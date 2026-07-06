/** Ayarlardan seçilen TikTok hediye ID'leri (sütun × 2) — localStorage */

export const COLUMN_GIFTS_KEY = 'vote5_column_tiktok_gifts';

export function normalizeColumnGifts(raw) {
  const rows = Array.isArray(raw) ? raw.slice(0, 5) : [];
  while (rows.length < 5) rows.push([]);
  return rows.map((row) => {
    const a = Array.isArray(row) ? row : [];
    return [String(a[0] || ''), String(a[1] || '')];
  });
}

export function loadColumnGifts() {
  try {
    const s = localStorage.getItem(COLUMN_GIFTS_KEY);
    if (!s) return normalizeColumnGifts([]);
    return normalizeColumnGifts(JSON.parse(s));
  } catch {
    return normalizeColumnGifts([]);
  }
}

export function saveColumnGifts(gifts) {
  try {
    localStorage.setItem(COLUMN_GIFTS_KEY, JSON.stringify(normalizeColumnGifts(gifts)));
  } catch (_) {}
}
