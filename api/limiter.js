const fs = require('fs');
const path = require('path');

const QUOTA_FILE = path.resolve(__dirname, '../.quota_store.json');
const MAX_LINKS_PER_USER = 50;

/**
 * In-memory & disk-backed Rate & Link Quota Limiter
 * Tracks links consumed per user/browser fingerprint
 */
class FingerprintLimiter {
  constructor(maxQuota = MAX_LINKS_PER_USER) {
    this.maxQuota = maxQuota;
    this.store = new Map();
    this.loadStore();
  }

  loadStore() {
    try {
      if (fs.existsSync(QUOTA_FILE)) {
        const raw = fs.readFileSync(QUOTA_FILE, 'utf8');
        const data = JSON.parse(raw);
        this.store.clear();
        for (const [key, val] of Object.entries(data)) {
          this.store.set(key, val);
        }
      }
    } catch (e) {
      console.warn('[Limiter] Could not read quota store, initializing clean map:', e.message);
    }
  }

  persistStore() {
    try {
      const obj = {};
      for (const [k, v] of this.store.entries()) {
        obj[k] = v;
      }
      fs.writeFileSync(QUOTA_FILE, JSON.stringify(obj, null, 2), 'utf8');
    } catch (e) {
      console.warn('[Limiter] Error writing quota store:', e.message);
    }
  }

  getUsage(fingerprint) {
    this.loadStore(); // Keep in sync across requests and processes
    const key = (fingerprint || 'anonymous').trim();
    const record = this.store.get(key) || { used: 0, firstSeen: Date.now(), lastSeen: Date.now() };
    const used = record.used || 0;
    const remaining = Math.max(0, this.maxQuota - used);
    return {
      fingerprint: key,
      used,
      max: this.maxQuota,
      remaining,
      isExceeded: used >= this.maxQuota,
      firstSeen: record.firstSeen,
      lastSeen: record.lastSeen
    };
  }

  checkCanConsume(fingerprint, requestedCount = 1) {
    const usage = this.getUsage(fingerprint);
    if (usage.used >= this.maxQuota) {
      return {
        allowed: false,
        used: usage.used,
        max: this.maxQuota,
        remaining: 0,
        reason: 'QUOTA_EXCEEDED'
      };
    }

    if (usage.used + requestedCount > this.maxQuota) {
      return {
        allowed: false,
        used: usage.used,
        max: this.maxQuota,
        remaining: usage.remaining,
        requested: requestedCount,
        reason: 'PARTIAL_EXCEEDED'
      };
    }

    return {
      allowed: true,
      used: usage.used,
      max: this.maxQuota,
      remaining: this.maxQuota - (usage.used + requestedCount)
    };
  }

  consume(fingerprint, count = 1) {
    this.loadStore();
    const key = (fingerprint || 'anonymous').trim();
    const record = this.store.get(key) || { used: 0, firstSeen: Date.now() };
    record.used = (record.used || 0) + count;
    record.lastSeen = Date.now();
    this.store.set(key, record);
    this.persistStore();
    return this.getUsage(key);
  }

  reset(fingerprint) {
    this.loadStore();
    const key = (fingerprint || 'anonymous').trim();
    if (this.store.has(key)) {
      this.store.delete(key);
      this.persistStore();
    }
    return { ok: true, reset: key };
  }

  resetAll() {
    this.store.clear();
    this.persistStore();
    return { ok: true, count: 0 };
  }

  getAllStats() {
    const list = [];
    for (const [key, val] of this.store.entries()) {
      list.push({
        fingerprint: key,
        used: val.used || 0,
        remaining: Math.max(0, this.maxQuota - (val.used || 0)),
        isExceeded: (val.used || 0) >= this.maxQuota,
        firstSeen: val.firstSeen ? new Date(val.firstSeen).toISOString() : null,
        lastSeen: val.lastSeen ? new Date(val.lastSeen).toISOString() : null
      });
    }
    return list;
  }
}

module.exports = new FingerprintLimiter();
