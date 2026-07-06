/** Tarayıcıda dosyadan (file://) veya Hostinger gibi statik sitede Node/sunucu yoktur. */
export function isStaticHostedSite() {
  if (typeof window === 'undefined') return false;
  if (window.location.protocol === 'file:') return false;
  try {
    if (typeof GemtokWebHost !== 'undefined' && typeof GemtokWebHost.isLocalDevHost === 'function') {
      return !GemtokWebHost.isLocalDevHost();
    }
  } catch (_) {}
  try {
    const h = String(window.location.hostname || '')
      .toLowerCase()
      .replace(/^\[|\]$/g, '');
    if (h === '127.0.0.1' || h === 'localhost' || h === '::1' || h === '0:0:0:0:0:0:0:1') return false;
    return window.location.protocol === 'http:' || window.location.protocol === 'https:';
  } catch (_) {}
  return false;
}

export function isStandaloneFileMode() {
  if (typeof window === 'undefined') return false;
  return window.location.protocol === 'file:';
}

/** Node sunucusu veya Socket.IO olmadan oynanır (file:// veya canlı statik site). */
export function isOfflinePlayMode() {
  return isStandaloneFileMode() || isStaticHostedSite();
}
