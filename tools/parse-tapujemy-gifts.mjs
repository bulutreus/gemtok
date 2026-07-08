/**
 * Tapujemy gifts markdown → sira/gift-images/gift-list.json
 * Kaynak: https://tapujemy.pl/gifts (export veya uploads/gifts-0.md)
 * Blok: isim, boş, jeton, boş, isim (tekrar), boş, #tiktok_id
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { hasForeignLocaleName } from "../gift-hub/lib/giftCatalogFilter.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_MD = path.join(REPO_ROOT, "uploads", "gifts-0.md");
const OUT_JSON = path.join(REPO_ROOT, "sıra", "gift-images", "gift-list.json");
/** file:// ile açılınca fetch() çoğu tarayıcıda engellenir; sync script ile aynı veri yüklenir. */
const OUT_LOADER = path.join(REPO_ROOT, "sıra", "gift-images", "gift-list.loader.js");

function norm(s) {
  return String(s || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTapujemyMarkdown(raw) {
  const compact = raw
    .split(/\r?\n/)
    .map((l) => norm(l))
    .filter(Boolean);
  const byId = new Map();
  for (let k = 0; k + 3 < compact.length; k++) {
    const name = compact[k];
    const coinsStr = compact[k + 1];
    const nameDup = compact[k + 2];
    const idLine = compact[k + 3];
    const m = idLine.match(/^#(\d+)$/);
    if (!m) continue;
    if (name !== nameDup) continue;
    const coins = Number(coinsStr);
    if (!Number.isFinite(coins) || coins < 0 || coins > 1_000_000_000) continue;
    const id = Number(m[1]);
    if (!Number.isFinite(id) || id <= 0) continue;
    if (name.startsWith("*") || name.startsWith("©") || /https?:\/\//i.test(name)) continue;
    if (name === "Logo" || name === "Minuty") continue;
    byId.set(id, { code: id, name, coins, file: `${id}.webp` });
  }
  return Array.from(byId.values()).sort((a, b) => (a.coins !== b.coins ? a.coins - b.coins : a.code - b.code));
}

const mdPath = process.argv[2] || DEFAULT_MD;
if (!fs.existsSync(mdPath)) {
  console.error("Markdown bulunamadı:", mdPath);
  console.error("Kullanım: node tools/parse-tapujemy-gifts.mjs [gifts-0.md]");
  process.exit(1);
}
const raw = fs.readFileSync(mdPath, "utf8");
const gifts = parseTapujemyMarkdown(raw).filter((row) => !hasForeignLocaleName(row.name));
if (gifts.length < 100) {
  console.error("Çok az kayıt:", gifts.length, "— format kontrolü gerekli.");
  process.exit(1);
}
fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
const jsonText = JSON.stringify(gifts, null, 4) + "\n";
fs.writeFileSync(OUT_JSON, jsonText, "utf8");
const loaderBody =
  "/** Otomatik: node tools/parse-tapujemy-gifts.mjs — file:// için fetch yerine */\n" +
  "window.__GEMTOK_GIFT_LIST__=" +
  JSON.stringify(gifts) +
  ";\n";
fs.writeFileSync(OUT_LOADER, loaderBody, "utf8");
console.log("Yazıldı:", OUT_JSON, "|", OUT_LOADER, "| kayıt:", gifts.length);
