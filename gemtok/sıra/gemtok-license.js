/**
 * Yerel lisans anahtarÄ± kaydÄ± (admin Ã¼retir; kullanÄ±cÄ± Oyun Merkezi'nde girer).
 * sessionStorage: gemtok_oyun_lisans = { expiresAt, games, keyNorm }
 * localStorage gemtok_oyun_lisans_last_key: file:// veya farklÄ± dosya kÃ¶keninde
 * sessionStorage paylaÅŸÄ±lmadÄ±ÄŸÄ±nda oyun sayfasÄ±nÄ±n lisansÄ± registry Ã¼zerinden kurmasÄ± iÃ§in.
 */
(function () {
  var REGISTRY_KEY = "gemtok_license_registry";
  var REGISTRY_BACKUP_KEY = "gemtok_license_registry_backup";
  var ITEMSATIS_URL_KEY = "gemtok_itemsatis_store_url";
  var ADMIN_SYNC_TOKEN_KEY = "gemtok_license_sync_token";
  /** KayÄ±tlÄ± maÄŸaza URLâ€™si yoksa Â«Lisans satÄ±n alÂ» baÄŸlantÄ±larÄ± bu profili kullanÄ±r. */
  var DEFAULT_ITEMSATIS_PROFILE_URL = "https://www.itemsatis.com/profil/2319676/gemtok.html";
  var SESSION_KEY = "gemtok_oyun_lisans";
  var ACTIVE_KEY_STORE = "gemtok_oyun_lisans_last_key";

  (function migrateLegacyLicenseKeysOnce() {
    try {
      if (!localStorage.getItem("gemtok_license_registry") && localStorage.getItem("hottok_license_registry")) {
        localStorage.setItem("gemtok_license_registry", localStorage.getItem("hottok_license_registry"));
      }
      if (!localStorage.getItem("gemtok_itemsatis_store_url") && localStorage.getItem("hottok_itemsatis_store_url")) {
        localStorage.setItem("gemtok_itemsatis_store_url", localStorage.getItem("hottok_itemsatis_store_url"));
      }
    } catch (e0) {}
    try {
      if (!sessionStorage.getItem("gemtok_oyun_lisans") && sessionStorage.getItem("hottok_oyun_lisans")) {
        sessionStorage.setItem("gemtok_oyun_lisans", sessionStorage.getItem("hottok_oyun_lisans"));
      }
    } catch (e1) {}
  })();

  var TIER_MS = {
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
    "90d": 90 * 24 * 60 * 60 * 1000,
    "365d": 365 * 24 * 60 * 60 * 1000,
  };

  /** SÄ±nÄ±rsÄ±z: sÃ¼re yok; `expiresAt` kayÄ±tta ve oturumda null kalÄ±r. */
  var UNLIMITED_TIER = "unl";

  function isUnlimitedTier(tier) {
    var t = String(tier || "").toLowerCase();
    return t === UNLIMITED_TIER || t === "unlimited";
  }

  function normalizeKey(s) {
    return String(s || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");
  }

  function readRegistry() {
    try {
      var raw = localStorage.getItem(REGISTRY_KEY) || localStorage.getItem(REGISTRY_BACKUP_KEY);
      var o = raw ? JSON.parse(raw) : {};
      if (!o || typeof o !== "object") o = {};
      if (!o.keys || typeof o.keys !== "object") o.keys = {};
      return o;
    } catch (e) {
      return { keys: {} };
    }
  }

  function writeRegistry(o) {
    try {
      var json = JSON.stringify(o);
      localStorage.setItem(REGISTRY_KEY, json);
      localStorage.setItem(REGISTRY_BACKUP_KEY, json);
    } catch (e2) {}
  }

  function getItemsatisUrl() {
    try {
      var u = String(localStorage.getItem(ITEMSATIS_URL_KEY) || "").trim();
      if (u) return u;
      return DEFAULT_ITEMSATIS_PROFILE_URL;
    } catch (e) {
      return DEFAULT_ITEMSATIS_PROFILE_URL;
    }
  }

  function setItemsatisUrl(url) {
    try {
      var u = String(url || "").trim().slice(0, 2048);
      if (!u) {
        try {
          localStorage.removeItem(ITEMSATIS_URL_KEY);
        } catch (e0) {}
        return { ok: true };
      }
      var lower = u.toLowerCase();
      if (lower.indexOf("javascript:") === 0 || lower.indexOf("data:") === 0) return { ok: false };
      if (lower.indexOf("http://") !== 0 && lower.indexOf("https://") !== 0) return { ok: false };
      localStorage.setItem(ITEMSATIS_URL_KEY, u);
      return { ok: true };
    } catch (e) {
      return { ok: false };
    }
  }

  function tryHydrateSessionFromLastKey() {
    try {
      if (sessionStorage.getItem(SESSION_KEY)) return;
      var kn = normalizeKey(
        localStorage.getItem(ACTIVE_KEY_STORE) ||
          localStorage.getItem("hottok_oyun_lisans_last_key") ||
          ""
      );
      if (!kn) return;
      var reg = readRegistry();
      var entry = reg.keys[kn];
      if (!entry || entry.revoked || !entry.activatedAt) {
        try {
          localStorage.removeItem(ACTIVE_KEY_STORE);
          localStorage.removeItem("hottok_oyun_lisans_last_key");
        } catch (eR0) {}
        return;
      }
      if (entry.expiresAt != null && Date.now() > Number(entry.expiresAt)) {
        try {
          localStorage.removeItem(ACTIVE_KEY_STORE);
        } catch (eR1) {}
        return;
      }
      var games = entry.games && entry.games.length ? entry.games : ["all"];
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          keyNorm: kn,
          expiresAt: entry.expiresAt == null ? null : Number(entry.expiresAt),
          games: games,
          tier: entry.tier || "7d",
          clientIp: String(entry.clientIp || ""),
          shared: entry.shared !== false,
        })
      );
    } catch (eH) {}
  }

  function readLicenseSession() {
    try {
      tryHydrateSessionFromLastKey();
      var raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || typeof s !== "object") return null;
      if (!s.keyNorm) {
        clearLicenseSession();
        return null;
      }
      var keyNorm = normalizeKey(s.keyNorm);
      if (!keyNorm) {
        clearLicenseSession();
        return null;
      }
      var reg = readRegistry();
      var entry = reg.keys[keyNorm];
      if (!entry || entry.revoked) {
        clearLicenseSession();
        return null;
      }
      if (!entry.activatedAt) {
        clearLicenseSession();
        return null;
      }
      if (entry.expiresAt != null && Date.now() > Number(entry.expiresAt)) {
        clearLicenseSession();
        return null;
      }
      var games = entry.games && entry.games.length ? entry.games : ["all"];
      var entryExp = entry.expiresAt == null ? null : Number(entry.expiresAt);
      var sExp = s.expiresAt == null ? null : Number(s.expiresAt);
      if (entryExp !== sExp || !gamesListEqual(s.games, games)) {
        writeLicenseSession({
          keyNorm: keyNorm,
          expiresAt: entry.expiresAt == null ? null : entryExp,
          games: games,
          tier: entry.tier || s.tier || "7d",
          clientIp: String(entry.clientIp || s.clientIp || ""),
          shared: entry.shared !== false,
        });
        raw = sessionStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        s = JSON.parse(raw);
        if (!s || typeof s !== "object") return null;
      }
      try {
        if (s.keyNorm) localStorage.setItem(ACTIVE_KEY_STORE, normalizeKey(s.keyNorm));
      } catch (eSync) {}
      return s;
    } catch (e) {
      try {
        clearLicenseSession();
      } catch (e2) {}
      return null;
    }
  }

  function writeLicenseSession(o) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(o));
    } catch (e2) {}
    try {
      if (o && o.keyNorm) localStorage.setItem(ACTIVE_KEY_STORE, normalizeKey(o.keyNorm));
    } catch (e3) {}
    try {
      window.dispatchEvent(new CustomEvent("gemtok-license-changed"));
    } catch (eEv) {}
  }

  function clearLicenseSession() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {}
    try {
      localStorage.removeItem(ACTIVE_KEY_STORE);
      localStorage.removeItem("hottok_oyun_lisans_last_key");
    } catch (e2) {}
    try {
      window.dispatchEvent(new CustomEvent("gemtok-license-changed"));
    } catch (eEv2) {}
  }

  function gamesListEqual(a, b) {
    var ga = a && a.slice ? a.slice().map(String).sort().join("\0") : "";
    var gb = b && b.slice ? b.slice().map(String).sort().join("\0") : "";
    return ga === gb;
  }

  function gamesAllow(entryGames, gameId) {
    var g = String(gameId || "").toLowerCase();
    if (!entryGames || !entryGames.length) return true;
    for (var i = 0; i < entryGames.length; i++) {
      var eg = String(entryGames[i] || "").toLowerCase();
      if (eg === "all") return true;
      if (eg === g) return true;
    }
    return false;
  }

  function isGameAllowedInSession(gameId) {
    var s = readLicenseSession();
    if (!s) return false;
    if (isUnlimitedTier(s.tier)) return gamesAllow(s.games, gameId);
    if (s.expiresAt == null) return false;
    if (Date.now() > Number(s.expiresAt)) {
      clearLicenseSession();
      return false;
    }
    return gamesAllow(s.games, gameId);
  }

  function redeemKeyLocal(rawKey, forGameId) {
    var keyNorm = normalizeKey(rawKey);
    if (keyNorm === "BULUTREUS") {
      return {
        ok: false,
        message:
          "Bu deÄŸer bir lisans anahtarÄ± deÄŸildir. YÃ¶netici eriÅŸimi iÃ§in Oyun Merkeziâ€™nde anahtar kutusuna yalnÄ±zca sizin bildiÄŸiniz yÃ¶netici parolasÄ±nÄ± yazÄ±p Â«AnahtarÄ± uygulaÂ» kullanÄ±n.",
      };
    }
    if (!keyNorm || keyNorm.length < 6) return { ok: false, message: "GeÃ§ersiz anahtar." };

    var reg = readRegistry();
    var entry = reg.keys[keyNorm];
    if (!entry) return { ok: false, message: "Bu anahtar kayÄ±tlÄ± deÄŸil." };
    if (entry.revoked) return { ok: false, message: "Bu anahtar iptal edilmiÅŸ." };

    var tier = entry.tier || "7d";
    var unl = isUnlimitedTier(tier);
    var ms = unl ? 0 : TIER_MS[tier] || TIER_MS["7d"];
    var now = Date.now();

    var games = entry.games && entry.games.length ? entry.games : ["all"];
    if (forGameId != null && String(forGameId).length && !gamesAllow(games, forGameId)) {
      return { ok: false, message: "Bu anahtar seÃ§ilen oyun iÃ§in geÃ§erli deÄŸil." };
    }

    if (entry.shared !== true) {
      entry.shared = true;
      reg.keys[keyNorm] = entry;
      writeRegistry(reg);
    }

    if (!entry.activatedAt) {
      entry.activatedAt = now;
      entry.expiresAt = unl ? null : now + ms;
      reg.keys[keyNorm] = entry;
      writeRegistry(reg);
    } else {
      if (entry.expiresAt != null && now > Number(entry.expiresAt)) {
        return { ok: false, message: "AnahtarÄ±n sÃ¼resi dolmuÅŸ." };
      }
    }

    writeLicenseSession({
      keyNorm: keyNorm,
      expiresAt: entry.expiresAt == null ? null : Number(entry.expiresAt),
      games: games,
      tier: tier,
      clientIp: entry.clientIp || "",
      shared: entry.shared !== false,
    });
    return { ok: true, expiresAt: entry.expiresAt };
  }

  function redeemKey(rawKey, forGameId) {
    return redeemKeyLocal(rawKey, forGameId);
  }

  function redeemKeyAsync(rawKey, forGameId) {
    if (!isPublicHostedSite()) {
      return Promise.resolve(redeemKeyLocal(rawKey, forGameId));
    }
    var keyNorm = normalizeKey(rawKey);
    if (keyNorm === "BULUTREUS") {
      return Promise.resolve({
        ok: false,
        message:
          "Bu deÄŸer bir lisans anahtarÄ± deÄŸildir. YÃ¶netici eriÅŸimi iÃ§in Oyun Merkeziâ€™nde anahtar kutusuna yalnÄ±zca sizin bildiÄŸiniz yÃ¶netici parolasÄ±nÄ± yazÄ±p Â«AnahtarÄ± uygulaÂ» kullanÄ±n.",
      });
    }
    return registryReadyPromise
      .then(function () {
        return fetch(resolveServerSyncUrl(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "redeem",
            key: keyNorm,
            gameId: forGameId != null ? String(forGameId) : "",
          }),
          cache: "no-store",
        });
      })
      .then(function (r) {
        return r.json().then(function (j) {
          if (!j || !j.ok) {
            var localTry = redeemKeyLocal(rawKey, forGameId);
            if (localTry.ok) return localTry;
            return { ok: false, message: (j && j.message) || localTry.message || "Anahtar doÄŸrulanamadÄ±." };
          }
          var entry = j.entry || {};
          var games = entry.games && entry.games.length ? entry.games : ["all"];
          var reg = readRegistry();
          reg.keys[keyNorm] = entry;
          writeRegistry(reg);
          writeLicenseSession({
            keyNorm: keyNorm,
            expiresAt: entry.expiresAt == null ? null : Number(entry.expiresAt),
            games: games,
            tier: entry.tier || "7d",
            clientIp: String(entry.clientIp || ""),
            shared: entry.shared !== false,
          });
          return { ok: true, expiresAt: entry.expiresAt };
        });
      })
      .catch(function () {
        return redeemKeyLocal(rawKey, forGameId);
      });
  }

  function allocateClientIpForKey(reg) {
    for (var t = 0; t < 400; t++) {
      var v = ("0000" + String(Math.floor(Math.random() * 10000))).slice(-4);
      var clash = false;
      for (var k in reg.keys) {
        if (reg.keys[k] && reg.keys[k].clientIp === v) {
          clash = true;
          break;
        }
      }
      if (!clash) return v;
    }
    return ("0000" + String(Date.now() % 10000)).slice(-4);
  }

  function migrateRegistryClientIps(reg) {
    var changed = false;
    for (var k in reg.keys) {
      var e = reg.keys[k];
      if (!e) continue;
      if (e.shared === true) continue;
      e.shared = true;
      reg.keys[k] = e;
      changed = true;
    }
    if (changed) writeRegistry(reg);
  }

  function adminGenerateKeys(tier, count, gameScope) {
    try {
      tier = tier || "7d";
      if (!TIER_MS[tier] && !isUnlimitedTier(tier)) tier = "7d";
      if (isUnlimitedTier(tier)) tier = UNLIMITED_TIER;
      count = Math.min(100, Math.max(1, parseInt(count, 10) || 1));
      var reg = readRegistry();
      var out = [];
      var gsc = String(gameScope || "all");
      if (
        gsc !== "all" &&
        gsc !== "warFront" &&
        gsc !== "arenaBattle" &&
        gsc !== "countryBirds" &&
        gsc !== "vote5" &&
        gsc !== "arena3" &&
        gsc !== "arena5gen" &&
        gsc !== "team20" &&
        gsc !== "airRace"
      )
        gsc = "all";
      var games = gsc === "all" ? ["all"] : [gsc];

      function randChunk() {
        var chars = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";
        var s = "";
        for (var i = 0; i < 4; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
        return s;
      }

      for (var n = 0; n < count; n++) {
        var keyNorm = "GEM-" + randChunk() + "-" + randChunk() + "-" + randChunk();
        while (reg.keys[keyNorm]) keyNorm = "GEM-" + randChunk() + "-" + randChunk() + "-" + randChunk();

        reg.keys[keyNorm] = {
          tier: tier,
          games: games,
          createdAt: new Date().toISOString(),
          revoked: false,
          activatedAt: null,
          expiresAt: null,
          clientIp: "",
          shared: true,
        };
        out.push(keyNorm);
      }
      writeRegistry(reg);
      return out;
    } catch (eGen) {
      return [];
    }
  }

  function normalizeAdminTier(tier) {
    var t = String(tier || "7d");
    if (!TIER_MS[t] && !isUnlimitedTier(t)) t = "7d";
    return isUnlimitedTier(t) ? UNLIMITED_TIER : t;
  }

  function gamesForAdminScope(gameScope) {
    var gsc = String(gameScope || "all");
    if (
      gsc !== "all" &&
      gsc !== "warFront" &&
      gsc !== "arenaBattle" &&
      gsc !== "countryBirds" &&
      gsc !== "vote5" &&
      gsc !== "arena3" &&
      gsc !== "arena5gen" &&
      gsc !== "team20" &&
      gsc !== "airRace"
    )
      gsc = "all";
    return gsc === "all" ? ["all"] : [gsc];
  }

  function adminUpsertKey(rawKey, tier, gameScope, activateNow) {
    try {
      var keyNorm = normalizeKey(rawKey);
      if (keyNorm === "BULUTREUS") return { ok: false, message: "Yonetici parolasi lisans anahtari olarak eklenemez." };
      if (!keyNorm || keyNorm.length < 6) return { ok: false, message: "Gecerli bir anahtar yazin." };
      tier = normalizeAdminTier(tier);
      var reg = readRegistry();
      var now = Date.now();
      var existed = !!reg.keys[keyNorm];
      var entry = reg.keys[keyNorm] || {};
      entry.tier = tier;
      entry.games = gamesForAdminScope(gameScope);
      entry.createdAt = entry.createdAt || new Date().toISOString();
      entry.revoked = false;
      entry.clientIp = "";
      entry.shared = true;
      if (activateNow && !entry.activatedAt) {
        entry.activatedAt = now;
        entry.expiresAt = isUnlimitedTier(tier) ? null : now + (TIER_MS[tier] || TIER_MS["7d"]);
      } else if (isUnlimitedTier(tier) && entry.activatedAt) {
        entry.expiresAt = null;
      } else if (!entry.activatedAt) {
        entry.expiresAt = null;
      }
      reg.keys[keyNorm] = entry;
      writeRegistry(reg);
      return { ok: true, keyNorm: keyNorm, created: !existed, entry: entry };
    } catch (eUpsert) {
      return { ok: false, message: "Anahtar kaydedilemedi." };
    }
  }

  function adminExtendKey(keyNorm, tierOrDays) {
    try {
      var k = normalizeKey(keyNorm);
      var reg = readRegistry();
      var entry = reg.keys[k];
      if (!entry) return { ok: false, message: "Anahtar bulunamadi." };
      var t = normalizeAdminTier(tierOrDays);
      var now = Date.now();
      entry.revoked = false;
      entry.shared = true;
      entry.clientIp = "";
      entry.tier = t;
      if (isUnlimitedTier(t)) {
        entry.activatedAt = entry.activatedAt || now;
        entry.expiresAt = null;
      } else {
        var ms = TIER_MS[t] || TIER_MS["7d"];
        var base = entry.expiresAt != null && Number(entry.expiresAt) > now ? Number(entry.expiresAt) : now;
        entry.activatedAt = entry.activatedAt || now;
        entry.expiresAt = base + ms;
      }
      reg.keys[k] = entry;
      writeRegistry(reg);
      try {
        readLicenseSession();
      } catch (eSess) {}
      return { ok: true, keyNorm: k, entry: entry };
    } catch (eExt) {
      return { ok: false, message: "Sure uzatilamadi." };
    }
  }

  function adminRevokeKey(keyNorm) {
    var k = normalizeKey(keyNorm);
    var reg = readRegistry();
    if (!reg.keys[k]) return false;
    reg.keys[k].revoked = true;
    writeRegistry(reg);
    try {
      readLicenseSession();
    } catch (eR) {}
    return true;
  }

  function adminDeleteKey(keyNorm) {
    var k = normalizeKey(keyNorm);
    var reg = readRegistry();
    if (!reg.keys[k]) return false;
    delete reg.keys[k];
    writeRegistry(reg);
    try {
      readLicenseSession();
    } catch (eS) {}
    return true;
  }

  function mergeServerRegistry(serverObj) {
    if (!serverObj || typeof serverObj !== "object") return false;
    var keys = serverObj.keys;
    if (!keys || typeof keys !== "object") return false;
    var reg = readRegistry();
    var changed = false;
    for (var k in keys) {
      if (!Object.prototype.hasOwnProperty.call(keys, k)) continue;
      var kn = normalizeKey(k);
      if (!kn) continue;
      if (!reg.keys[kn]) {
        reg.keys[kn] = keys[k];
        changed = true;
        continue;
      }
      if (keys[k] && typeof keys[k] === "object") {
        reg.keys[kn] = Object.assign({}, reg.keys[kn], keys[k]);
        changed = true;
      }
    }
    if (changed) writeRegistry(reg);
    return changed;
  }

  function isPublicHostedSite() {
    try {
      if (!location || location.protocol === "file:") return false;
      var h = String(location.hostname || "")
        .toLowerCase()
        .replace(/^\[|\]$/g, "");
      if (!h || h === "127.0.0.1" || h === "localhost" || h === "::1" || h === "0:0:0:0:0:0:0:1") return false;
      return true;
    } catch (eH) {
      return false;
    }
  }

  function getAdminSyncToken() {
    try {
      return String(sessionStorage.getItem(ADMIN_SYNC_TOKEN_KEY) || localStorage.getItem(ADMIN_SYNC_TOKEN_KEY) || "").trim();
    } catch (e0) {
      return "";
    }
  }

  function setAdminSyncToken(raw) {
    try {
      var t = String(raw || "").trim();
      if (!t) {
        sessionStorage.removeItem(ADMIN_SYNC_TOKEN_KEY);
        localStorage.removeItem(ADMIN_SYNC_TOKEN_KEY);
        return;
      }
      sessionStorage.setItem(ADMIN_SYNC_TOKEN_KEY, t);
      localStorage.setItem(ADMIN_SYNC_TOKEN_KEY, t);
    } catch (e1) {}
  }

  function resolveServerSyncUrl() {
    try {
      var scripts = document.getElementsByTagName("script");
      for (var i = 0; i < scripts.length; i++) {
        var src = String(scripts[i].src || "");
        if (src.indexOf("gemtok-license.js") >= 0) {
          return src.replace(/gemtok-license\.js(\?.*)?$/i, "gemtok-license-sync.php");
        }
      }
    } catch (e0) {}
    try {
      return new URL("sÄ±ra/gemtok-license-sync.php", location.origin + "/").href;
    } catch (e1) {
      return "sÄ±ra/gemtok-license-sync.php";
    }
  }

  function syncRegistryToServer(adminToken, keysSubset) {
    if (!isPublicHostedSite()) {
      return Promise.resolve({ ok: false, message: "local_skip", local: true });
    }
    var token = String(adminToken || getAdminSyncToken() || "").trim();
    if (!token) {
      return Promise.resolve({ ok: false, message: "no_token" });
    }
    var keys = keysSubset;
    if (!keys || typeof keys !== "object") {
      keys = readRegistry().keys || {};
    }
    return fetch(resolveServerSyncUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "merge", adminToken: token, keys: keys }),
      cache: "no-store",
    })
      .then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok || !j || !j.ok) {
            return {
              ok: false,
              message: (j && j.message) || "sync_failed",
              status: r.status,
            };
          }
          return loadServerRegistryAsync().then(function () {
            return { ok: true, added: j.added || 0, updated: j.updated || 0, total: j.total || 0 };
          });
        });
      })
      .catch(function (eSync) {
        return { ok: false, message: String(eSync && eSync.message ? eSync.message : "sync_error") };
      });
  }

  function deleteKeyOnServer(adminToken, keyNorm) {
    if (!isPublicHostedSite()) return Promise.resolve({ ok: false, message: "local_skip", local: true });
    var token = String(adminToken || getAdminSyncToken() || "").trim();
    if (!token) return Promise.resolve({ ok: false, message: "no_token" });
    var kn = normalizeKey(keyNorm);
    return fetch(resolveServerSyncUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", adminToken: token, key: kn }),
      cache: "no-store",
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: !!(r.ok && j && j.ok), message: (j && j.message) || "" };
        });
      })
      .catch(function () {
        return { ok: false, message: "delete_error" };
      });
  }

  function resolveServerRegistryUrl() {
    if (isPublicHostedSite()) {
      return resolveServerSyncUrl();
    }
    try {
      var scripts = document.getElementsByTagName("script");
      for (var i = 0; i < scripts.length; i++) {
        var src = String(scripts[i].src || "");
        if (src.indexOf("gemtok-license.js") >= 0) {
          return src.replace(/gemtok-license\.js(\?.*)?$/i, "gemtok-license-registry.json");
        }
      }
    } catch (e0) {}
    try {
      return new URL("sÄ±ra/gemtok-license-registry.json", location.origin + "/").href;
    } catch (e1) {
      return "sÄ±ra/gemtok-license-registry.json";
    }
  }

  function fetchServerRegistryJson(url) {
    return fetch(url, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("registry_http");
      return r.json();
    });
  }

  function loadServerRegistryAsync() {
    var primary = resolveServerRegistryUrl();
    var fallback = "";
    try {
      if (primary.indexOf("gemtok-license-sync.php") >= 0) {
        fallback = primary.replace("gemtok-license-sync.php", "gemtok-license-registry.json");
      }
    } catch (eFb) {}

    function applyRegistry(j) {
      var hadSession = !!readLicenseSession();
      mergeServerRegistry(j);
      tryHydrateSessionFromLastKey();
      if (!hadSession && readLicenseSession()) {
        try {
          window.dispatchEvent(new CustomEvent("gemtok-license-changed"));
        } catch (eEv) {}
      }
    }

    return fetchServerRegistryJson(primary)
      .catch(function () {
        if (!fallback || fallback === primary) throw new Error("registry_fetch");
        return fetchServerRegistryJson(fallback);
      })
      .then(applyRegistry)
      .catch(function () {})
      .finally(function () {
        finishRegistryReady();
      });
  }

  function exportServerRegistryJson() {
    var reg = readRegistry();
    return JSON.stringify({ keys: reg.keys || {} }, null, 2);
  }

  var registryReadyResolve = null;
  var registryReadyPromise = new Promise(function (resolve) {
    registryReadyResolve = resolve;
  });

  function finishRegistryReady() {
    if (registryReadyResolve) {
      registryReadyResolve();
      registryReadyResolve = null;
    }
  }

  function whenReady() {
    return registryReadyPromise;
  }

  function downloadServerRegistryFile() {
    try {
      var text = exportServerRegistryJson();
      var blob = new Blob([text], { type: "application/json;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "gemtok-license-registry.json";
      a.click();
      setTimeout(function () {
        try {
          URL.revokeObjectURL(a.href);
        } catch (e0) {}
      }, 4000);
      return true;
    } catch (e) {
      return false;
    }
  }

  window.GemtokLicense = {
    REGISTRY_KEY: REGISTRY_KEY,
    REGISTRY_BACKUP_KEY: REGISTRY_BACKUP_KEY,
    ADMIN_SYNC_TOKEN_KEY: ADMIN_SYNC_TOKEN_KEY,
    ITEMSATIS_URL_KEY: ITEMSATIS_URL_KEY,
    DEFAULT_ITEMSATIS_PROFILE_URL: DEFAULT_ITEMSATIS_PROFILE_URL,
    SESSION_KEY: SESSION_KEY,
    TIER_MS: TIER_MS,
    UNLIMITED_TIER: UNLIMITED_TIER,
    isUnlimitedTier: isUnlimitedTier,
    normalizeKey: normalizeKey,
    readRegistry: readRegistry,
    writeRegistry: writeRegistry,
    getItemsatisUrl: getItemsatisUrl,
    setItemsatisUrl: setItemsatisUrl,
    readLicenseSession: readLicenseSession,
    clearLicenseSession: clearLicenseSession,
    isGameAllowedInSession: isGameAllowedInSession,
    redeemKey: redeemKey,
    redeemKeyAsync: redeemKeyAsync,
    adminGenerateKeys: adminGenerateKeys,
    adminUpsertKey: adminUpsertKey,
    adminExtendKey: adminExtendKey,
    adminRevokeKey: adminRevokeKey,
    adminDeleteKey: adminDeleteKey,
    mergeServerRegistry: mergeServerRegistry,
    isPublicHostedSite: isPublicHostedSite,
    getAdminSyncToken: getAdminSyncToken,
    setAdminSyncToken: setAdminSyncToken,
    resolveServerSyncUrl: resolveServerSyncUrl,
    syncRegistryToServer: syncRegistryToServer,
    deleteKeyOnServer: deleteKeyOnServer,
    loadServerRegistryAsync: loadServerRegistryAsync,
    whenReady: whenReady,
    exportServerRegistryJson: exportServerRegistryJson,
    downloadServerRegistryFile: downloadServerRegistryFile,
    migrateKeyClientIps: function () {
      var reg = readRegistry();
      migrateRegistryClientIps(reg);
    },
  };

  try {
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("storage", function (ev) {
        if (!ev) return;
        if (ev.key !== REGISTRY_KEY && ev.key != null) return;
        try {
          readLicenseSession();
        } catch (eSt) {}
      });
      var bootRegistry = function () {
        loadServerRegistryAsync();
      };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootRegistry);
      else bootRegistry();
    } else {
      finishRegistryReady();
    }
  } catch (eLs) {
    finishRegistryReady();
  }
})();
