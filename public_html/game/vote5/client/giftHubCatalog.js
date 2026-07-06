/**
 * GemTok Gift Hub (gift-list / SQLite) → Vote5 ayar paleti satırı { id, name, diamond, image }.
 * `gemtok-gift-client.js` sayfada yüklü olmalı (`GemtokGiftHub`).
 */

import { giftImageUrlForId } from './localGiftImages.js';

/** @param {unknown} g @param {string} hubBase */
export function hubApiRowToClientGift(g, hubBase) {
  if (!g || typeof g !== 'object') return null;
  const id = String(g.tiktok_id ?? g.id ?? '').trim();
  if (!id) return null;
  const name = String(g.name ?? '').trim() || id;
  const diamond = Math.max(0, Number(g.diamond_count ?? g.diamond ?? g.diamondCount) || 0);
  let image = null;
  const disc = g.discoveredImageUrl;
  if (typeof disc === 'string' && disc.startsWith('http')) image = disc;
  const u = g.imageUrl ?? g.image;
  if (!image && typeof u === 'string') {
    if (u.startsWith('http')) image = u;
    else if (u.startsWith('/') && hubBase) {
      const base = String(hubBase).replace(/\/$/, '');
      image = `${base}${u}`;
    }
  }
  if (!image && id) image = giftImageUrlForId(id);
  return { id, name, diamond, image };
}

/** Sunucu / TikTok satırı üzerine yerel bilgi (hub önce veya sonra). */
export function mergeGiftRow(base, overlay) {
  const id = String(base?.id ?? overlay?.id ?? '').trim();
  if (!id) return null;
  const b = base && String(base.id) === id ? base : { id, name: '', diamond: 0, image: null };
  const o = overlay && String(overlay.id) === id ? overlay : {};
  const on = String(o.name ?? '').trim();
  const bn = String(b.name ?? '').trim();
  const od = Number(o.diamond) || 0;
  const bd = Number(b.diamond) || 0;
  const oi = o.image && String(o.image).startsWith('http') ? String(o.image) : null;
  const bi = b.image && String(b.image).startsWith('http') ? String(b.image) : null;
  return {
    id,
    name: on || bn || id,
    diamond: od > 0 ? od : bd,
    image: oi || bi || giftImageUrlForId(id) || null,
  };
}

/** @param {{ id: string, name: string, diamond: number, image: string|null }[]} arr */
function sortClientGifts(arr) {
  return [...arr].sort((a, b) => {
    const da = Number(a.diamond) || 0;
    const db = Number(b.diamond) || 0;
    if (da !== db) return da - db;
    return String(a.name || '').localeCompare(String(b.name || ''), 'tr');
  });
}

function dedupeClientGifts(arr) {
  const out = [];
  const keyToIdx = new Map();
  for (const g of arr) {
    if (!g || g.id == null) continue;
    const name = String(g.name ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    const diamond = Math.max(0, Number(g.diamond) || 0);
    const key = name ? `${name}\0${diamond}` : `#${g.id}`;
    const id = Math.floor(Number(g.id));
    const idx = keyToIdx.get(key);
    if (idx === undefined) {
      keyToIdx.set(key, out.length);
      out.push(g);
      continue;
    }
    const prevId = Math.floor(Number(out[idx].id));
    if (!Number.isFinite(prevId) || prevId <= 0 || (Number.isFinite(id) && id > 0 && id < prevId)) {
      out[idx] = g;
    }
  }
  return sortClientGifts(out);
}

/**
 * Hediye hub listesini indirir (istemci yoksa veya hata → []).
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<{ id: string, name: string, diamond: number, image: string|null }[]>}
 */
export async function fetchVote5GiftHubCatalog(opts) {
  const hub = typeof globalThis !== 'undefined' ? globalThis.GemtokGiftHub : null;
  if (!hub || typeof hub.getAllGifts !== 'function' || typeof hub.hubBase !== 'function') return [];
  try {
    const base = hub.hubBase();
    const rows = await hub.getAllGifts({ force: !!(opts && opts.force) });
    if (!Array.isArray(rows)) return [];
    const out = [];
    for (const row of rows) {
      const g = hubApiRowToClientGift(row, base);
      if (g) out.push(g);
    }
    return dedupeClientGifts(out);
  } catch {
    return [];
  }
}

/**
 * `prev` durumuna hub satırlarını ekler; aynı id’de mevcut (manuel / TikTok) alanlar korunur.
 * @param {readonly { id: string, name?: string, diamond?: number, image?: string|null }[]} hub
 * @param {readonly { id: string, name?: string, diamond?: number, image?: string|null }[]} prev
 */
export function mergeHubIntoCatalogState(hub, prev) {
  const byId = new Map();
  for (const g of prev || []) {
    if (g && g.id != null) byId.set(String(g.id), { ...g, id: String(g.id) });
  }
  for (const g of hub || []) {
    if (!g || g.id == null) continue;
    const id = String(g.id);
    const cur = byId.get(id) || {};
    byId.set(id, mergeGiftRow(g, cur));
  }
  return dedupeClientGifts([...byId.values()]);
}

/**
 * Socket / API’ten gelen hediyeleri mevcut listeye uygular (hub ile doldurulmuş satırlar güncellenir).
 */
export function mergeSocketGiftsIntoCatalogState(prev, socketGifts) {
  const byId = new Map();
  for (const g of prev || []) {
    if (g && g.id != null) byId.set(String(g.id), { ...g, id: String(g.id) });
  }
  for (const g of socketGifts || []) {
    if (!g || g.id == null) continue;
    const id = String(g.id);
    const cur = byId.get(id) || { id, name: id, diamond: 0, image: null };
    byId.set(id, mergeGiftRow(cur, g));
  }
  return dedupeClientGifts([...byId.values()]);
}
