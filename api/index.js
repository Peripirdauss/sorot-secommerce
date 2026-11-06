// Use plain puppeteer instead of puppeteer-extra
const puppeteer = require("puppeteer");

// Load environment variables in development
if (process.env.NODE_ENV !== "production") {
  require('dotenv').config();
}

const pool = require("./pool");
const limiter = require("./limiter");

// Helper to determine client fingerprint
function getClientFingerprint(req) {
  const headerFp = req.headers['x-sorot-fingerprint'];
  if (headerFp && headerFp.trim()) return headerFp.trim();

  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const firstIp = forwarded.split(',')[0].trim();
    if (firstIp) return firstIp;
  }

  const socketIp = req.socket?.remoteAddress;
  if (socketIp && socketIp !== '::1' && socketIp !== '127.0.0.1') {
    return socketIp;
  }

  return 'local_browser_client';
}

// Log environment info for debugging
console.log('Environment:', process.env.NODE_ENV);
console.log('Browserless Pool initialized with', pool.nodes.length, 'token node(s)');

async function delay(ms) {
  return new Promise(res => setTimeout(res, ms));
}

// Normalizes TikTok video URLs and accepts bare video IDs
function normalizeTikTokUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (/^\d{15,22}$/.test(trimmed)) {
    return `https://www.tiktok.com/@creator/video/${trimmed}`;
  }
  if (trimmed.startsWith('tiktok.com') || trimmed.startsWith('www.tiktok.com')) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

const KNOWN_CREATOR_SAMPLES = {
  'mineralbotanica': [
    'https://www.tiktok.com/@mineralbotanica/video/7703890519725739285'
  ],
  'aerostreet': [
    'https://www.tiktok.com/@aerostreet/video/7345812901928374829'
  ],
  'tokopedia': [
    'https://www.tiktok.com/@tokopedia/video/7346129847192839102'
  ]
};

/**
 * Scrapes a single TikTok video using BrowserlessPool with automatic round-robin and fallback
 */
