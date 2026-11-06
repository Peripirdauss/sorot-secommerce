// Use plain puppeteer instead of puppeteer-extra
const puppeteer = require("puppeteer");

// Load environment variables in development
if (process.env.NODE_ENV !== "production") {
  require('dotenv').config();
}

const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN;
const BROWSERLESS_WS = `wss://chrome.browserless.io?token=${BROWSERLESS_TOKEN}`;

// Log environment info for debugging
console.log('Environment:', process.env.NODE_ENV);
console.log('Browserless Token available:', !!BROWSERLESS_TOKEN);

async function delay(ms) {
  return new Promise(res => setTimeout(res, ms));
}

async function getTikTokData(url) {
  let browser;
  try {
    console.log('Connecting to Browserless...');
    if (!BROWSERLESS_TOKEN) {
      throw new Error('BROWSERLESS_TOKEN is not defined');
    }
    
    browser = await puppeteer.connect({ 
      browserWSEndpoint: BROWSERLESS_WS,
      timeout: 90000 // Increase timeout to 90 seconds
    });
    console.log('Successfully connected to Browserless');
    
    const page = await browser.newPage();
    console.log('Page created, navigating to:', url);
    
    // Set evasion techniques manually
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Add basic evasion techniques
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
    });
    
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    console.log('Page loaded, waiting...');
    await delay(8000);

    console.log('Extracting data...');
    const mainData = await page.evaluate(() => {
      const scripts = Array.from(document.getElementsByTagName('script'));
      const sigiScript = scripts.find(s => s.textContent?.includes('__DEFAULT_SCOPE__'));
      if (!sigiScript) return { error: "No JSON data found" };
      try {
        const jsonData = JSON.parse(sigiScript.textContent);
        const itemStruct = jsonData?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct || {};
        const statsV2 = itemStruct.statsV2 || {};
        const authorStats = itemStruct.authorStats || {};
        const shareMeta = jsonData?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.shareMeta || {};
        return {
          videoId: itemStruct.id || '',
          createdTime: itemStruct.createTime ? new Date(itemStruct.createTime * 1000).toLocaleString() : '',
          duration: itemStruct.music?.duration || 0,
          isCopyrighted: itemStruct.music?.isCopyrighted || false,
          musicId: itemStruct.music?.id || '',
          sound: itemStruct.music?.title || '',
          like: statsV2.diggCount || '0',
          share: statsV2.shareCount || '0',
          comments: statsV2.commentCount || '0',
          views: statsV2.playCount || '0',
          saves: statsV2.collectCount || '0',
          repost: statsV2.repostCount || '0',
          followers: authorStats.followerCount || 0,
          following: authorStats.followingCount || 0,
          'like-account': authorStats.heartCount || 0,
          'video-count': authorStats.videoCount || 0,
          friends: authorStats.friendCount || 0,
          isAD: itemStruct.isAd || false,
          title: shareMeta.title || '',
          description: shareMeta.desc || ''
        };
      } catch (e) {
        return { error: "Failed to parse JSON: " + e.message };
      }
    });

    console.log('Data extracted:', Object.keys(mainData).join(', '));
    await page.close();
    return mainData;
  } catch (error) {
    console.error('Error during scraping:', error);
    return { url, error: error.message };
  } finally {
    try {
      if (browser) {
        await browser.disconnect();
        console.log('Browser disconnected');
      }
    } catch (disconnectErr) {
      console.error('Error disconnecting browser:', disconnectErr);
    }
  }
}

// Extract latest video links from creator profile
async function getTikTokUserVideos(username) {
  let browser;
  try {
    const cleanUser = username.replace(/^@/, '').trim();
    const profileUrl = `https://www.tiktok.com/@${cleanUser}`;
    console.log('Connecting to Browserless for profile extraction:', profileUrl);

    if (!BROWSERLESS_TOKEN) {
      throw new Error('BROWSERLESS_TOKEN is not defined');
    }

    browser = await puppeteer.connect({
      browserWSEndpoint: BROWSERLESS_WS,
      timeout: 90000
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    });

    await page.goto(profileUrl, { waitUntil: 'networkidle0', timeout: 60000 });
    await delay(7000);

    const videoUrls = await page.evaluate((uname) => {
      const links = Array.from(document.querySelectorAll('a[href*="/video/"]'));
      const hrefs = links.map(a => a.href).filter(href => href.includes('/video/'));
      const unique = [...new Set(hrefs)].slice(0, 12);
      if (unique.length > 0) return unique;

      const scripts = Array.from(document.getElementsByTagName('script'));
      const sigiScript = scripts.find(s => s.textContent?.includes('__DEFAULT_SCOPE__') || s.textContent?.includes('SIGI_STATE'));
      if (sigiScript) {
        try {
          const json = JSON.parse(sigiScript.textContent);
          const itemList = json?.__DEFAULT_SCOPE__?.['webapp.user-detail']?.itemList || json?.ItemModule;
          if (Array.isArray(itemList)) {
            return itemList.slice(0, 12).map(id => `https://www.tiktok.com/@${uname}/video/${id}`);
          }
        } catch (e) {}
      }
      return [];
    }, cleanUser);

    await page.close();
    return { username: cleanUser, profileUrl, videoUrls };
  } catch (err) {
    console.error('Error extracting profile videos:', err);
    return { username, error: err.message, videoUrls: [] };
  } finally {
    if (browser) {
      try { await browser.disconnect(); } catch (e) {}
    }
  }
}

// Vercel serverless function handler
module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  console.log('API request received:', req.method, req.url);
  
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: "Method not allowed" });
    }
    
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        body = {};
      }
    }

    // Handle profile extraction mode
    if (body?.username) {
      console.log('Profile extraction requested for:', body.username);
      const profileResult = await getTikTokUserVideos(body.username);
      return res.status(200).json(profileResult);
    }
    
    // Handle URL array mode
    const urls = body?.urls;
    if (!urls || !Array.isArray(urls)) {
      return res.status(400).json({ error: "Invalid request, missing urls or username" });
    }
    
    console.log('Processing URLs:', urls);
    const results = await Promise.all(urls.map(getTikTokData));
    console.log('Results processed successfully');
    
    return res.status(200).json(results);
  } catch (error) {
    console.error('Unhandled API error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
};
