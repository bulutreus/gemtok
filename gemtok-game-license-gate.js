/**
 * GemTok — oyun sayfası lisans kapısı (statik web / yerel geliştirme).
 * Önkoşul: sira/gemtok-license.js
 */
(function (g) {
  "use strict";

  function hubUrl() {
    try {
      var portal =
        g.localStorage.getItem("gemtok_sira_portal") || g.localStorage.getItem("hottok_sira_portal") || "";
      if (portal) return portal + "oyun-merkezi.html";
    } catch (e0) {}
    try {
      return new URL("../../../sira/oyun-merkezi.html", g.location.href).href;
    } catch (e1) {
      return "../../../sira/oyun-merkezi.html";
    }
  }

  function isLocalDev() {
    try {
      if (g.GemtokWebHost && typeof g.GemtokWebHost.isLocalDevHost === "function") {
        return g.GemtokWebHost.isLocalDevHost();
      }
    } catch (eW) {}
    try {
      if (!g.location || g.location.protocol === "file:") return true;
      var h = String(g.location.hostname || "")
        .toLowerCase()
        .replace(/^\[|\]$/g, "");
      if (h === "127.0.0.1" || h === "localhost" || h === "::1") return true;
      var p = String(g.location.port || "");
      if (p === "5173" || p === "3847" || p === "5749") return true;
    } catch (e2) {}
    return false;
  }

  function whenLicenseReady() {
    try {
      if (g.GemtokLicense && typeof g.GemtokLicense.whenReady === "function") {
        return g.GemtokLicense.whenReady();
      }
    } catch (eR) {}
    return Promise.resolve();
  }

  function runGate(gameId, opt) {
    opt = opt || {};
    if (opt.skipOnLocalDev !== false && isLocalDev()) return Promise.resolve();
    return whenLicenseReady().then(function () {
      if (g.GemtokLicense && typeof g.GemtokLicense.validateServerSessionAsync === "function") {
        return g.GemtokLicense.validateServerSessionAsync(String(gameId || "")).then(function (ok) {
          if (ok) return;
          var serverMsg =
            opt.message ||
            "Bu oyun için geçerli bir lisans anahtarı gerekir. Lisansınızı Oyun Merkezi'nde yeniden doğrulayın.";
          g.alert(serverMsg);
          g.location.replace(opt.hubUrl || hubUrl());
          throw new Error("game_access_blocked");
        });
      }
      try {
        if (g.GemtokLicense && g.GemtokLicense.isGameAllowedInSession(String(gameId || ""))) return;
      } catch (e3) {}
      var msg =
        opt.message ||
        "Bu oyun için geçerli bir lisans anahtarı gerekir. Anahtar silindi veya süresi dolduysa Oyun Merkezi'nde yeni anahtar girin.";
      g.alert(msg);
      g.location.replace(opt.hubUrl || hubUrl());
      throw new Error("game_access_blocked");
    });
  }

  g.GemtokGameLicenseGate = function (gameId, opt) {
    opt = opt || {};
    if (opt.skipOnLocalDev !== false && isLocalDev()) return;
    try {
      if (g.document && g.document.documentElement) {
        g.document.documentElement.classList.add("gemtok-license-pending");
        var st = g.document.createElement("style");
        st.setAttribute("data-gemtok-license-gate", "1");
        st.textContent = "html.gemtok-license-pending body{visibility:hidden!important}";
        g.document.head.appendChild(st);
      }
    } catch (eP) {}
    runGate(gameId, opt)
      .then(function () {
        try {
          if (g.document && g.document.documentElement) {
            g.document.documentElement.classList.remove("gemtok-license-pending");
          }
        } catch (eD) {}
      })
      .catch(function () {});
  };

  g.GemtokGameLicenseGateAsync = runGate;
})(typeof window !== "undefined" ? window : globalThis);
