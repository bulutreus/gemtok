const fs = require('fs');
const path = require('path');
const { TikTokLiveConnection } = require('tiktok-live-connector');

async function main() {
  const connection = new TikTokLiveConnection('tiktok');
  const giftList = await connection.fetchAvailableGifts();
  const gifts = giftList.gifts ?? giftList;

  const mapped = gifts
    .filter((g) => g.name && (g.image?.url_list?.[0] || g.icon?.url_list?.[0] || g.giftPictureUrl))
    .map((g) => ({
      name: g.name,
      url: g.image?.url_list?.[0] || g.icon?.url_list?.[0] || g.giftPictureUrl,
      diamonds: g.diamond_count ?? g.diamondCount ?? null,
      id: g.id ?? null,
    }));

  const seen = new Set();
  const unique = [];
  for (const gift of mapped) {
    const key = gift.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ name: gift.name, url: gift.url });
  }

  unique.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

  const outPath = path.join(__dirname, '..', 'gifts.js');
  const body = `// Auto-generated TikTok gift catalog (${unique.length} gifts)\nwindow.TIKTOK_GIFTS = ${JSON.stringify(unique, null, 2)};\n`;
  fs.writeFileSync(outPath, body, 'utf8');
  console.log(`Wrote ${unique.length} gifts to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
