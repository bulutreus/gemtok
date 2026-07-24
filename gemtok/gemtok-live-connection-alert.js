/**
 * GemTok — "TikTok hediyeleri gelmiyor" uyari bandi.
 *
 * Kendi TikFinity istemcisini kullanan oyunlar (Air Race, Team20) icindir.
 * Ortak yigini yukleyen oyunlarda ayni band sira/gemtok-tiktok-live-global.js
 * icindeki installConnectionAlert tarafindan kurulur; davranis ikisinde ayni
 * olmalidir (12 sn tolerans, 60 sn erteleme, yeniden baglan dugmesi).
 *
 * GemTokLiveConnAlert.install({
 *   isLiveOk:   function () { return true; },  // zorunlu — canli sinyal saglikli mi
 *   isEnabled:  function () { return true; },  // ops. — ?tikfinity=0 ise false
 *   isLicensed: function () { return true; },  // ops. — varsayilan: lisans oturumu
 *   reconnect:  function () {},                // ops. — "Yeniden baglan" dugmesi
 * })
 */
(function (global) {
  "use strict";

  var GRACE_MS = 12000;
  var SNOOZE_MS = 60000;
  var TICK_MS = 1500;
  var installed = false;

  function hasActiveLicenseSession() {
    try {
      var L = global.GemtokLicense;
      if (L && typeof L.readLicenseSession === "function") return !!L.readLicenseSession();
    } catch (e0) {}
    try {
      return !!(global.sessionStorage && global.sessionStorage.getItem("gemtok_oyun_lisans"));
    } catch (e1) {
      return false;
    }
  }

  function isHostedPublicSite() {
    try {
      if (!global.location || global.location.protocol === "file:") return false;
      var h = String(global.location.hostname || "")
        .toLowerCase()
        .replace(/^\[|\]$/g, "");
      if (h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "0:0:0:0:0:0:0:1") return false;
      return global.location.protocol === "http:" || global.location.protocol === "https:";
    } catch (e) {
      return false;
    }
  }

  function call(fn, fallback) {
    if (typeof fn !== "function") return fallback;
    try {
      return !!fn();
    } catch (e) {
      return fallback;
    }
  }

  function install(opt) {
    var o = opt || {};
    if (installed || !global.document || typeof o.isLiveOk !== "function") return;
    installed = true;

    var troubleSince = 0;
    var dismissedUntil = 0;
    var el = null;

    function ensureEl() {
      if (el) return el;
      el = global.document.getElementById("gemtok-live-conn-alert");
      if (el) return el;
      el = global.document.createElement("div");
      el.id = "gemtok-live-conn-alert";
      el.setAttribute("role", "alert");
      el.style.cssText =
        "position:fixed;top:0;left:0;right:0;z-index:2147483000;display:none;box-sizing:border-box;" +
        "padding:10px 44px 10px 16px;font:600 13px/1.45 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;" +
        "color:#fff;background:linear-gradient(90deg,#b91c1c,#7f1d1d);box-shadow:0 2px 14px rgba(0,0,0,0.4);text-align:center;";
      el.innerHTML =
        '<span id="gemtok-live-conn-alert-msg"></span>' +
        ' <button type="button" id="gemtok-live-conn-alert-retry" style="margin-left:10px;cursor:pointer;padding:3px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.6);background:rgba(255,255,255,0.16);color:#fff;font-weight:700">Yeniden bağlan</button>' +
        '<button type="button" id="gemtok-live-conn-alert-close" aria-label="Kapat" style="position:absolute;top:5px;right:10px;cursor:pointer;border:none;background:transparent;color:#fff;font-size:20px;line-height:1;font-weight:700">×</button>';
      (global.document.body || global.document.documentElement).appendChild(el);
      var retry = el.querySelector("#gemtok-live-conn-alert-retry");
      if (retry)
        retry.onclick = function () {
          if (typeof o.reconnect === "function") {
            try {
              o.reconnect();
            } catch (eR) {}
          }
        };
      var close = el.querySelector("#gemtok-live-conn-alert-close");
      if (close)
        close.onclick = function () {
          dismissedUntil = Date.now() + SNOOZE_MS;
          el.style.display = "none";
        };
      return el;
    }

    function tick() {
      if (!global.document.body) return;
      var node = ensureEl();
      var licensed = typeof o.isLicensed === "function" ? call(o.isLicensed, true) : hasActiveLicenseSession();
      var trouble = licensed && call(o.isEnabled, true) && !call(o.isLiveOk, false);
      if (!trouble) {
        troubleSince = 0;
        node.style.display = "none";
        return;
      }
      if (!troubleSince) troubleSince = Date.now();
      // Sessiz bir yayinda yanlis alarm vermemek icin once tolerans tani.
      if (Date.now() - troubleSince <= GRACE_MS || Date.now() < dismissedUntil) {
        node.style.display = "none";
        return;
      }
      var msg = node.querySelector("#gemtok-live-conn-alert-msg");
      if (msg) {
        msg.textContent = isHostedPublicSite()
          ? "TikTok hediyeleri gelmiyor. TikFinity açık olmalı ve WebSocket API portu 21213 olmalı; tarayıcıda yerel ağ erişimine izin verin. Bağlanamazsanız «GemTok TikFinity Köprüsü»nü çalıştırıp oyunu açın."
          : "TikTok hediyeleri gelmiyor. TikFinity masaüstü uygulamasını açın (ws://127.0.0.1:21213).";
      }
      node.style.display = "block";
    }

    global.setInterval(tick, TICK_MS);
  }

  global.GemTokLiveConnAlert = { install: install };
})(typeof window !== "undefined" ? window : globalThis);
