const puppeteer = require("puppeteer");
const fs = require('fs');
const path = require('path');

/**
 * Helper to parse a token string with optional custom account name.
 * Supported formats:
 * - "Akun Pribadi | tok_12345"
 * - "Akun Kantor : tok_12345"
 * - "tok_12345" (defaults to "Akun <index>")
 */
function parseTokenEntry(raw, defaultIndex = 0) {
  if (typeof raw === 'object' && raw !== null) {
    const name = (raw.name || '').trim() || `Akun ${defaultIndex + 1}`;
    const token = (raw.token || '').trim();
    return token ? { name, token } : null;
  }

  const trimmed = (raw || '').trim();
  if (!trimmed) return null;

  let name = `Akun ${defaultIndex + 1}`;
  let token = trimmed;

  if (trimmed.includes('|')) {
    const parts = trimmed.split('|');
    const potentialName = parts[0].trim();
    const potentialToken = parts.slice(1).join('|').trim();
    if (potentialToken) {
      name = potentialName || name;
      token = potentialToken;
    }
  } else if (trimmed.includes(':') && !/^(https?|wss?):\/\//i.test(trimmed)) {
    const colonIdx = trimmed.indexOf(':');
    const potentialName = trimmed.slice(0, colonIdx).trim();
    const potentialToken = trimmed.slice(colonIdx + 1).trim();
    if (potentialToken) {
      name = potentialName || name;
      token = potentialToken;
    }
  }

  return { name, token };
}

/**
 * BrowserlessPool
 * Multi-Token Round-Robin Load Balancer, Account Alias Manager & Resilient Failover Engine
 * Designed for Sorot by Secommercs
 */
class BrowserlessPool {
  constructor(options = {}) {
    this.nodes = [];
    this.currentIndex = 0;
    this.cooldownMs = options.cooldownMs || 60000; // 60s cooldown when tripped
    this.maxConsecutiveFailures = options.maxConsecutiveFailures || 2;
    this.loadTokens();
  }

  /**
   * Discovers and parses tokens from .env file or environment variables.
   * Extracts account labels and tokens.
   */
  loadTokens() {
    const rawList = [];
    const envPath = path.resolve(__dirname, '../.env');

    if (fs.existsSync(envPath)) {
      try {
        const dotenv = require('dotenv');
        const envConfig = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
        if (envConfig.BROWSERLESS_TOKENS) {
          rawList.push(...envConfig.BROWSERLESS_TOKENS.split(/[\r\n,]+/));
        }
        if (envConfig.BROWSERLESS_TOKEN) {
          rawList.push(...envConfig.BROWSERLESS_TOKEN.split(/[\r\n,]+/));
        }
        for (let i = 1; i <= 30; i++) {
          if (envConfig[`BROWSERLESS_TOKEN_${i}`]) {
            rawList.push(envConfig[`BROWSERLESS_TOKEN_${i}`].trim());
          }
        }
        if (envConfig.ADMIN_SECRET_CODE) {
          process.env.ADMIN_SECRET_CODE = envConfig.ADMIN_SECRET_CODE.trim();
        }
      } catch (e) {
        console.warn('Error reading .env directly in pool:', e.message);
      }
    }

    if (rawList.length === 0) {
      if (process.env.BROWSERLESS_TOKENS) {
        rawList.push(...process.env.BROWSERLESS_TOKENS.split(/[\r\n,]+/));
      }
      if (process.env.BROWSERLESS_TOKEN) {
        rawList.push(...process.env.BROWSERLESS_TOKEN.split(/[\r\n,]+/));
      }
      for (let i = 1; i <= 30; i++) {
        const indexed = process.env[`BROWSERLESS_TOKEN_${i}`];
        if (indexed) rawList.push(indexed.trim());
      }
    }

    // Parse into structured { name, token } objects and deduplicate by token
    const parsedEntries = [];
    const seenTokens = new Set();

    rawList.forEach((raw, idx) => {
      const parsed = parseTokenEntry(raw, idx);
      if (parsed && parsed.token && !seenTokens.has(parsed.token)) {
        seenTokens.add(parsed.token);
        parsedEntries.push(parsed);
      }
    });

    const defaultHost = process.env.BROWSERLESS_HOST || 'wss://chrome.browserless.io';

    this.nodes = parsedEntries.map((entry, idx) => {
      let token = entry.token;
      let wsBase = defaultHost;

      // Handle full WebSocket endpoints if specified
      if (token.startsWith('ws://') || token.startsWith('wss://')) {
        try {
          const parsedUrl = new URL(token);
          const qToken = parsedUrl.searchParams.get('token');
          if (qToken) token = qToken;
          wsBase = `${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.pathname}`;
        } catch (e) {}
      }

      const maskedToken = token.length > 8
        ? `${token.slice(0, 4)}...${token.slice(-4)}`
        : `token-${idx + 1}`;

      const existing = this.nodes.find(n => n.token === token);

      return {
        id: `node-${idx + 1}`,
        name: entry.name || `Akun ${idx + 1}`,
        token,
        maskedToken,
        wsBase,
        wsEndpoint: `${wsBase}?token=${encodeURIComponent(token)}&stealth=true`,
        status: existing?.status || 'HEALTHY',
        totalRequests: existing?.totalRequests || 0,
        totalSuccesses: existing?.totalSuccesses || 0,
        totalFailures: existing?.totalFailures || 0,
        consecutiveFailures: existing?.consecutiveFailures || 0,
        lastError: existing?.lastError || null,
        lastSuccessTime: existing?.lastSuccessTime || null,
        lastFailureTime: existing?.lastFailureTime || null,
        cooldownUntil: existing?.cooldownUntil || 0
      };
    });

    console.log(
      `[BrowserlessPool] Active Pool Size: ${this.nodes.length} token node(s):`,
      this.nodes.map(n => `${n.id} [${n.name}] (${n.maskedToken})`).join(', ') || 'NONE'
    );
  }

