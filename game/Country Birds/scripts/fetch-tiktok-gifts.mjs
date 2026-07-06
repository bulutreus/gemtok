/**
 * TikTok webcast /gift/list — tüm hediyeleri indirir (id, ad, elmas, ikon).
 * Çıktı: src/data/tiktok-gifts-full.json
 * Çalıştır: npm run refresh-tiktok-gifts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, "..", "src", "data", "tiktok-gifts-full.json");

const params = new URLSearchParams({
  aid: "1988",
  app_language: "en",
  app_name: "tiktok_web",
  browser_language: "en-US",
  browser_name: "Mozilla",
  browser_online: "true",
  browser_platform: "Win32",
  browser_version: "5.0",
  cookie_enabled: "true",
  device_platform: "web_pc",
  focus_state: "true",
  is_fullscreen: "false",
  is_page_visible: "true",
  screen_height: "1080",
  screen_width: "1920",
  tz_name: "Europe/Istanbul",
  channel: "tiktok_web",
  data_collection_enabled: "true",
  os: "windows",
  priority_region: "TR",
  region: "TR",
  user_is_login: "false",
  webcast_language: "en",
  msToken: "",
});

const url = `https://webcast.tiktok.com/webcast/gift/list/?${params.toString()}`;

function iconUrl(g) {
  const u = g.icon?.url_list?.[0] ?? g.image?.url_list?.[0] ?? g.preview_image?.url_list?.[0];
  return typeof u === "string" && u.startsWith("http") ? u : null;
}

const r = await fetch(url, {
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
    Referer: "https://www.tiktok.com/",
    Accept: "application/json",
  },
});
if (!r.ok) {
  console.error("HTTP", r.status);
  process.exit(1);
}

const j = JSON.parse(await r.text());
const gifts = j.data?.gifts;
if (!Array.isArray(gifts)) {
  console.error("Beklenmeyen yanıt", Object.keys(j.data || {}));
  process.exit(1);
}

const byId = new Map();
for (const g of gifts) {
  const icon = iconUrl(g);
  if (!icon) continue;
  const id = Number(g.id);
  const diamonds = Math.max(1, Math.floor(Number(g.diamond_count) || 1));
  if (!Number.isFinite(id)) continue;
  if (!byId.has(id)) {
    byId.set(id, {
      id,
      name: String(g.name ?? "").trim() || `Gift ${id}`,
      diamonds,
      icon,
    });
  }
}

const list = [...byId.values()].sort((a, b) => a.id - b.id);
const payload = {
  fetchedAt: new Date().toISOString(),
  source: "https://webcast.tiktok.com/webcast/gift/list/",
  giftCount: list.length,
  gifts: list,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(payload)}\n`);
console.log(`Yazıldı: ${outPath} (${list.length} hediye)`);
