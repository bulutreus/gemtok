/**
 * GemTok — oyun sayfalarında TikTok Live (TikFinity) köprüsünü başlatır.
 * Önkoşul: gemtok-license.js, gemtok-tikfinity-client.js, sıra/gemtok-tiktok-live-global.js
 */
(function (g) {
  'use strict';

  function boot() {
    try {
      if (!g.GemTokTikTokLive || typeof g.GemTokTikTokLive.bootstrap !== 'function') return;
      g.GemTokTikTokLive.bootstrap({
        hubBase:
          (typeof g.__GEMTOK_GIFT_HUB_URL__ === 'string' && g.__GEMTOK_GIFT_HUB_URL__) ||
          'http://127.0.0.1:8787',
        showHud: false,
      });
    } catch (_e) {}
  }

  function start() {
    try {
      if (g.GemtokLicense && typeof g.GemtokLicense.whenReady === 'function') {
        g.GemtokLicense.whenReady().then(boot);
        return;
      }
    } catch (_e2) {}
    boot();
  }

  if (g.document && g.document.readyState === 'loading') {
    g.document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(typeof window !== 'undefined' ? window : globalThis);
