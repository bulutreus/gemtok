/**
 * TikTok webcast gift/list (çoklu ülke parametresiyle birleştirilir; API aynı küresel paneli döndürür)
 * + uploads/gifts-0.md (Tapujemy) ile birleşik katalog → gift-list.json + gift-list.loader.js + CDN görselleri.
 *
 * Not: TikTok resmi gift/list yanıtı denenen tüm region/priority_region değerlerinde aynı 552 benzersiz ID
 * verdi; bölgesel ek set yok. Yine de bir dizi ülkeden istek atılıp kayıtlar birleştirilir (gelecekteki
 * farklar için). Tapujemy’de olup API’de olmayan ID’ler listeye eklenir; görseli şablonla doldurulur.
 *
 * Kullanım (repo kökü):
 *   node tools/sync-global-gifts-tiktok.mjs
 *   node tools/sync-global-gifts-tiktok.mjs --no-download
 *   node tools/sync-global-gifts-tiktok.mjs --md path/to/gifts-0.md
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { filterCatalogGifts, hasForeignLocaleName } from "../gift-hub/lib/giftCatalogFilter.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

const CONFIG_CANDIDATES = [
  path.join(REPO_ROOT, "game", "vote5", "node_modules", "tiktok-live-connector", "dist", "lib", "webcastConfig.js"),
  path.join(REPO_ROOT, "node_modules", "tiktok-live-connector", "dist", "lib", "webcastConfig.js"),
];

const DEFAULT_MD = path.join(REPO_ROOT, "uploads", "gifts-0.md");
const OUT_JSON = path.join(REPO_ROOT, "sıra", "gift-images", "gift-list.json");
const OUT_LOADER = path.join(REPO_ROOT, "sıra", "gift-images", "gift-list.loader.js");
const OUT_DIR = path.join(REPO_ROOT, "sıra", "gift-images");

/** TikTok istemcisinde kullanılan ülke/bölge kodları (gift/list birleştirme taraması). */
const REGION_CODES = [
  "US", "GB", "DE", "FR", "IT", "ES", "PT", "NL", "BE", "PL", "TR", "RU", "UA",
  "BR", "MX", "AR", "CL", "CO", "JP", "KR", "TW", "HK", "IN", "ID", "TH", "VN",
  "PH", "MY", "SG", "AU", "NZ", "SA", "AE", "EG", "NG", "ZA", "IL", "CA", "CH",
  "AT", "SE", "NO", "DK", "FI", "CZ", "RO", "HU", "GR", "IE",
];

function loadConfig() {
  for (const p of CONFIG_CANDIDATES) {
    if (fs.existsSync(p)) return require(p);
  }
  console.error("webcastConfig bulunamadı. Önce: cd game/vote5 && npm install");
  process.exit(1);
}

const Config = loadConfig();

