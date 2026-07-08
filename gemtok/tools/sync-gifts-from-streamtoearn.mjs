/**
 * StreamToEarn (streamtoearn.io/gifts) bölge sayfalarındaki hediye kartları + TikTok webcast gift/list
 * eşlemesi → sira/gift-images/gift-list.json (+ loader) + isteğe bağlı ikon indirme.
 *
 * Eşleme: TikTok CDN ikon URL’sindeki 32 hex (resource/…png veya ~tplv öncesi) → resmi API’deki aynı ikon.
 * Yedek: isim + jeton (TikTok diamond_count) tam eşleşmesi (tek aday varsa).
 *
 * Kaynak: herkese açık HTML — streamtoearn.io/gifts (bölge ?region=XX) + TikTok webcast gift/list.
 * StreamToEarn’de olup TikTok API’de artık olmayan ikonlar eşlenemeyebilir (senkron çıktısında uyarı sayıları).
 *
 * Kullanım (repo kökü):
 *   node tools/sync-gifts-from-streamtoearn.mjs
 *   node tools/sync-gifts-from-streamtoearn.mjs --no-download
 *   node tools/sync-gifts-from-streamtoearn.mjs --md uploads/gifts-0.md
 *   node tools/sync-gifts-from-streamtoearn.mjs --html "C:/path/TikTok gifts list by countries.html"
 *   node tools/sync-gifts-from-streamtoearn.mjs --s2e-offline   (yalnızca yerel HTML; bölge ağı yok)
 *
 * Yerel anlık görüntü: önce `sira/hediyeler.html` (node tools/mirror-streamtoearn-gifts-page.mjs), sonra gift-hub/giftlist, uploads yedeği.
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

const DEFAULT_MD = path.join(REPO_ROOT, "uploads", "gifts-0.md");
/** Ağdan indirilen streamtoearn.io/gifts aynası (öncelikli). */
const DEFAULT_LOCAL_S2E_HTML_MIRROR = path.join(REPO_ROOT, "sıra", "hediyeler.html");
/** Tarayıcıdan kaydedilen tam sayfa — gift-hub/giftlist, yedek uploads. */
const DEFAULT_LOCAL_S2E_HTML_HUB = path.join(
  REPO_ROOT,
  "gift-hub",
  "giftlist",
  "TikTok gifts list by countries.html",
);
const DEFAULT_LOCAL_S2E_HTML_UPLOADS = path.join(REPO_ROOT, "uploads", "TikTok-gifts-list-by-countries.html");
const OUT_JSON = path.join(REPO_ROOT, "sıra", "gift-images", "gift-list.json");
const OUT_LOADER = path.join(REPO_ROOT, "sıra", "gift-images", "gift-list.loader.js");
const OUT_DIR = path.join(REPO_ROOT, "sıra", "gift-images");
const S2E_BASE = "https://streamtoearn.io/gifts";

/** TikTok gift/list birleştirme (sync-global-gifts-tiktok ile aynı küme). */
const TIKTOK_MERGE_REGIONS = [
  "US", "GB", "DE", "FR", "IT", "ES", "PT", "NL", "BE", "PL", "TR", "RU", "UA",
  "BR", "MX", "AR", "CL", "CO", "JP", "KR", "TW", "HK", "IN", "ID", "TH", "VN",
  "PH", "MY", "SG", "AU", "NZ", "SA", "AE", "EG", "NG", "ZA", "IL", "CA", "CH",
  "AT", "SE", "NO", "DK", "FI", "CZ", "RO", "HU", "GR", "IE",
];

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

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