async function getTikTokData(url) {
  try {
    return await pool.executeWithFallback(async (node, { attempt, maxAttempts }) => {
      let browser;
      try {
        console.log(`Connecting to Browserless node ${node.id} (${node.maskedToken})...`);
        browser = await puppeteer.connect({
          browserWSEndpoint: node.wsEndpoint,
          timeout: 45000 // Responsive connect timeout to failover swiftly if token fails
        });
        console.log(`Successfully connected to ${node.id}`);

        const page = await browser.newPage();
        console.log(`[${node.id}] Page created, navigating to:`, url);

        // Stealth and viewport configuration
        await page.setViewport({ width: 1280, height: 800 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

        await page.evaluateOnNewDocument(() => {
          Object.defineProperty(navigator, 'webdriver', { get: () => false });
          Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
          Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        });

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
        console.log(`[${node.id}] Page loaded, waiting for rehydration...`);
        await delay(2500);

        console.log(`[${node.id}] Extracting data...`);
        const mainData = await page.evaluate(() => {
          let jsonData = null;
          const universalScript = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
          if (universalScript && universalScript.textContent) {
            try {
              jsonData = JSON.parse(universalScript.textContent);
            } catch (e) {}
          }

          if (!jsonData) {
            const scripts = Array.from(document.getElementsByTagName('script'));
            const sigiScript = scripts.find(s => s.textContent?.includes('__DEFAULT_SCOPE__'));
            if (sigiScript) {
              try {
                jsonData = JSON.parse(sigiScript.textContent);
              } catch (e) {}
            }
          }

          if (!jsonData) return { error: "No JSON rehydration data found on page" };

          try {
            const itemStruct = jsonData?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct || {};
            const statsV2 = itemStruct.statsV2 || {};
            const stats = itemStruct.stats || {};
            const authorStats = itemStruct.authorStats || {};
            const author = itemStruct.author || {};
            const shareMeta = jsonData?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.shareMeta || {};

            return {
              videoId: itemStruct.id || '',
              createdTime: itemStruct.createTime ? new Date(itemStruct.createTime * 1000).toLocaleString() : '',
              duration: itemStruct.music?.duration || itemStruct.video?.duration || 0,
              isCopyrighted: itemStruct.music?.isCopyrighted || false,
              musicId: itemStruct.music?.id || '',
              sound: itemStruct.music?.title || '',
              like: statsV2.diggCount || stats.diggCount || '0',
              share: statsV2.shareCount || stats.shareCount || '0',
              comments: statsV2.commentCount || stats.commentCount || '0',
              views: statsV2.playCount || stats.playCount || '0',
              saves: statsV2.collectCount || stats.collectCount || '0',
              repost: statsV2.repostCount || stats.repostCount || '0',
              followers: authorStats.followerCount || author.followerCount || 0,
              following: authorStats.followingCount || author.followingCount || 0,
              'like-account': authorStats.heartCount || authorStats.heart || 0,
              'video-count': authorStats.videoCount || 0,
              friends: authorStats.friendCount || 0,
              isAD: itemStruct.isAd || false,
              title: itemStruct.desc || shareMeta.title || '',
              description: shareMeta.desc || itemStruct.desc || '',
              authorUniqueId: author.uniqueId || '',
              authorNickname: author.nickname || '',
              authorAvatar: author.avatarLarger || author.avatarMedium || author.avatarThumb || '',
              authorSignature: author.signature || '',
              authorVerified: Boolean(author.verified),
              cover: itemStruct.video?.cover || itemStruct.video?.originCover || '',
              dynamicCover: itemStruct.video?.dynamicCover || '',
              originCover: itemStruct.video?.originCover || '',
              videoRatio: itemStruct.video?.ratio || '',
              videoWidth: itemStruct.video?.width || 0,
              videoHeight: itemStruct.video?.height || 0,
              videoUrl: `https://www.tiktok.com/@${author.uniqueId || 'video'}/video/${itemStruct.id || ''}`
            };
          } catch (e) {
            return { error: "Failed to parse video item: " + e.message };
          }
        });

        await page.close();

        if (mainData.error) {
          throw new Error(mainData.error);
        }

        console.log(`[${node.id}] Data extracted successfully:`, Object.keys(mainData).join(', '));
        return mainData;
      } finally {
        if (browser) {
          try {
            await browser.disconnect();
            console.log(`[${node.id}] Browser disconnected`);
          } catch (disconnectErr) {
            console.error(`[${node.id}] Error disconnecting browser:`, disconnectErr.message);
          }
        }
      }
    }, { url, job: 'video-extraction' });
  } catch (error) {
    console.error('Final error during video scraping after all pool retries:', error.message);
    return { url, error: error.message };
  }
}

/**
 * Extract latest video links from creator profile using BrowserlessPool with round-robin and fallback
 */
async function getTikTokUserVideos(username) {
  let cleanUser = (username || '').trim();
  if (cleanUser.includes('tiktok.com/@')) {
    cleanUser = cleanUser.split('tiktok.com/@')[1].split('/')[0].split('?')[0];
  } else if (cleanUser.includes('tiktok.com/')) {
    cleanUser = cleanUser.split('tiktok.com/')[1].split('/')[0].split('?')[0];
  }
  cleanUser = cleanUser.replace(/^@/, '').trim();

  const profileUrl = `https://www.tiktok.com/@${cleanUser}`;
  const sampleVideos = KNOWN_CREATOR_SAMPLES[cleanUser.toLowerCase()] || [];

  try {
    return await pool.executeWithFallback(async (node, { attempt }) => {
      let browser;
      try {
        console.log(`Connecting to Browserless node ${node.id} (${node.maskedToken}) for profile: ${profileUrl}`);
        browser = await puppeteer.connect({
          browserWSEndpoint: node.wsEndpoint,
          timeout: 45000
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        await page.evaluateOnNewDocument(() => {
          Object.defineProperty(navigator, 'webdriver', { get: () => false });
          Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
          Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        });

        await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
        await delay(3000);

        const profileData = await page.evaluate((uname) => {
          let stats = {};
          let statsV2 = {};
          let user = {};

          const universalScript = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
          if (universalScript && universalScript.textContent) {
            try {
              const json = JSON.parse(universalScript.textContent);
              const detail = json?.['__DEFAULT_SCOPE__']?.['webapp.user-detail'] || {};
              const userInfo = detail.userInfo || {};
              stats = userInfo.stats || {};
              statsV2 = userInfo.statsV2 || {};
              user = userInfo.user || {};
            } catch (e) {}
          }

          const links = Array.from(document.querySelectorAll('a[href*="/video/"]'));
          const hrefs = links.map(a => a.href).filter(href => href.includes('/video/'));
          const unique = [...new Set(hrefs)].slice(0, 12);

          return {
            nickname: user.nickname || uname,
            avatar: user.avatarLarger || user.avatarMedium || user.avatarThumb || '',
            signature: user.signature || '',
            verified: Boolean(user.verified),
            category: user.commerceUserInfo?.category || '',
            isSeller: Boolean(user.ttSeller || user.commerceUserInfo?.commerceUser),
            bioLink: user.bioLink?.link || '',
            followerCount: Number(statsV2.followerCount || stats.followerCount || 0),
            heartCount: Number(statsV2.heartCount || stats.heartCount || stats.heart || 0),
            videoCount: Number(statsV2.videoCount || stats.videoCount || 0),
            followingCount: Number(statsV2.followingCount || stats.followingCount || 0),
            videoUrls: unique
          };
        }, cleanUser);

        await page.close();

        const finalUrls = profileData.videoUrls && profileData.videoUrls.length > 0
          ? profileData.videoUrls
          : sampleVideos;

        return {
          username: cleanUser,
          profileUrl,
          nickname: profileData.nickname,
          avatar: profileData.avatar,
          signature: profileData.signature,
          verified: profileData.verified,
          category: profileData.category,
          isSeller: profileData.isSeller,
          bioLink: profileData.bioLink,
          followerCount: profileData.followerCount,
          heartCount: profileData.heartCount,
          videoCount: profileData.videoCount,
          followingCount: profileData.followingCount,
          videoUrls: finalUrls,
          sampleVideos,
          hasSampleVideos: sampleVideos.length > 0,
          isRestrictedList: !profileData.videoUrls || profileData.videoUrls.length === 0
        };
      } finally {
        if (browser) {
          try { await browser.disconnect(); } catch (e) {}
        }
      }
    }, { username: cleanUser, job: 'creator-profile' });
  } catch (err) {
    console.error('All pool attempts failed for profile:', cleanUser, err.message);
    return {
      username: cleanUser,
      profileUrl,
      error: err.message,
      videoUrls: sampleVideos,
      sampleVideos,
      hasSampleVideos: sampleVideos.length > 0,
      isRestrictedList: true
    };
  }
}

// Vercel serverless function & local Node.js handler
module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const rawUrl = req.url || '/api';
  const parsed = new URL(rawUrl, 'http://localhost');

  // Helper to verify admin passcode
  const checkAdminAuth = () => {
    const adminCode = (process.env.ADMIN_SECRET_CODE || 'sorotganteng').trim();
    const provided = (req.headers['x-admin-code'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '') || '').trim();
    return provided === adminCode;
  };

  // --- Admin GUI Endpoints (/api/admin/*) ---
  if (parsed.pathname.startsWith('/api/admin')) {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }

    // 1. Verify Passcode
    if (parsed.pathname === '/api/admin/verify' && req.method === 'POST') {
      const adminCode = (process.env.ADMIN_SECRET_CODE || 'sorotganteng').trim();
      const codeInput = (body?.code || '').trim();
      if (codeInput === adminCode) {
        return res.status(200).json({
          ok: true,
          message: 'Akses admin berhasil diverifikasi',
          ...pool.getStatus(true)
        });
      }
      return res.status(401).json({
        ok: false,
        error: 'Code masuk salah. Akses ditolak.'
      });
    }

    // Authentication Gate for all subsequent admin actions
    if (!checkAdminAuth()) {
      return res.status(401).json({ error: 'Unauthorized: Invalid admin code' });
    }

    // 2. Get full pool details
    if (parsed.pathname === '/api/admin/tokens' && req.method === 'GET') {
      return res.status(200).json({
        ok: true,
        ...pool.getStatus(true)
      });
    }

    // 3. Add new token(s) with optional custom name
    if (parsed.pathname === '/api/admin/tokens' && req.method === 'POST') {
      let tokenList = [];
      if (body?.token && body?.name) {
        tokenList = [{ name: body.name.trim(), token: body.token.trim() }];
      } else if (body?.tokens) {
        const rawTokens = Array.isArray(body.tokens) ? body.tokens : String(body.tokens).split(/[\r\n,]+/);
        tokenList = rawTokens.map(t => (t || '').trim()).filter(Boolean);
      } else if (body?.token) {
        tokenList = [body.token.trim()];
      }

      const result = pool.addTokens(tokenList);
      return res.status(200).json({
        ok: true,
        message: `${result.added.length} token berhasil ditambahkan dan disimpan ke pool`,
        added: result.added,
        ...pool.getStatus(true)
      });
    }

    // 4. Update custom account name/alias
    if (parsed.pathname === '/api/admin/tokens' && req.method === 'PATCH') {
      const target = body?.id || body?.token;
      const newName = body?.name;
      if (!target || !newName) {
        return res.status(400).json({ error: 'Target node ID/token dan nama baru wajib diisi' });
      }
      try {
        pool.updateTokenName(target, newName);
        return res.status(200).json({
          ok: true,
          message: `Nama akun berhasil diperbarui menjadi "${newName}"`,
          ...pool.getStatus(true)
        });
      } catch (err) {
        return res.status(404).json({ error: err.message });
      }
    }

    // 5. Delete token
    if (parsed.pathname === '/api/admin/tokens' && req.method === 'DELETE') {
      const target = body?.id || body?.token;
      if (!target) {
        return res.status(400).json({ error: 'Missing target token id or token string' });
      }
      try {
        const result = pool.removeToken(target);
        return res.status(200).json({
          ok: true,
          message: `Token ${target} berhasil dihapus dari pool`,
          ...pool.getStatus(true)
        });
      } catch (err) {
        return res.status(404).json({ error: err.message });
      }
    }

    // 5. Test connection of a token
    if (parsed.pathname === '/api/admin/test-token' && req.method === 'POST') {
      const tokenToTest = body?.token;
      if (!tokenToTest) {
        return res.status(400).json({ error: 'Missing token to test' });
      }
      const testResult = await pool.testConnection(tokenToTest);
      return res.status(200).json(testResult);
    }

    // 6. View Quotas list
    if (parsed.pathname === '/api/admin/quotas' && req.method === 'GET') {
      return res.status(200).json({ ok: true, quotas: limiter.getAllStats() });
    }

    // 7. Reset Quotas
    if (parsed.pathname === '/api/admin/quotas/reset' && req.method === 'POST') {
      const targetFp = body?.fingerprint;
      if (targetFp) {
        limiter.reset(targetFp);
        return res.status(200).json({ ok: true, message: `Quota untuk ${targetFp} direset`, quotas: limiter.getAllStats() });
      } else {
        limiter.resetAll();
        return res.status(200).json({ ok: true, message: 'Semua quota berhasil direset ke 0', quotas: limiter.getAllStats() });
      }
    }

    return res.status(404).json({ error: 'Admin route not found' });
  }

  // Quota status inspection endpoint (/api/quota)
  if (req.method === 'GET' && (parsed.pathname === '/api/quota' || parsed.searchParams.has('quota'))) {
    const fp = getClientFingerprint(req);
    return res.status(200).json({
      ok: true,
      ...limiter.getUsage(fp)
    });
  }

  // Diagnostic, Health & Pool Inspection endpoint
  if (req.method === 'GET') {
    const rawUrl = req.url || '/api';
    const parsed = new URL(rawUrl, 'http://localhost');
    const isReload = parsed.pathname.includes('/reload') || parsed.searchParams.has('reload');

    if (isReload) {
      if (process.env.NODE_ENV !== 'production') {
        require('dotenv').config({ override: true });
      }
      pool.loadTokens();
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Sorot-Engine', 'browserless-pool');
    res.setHeader('X-Sorot-Pool-Size', pool.nodes.length);
    return res.status(200).json({
      status: 'healthy',
      engine: 'browserless-pool',
      reloaded: isReload,
      ...pool.getStatus()
    });
  }

  console.log('API request received:', req.method, req.url);

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: "Method not allowed" });
    }

    res.setHeader('X-Sorot-Engine', 'browserless-pool');
    res.setHeader('X-Sorot-Pool-Size', pool.nodes.length);

    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        body = {};
      }
    }

    const fp = getClientFingerprint(req);
    const quotaUsage = limiter.getUsage(fp);

    res.setHeader('X-Sorot-Quota-Used', quotaUsage.used);
    res.setHeader('X-Sorot-Quota-Remaining', quotaUsage.remaining);
    res.setHeader('X-Sorot-Quota-Max', quotaUsage.max);

    // Handle profile extraction mode
    if (body?.username) {
      if (quotaUsage.isExceeded) {
        return res.status(429).json({
          error: "QUOTA_EXCEEDED",
          title: "You're an Amazing Runner, Slow Down or Contact Us",
          message: "You have completed your 50-video analysis limit in this session. Your creative pace is remarkable! To protect server resources and maintain zero-latency intelligence, please pause or contact our team for enterprise unlimited access.",
          quota: quotaUsage
        });
      }

      console.log(`Profile extraction requested for: ${body.username} [User: ${fp}]`);
      const profileResult = await getTikTokUserVideos(body.username);
      return res.status(200).json(profileResult);
    }

    // Handle URL array mode
    const urls = body?.urls;
    if (!urls || !Array.isArray(urls)) {
      return res.status(400).json({ error: "Invalid request, missing urls or username" });
    }

    const cleanedUrls = urls.map(normalizeTikTokUrl).filter(u => u.length > 0);
    const quotaCheck = limiter.checkCanConsume(fp, cleanedUrls.length);

    if (!quotaCheck.allowed) {
      const isCapped = quotaUsage.used >= quotaUsage.max;
      return res.status(429).json({
        error: "QUOTA_EXCEEDED",
        title: "You're an Amazing Runner, Slow Down or Contact Us",
        message: isCapped
          ? "You have analyzed 50 out of 50 links in this session! Your momentum is extraordinary. Please slow down and let these insights settle, or contact our team to unlock unlimited enterprise pipelines."
          : `You have ${quotaCheck.remaining} link slot(s) remaining in your session quota of 50, but submitted a batch of ${cleanedUrls.length} links. Please submit ${quotaCheck.remaining} or fewer links, or contact our team to unlock unlimited runs.`,
        quota: quotaUsage
      });
    }

    console.log(`Processing ${cleanedUrls.length} URL(s) across Browserless pool for [${fp}]:`, cleanedUrls);

    // Concurrently process across pool with round-robin distribution
    const results = await Promise.all(cleanedUrls.map(getTikTokData));
    console.log('Results processed successfully via Browserless pool');

    // Increment links consumed by this fingerprint
    const updatedQuota = limiter.consume(fp, cleanedUrls.length);
    res.setHeader('X-Sorot-Quota-Used', updatedQuota.used);
    res.setHeader('X-Sorot-Quota-Remaining', updatedQuota.remaining);
    console.log(`[Limiter] Fingerprint ${fp} consumed ${cleanedUrls.length} links. Session Total: ${updatedQuota.used}/${updatedQuota.max}`);

    return res.status(200).json(results);
  } catch (error) {
    console.error('Unhandled API error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
};
