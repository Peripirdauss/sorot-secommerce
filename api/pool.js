const puppeteer = require("puppeteer");

/**
 * BrowserlessPool
 * Multi-Token Round-Robin Load Balancer & Automatic Fallback Engine
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
   * Discovers and parses tokens from various environment configurations:
   * - BROWSERLESS_TOKENS (comma, space, or newline separated)
   * - BROWSERLESS_TOKEN (single or comma-separated)
   * - BROWSERLESS_TOKEN_1, BROWSERLESS_TOKEN_2, ...
   */
  loadTokens() {
    const rawList = [];
    const fs = require('fs');
    const path = require('path');
    const envPath = path.resolve(__dirname, '../.env');

    // Parse directly from .env file to ensure exact disk synchronization
    if (fs.existsSync(envPath)) {
      try {
        const dotenv = require('dotenv');
        const envConfig = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
        if (envConfig.BROWSERLESS_TOKENS) {
          rawList.push(...envConfig.BROWSERLESS_TOKENS.split(/[\s,]+/));
        }
        if (envConfig.BROWSERLESS_TOKEN) {
          rawList.push(...envConfig.BROWSERLESS_TOKEN.split(/[\s,]+/));
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

    // Fallback to process.env if file did not contain tokens
    if (rawList.length === 0) {
      if (process.env.BROWSERLESS_TOKENS) {
        rawList.push(...process.env.BROWSERLESS_TOKENS.split(/[\s,]+/));
      }
      if (process.env.BROWSERLESS_TOKEN) {
        rawList.push(...process.env.BROWSERLESS_TOKEN.split(/[\s,]+/));
      }
      for (let i = 1; i <= 30; i++) {
        const indexed = process.env[`BROWSERLESS_TOKEN_${i}`];
        if (indexed) rawList.push(indexed.trim());
      }
    }

    // Sanitize and deduplicate
    const uniqueTokens = [...new Set(
      rawList
        .map(t => (t || '').trim())
        .filter(t => t.length > 0 && !t.startsWith('#'))
    )];

    const defaultHost = process.env.BROWSERLESS_HOST || 'wss://chrome.browserless.io';

    this.nodes = uniqueTokens.map((tokenOrUrl, idx) => {
      let token = tokenOrUrl;
      let wsBase = defaultHost;

      // Handle full WebSocket endpoints if specified
      if (tokenOrUrl.startsWith('ws://') || tokenOrUrl.startsWith('wss://')) {
        try {
          const parsed = new URL(tokenOrUrl);
          const qToken = parsed.searchParams.get('token');
          if (qToken) token = qToken;
          wsBase = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
        } catch (e) {}
      }

      const maskedToken = token.length > 8
        ? `${token.slice(0, 4)}...${token.slice(-4)}`
        : `token-${idx + 1}`;

      // Preserve existing metrics if node is being reloaded
      const existing = this.nodes.find(n => n.token === token);

      return {
        id: `node-${idx + 1}`,
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
      this.nodes.map(n => `${n.id} (${n.maskedToken})`).join(', ') || 'NONE'
    );
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

      // Check if cooldown expired
      if (node.status === 'COOLDOWN') {
        if (now >= node.cooldownUntil) {
          console.log(`[BrowserlessPool] Cooldown elapsed for ${node.id} (${node.maskedToken}). Probing...`);
          node.status = 'HEALTHY';
          node.consecutiveFailures = 0;
          this.currentIndex = (this.currentIndex + i + 1) % availableNodes.length;
          return node;
        }
        continue;
      }

      // Found healthy node
      this.currentIndex = (this.currentIndex + i + 1) % availableNodes.length;
      return node;
    }

    // Emergency fallback if all candidates are in cooldown: pick the one closest to recovery
    const sorted = [...availableNodes].sort((a, b) => a.cooldownUntil - b.cooldownUntil);
    const emergencyNode = sorted[0];
    console.warn(`[BrowserlessPool] All nodes currently cooling down. Forcing probe on ${emergencyNode.id} (${emergencyNode.maskedToken})`);
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

      const logPrefix = `[BrowserlessPool] [Attempt ${attempt}/${maxAttempts}] Node ${node.id} (${node.maskedToken})`;
      console.log(`${logPrefix} -> Executing for: ${metadata.url || metadata.job || 'task'}`);

      const startTime = Date.now();
      try {
        const result = await actionFn(node, { attempt, maxAttempts });

        // Success metrics
        const elapsed = Date.now() - startTime;
        node.totalSuccesses++;
        node.consecutiveFailures = 0;
        node.status = 'HEALTHY';
        node.lastSuccessTime = Date.now();

        console.log(`${logPrefix} -> SUCCESS (${elapsed}ms)`);

        if (result && typeof result === 'object' && !Array.isArray(result)) {
          result._poolMeta = {
            nodeId: node.id,
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
          maskedToken: node.maskedToken,
          error: err.message,
          elapsedMs: elapsed
        });

        console.error(`${logPrefix} -> FAILED (${elapsed}ms): ${err.message}`);

        // Circuit breaker: Trip into COOLDOWN if threshold reached
        if (node.consecutiveFailures >= this.maxConsecutiveFailures) {
          node.status = 'COOLDOWN';
          node.cooldownUntil = Date.now() + this.cooldownMs;
          console.warn(`[BrowserlessPool] Node ${node.id} (${node.maskedToken}) tripped into COOLDOWN for ${this.cooldownMs / 1000}s`);
        }

        if (attempt < maxAttempts) {
          console.log(`[BrowserlessPool] Retrying with next available node in pool...`);
        }
      }
    }

    const summary = failureHistory.map(f => `${f.nodeId}: ${f.error}`).join(' | ');
    throw new Error(`Browserless pool exhausted (${failureHistory.length} node(s) failed): ${summary}`);
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
   * Persists tokens array to .env file and updates process.env
   */
  saveTokensToEnv(tokens) {
    const fs = require('fs');
    const path = require('path');
    const envPath = path.resolve(__dirname, '../.env');
    let content = '';
    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, 'utf8');
    }

    const tokenStr = tokens.join(', ');
    if (/^BROWSERLESS_TOKENS=.*$/m.test(content)) {
      content = content.replace(/^BROWSERLESS_TOKENS=.*$/m, `BROWSERLESS_TOKENS="${tokenStr}"`);
    } else if (/^BROWSERLESS_TOKEN=.*$/m.test(content)) {
      content = content.replace(/^BROWSERLESS_TOKEN=.*$/m, `BROWSERLESS_TOKENS="${tokenStr}"`);
    } else {
      content += (content.endsWith('\n') ? '' : '\n') + `BROWSERLESS_TOKENS="${tokenStr}"\n`;
    }

    if (!/^ADMIN_SECRET_CODE=.*$/m.test(content)) {
      const adminCode = process.env.ADMIN_SECRET_CODE || 'sorotganteng';
      content += `ADMIN_SECRET_CODE="${adminCode}"\n`;
    }

    fs.writeFileSync(envPath, content, 'utf8');
    process.env.BROWSERLESS_TOKENS = tokenStr;
  }

  /**
   * Adds new token(s) to the pool and persists to .env
   */
  addTokens(newTokensList) {
    const currentTokens = this.nodes.map(n => n.token);
    const added = [];

    for (const raw of newTokensList) {
      const cleaned = (raw || '').trim();
      if (cleaned && !currentTokens.includes(cleaned)) {
        currentTokens.push(cleaned);
        added.push(cleaned);
      }
    }

    if (added.length > 0) {
      this.saveTokensToEnv(currentTokens);
      this.loadTokens();
    }

    return { added, total: this.nodes.length, nodes: this.nodes };
  }

  /**
   * Removes a token from the pool and persists to .env
   */
  removeToken(tokenIdOrToken) {
    const targetNode = this.nodes.find(n => n.id === tokenIdOrToken || n.token === tokenIdOrToken);
    if (!targetNode) {
      throw new Error(`Token ${tokenIdOrToken} not found in pool`);
    }

    const remainingTokens = this.nodes
      .filter(n => n.id !== targetNode.id)
      .map(n => n.token);

    this.saveTokensToEnv(remainingTokens);
    this.loadTokens();

    return { removedId: targetNode.id, remaining: this.nodes.length };
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

