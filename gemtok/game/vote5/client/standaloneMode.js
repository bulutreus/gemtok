/** Tarayıcıda dosyadan (file://) açıldığında Node/sunucu yoktur. */
export function isStandaloneFileMode() {
  if (typeof window === 'undefined') return false;
  return window.location.protocol === 'file:';
}
