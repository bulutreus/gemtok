/** TR hediye kataloğu filtresi (gift-hub). */
import fs from "node:fs";

export const PREFERRED_REGION = "TR";
const POLISH_RE = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;

let cachedAllowIds = null;
let cachedAllowPath = "";

export function giftRegions(row) {
  if (!row || typeof row !== "object") return null;
  if (Array.isArray(row.regions)) return row.regions;
  const meta = row.metadata;
  if (meta && typeof meta === "object" && Array.isArray(meta.original?.regions)) {
    return meta.original.regions;
  }
  const raw = row.metadata_json;
  if (typeof raw === "string" && raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.original?.regions)) return parsed.original.regions;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function giftTiktokId(row) {
  if (!row || typeof row !== "object") return null;
  const id = Math.floor(Number(row.tiktok_id ?? row.code ?? row.gift_tiktok_id ?? 0));
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function hasForeignLocaleName(name) {
  const n = String(name || "").trim();
  if (!n) return false;
  if (POLISH_RE.test(n)) return true;
  if (/[\u0400-\u04FF]/.test(n)) return true;
  if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(n)) return true;
  return false;
}

export function includesPreferredRegion(row) {
  const regions = giftRegions(row);
  if (!regions?.length) return false;
  return regions.includes(PREFERRED_REGION);
}

export function isCatalogGiftAllowed(row, allowIds) {
  if (!row || typeof row !== "object") return false;
  const id = giftTiktokId(row);
  if (id == null) return false;
  if (allowIds?.has(id)) return true;
  if (hasForeignLocaleName(row.name)) return false;
  return includesPreferredRegion(row);
}

export function filterCatalogGifts(rows, allowIds) {
  if (!Array.isArray(rows)) return [];
  return dedupeCatalogGifts(rows.filter((r) => isCatalogGiftAllowed(r, allowIds)));
}

/** Ayni isim + jeton: yalnizca en dusuk tiktok_id/code kalir. */
export function dedupeCatalogGifts(rows) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  const keyToIdx = new Map();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const id = giftTiktokId(row);
    const name = String(row.name ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    const diamonds = Math.max(
      0,
      Math.floor(Number(row.diamond_count ?? row.coins ?? row.diamond ?? 0) || 0),
    );
    const key = name ? `${name}\0${diamonds}` : id != null ? `#${id}` : "";
    if (!key) continue;
    const idx = keyToIdx.get(key);
    if (idx === undefined) {
      keyToIdx.set(key, out.length);
      out.push(row);
      continue;
    }
    if (id == null) continue;
    const prevId = giftTiktokId(out[idx]);
    if (prevId == null || id < prevId) out[idx] = row;
  }
  return out;
}

export function buildAllowIdSetFromGiftList(arr) {
  const set = new Set();
  if (!Array.isArray(arr)) return set;
  for (const row of arr) {
    if (includesPreferredRegion(row) && !hasForeignLocaleName(row?.name)) {
      const id = giftTiktokId(row);
      if (id != null) set.add(id);
    }
  }
  return set;
}

export function loadTrAllowIdsFromJson(jsonPath) {
  if (cachedAllowIds && cachedAllowPath === jsonPath) return cachedAllowIds;
  if (!jsonPath || !fs.existsSync(jsonPath)) {
    cachedAllowIds = new Set();
    cachedAllowPath = jsonPath || "";
    return cachedAllowIds;
  }
  const arr = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  cachedAllowIds = buildAllowIdSetFromGiftList(Array.isArray(arr) ? arr : []);
  cachedAllowPath = jsonPath;
  return cachedAllowIds;
}

export function invalidateTrAllowIdsCache() {
  cachedAllowIds = null;
  cachedAllowPath = "";
}
