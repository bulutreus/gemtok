/**
 * Sunucu: sira/gift-images → /gift-images URL
 */
const path = require('path');
const fs = require('fs');

const GIFT_LIST_PATH = path.join(__dirname, '..', '..', '..', 'sıra', 'gift-images', 'gift-list.json');
const GIFT_IMAGES_DIR = path.join(__dirname, '..', '..', '..', 'sıra', 'gift-images');

let fileById = null;

function loadFileMap() {
  if (fileById) return fileById;
  fileById = Object.create(null);
  try {
    if (!fs.existsSync(GIFT_LIST_PATH)) return fileById;
    const arr = JSON.parse(fs.readFileSync(GIFT_LIST_PATH, 'utf8'));
    if (!Array.isArray(arr)) return fileById;
    for (const row of arr) {
      const id = String(row.code ?? row.id ?? '').trim();
      const file = row.file ? String(row.file).trim() : '';
      if (id && file) fileById[id] = file;
    }
  } catch (_) {
    /* ignore */
  }
  return fileById;
}

function giftImageUrlForId(id, origin) {
  const idStr = String(id ?? '').trim();
  if (!idStr) return null;
  const map = loadFileMap();
  const file = map[idStr] || `${idStr}.webp`;
  const base = String(
    origin || process.env.VOTE5_PUBLIC_ORIGIN || process.env.GEMTOK_GIFT_HUB_URL || 'http://127.0.0.1:8787',
  ).replace(/\/$/, '');
  return `${base}/gift-images/${encodeURIComponent(file)}`;
}

function enrichCatalogEntry(entry, origin) {
  if (!entry || entry.id == null) return entry;
  if (entry.image && String(entry.image).startsWith('http')) return entry;
  const image = giftImageUrlForId(entry.id, origin);
  if (!image) return entry;
  return { ...entry, image };
}

function enrichCatalogMap(catalog, origin) {
  if (!catalog || typeof catalog !== 'object') return;
  for (const id of Object.keys(catalog)) {
    catalog[id] = enrichCatalogEntry(catalog[id], origin);
  }
}

function loadGiftListArray() {
  try {
    if (!fs.existsSync(GIFT_LIST_PATH)) return [];
    const arr = JSON.parse(fs.readFileSync(GIFT_LIST_PATH, 'utf8'));
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

/** gift-list.json satırları → catalogFromGiftList girdisi */
function giftListRowsForCatalog(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      const id = String(row.code ?? row.id ?? '').trim();
      if (!id) return null;
      return {
        id,
        name: String(row.name ?? '').trim() || id,
        diamond_count: Math.max(
          0,
          Number(row.coins ?? row.diamond_count ?? row.diamondCount ?? row.diamond ?? 0) || 0,
        ),
      };
    })
    .filter(Boolean);
}

module.exports = {
  GIFT_IMAGES_DIR,
  GIFT_LIST_PATH,
  giftImageUrlForId,
  enrichCatalogEntry,
  enrichCatalogMap,
  loadFileMap,
  loadGiftListArray,
  giftListRowsForCatalog,
};
