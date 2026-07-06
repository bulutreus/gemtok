/**
 * streamtoearn.io/gifts?region=XX sayfalarından hediye görsel URL'lerini toplar;
 * çıktı: sıra/streamtoearn-gifts-assets/gift-regions.json
 *   { "host/path": ["TR","DE", ...], ... }
 *
 * Repo kökü: node tools/fetch-streamtoearn-gift-regions.mjs
 * Not: Ağ gerekir; rate-limit için küçük gruplar halinde istek atar.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const SIRA_HTML = path.join(REPO_ROOT, "sıra", "StreamToEarn-Gifts.html");
const OUT_JSON = path.join(REPO_ROOT, "sıra", "streamtoearn-gifts-assets", "gift-regions.json");

const BASE = "https://streamtoearn.io/gifts";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function normKey(src) {
  const s = String(src || "")
    .trim()
    .split("?")[0];
  try {
    const u = new URL(s);
    return (u.hostname + u.pathname).toLowerCase();
  } catch {
    return s.replace(/^https?:\/\//i, "").toLowerCase();
  }
}

function extractRegionCodesFromSidebar(html) {
  const set = new Set();
  const re = /\?region=([A-Z]{2})\b/gi;
  let m;
  while ((m = re.exec(html))) set.add(m[1].toUpperCase());
  return [...set].sort();
}

function extractGiftImageUrls(html) {
  const urls = [];
  const re = /<div class="gift"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/gi;
  let m;
  while ((m = re.exec(html))) urls.push(m[1]);
  return urls;
}

async function fetchHtml(region) {
  const url = region ? `${BASE}?region=${encodeURIComponent(region)}` : BASE;
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html", Referer: BASE } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.text();
}

async function main() {
  if (!fs.existsSync(SIRA_HTML)) {
    console.error("Bulunamadı:", SIRA_HTML);
    process.exit(1);
  }
  const sidebar = fs.readFileSync(SIRA_HTML, "utf8");
  const codes = extractRegionCodesFromSidebar(sidebar);
  console.log("Bölge kodu sayısı:", codes.length);

  /** @type {Map<string, Set<string>>} */
  const keyToRegions = new Map();

  function addKeys(html, regionCode) {
    for (const src of extractGiftImageUrls(html)) {
      const k = normKey(src);
      if (!k) continue;
      if (!keyToRegions.has(k)) keyToRegions.set(k, new Set());
      keyToRegions.get(k).add(regionCode);
    }
  }

  console.log("Çekiliyor: tüm bölgeler (varsayılan sayfa)…");
  try {
    const allHtml = await fetchHtml("");
    addKeys(allHtml, "ALL");
  } catch (e) {
    console.warn("Varsayılan sayfa atlandı:", e.message || e);
  }

  const concurrency = 6;
  let idx = 0;
  async function worker() {
    for (;;) {
      const i = idx++;
      if (i >= codes.length) return;
      const code = codes[i];
      try {
        const h = await fetchHtml(code);
        addKeys(h, code);
        console.log("  OK", code, extractGiftImageUrls(h).length, "hediye");
      } catch (e) {
        console.warn("  Hata", code, e.message || e);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const out = {};
  for (const [k, set] of keyToRegions) {
    out[k] = [...set].sort();
  }
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 0), "utf8");
  console.log("Yazıldı:", OUT_JSON, "| anahtar:", Object.keys(out).length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
