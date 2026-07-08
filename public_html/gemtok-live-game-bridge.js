/**
 * GemTok — oyun sayfaları için merkezi TikTok Live köprüsü.
 * Önkoşul: gemtok-tikfinity-client.js + sira/gemtok-tiktok-live-global.js (GemTokTikTokLive).
 *
 * Oyunlar doğrudan WebSocket açmaz; GemTokTikTokLive.bootstrap + eventBus kullanır.
 */
(function (g) {
  "use strict";

  function ensure(opt) {
    if (!g.GemTokTikTokLive || typeof g.GemTokTikTokLive.bootstrap !== "function") return false;
    var o = opt || {};
    try {
      g.GemTokTikTokLive.bootstrap({
        hubBase: o.hubBase || g.__GEMTOK_GIFT_HUB_URL__ || "http://127.0.0.1:8787",
        showHud: !!o.showHud,
        navConnectionSlot: o.navConnectionSlot || "",
      });
    } catch (e) {
      return false;
    }
    return true;
  }

  /**
   * TikFinity ile aynı düz payload’ları (gift, like, …) tek tek iletir.
   * @returns kapatıcı fonksiyon
   */
  function onPayload(handler) {
    if (!g.GemTokTikTokLive || !g.GemTokTikTokLive.eventBus) return function () {};
    var bus = g.GemTokTikTokLive.eventBus;
    var evs = ["gift", "like", "follow", "share", "member", "subscribe", "chat"];
    var fns = [];
    var i;
    for (i = 0; i < evs.length; i++) {
      (function (ev) {
        var fn = function (p) {
          handler(p);
        };
        bus.on(ev, fn);
        fns.push({ ev: ev, fn: fn });
      })(evs[i]);
    }
    return function () {
      var j;
      for (j = 0; j < fns.length; j++) {
        try {
          bus.off(fns[j].ev, fns[j].fn);
        } catch (e2) {}
      }
    };
  }

  g.GemTokLiveGameBridge = { ensure: ensure, onPayload: onPayload };
})(typeof globalThis !== "undefined" ? globalThis : window);