  /**
   * Persists items to .env file preserving custom account names
   */
  saveTokensToEnv(items) {
    const envPath = path.resolve(__dirname, '../.env');
    let content = '';
    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, 'utf8');
    }

    const formattedList = items.map((item, idx) => {
      if (typeof item === 'object' && item !== null) {
        const name = (item.name || '').trim() || `Akun ${idx + 1}`;
        const tok = (item.token || '').trim();
        return `${name} | ${tok}`;
      }
      return String(item).trim();
    });

    const combinedStr = formattedList.join(', ');
    if (/^BROWSERLESS_TOKENS=.*$/m.test(content)) {
      content = content.replace(/^BROWSERLESS_TOKENS=.*$/m, `BROWSERLESS_TOKENS="${combinedStr}"`);
    } else if (/^BROWSERLESS_TOKEN=.*$/m.test(content)) {
      content = content.replace(/^BROWSERLESS_TOKEN=.*$/m, `BROWSERLESS_TOKENS="${combinedStr}"`);
    } else {
      content += (content.endsWith('\n') ? '' : '\n') + `BROWSERLESS_TOKENS="${combinedStr}"\n`;
    }

    if (!/^ADMIN_SECRET_CODE=.*$/m.test(content)) {
      const adminCode = process.env.ADMIN_SECRET_CODE || 'sorotganteng';
      content += `ADMIN_SECRET_CODE="${adminCode}"\n`;
    }

    fs.writeFileSync(envPath, content, 'utf8');
    process.env.BROWSERLESS_TOKENS = combinedStr;
  }

  /**
   * Updates an existing node's custom account name/alias
   */
  updateTokenName(targetIdOrToken, newName) {
    const node = this.nodes.find(n => n.id === targetIdOrToken || n.token === targetIdOrToken);
    if (!node) {
      throw new Error(`Token atau node "${targetIdOrToken}" tidak ditemukan`);
    }

    const cleanName = (newName || '').trim();
    if (cleanName) {
      node.name = cleanName;
    }

    this.saveTokensToEnv(this.nodes.map(n => ({ name: n.name, token: n.token })));
    return { ok: true, node };
  }

  /**
   * Adds new token(s) to the pool and persists to .env
   */
  addTokens(newTokensList) {
    const currentItems = this.nodes.map(n => ({ name: n.name, token: n.token }));
    const added = [];

    for (let i = 0; i < newTokensList.length; i++) {
      const raw = newTokensList[i];
      let parsed;
      if (typeof raw === 'object' && raw !== null) {
        parsed = {
          name: (raw.name || '').trim() || `Akun ${currentItems.length + 1}`,
          token: (raw.token || '').trim()
        };
      } else {
        parsed = parseTokenEntry(raw, currentItems.length);
      }

      if (!parsed || !parsed.token) continue;

      const existing = currentItems.find(item => item.token === parsed.token);
      if (existing) {
        if (parsed.name && parsed.name !== existing.name) {
          existing.name = parsed.name;
        }
      } else {
        currentItems.push(parsed);
        added.push(parsed);
      }
    }

    this.saveTokensToEnv(currentItems);
    this.loadTokens();
    return { added, total: this.nodes.length, nodes: this.nodes };
  }

  /**
   * Removes a token from the pool and persists to .env
   */
  removeToken(tokenIdOrToken) {
    const targetNode = this.nodes.find(n => n.id === tokenIdOrToken || n.token === tokenIdOrToken);
    if (!targetNode) {
      throw new Error(`Token atau node ${tokenIdOrToken} tidak ditemukan di pool`);
    }

    const remaining = this.nodes
      .filter(n => n.id !== targetNode.id)
      .map(n => ({ name: n.name, token: n.token }));

    this.saveTokensToEnv(remaining);
    this.loadTokens();
    return { removedId: targetNode.id, remaining: this.nodes.length };
  }

  /**
   * Tests a single token by attempting a quick connect to Browserless
   */
  async testConnection(token) {
    let testBrowser;
    const start = Date.now();
    try {
      const clean = (token || '').trim();
      if (!clean) throw new Error('Token string cannot be empty');
      const wsBase = process.env.BROWSERLESS_HOST || 'wss://chrome.browserless.io';
      const endpoint = `${wsBase}?token=${encodeURIComponent(clean)}&stealth=true`;

      testBrowser = await puppeteer.connect({
        browserWSEndpoint: endpoint,
        timeout: 12000
      });
      const latencyMs = Date.now() - start;
      return { ok: true, latencyMs };
    } catch (err) {
      return { ok: false, error: err.message, latencyMs: Date.now() - start };
    } finally {
      if (testBrowser) {
        try { await testBrowser.disconnect(); } catch (e) {}
      }
    }
  }

  /**
   * Round-Robin Node Selector with Circuit-Breaker Awareness
   */
  getNextNode(excludeNodeIds = new Set()) {
    if (this.nodes.length === 0) {
      throw new Error('No Browserless tokens configured. Set BROWSERLESS_TOKENS or BROWSERLESS_TOKEN in .env');
    }

    const now = Date.now();
    const availableNodes = this.nodes.filter(n => !excludeNodeIds.has(n.id));
    if (availableNodes.length === 0) {
      return null;
    }

    for (let i = 0; i < availableNodes.length; i++) {
      const node = availableNodes[(this.currentIndex + i) % availableNodes.length];

      if (node.status === 'COOLDOWN') {
        if (now >= node.cooldownUntil) {
          console.log(`[BrowserlessPool] Cooldown elapsed for ${node.id} (${node.name} - ${node.maskedToken}). Probing...`);
          node.status = 'HEALTHY';
          node.consecutiveFailures = 0;
          this.currentIndex = (this.currentIndex + i + 1) % availableNodes.length;
          return node;
        }
        continue;
      }

      this.currentIndex = (this.currentIndex + i + 1) % availableNodes.length;
      return node;
    }

    const sorted = [...availableNodes].sort((a, b) => a.cooldownUntil - b.cooldownUntil);
    const emergencyNode = sorted[0];
    console.warn(`[BrowserlessPool] All nodes currently cooling down. Forcing probe on ${emergencyNode.id} (${emergencyNode.name} - ${emergencyNode.maskedToken})`);
    return emergencyNode;
  }

  /**
   * Execute task with automatic retry and failover across pool nodes
   */
  async executeWithFallback(actionFn, metadata = {}) {
    const triedNodeIds = new Set();
    const maxAttempts = Math.min(this.nodes.length || 1, 6);
    const failureHistory = [];

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const node = this.getNextNode(triedNodeIds);
      if (!node) {
        break;
      }

      triedNodeIds.add(node.id);
      node.totalRequests++;

      const logPrefix = `[BrowserlessPool] [Attempt ${attempt}/${maxAttempts}] Node ${node.id} [${node.name}] (${node.maskedToken})`;
      console.log(`${logPrefix} -> Executing for: ${metadata.url || metadata.job || 'task'}`);

      const startTime = Date.now();
      try {
        const result = await actionFn(node, { attempt, maxAttempts });

        const elapsed = Date.now() - startTime;
        node.totalSuccesses++;
        node.consecutiveFailures = 0;
        node.status = 'HEALTHY';
        node.lastSuccessTime = Date.now();

        console.log(`${logPrefix} -> SUCCESS (${elapsed}ms)`);

        if (result && typeof result === 'object' && !Array.isArray(result)) {
          result._poolMeta = {
            nodeId: node.id,
            nodeName: node.name,
            maskedToken: node.maskedToken,
            attempt,
            totalFailovers: attempt - 1,
            elapsedMs: elapsed
          };
        }

        return result;
      } catch (err) {
        const elapsed = Date.now() - startTime;
        node.totalFailures++;
        node.consecutiveFailures++;
        node.lastFailureTime = Date.now();
        node.lastError = err.message;

        failureHistory.push({
          nodeId: node.id,
          nodeName: node.name,
          maskedToken: node.maskedToken,
          error: err.message,
          elapsedMs: elapsed
        });

        console.error(`${logPrefix} -> FAILED (${elapsed}ms): ${err.message}`);

        if (node.consecutiveFailures >= this.maxConsecutiveFailures) {
          node.status = 'COOLDOWN';
          node.cooldownUntil = Date.now() + this.cooldownMs;
          console.warn(`[BrowserlessPool] Node ${node.id} [${node.name}] (${node.maskedToken}) tripped into COOLDOWN for ${this.cooldownMs / 1000}s`);
        }

        if (attempt < maxAttempts) {
          console.log(`[BrowserlessPool] Retrying with next available node in pool...`);
        }
      }
    }

    const summary = failureHistory.map(f => `${f.nodeId} [${f.nodeName}]: ${f.error}`).join(' | ');
    throw new Error(`Browserless pool exhausted (${failureHistory.length} node(s) failed): ${summary}`);
  }

  /**
   * Health and telemetry diagnostic summary
   */
  getStatus(isAdmin = false) {
    const now = Date.now();
    return {
      poolSize: this.nodes.length,
      healthyNodes: this.nodes.filter(n => n.status === 'HEALTHY' && n.cooldownUntil <= now).length,
      coolingDownNodes: this.nodes.filter(n => n.status === 'COOLDOWN' && n.cooldownUntil > now).length,
      currentIndex: this.currentIndex,
      nodes: this.nodes.map(n => ({
        id: n.id,
        name: n.name || `Akun ${n.id.replace('node-', '')}`,
        maskedToken: n.maskedToken,
        token: isAdmin ? n.token : undefined,
        status: n.status === 'COOLDOWN' && now >= n.cooldownUntil ? 'RECOVERING' : n.status,
        totalRequests: n.totalRequests,
        totalSuccesses: n.totalSuccesses,
        totalFailures: n.totalFailures,
        consecutiveFailures: n.consecutiveFailures,
        cooldownRemainingSec: n.cooldownUntil > now ? Math.ceil((n.cooldownUntil - now) / 1000) : 0,
        lastError: n.lastError,
        lastSuccessTime: n.lastSuccessTime ? new Date(n.lastSuccessTime).toISOString() : null
      }))
    };
  }
}

module.exports = new BrowserlessPool();
