/**
 * Yerel lisans anahtarı kaydı (admin üretir; kullanıcı Oyun Merkezi'nde girer).
 * sessionStorage: hottok_oyun_lisans = { expiresAt, games, keyNorm }
 */
(function () {
  var REGISTRY_KEY = "hottok_license_registry";
  var ITEMSATIS_URL_KEY = "hottok_itemsatis_store_url";
  /** Kayıtlı mağaza URL’si yoksa «Lisans satın al» bağlantıları bu profili kullanır. */
  var DEFAULT_ITEMSATIS_PROFILE_URL = "https://www.itemsatis.com/profil/2319676/gemtok.html";
  var SESSION_KEY = "hottok_oyun_lisans";

  var TIER_MS = {
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
    "90d": 90 * 24 * 60 * 60 * 1000,
    "365d": 365 * 24 * 60 * 60 * 1000,
  };

  /** Sınırsız: süre yok; `expiresAt` kayıtta ve oturumda null kalır. */
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
      var raw = localStorage.getItem(REGISTRY_KEY);
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
      localStorage.setItem(REGISTRY_KEY, JSON.stringify(o));
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

  function readLicenseSession() {
    try {
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
        });
        raw = sessionStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        s = JSON.parse(raw);
        if (!s || typeof s !== "object") return null;
      }
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
  }

  function clearLicenseSession() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {}
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

  /**
   * Anahtarı doğrular; ilk kullanımda süreyi başlatır.
   * @param {string} rawKey
   * @param {string} [forGameId] — verilirse yalnızca bu oyun için kabul edilir.
   * @returns {{ ok: boolean, message?: string, expiresAt?: number }}
   */
  function redeemKey(rawKey, forGameId) {
    var keyNorm = normalizeKey(rawKey);
    if (keyNorm === "BULUTREUS") {
      return {
        ok: false,
        message:
          "Bu değer bir lisans anahtarı değildir. Yönetici erişimi için Oyun Merkezi’nde anahtar kutusuna yalnızca sizin bildiğiniz yönetici parolasını yazıp «Anahtarı uygula» kullanın.",
      };
    }
    if (!keyNorm || keyNorm.length < 6) return { ok: false, message: "Geçersiz anahtar." };

    var reg = readRegistry();
    var entry = reg.keys[keyNorm];
    if (!entry) return { ok: false, message: "Bu anahtar kayıtlı değil." };
    if (entry.revoked) return { ok: false, message: "Bu anahtar iptal edilmiş." };

    var tier = entry.tier || "7d";
    var unl = isUnlimitedTier(tier);
    var ms = unl ? 0 : TIER_MS[tier] || TIER_MS["7d"];
    var now = Date.now();

    var games = entry.games && entry.games.length ? entry.games : ["all"];
    if (forGameId != null && String(forGameId).length && !gamesAllow(games, forGameId)) {
      return { ok: false, message: "Bu anahtar seçilen oyun için geçerli değil." };
    }

    if (!entry.clientIp) {
      entry.clientIp = allocateClientIpForKey(reg);
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
        return { ok: false, message: "Anahtarın süresi dolmuş." };
      }
    }

    writeLicenseSession({
      keyNorm: keyNorm,
      expiresAt: entry.expiresAt == null ? null : Number(entry.expiresAt),
      games: games,
      tier: tier,
      clientIp: entry.clientIp || "",
    });
    return { ok: true, expiresAt: entry.expiresAt };
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
      if (!e || e.clientIp) continue;
      e.clientIp = allocateClientIpForKey(reg);
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
      if (gsc !== "all" && gsc !== "carRace" && gsc !== "warFront" && gsc !== "arenaBattle") gsc = "all";
      var games = gsc === "all" ? ["all"] : [gsc];

      function randChunk() {
        var chars = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";
        var s = "";
        for (var i = 0; i < 4; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
        return s;
      }

      for (var n = 0; n < count; n++) {
        var keyNorm = "HTOK-" + randChunk() + "-" + randChunk() + "-" + randChunk();
        while (reg.keys[keyNorm]) keyNorm = "HTOK-" + randChunk() + "-" + randChunk() + "-" + randChunk();

        reg.keys[keyNorm] = {
          tier: tier,
          games: games,
          createdAt: new Date().toISOString(),
          revoked: false,
          activatedAt: null,
          expiresAt: null,
          clientIp: allocateClientIpForKey(reg),
        };
        out.push(keyNorm);
      }
      writeRegistry(reg);
      return out;
    } catch (eGen) {
      return [];
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

  window.HottokLicense = {
    REGISTRY_KEY: REGISTRY_KEY,
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
    adminGenerateKeys: adminGenerateKeys,
    adminRevokeKey: adminRevokeKey,
    adminDeleteKey: adminDeleteKey,
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
    }
  } catch (eLs) {}
})();
