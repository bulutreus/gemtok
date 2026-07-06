/**
 * gift-list.json içindeki TikTok hediye kodları için ikonları TikTok webcast CDN'den indirir.
 * Gerekir: game/vote5 içinde tiktok-live-connector (webcastConfig için).
 *
 * Kullanım (repo kökü): node tools/download-gift-images-tiktok-cdn.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

const CONFIG_CANDIDATES = [
  path.join(REPO_ROOT, "game", "vote5", "node_modules", "tiktok-live-connector", "dist", "lib", "webcastConfig.js"),
  path.join(REPO_ROOT, "node_modules", "tiktok-live-connector", "dist", "lib", "webcastConfig.js"),
];

function loadConfig() {
  for (const p of CONFIG_CANDIDATES) {
    if (fs.existsSync(p)) return require(p);
  }
  console.error("webcastConfig bulunamadı. Önce: cd game/vote5 && npm install");
  process.exit(1);
}

const Config = loadConfig();
const LIST_JSON = path.join(REPO_ROOT, "sıra", "gift-images", "gift-list.json");
const OUT_DIR = path.join(REPO_ROOT, "sıra", "gift-images");

async function fetchGiftCatalog() {
  const params = new URLSearchParams({
    ...Config.DEFAULT_CLIENT_PARAMS,
    resp_content_type: "json",
  });
  const url = "https://webcast.tiktok.com/webcast/gift/list/?" + params.toString();
  const r = await fetch(url, {
    headers: {
      "User-Agent": Config.DEFAULT_REQUEST_HEADERS["User-Agent"],
      Referer: "https://www.tiktok.com/",
      Origin: "https://www.tiktok.com",
      Accept: "application/json",
    },
  });
  if (!r.ok) throw new Error("gift/list HTTP " + r.status);
  const j = await r.json();
  const gifts = j?.data?.gifts;
  if (!Array.isArray(gifts)) throw new Error("gift/list: data.gifts yok");
  const map = new Map();
  for (const g of gifts) {
    const id = Number(g.id);
    const urls = g.icon?.url_list || g.image?.url_list;
    if (!Number.isFinite(id) || !Array.isArray(urls) || !urls[0]) continue;
    map.set(id, String(urls[0]));
  }
  return map;
}

async function downloadOne(url, dest) {
  const r = await fetch(url, {
    headers: {
      Referer: "https://www.tiktok.com/",
      "User-Agent": Config.DEFAULT_REQUEST_HEADERS["User-Agent"],
    },
  });
  if (!r.ok) throw new Error("CDN HTTP " + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 32) throw new Error("çok küçük gövde");
  fs.writeFileSync(dest, buf);
}

const CONCURRENCY = Number(process.argv[2]) || 8;
const DELAY_MS = Number(process.argv[3]) || 60;

async function main() {
  if (!fs.existsSync(LIST_JSON)) {
    console.error("Yok:", LIST_JSON);
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log("gift/list çekiliyor…");
  const catalog = await fetchGiftCatalog();
  console.log("TikTok hediye sayısı (CDN URL):", catalog.size);

  const list = JSON.parse(fs.readFileSync(LIST_JSON, "utf8"));
  if (!Array.isArray(list) || !list.length) {
    console.error("gift-list.json boş veya dizi değil");
    process.exit(1);
  }

  let ok = 0;
  let miss = 0;
  let err = 0;

  for (let i = 0; i < list.length; i += CONCURRENCY) {
    const chunk = list.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (row) => {
        const id = Number(row.code);
        if (!Number.isFinite(id)) return;
        const u = catalog.get(id);
        const dest = path.join(OUT_DIR, `${id}.webp`);
        if (!u) {
          miss++;
          return;
        }
        try {
          await downloadOne(u, dest);
          ok++;
        } catch (e) {
          err++;
          console.warn("#" + id, e.message || e);
        }
      })
    );
    if (i + CONCURRENCY < list.length) await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  const fallback = path.join(OUT_DIR, "5655.webp");
  let filled = 0;
  if (fs.existsSync(fallback)) {
    for (const row of list) {
      const id = Number(row.code);
      if (!Number.isFinite(id)) continue;
      const dest = path.join(OUT_DIR, `${id}.webp`);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(fallback, dest);
        filled++;
      }
    }
    if (filled) console.log("Eksik ID'ler için şablon kopyalandı (5655.webp):", filled);
  } else if (miss) {
    console.warn("5655.webp yok; eksik görseller doldurulamadı.");
  }

  console.log("Bitti:", { indirilen: ok, katalogdaYok: miss, hata: err, sablonlaDoldurulan: filled, giftListSatir: list.length });
  if (miss) console.warn("Not: TikTok gift/list bazı bölgesel ID'leri içermeyebilir; şablon ikon kullanıldı.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