function normName(s) {
  return norm(s).toLowerCase();
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
async function overlayEnglishNamesFromUs(byIdMap) {
  const us = await fetchGiftListForRegion("US");
  const names = new Map();
  for (const g of us) {
    const id = Number(g.id);
    if (!Number.isFinite(id)) continue;
    names.set(id, String(g.name || "").trim() || `Gift ${id}`);
  }
  for (const [id, row] of byIdMap) {
    if (names.has(id)) row.name = names.get(id);
  }
}

async function fetchMergedTiktokRawGifts() {
  const mergedById = new Map();
  let regionsOk = 0;
  const BATCH = 6;
  for (let i = 0; i < TIKTOK_MERGE_REGIONS.length; i += BATCH) {
    const batch = TIKTOK_MERGE_REGIONS.slice(i, i + BATCH);
    const settled = await Promise.allSettled(batch.map((region) => fetchGiftListForRegion(region)));
    for (let j = 0; j < settled.length; j++) {
      const region = batch[j];
      const s = settled[j];
      if (s.status === "rejected") {
        console.warn("[tiktok]", region, s.reason?.message || s.reason);
        continue;
      }
      regionsOk++;
      for (const g of s.value) {
        const id = Number(g.id);
        if (!Number.isFinite(id)) continue;
        if (!mergedById.has(id)) mergedById.set(id, g);
      }
    }
    await new Promise((r) => setTimeout(r, 45));
  }
  const list = [...mergedById.values()];
  console.log(
    "TikTok birleşik:",
    regionsOk + "/" + TIKTOK_MERGE_REGIONS.length,
    "bölge | benzersiz hediye:",
    list.length,
  );
  return list;
}

/** p16/p19 ve sorgu dizesi farklarını yok sayarak tam CDN URL (indeks anahtarı). */
function normalizeGiftCdnUrl(u) {
  return String(u || "")
    .trim()
    .replace(/^https?:\/\/p19-webcast\.tiktokcdn\.com\//i, "https://p16-webcast.tiktokcdn.com/")
    .replace(/^https?:\/\/p16-webcast\.tiktokcdn\.com\//i, "https://p16-webcast.tiktokcdn.com/")
    .split("?")[0];
}

/** TikTok CDN yol varyantları (alisg / maliva). */
function cdnUrlVariants(u) {
  const b = normalizeGiftCdnUrl(u);
  const v = new Set([b]);
  v.add(b.replace(/\/img\/maliva\//i, "/img/alisg/"));
  v.add(b.replace(/\/img\/alisg\//i, "/img/maliva/"));
  return v;
}

function buildExactUrlIndex(gifts) {
  const m = new Map();
  for (const g of gifts) {
    const id = Number(g.id);
    if (!Number.isFinite(id)) continue;
    const lists = [g.icon?.url_list, g.image?.url_list].filter(Boolean);
    for (const arr of lists) {
      if (!Array.isArray(arr)) continue;
      for (const u of arr) {
        for (const k of cdnUrlVariants(u)) {
          if (k && !m.has(k)) m.set(k, id);
        }
      }
    }
  }
  return m;
}

/** TikTok tek bölge yanıtı yeterli (ikon küresel); id → meta */
function buildTiktokById(gifts) {
  const byId = new Map();
  for (const g of gifts) {
    const id = Number(g.id);
    if (!Number.isFinite(id)) continue;
    const urls = g.icon?.url_list || g.image?.url_list;
    const iconUrl = Array.isArray(urls) && urls[0] ? String(urls[0]) : "";
    const name = String(g.name || "").trim() || `Gift ${id}`;
    const diamond_count = Math.max(0, Math.floor(Number(g.diamond_count) || 0));
    byId.set(id, { id, name, diamond_count, iconUrl });
  }
  return byId;
}

function candidatesByIconKey(imgKey, gifts) {
  if (!imgKey) return [];
  const seen = new Set();
  const out = [];
  for (const g of gifts) {
    const id = Number(g.id);
    if (!Number.isFinite(id) || seen.has(id)) continue;
    const lists = [g.icon?.url_list, g.image?.url_list].filter(Boolean);
    let hit = false;
    for (const arr of lists) {
      if (!Array.isArray(arr)) continue;
      for (const iconUrl of arr) {
        if (assetKeyFromImgUrl(String(iconUrl)) === imgKey) {
          hit = true;
          break;
        }
      }
      if (hit) break;
    }
    if (hit) {
      seen.add(id);
      out.push(g);
    }
  }
  return out;
}

/**
 * StreamToEarn kartı → TikTok id (tam CDN URL → id; sonra ikon hash + jeton + isim / alt / describe).
 */
function resolveTiktokIdFromStreamRow(streamName, streamCoins, streamImg, altHint, gifts, urlIndex) {
  for (const k of cdnUrlVariants(streamImg)) {
    if (urlIndex.has(k)) return urlIndex.get(k);
  }

  const imgKey = assetKeyFromImgUrl(streamImg);
  const byIcon = candidatesByIconKey(imgKey, gifts);
  if (byIcon.length === 1) return Number(byIcon[0].id);

  let c1 = byIcon.filter((g) => Math.max(0, Math.floor(Number(g.diamond_count) || 0)) === streamCoins);
  if (c1.length === 0) c1 = byIcon;

  const tryNames = [streamName, altHint].filter(Boolean);
  for (const label of tryNames) {
    const nn = normName(label);
    if (!nn) continue;
    const c = c1.filter((g) => normName(String(g.name || "")) === nn);
    if (c.length === 1) return Number(c[0].id);
  }

  for (const label of tryNames) {
    const nn = normName(label);
    if (!nn) continue;
    const c = c1.filter((g) => normName(String(g.describe || "")).includes(nn));
    if (c.length === 1) return Number(c[0].id);
  }

  if (c1.length === 1) return Number(c1[0].id);
  if (c1.length > 1) {
    const ids = [...new Set(c1.map((g) => Number(g.id)))].sort((a, b) => a - b);
    if (process.env.GEMTOK_S2E_VERBOSE === "1") {
      console.warn("[s2e] çoklu aday (en küçük id):", streamName, "/", altHint, streamCoins, ids.join(","));
    }
    return ids[0];
  }
  return fallbackIdByNameCoins(streamName, streamCoins, gifts);
}

function fallbackIdByNameCoins(name, coins, gifts) {
  const nn = normName(name);
  const cands = [];
  for (const g of gifts) {
    const id = Number(g.id);
    if (!Number.isFinite(id)) continue;
    const dc = Math.max(0, Math.floor(Number(g.diamond_count) || 0));
    if (dc !== coins) continue;
    if (normName(String(g.name || "")) === nn) cands.push(id);
  }
  if (cands.length === 1) return cands[0];
  return null;
}

function assetKeyFromImgUrl(url) {
  const u = String(url || "");
  const m32 = u.match(/([a-f0-9]{32})(?:\.png|~tplv|\.webp)/i);
  if (m32) return m32[1].toLowerCase();
  const m = u.match(/webcast-va\/([a-f0-9]{32})/i);
  if (m) return m[1].toLowerCase();
  return null;
}

function parseGiftsFromStreamtoearnHtml(html) {
  const out = [];
  const parts = html.split('<div class="gift"');
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i];
    const dm = chunk.match(/^ data-price="([^"]+)">/);
    if (!dm) continue;
    const inner = chunk.slice(dm[0].length);
    const sm = inner.match(/<img[^>]+src="([^"]+)"/);
    const am = inner.match(/\balt="([^"]*)"/);
    const nm = inner.match(/<p class="gift-name">([^<]*)<\/p>/);
    const pm = inner.match(/<p class="gift-price">(\d+)/);
    if (!sm || !nm || !pm) continue;
    let altHint = "";
    if (am) {
      altHint = norm(String(am[1]).replace(/\s*TikTok\s*gift\s*$/i, "").trim());
    }
    out.push({
      priceBucket: dm[1],
      img: sm[1].trim(),
      altHint,
      name: norm(nm[1]),
      coins: Math.max(0, Math.floor(Number(pm[1]) || 0)),
    });
  }
  return out;
}

function discoverRegionCodesFromIndexHtml(html) {
  const set = new Set();
  for (const m of html.matchAll(/[?&]region=([A-Z]{2})\b/g)) {
    set.add(m[1]);
  }
  return [...set].sort();
}

async function fetchText(url) {
  const r = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
      Referer: S2E_BASE + "/",
    },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.text();
}

function parseArgs(argv) {
  const out = {
    noDownload: false,
    mdPath: DEFAULT_MD,
    /** Açık yol; yoksa gift-hub/giftlist veya uploads anlık görüntüsü dolu sayılır */
    htmlPath: null,
    /** true: streamtoearn.io bölge sayfalarını fetch etme (yalnızca yerel HTML + TikTok API) */
    s2eOffline: false,
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--no-download") out.noDownload = true;
    else if (argv[i] === "--s2e-offline") out.s2eOffline = true;
    else if (argv[i] === "--md" && argv[i + 1]) {
      out.mdPath = argv[++i];
    } else if (argv[i] === "--html" && argv[i + 1]) {
      out.htmlPath = argv[++i];
    }
  }
  if (!out.htmlPath) {
    if (fs.existsSync(DEFAULT_LOCAL_S2E_HTML_MIRROR)) out.htmlPath = DEFAULT_LOCAL_S2E_HTML_MIRROR;
    else if (fs.existsSync(DEFAULT_LOCAL_S2E_HTML_HUB)) out.htmlPath = DEFAULT_LOCAL_S2E_HTML_HUB;
    else if (fs.existsSync(DEFAULT_LOCAL_S2E_HTML_UPLOADS)) out.htmlPath = DEFAULT_LOCAL_S2E_HTML_UPLOADS;
  }
  return out;
}

function writeListArtifacts(rows) {
  const publicRows = rows.map(({ _iconUrl, ...rest }) => rest);
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(publicRows, null, 4) + "\n", "utf8");
  const loaderBody =
    "/** Otomatik: node tools/sync-gifts-from-streamtoearn.mjs — file:// için */\n" +
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
      }),
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

