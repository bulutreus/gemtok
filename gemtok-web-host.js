/**
 * GemTok — statik web ortamı: hediye görselleri ve site kökü.
 */
(function (g) {
  "use strict";

  function resolveGiftImagesBase() {
    try {
      if (g.__GEMTOK_GIFT_IMAGES_BASE__) {
        return String(g.__GEMTOK_GIFT_IMAGES_BASE__).replace(/\/?$/, "/");
      }
    } catch (e0) {}
    try {
      var scripts = g.document && g.document.getElementsByTagName("script");
      if (scripts) {
        for (var i = 0; i < scripts.length; i++) {
          var src = String(scripts[i].src || "");
          if (src.indexOf("gift-list.loader.js") >= 0) {
            return src.replace(/gift-list\.loader\.js(\?.*)?$/i, "");
          }
        }
      }
    } catch (e1) {}
    try {
      return new URL("sıra/gift-images/", g.location.origin + "/").href;
    } catch (e2) {
      return "sıra/gift-images/";
    }
  }

  function isLocalDevHost() {
    try {
      if (!g.location || g.location.protocol === "file:") return true;
      var h = String(g.location.hostname || "")
        .toLowerCase()
        .replace(/^\[|\]$/g, "");
      if (h === "127.0.0.1" || h === "localhost" || h === "::1" || h === "0:0:0:0:0:0:0:1") return true;
      var p = String(g.location.port || "");
      if (p === "5173" || p === "3847" || p === "5749" || p === "8787") return true;
    } catch (e3) {}
    return false;
  }

  try {
    g.__GEMTOK_GIFT_IMAGES_BASE__ = resolveGiftImagesBase();
  } catch (e4) {}

  try {
    // TikFinity masaustu uygulamasina her ortamda dogrudan baglan. Kullanici
    // localStorage veya ortam degiskeniyle farkli bir URL belirleyebilir.
    if (!g.__TIKFINITY_WS_URL__) g.__TIKFINITY_WS_URL__ = "ws://127.0.0.1:21213";
  } catch (eTf) {}

  g.GemtokWebHost = {
    resolveGiftImagesBase: resolveGiftImagesBase,
    isLocalDevHost: isLocalDevHost,
    giftImageUrl: function (file) {
      var f = String(file || "").trim();
      if (!f) return "";
      var base = resolveGiftImagesBase().replace(/\/?$/, "/");
      return base + encodeURIComponent(f).replace(/%2F/gi, "/");
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
