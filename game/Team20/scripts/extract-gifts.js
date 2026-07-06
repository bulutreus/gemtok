const fs = require('fs');
const path = require('path');
const https = require('https');
const { WebcastPushConnection } = require('tiktok-live-connector');

const TR_PARAMS = {
  app_language: 'tr-TR',
  browser_language: 'tr-TR',
  webcast_language: 'tr',
  region: 'TR',
  priority_region: 'TR',
  tz_name: 'Europe/Istanbul',
};

const TR_LIVE_USERS = [
  'demetozdemir', 'hadise', 'acunilicali', 'trthaber', 'ntv', 'haberturk',
  'showtv', 'kanald', 'atv', 'foxtr', 'cnnturk', 'trt1', 'sabah', 'turkiye',
];

const SOURCES = [
  {
    url: 'https://raw.githubusercontent.com/nglmercer/tiktok-live-giftnames/main/index.html',
    imgBase: 'https://raw.githubusercontent.com/nglmercer/tiktok-live-giftnames/main/index_files/',
  },
  {
    url: 'https://raw.githubusercontent.com/nglmercer/tiktok-live-giftnames/main/index2.html',
    imgBase: 'https://raw.githubusercontent.com/nglmercer/tiktok-live-giftnames/main/index_files/',
  },
];

const COUNTRIES_HTML = 'https://raw.githubusercontent.com/nglmercer/tiktok-live-giftnames/main/TikTok%20gifts%20list%20by%20countries.html';
const COUNTRIES_IMG = 'https://raw.githubusercontent.com/nglmercer/tiktok-live-giftnames/main/TikTok%20gifts%20list%20by%20countries_files/';

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function giftUrl(gift) {
  return gift.image?.url_list?.[0] || gift.icon?.url_list?.[0] || gift.giftPictureUrl || '';
}

function normalizeKey(name) {
  return (name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseCoins(text) {
  return Number((text ?? '').replace(/\./g, '').replace(/,/g, '').replace(/[^\d]/g, '')) || 0;
}

function decodeHtml(text) {
  return text
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .trim();
}

function extractIndexGifts(html, imgBase) {
  const gifts = [];
  const itemRe = /<div class="dx-item dx-list-item"[\s\S]*?<\/div>\s*<\/div>/gi;
  let block;
  while ((block = itemRe.exec(html))) {
    const chunk = block[0];
    const imgMatch = chunk.match(/src="\.\/index_files\/([^"]+)"/);
    const nameMatch = chunk.match(/<div>([^<]+)<\/div>\s*<div style="font-size: 0\.8em; margin-top: 3px;">\s*([^<]+)/);
    if (!imgMatch || !nameMatch) continue;
    gifts.push({
      name: decodeHtml(nameMatch[1]),
      diamonds: parseCoins(nameMatch[2]),
      url: imgBase + encodeURIComponent(imgMatch[1].trim()),
    });
  }
  return gifts;
}

function extractCountriesGifts(html) {
  const gifts = [];
  const re = /title="([^"]+)"[\s\S]*?src="\.\/TikTok gifts list by countries_files\/([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    gifts.push({
      name: decodeHtml(m[1]),
      diamonds: 0,
      url: COUNTRIES_IMG + encodeURIComponent(m[2]),
    });
  }
  return gifts;
}

function buildPriceLookup(extraSources) {
  const prices = new Map();
  for (const gift of extraSources) {
    const key = normalizeKey(gift.name);
    if (gift.diamonds > 0 && (!prices.has(key) || gift.diamonds < prices.get(key))) {
      prices.set(key, gift.diamonds);
    }
  }
  return prices;
}

function sortGifts(gifts) {
  return gifts.sort((a, b) => {
    const da = a.diamonds > 0 ? a.diamonds : Number.MAX_SAFE_INTEGER;
    const db = b.diamonds > 0 ? b.diamonds : Number.MAX_SAFE_INTEGER;
    if (da !== db) return da - db;
    return a.name.localeCompare(b.name, 'tr', { sensitivity: 'base' });
  });
}

async function fetchApiCatalog() {
  for (const user of TR_LIVE_USERS) {
    try {
      const conn = new WebcastPushConnection(user, {
        processInitialData: false,
        fetchRoomInfoOnConnect: false,
        clientParams: TR_PARAMS,
        requestHeaders: { 'Accept-Language': 'tr-TR,tr;q=0.9' },
      });

      try { await conn.getRoomInfo(); } catch { /* optional */ }

      const gifts = await conn.getAvailableGifts();
      if (Array.isArray(gifts) && gifts.length) {
        console.log(`API (TR): ${gifts.length} gifts via @${user}`);
        return gifts;
      }
    } catch (err) {
      console.warn(`API @${user}: ${err.message}`);
    }
  }
  throw new Error('API catalog fetch failed');
}

async function main() {
  const supplemental = [];
  for (const source of SOURCES) {
    const html = await fetchText(source.url);
    supplemental.push(...extractIndexGifts(html, source.imgBase));
  }
  supplemental.push(...extractCountriesGifts(await fetchText(COUNTRIES_HTML)));
  const priceLookup = buildPriceLookup(supplemental);
  console.log(`Price lookup entries: ${priceLookup.size}`);

  const catalog = new Map();
  const apiGifts = await fetchApiCatalog();

  for (const gift of apiGifts) {
    const url = giftUrl(gift);
    if (!gift.name || !url) continue;
    const key = normalizeKey(gift.name);
    catalog.set(key, {
      name: gift.name.trim(),
      url,
      diamonds: Number(gift.diamond_count || 0) || priceLookup.get(key) || 0,
    });
  }

  let added = 0;
  for (const gift of supplemental) {
    const key = normalizeKey(gift.name);
    const diamonds = gift.diamonds || priceLookup.get(key) || 0;
    if (catalog.has(key)) {
      const existing = catalog.get(key);
      if (!existing.diamonds && diamonds) existing.diamonds = diamonds;
      continue;
    }
    catalog.set(key, { name: gift.name, url: gift.url, diamonds });
    added += 1;
  }

  console.log(`Added ${added} supplemental gifts`);

  const gifts = sortGifts([...catalog.values()]);
  const out = path.join(__dirname, '..', 'gifts.js');
  const body = `// TikTok gift catalog (${gifts.length} gifts, Türkiye güncel + ek panel, elmas sıralı)\nwindow.TIKTOK_GIFTS = ${JSON.stringify(gifts, null, 2)};\n`;
  fs.writeFileSync(out, body, 'utf8');

  const zeroCount = gifts.filter((g) => !g.diamonds).length;
  const priced = gifts.filter((g) => g.diamonds > 0);
  console.log(`Wrote ${gifts.length} gifts, ${zeroCount} without price`);
  console.log(`Range: ${priced[0]?.diamonds} - ${priced[priced.length - 1]?.diamonds} diamonds`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
