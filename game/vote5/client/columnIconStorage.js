/** Hediye patlamasını gizle tercihi (localStorage) */
export const HIDE_GIFTS_KEY = 'vote5_hide_gifts';

export function loadHideGifts() {
  try {
    return localStorage.getItem(HIDE_GIFTS_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveHideGifts(hide) {
  try {
    localStorage.setItem(HIDE_GIFTS_KEY, hide ? '1' : '0');
  } catch (_) {}
}