async function main() {
  const args = parseArgs(process.argv);
  console.log("TikTok gift/list birleştiriliyor…");
  const ttGifts = await fetchMergedTiktokRawGifts();
  const urlIndex = buildExactUrlIndex(ttGifts);
  console.log("CDN tam URL indeksi:", urlIndex.size);
  const tiktokById = buildTiktokById(ttGifts);
  await overlayEnglishNamesFromUs(tiktokById);
  console.log("TikTok API hediye:", tiktokById.size);

  /** id → { regions:Set, s2eNames:Set } */
  const fromS2e = new Map();
  let unmatched = 0;
  let matched = 0;

  function ingestStreamtoearnGiftsHtml(html, regionIso) {
    const gifts = parseGiftsFromStreamtoearnHtml(html);
    for (const g of gifts) {
      const id = resolveTiktokIdFromStreamRow(g.name, g.coins, g.img, g.altHint, ttGifts, urlIndex);
      if (id == null) {
        unmatched++;
        continue;
      }
      matched++;
      let rec = fromS2e.get(id);
      if (!rec) {
        rec = { regions: new Set(), s2eNames: new Set() };
        fromS2e.set(id, rec);
      }
      if (regionIso) rec.regions.add(regionIso);
      if (g.name) rec.s2eNames.add(g.name);
    }
  }

  if (args.htmlPath) {
    if (!fs.existsSync(args.htmlPath)) {
      console.error("HTML bulunamadı:", args.htmlPath);
      process.exit(1);
    }
    const localHtml = fs.readFileSync(args.htmlPath, "utf8");
    console.log("StreamToEarn yerel HTML:", args.htmlPath);
    ingestStreamtoearnGiftsHtml(localHtml, "");
  }

  if (args.s2eOffline) {
    if (!args.htmlPath) {
      console.error(
        "--s2e-offline için --html veya sira/hediyeler.html (veya gift-hub/uploads yedeği) gerekli.",
      );
      process.exit(1);
    }
    console.log("--s2e-offline: bölge sayfaları atlandı (hediye bölgeleri boş kalabilir).");
  } else {
    console.log("StreamToEarn bölge listesi (ağ)…");
    let indexHtml;
    if (args.htmlPath && fs.existsSync(args.htmlPath)) {
      indexHtml = fs.readFileSync(args.htmlPath, "utf8");
    } else {
      indexHtml = await fetchText(S2E_BASE);
    }
    const regionCodes = discoverRegionCodesFromIndexHtml(indexHtml);
    console.log("Bölge sayfası:", regionCodes.length, regionCodes.slice(0, 8).join(", "), "…");

    for (let r = 0; r < regionCodes.length; r++) {
      const code = regionCodes[r];
      const url = `${S2E_BASE}?region=${encodeURIComponent(code)}`;
      const html = await fetchText(url);
      ingestStreamtoearnGiftsHtml(html, code);
      if ((r + 1) % 10 === 0) console.log("  bölge", r + 1, "/", regionCodes.length);
      await new Promise((res) => setTimeout(res, Number(process.env.GEMTOK_S2E_DELAY_MS) || 85));
    }
  }

  console.log("StreamToEarn eşleşen kart:", matched, "| eşlenemedi:", unmatched, "| benzersiz id:", fromS2e.size);

  let tapMap = new Map();
  if (fs.existsSync(args.mdPath)) {
    const raw = fs.readFileSync(args.mdPath, "utf8");
    tapMap = parseTapujemyMarkdownToMap(raw);
    console.log("Tapujemy (md) kayıt:", tapMap.size);
  } else {
    console.warn("Markdown yok:", args.mdPath);
  }

  const unionIds = new Set([...tiktokById.keys(), ...fromS2e.keys(), ...tapMap.keys()]);
  const rows = [];

  for (const id of unionIds) {
    const t = tiktokById.get(id);
    const p = tapMap.get(id);
    const s2e = fromS2e.get(id);
    /** İsim: TikTok (birleşik API, US öncelikli) → İngilizce; Tapujemy yedek. */
    const name = (t && t.name) || (p && p.name) || `Gift ${id}`;
    const coins =
      t != null
        ? Math.max(0, Math.floor(Number(t.diamond_count) || 0))
        : Math.max(0, Math.floor(Number(p?.coins) || 0));
    const regions = s2e ? [...s2e.regions].sort() : [];
    rows.push({
      code: id,
      name,
      coins,
      file: `${id}.webp`,
      regions,
      _iconUrl: t?.iconUrl || null,
    });
  }

  rows.sort((a, b) => (a.coins !== b.coins ? a.coins - b.coins : a.code - b.code));
  writeListArtifacts(rows);

  if (!args.noDownload) {
    await downloadAllImages(rows, Number(process.env.GEMTOK_GIFT_DL_CONC) || 10, Number(process.env.GEMTOK_GIFT_DL_DELAY_MS) || 40);
  } else {
    console.log("--no-download: görseller atlandı.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