function norm(s) {
  return String(s || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tapujemy markdown → Map<id, { code, name, coins }> */
function parseTapujemyMarkdownToMap(raw) {
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
    byId.set(id, { code: id, name, coins });
  }
  return byId;
}

async function fetchGiftListForRegion(region) {
  const params = new URLSearchParams({
    ...Config.DEFAULT_CLIENT_PARAMS,
    resp_content_type: "json",
    region,
    priority_region: region,
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
  if (!r.ok) throw new Error(`gift/list ${region} HTTP ${r.status}`);
  const j = await r.json();
  const gifts = j?.data?.gifts;
  if (!Array.isArray(gifts)) throw new Error(`gift/list ${region}: data.gifts yok`);
  return gifts;
}

/** Görünen adları ABD `gift/list` ile hizala (TikTok’un İngilizce paneli). */
async function overlayEnglishNamesFromUs(mergedMap) {
  const us = await fetchGiftListForRegion("US");
  const names = new Map();
  for (const g of us) {
    const id = Number(g.id);
    if (!Number.isFinite(id)) continue;
    names.set(id, String(g.name || "").trim() || `Gift ${id}`);
  }
  for (const [id, row] of mergedMap) {
    if (names.has(id)) row.name = names.get(id);
  }
}

/** Tüm bölge isteklerinden hediye birleştir (aynı ID → tek kayıt). Paralel küçük gruplarla hızlı tarama. */
async function fetchMergedTiktokGifts() {
  const merged = new Map();
  let regionsOk = 0;
  const BATCH = 6;
  for (let i = 0; i < REGION_CODES.length; i += BATCH) {
    const batch = REGION_CODES.slice(i, i + BATCH);
    const settled = await Promise.allSettled(batch.map((region) => fetchGiftListForRegion(region)));
    for (let j = 0; j < settled.length; j++) {
      const region = batch[j];
      const s = settled[j];
      if (s.status === "rejected") {
        console.warn(`[${region}]`, s.reason?.message || s.reason);
        continue;
      }
      regionsOk++;
      const gifts = s.value;
      for (const g of gifts) {
        const id = Number(g.id);
        const urls = g.icon?.url_list || g.image?.url_list;
        const iconUrl = Array.isArray(urls) && urls[0] ? String(urls[0]) : null;
        if (!Number.isFinite(id)) continue;
        const prev = merged.get(id);
        if (!prev) {
          merged.set(id, {
            id,
            name: String(g.name || "").trim() || `Gift ${id}`,
            diamond_count: Math.max(0, Math.floor(Number(g.diamond_count) || 0)),
            iconUrl,
          });
        } else if (iconUrl && !prev.iconUrl) {
          prev.iconUrl = iconUrl;
        }
      }
    }
    await new Promise((r) => setTimeout(r, 45));
  }
  console.log(
    "TikTok: başarılı bölge yanıtı:",
    regionsOk + "/" + REGION_CODES.length,
    "| benzersiz hediye ID:",
    merged.size,
    "(API şu an tüm bölgelerde aynı paneli döndürüyor olabilir.)"
  );
  return merged;
}

function buildGiftRows(tiktokMap, tapMap) {
  /** İsim: önce ABD TikTok (overlay); yoksa Tapujemy. Sıra: jeton artan, sonra kod. */
  const unionIds = new Set([...tiktokMap.keys(), ...tapMap.keys()]);
  const rows = [];
  for (const id of unionIds) {
    const t = tiktokMap.get(id);
    const p = tapMap.get(id);
    const name = (t && t.name) || (p && p.name) || `Gift ${id}`;
    const coins =
      t != null
        ? Math.max(0, Math.floor(Number(t.diamond_count) || 0))
        : Math.max(0, Math.floor(Number(p?.coins) || 0));
    rows.push({
      code: id,
      name,
      coins,
      file: `${id}.webp`,
      _iconUrl: t?.iconUrl || null,
    });
  }
  rows.sort((a, b) => (a.coins !== b.coins ? a.coins - b.coins : a.code - b.code));
  return rows;
}

function writeListArtifacts(rows) {
  const catalogRows = filterCatalogGifts(rows);
  const publicRows = catalogRows.map(({ _iconUrl, ...rest }) => rest);
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(publicRows, null, 4) + "\n", "utf8");
  const loaderBody =
    "/** Otomatik: node tools/sync-global-gifts-tiktok.mjs — file:// için */\n" +
    "window.__GEMTOK_GIFT_LIST__=" +
    JSON.stringify(publicRows) +
    ";\n";
  fs.writeFileSync(OUT_LOADER, loaderBody, "utf8");
  console.log("Yazıldı:", OUT_JSON, "|", OUT_LOADER, "| kayıt:", publicRows.length);
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

async function downloadAllImages(rows, concurrency, delayMs) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let ok = 0;
  let skip = 0;
  let err = 0;
  for (let i = 0; i < rows.length; i += concurrency) {
    const chunk = rows.slice(i, i + concurrency);
    await Promise.all(
      chunk.map(async (row) => {
        const id = row.code;
        const dest = path.join(OUT_DIR, `${id}.webp`);
        const u = row._iconUrl;
        if (!u) {
          skip++;
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
    if (i + concurrency < rows.length) await new Promise((r) => setTimeout(r, delayMs));
  }
  const fallback = path.join(OUT_DIR, "5655.webp");
  let filled = 0;
  if (fs.existsSync(fallback)) {
    for (const row of rows) {
      const dest = path.join(OUT_DIR, `${row.code}.webp`);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(fallback, dest);
        filled++;
      }
    }
  }
  console.log("Görseller:", { indirilen: ok, urlYok: skip, hata: err, sablon: filled });
}

function parseArgs(argv) {
  const out = { noDownload: false, mdPath: DEFAULT_MD };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--no-download") out.noDownload = true;
    else if (argv[i] === "--md" && argv[i + 1]) {
      out.mdPath = argv[++i];
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const tiktokMap = await fetchMergedTiktokGifts();
  await overlayEnglishNamesFromUs(tiktokMap);
  let tapMap = new Map();
  if (fs.existsSync(args.mdPath)) {
    const raw = fs.readFileSync(args.mdPath, "utf8");
    tapMap = parseTapujemyMarkdownToMap(raw);
    console.log("Tapujemy (md) kayıt:", tapMap.size);
  } else {
    console.warn("Markdown yok, yalnızca TikTok:", args.mdPath);
  }

  const rows = buildGiftRows(tiktokMap, tapMap)
    .filter((row) => !hasForeignLocaleName(row.name));
  const trGifts = await fetchGiftListForRegion("TR");
  const trIds = new Set(
    trGifts.map((g) => Number(g.id)).filter((id) => Number.isFinite(id) && id > 0)
  );
  const trRows = rows.filter((row) => trIds.has(row.code));
  const existingRegions = new Map();
  if (fs.existsSync(OUT_JSON)) {
    try {
      for (const row of JSON.parse(fs.readFileSync(OUT_JSON, "utf8"))) {
        if (Array.isArray(row.regions) && row.regions.length) existingRegions.set(row.code, row.regions);
      }
    } catch (_e) {}
  }
  for (const row of trRows) {
    row.regions = existingRegions.get(row.code) || ["TR"];
  }
  writeListArtifacts(trRows);

  if (!args.noDownload) {
    await downloadAllImages(trRows, Number(process.env.GEMTOK_GIFT_DL_CONC) || 10, Number(process.env.GEMTOK_GIFT_DL_DELAY_MS) || 40);
  } else {
    console.log("--no-download: görseller atlandı.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
