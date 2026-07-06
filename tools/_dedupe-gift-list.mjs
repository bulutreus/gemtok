/** gift-list.json + loader.js — TR filtresi ve isim+jeton tekilleştirme */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { filterCatalogGifts } from "../gift-hub/lib/giftCatalogFilter.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const OUT_JSON = path.join(REPO_ROOT, "sıra", "gift-images", "gift-list.json");
const OUT_LOADER = path.join(REPO_ROOT, "sıra", "gift-images", "gift-list.loader.js");

const arr = JSON.parse(fs.readFileSync(OUT_JSON, "utf8"));
const before = arr.length;
const filtered = filterCatalogGifts(arr);
const publicRows = filtered.map(({ _iconUrl, ...rest }) => rest);

fs.writeFileSync(OUT_JSON, JSON.stringify(publicRows, null, 4) + "\n", "utf8");
const loaderBody =
  "/** Otomatik: tools/_dedupe-gift-list.mjs — file:// için */\n" +
  "window.__GEMTOK_GIFT_LIST__=" +
  JSON.stringify(publicRows) +
  ";\n";
fs.writeFileSync(OUT_LOADER, loaderBody, "utf8");
console.log("gift-list.json:", before, "→", publicRows.length, "(", before - publicRows.length, "kaldırıldı)");
