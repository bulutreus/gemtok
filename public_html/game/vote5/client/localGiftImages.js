/**
 * Yerel sira/gift-images + Gift Hub görsel URL çözümü.
 * `gift-list.loader.js` → window.__GEMTOK_GIFT_LIST__
 */

let fileById = null;

function ensureFileMap() {
  if (fileById) return fileById;
  fileById = new Map();
  const list = typeof globalThis !== 'undefined' ? globalThis.__GEMTOK_GIFT_LIST__ : null;
  if (Array.isArray(list)) {
    for (const row of list) {
      const id = String(row.code ?? row.id ?? '').trim();
      const file = row.file ? String(row.file).trim() : '';
      if (id && file) fileById.set(id, file);
    }
  }
  return fileById;
}

function giftFileNamesForId(id) {
  const idStr = String(id ?? '').trim();
  if (!idStr) return [];

  const files = [];
  const seen = new Set();
  const push = (name) => {
    const f = String(name ?? '').trim();
    if (f && !seen.has(f)) {
      seen.add(f);
      files.push(f);
    }
  };

  const mapped = ensureFileMap().get(idStr);
  if (mapped) push(mapped);

  const base = mapped ? mapped.replace(/\.(webp|png|jpe?g|gif)$/i, '') : idStr;
  for (const ext of ['webp', 'png', 'jpg', 'jpeg']) {
    push(`${base}.${ext}`);
  }

  return files;
}

function giftFileNameForId(id) {
  const list = giftFileNamesForId(id);
  return list[0] || null;
}

function giftHubBase() {
  try {
    const hub = globalThis.__GEMTOK_GIFT_HUB_URL__;
    if (hub) return String(hub).replace(/\/$/, '');
  } catch (_) {
    /* ignore */
  }
  return 'http://127.0.0.1:8787';
}

/** Aynı hediye için sırayla denenecek görsel URL listesi. */
export function giftImageUrlCandidatesForId(id) {
  const files = giftFileNamesForId(id);
  if (!files.length) return [];

  const out = [];
  const seen = new Set();
  const push = (url) => {
    if (url && !seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  };

  const pushFile = (file) => {
    if (typeof window !== 'undefined' && window.location) {
      const { protocol, href } = window.location;
      if (protocol === 'http:' || protocol === 'https:' || protocol === 'file:') {
        try {
          if (globalThis.__GEMTOK_GIFT_IMAGES_BASE__) {
            push(String(globalThis.__GEMTOK_GIFT_IMAGES_BASE__).replace(/\/?$/, '/') + file);
          }
          push(new URL(`../../../sira/gift-images/${encodeURIComponent(file)}`, href).href);
        } catch (_) {
          /* ignore */
        }
      }
    }
    if (typeof globalThis !== 'undefined' && globalThis.GemtokWebHost && globalThis.GemtokWebHost.giftImageUrl) {
      push(globalThis.GemtokWebHost.giftImageUrl(file));
    }
    push(`${giftHubBase()}/gift-images/${encodeURIComponent(file)}`);
  };

  for (const file of files) pushFile(file);

  return out;
}

/** Hediye id için birincil görsel URL. */
export function giftImageUrlForId(id) {
  const list = giftImageUrlCandidatesForId(id);
  return list[0] || null;
}

/** @param {{ id?: string, name?: string, diamond?: number, image?: string|null }|null|undefined} g */
export function enrichClientGift(g) {
  if (!g || g.id == null) return g;
  const cur = g.image && String(g.image).startsWith('http') ? String(g.image) : null;
  const image = cur || giftImageUrlForId(g.id);
  if (!image || image === g.image) return g;
  return { ...g, image };
}

/** @param {readonly { id?: string }[]} gifts */
export function enrichCatalog(gifts) {
  if (!Array.isArray(gifts)) return [];
  return gifts.map((g) => enrichClientGift(g));
}

function sortClientGifts(arr) {
  return [...arr].sort((a, b) => {
    const da = Number(a.diamond) || 0;
    const db = Number(b.diamond) || 0;
    if (da !== db) return da - db;
    return String(a.name || '').localeCompare(String(b.name || ''), 'tr');
  });
}

/** `gift-list.loader.js` / Gift Hub satırları → ayar paleti biçimi */
function dedupeClientGiftRows(rows) {
  const filter = typeof globalThis !== 'undefined' ? globalThis.GemtokGiftCatalogFilter : null;
  if (filter && typeof filter.dedupeCatalogGifts === 'function') {
    return filter.dedupeCatalogGifts(rows);
  }
  const out = [];
  const keyToIdx = new Map();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const id = Math.floor(Number(row.code ?? row.id ?? row.tiktok_id ?? 0));
    const name = String(row.name ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    const diamond = Math.max(
      0,
      Number(row.coins ?? row.diamond_count ?? row.diamondCount ?? row.diamond ?? 0) || 0,
    );
    const key = name ? `${name}\0${diamond}` : Number.isFinite(id) && id > 0 ? `#${id}` : '';
    if (!key) continue;
    const idx = keyToIdx.get(key);
    if (idx === undefined) {
      keyToIdx.set(key, out.length);
      out.push(row);
      continue;
    }
    if (!Number.isFinite(id) || id <= 0) continue;
    const prevId = Math.floor(Number(out[idx].code ?? out[idx].id ?? out[idx].tiktok_id ?? 0));
    if (!Number.isFinite(prevId) || prevId <= 0 || id < prevId) out[idx] = row;
  }
  return out;
}

export function clientGiftsFromGemTokList(list) {
  const rows =
    list ??
    (typeof globalThis !== 'undefined' && Array.isArray(globalThis.__GEMTOK_GIFT_LIST__)
      ? globalThis.__GEMTOK_GIFT_LIST__
      : null);
  if (!Array.isArray(rows)) return [];
  const filter = typeof globalThis !== 'undefined' ? globalThis.GemtokGiftCatalogFilter : null;
  const scoped =
    filter && typeof filter.filterCatalogGifts === 'function' ? filter.filterCatalogGifts(rows) : dedupeClientGiftRows(rows);
  const out = [];
  for (const row of scoped) {
    const id = String(row.code ?? row.id ?? '').trim();
    if (!id) continue;
    const name = String(row.name ?? '').trim() || id;
    const diamond = Math.max(
      0,
      Number(row.coins ?? row.diamond_count ?? row.diamondCount ?? row.diamond ?? 0) || 0,
    );
    out.push({ id, name, diamond, image: giftImageUrlForId(id) || null });
  }
  return sortClientGifts(out);
}

/** Katalog / slot için tüm aday URL'ler (http görsel + yerel yedekler). */
export function giftImageUrlsForGift(g) {
  const id = g?.id != null ? String(g.id) : '';
  const out = [];
  const seen = new Set();
  const push = (url) => {
    if (url && String(url).startsWith('http') && !seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  };
  push(g?.image);
  if (id) {
    for (const u of giftImageUrlCandidatesForId(id)) push(u);
  }
  return out;
}
