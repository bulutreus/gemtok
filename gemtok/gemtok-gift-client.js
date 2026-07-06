/**
 * GemTok — merkezi hediye hub istemcisi (vanilla / oyunlardan paylaşılır).
 * Sunucu: gift-hub (http://127.0.0.1:8787). Önbellek: bellek + isteğe localStorage.
 */
(function (global) {
  var DEFAULT_PORT = 8787;
  var CACHE_MS = 60 * 1000;
  var mem = { gifts: null, at: 0, mappings: {} };

  function hubBase() {
    try {
      if (global.__GEMTOK_GIFT_HUB_URL__) return String(global.__GEMTOK_GIFT_HUB_URL__).replace(/\/$/, "");
    } catch (e0) {}
    try {
      if (global.localStorage) {
        var ls = global.localStorage.getItem("gemtok_gift_hub_url");
        if (ls) return String(ls).replace(/\/$/, "");
      }
    } catch (e1) {}
    return "http://127.0.0.1:" + DEFAULT_PORT;
  }

  function setHubBase(url) {
    try {
      global.localStorage.setItem("gemtok_gift_hub_url", String(url || "").replace(/\/$/, ""));
    } catch (e) {}
  }

  function canReachLocalGiftHub() {
    try {
      if (global.location && global.location.protocol === "file:") return true;
      var h = String(global.location.hostname || "").toLowerCase();
      return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
    } catch (e0) {
      return false;
    }
  }

  function resolveStaticGiftImagesBase() {
    try {
      if (global.__GEMTOK_GIFT_IMAGES_BASE__) {
        return String(global.__GEMTOK_GIFT_IMAGES_BASE__).replace(/\/?$/, "/");
      }
    } catch (e0) {}
    try {
      var scripts = global.document && global.document.getElementsByTagName("script");
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
      return new URL("sıra/gift-images/", global.location.origin + "/").href;
    } catch (e2) {
      return "sıra/gift-images/";
    }
  }

  function resolveStaticGiftListJsonUrl() {
    try {
      return new URL("sıra/gift-images/gift-list.json", global.location.origin + "/").href;
    } catch (e0) {
      return "sıra/gift-images/gift-list.json";
    }
  }

  function rowToHubGift(row, imgBase) {
    if (!row || typeof row !== "object") return null;
    var id = Math.floor(Number(row.tiktok_id != null ? row.tiktok_id : row.code));
    if (!Number.isFinite(id) || id <= 0) return null;
    var file = String(row.file || id + ".webp").trim();
    var imageUrl = file ? String(imgBase || "").replace(/\/?$/, "/") + file : null;
    return {
      tiktok_id: id,
      name: String(row.name || "").trim() || "Gift " + id,
      diamond_count: Math.max(
        0,
        Math.floor(Number(row.diamond_count != null ? row.diamond_count : row.coins != null ? row.coins : 0) || 0),
      ),
      imageUrl: imageUrl,
      active: true,
    };
  }

  async function loadStaticGifts() {
    var rows = null;
    try {
      if (global.__GEMTOK_GIFT_LIST__ && Array.isArray(global.__GEMTOK_GIFT_LIST__) && global.__GEMTOK_GIFT_LIST__.length) {
        rows = global.__GEMTOK_GIFT_LIST__;
      }
    } catch (e0) {}
    if (!rows) {
      try {
        var r = await fetch(resolveStaticGiftListJsonUrl(), { cache: "no-store" });
        if (r.ok) {
          var parsed = await r.json();
          if (Array.isArray(parsed)) rows = parsed;
        }
      } catch (e1) {}
    }
    if (!Array.isArray(rows)) return [];
    var imgBase = resolveStaticGiftImagesBase();
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var g = rowToHubGift(rows[i], imgBase);
      if (g) out.push(g);
    }
    if (global.GemtokGiftCatalogFilter && typeof global.GemtokGiftCatalogFilter.filterCatalogGifts === "function") {
      out = global.GemtokGiftCatalogFilter.filterCatalogGifts(out);
    }
    return out;
  }

  async function jget(path) {
    var r = await fetch(hubBase() + path, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!r.ok) throw new Error("gift_hub_http_" + r.status);
    return r.json();
  }

  /**
   * TikTok Live hediye benzeri payload (giftId / gift_id / giftDetails.id).
   */
  function extractGiftIdFromEvent(ev) {
    if (ev == null) return null;
    if (typeof ev.giftKey === "number" && Number.isFinite(ev.giftKey)) return ev.giftKey;
    if (typeof ev.giftKey === "string") {
      var pk = parseInt(String(ev.giftKey).trim(), 10);
      if (Number.isFinite(pk) && pk > 0) return pk;
    }
    if (typeof ev.giftId === "number" && Number.isFinite(ev.giftId)) return ev.giftId;
    if (typeof ev.gift_id === "number" && Number.isFinite(ev.gift_id)) return ev.gift_id;
    var gd = ev.giftDetails || ev.gift || {};
    if (typeof gd.id === "number" && Number.isFinite(gd.id)) return gd.id;
    if (typeof gd.giftId === "number" && Number.isFinite(gd.giftId)) return gd.giftId;
    return null;
  }

  function invalidateGiftHubCaches() {
    mem.gifts = null;
    mem.at = 0;
    mem.mappings = {};
  }

  function subscribeGiftCatalog(cb) {
    if (typeof cb !== "function") return function () {};
    var handler = function () {
      invalidateGiftHubCaches();
      try {
        cb();
      } catch (e) {}
    };
    try {
      global.addEventListener("gemtok-gifts-updated", handler);
    } catch (e0) {}
    var ch = null;
    try {
      ch = new global.BroadcastChannel("gemtok-gifts-v1");
      ch.onmessage = function () {
        handler();
      };
    } catch (e1) {}
    return function () {
      try {
        global.removeEventListener("gemtok-gifts-updated", handler);
      } catch (e2) {}
      try {
        if (ch) ch.close();
      } catch (e3) {}
    };
  }

  /**
   * Tüm hediye satırları (sayfalı indirme; önbellekli).
   * @returns {Promise<object[]>}
   */
  async function getAllGifts(opts) {
    var force = opts && opts.force;
    if (!force && mem.gifts && Date.now() - mem.at < CACHE_MS) return mem.gifts;
    if (!canReachLocalGiftHub()) {
      var staticOnly = await loadStaticGifts();
      mem.gifts = staticOnly;
      mem.at = Date.now();
      return staticOnly;
    }
    var out = [];
    try {
      var limit = 200;
      var offset = 0;
      for (;;) {
        var j = await fetchGiftsPage({
          limit: limit,
          offset: offset,
          search: (opts && opts.search) || "",
          sort: (opts && opts.sort) || "",
          order: (opts && opts.order) || "",
          active: (opts && opts.active) || "",
        });
        if (!j || !j.ok || !Array.isArray(j.gifts)) break;
        for (var i = 0; i < j.gifts.length; i++) out.push(j.gifts[i]);
        if (j.gifts.length < limit) break;
        offset += limit;
      }
    } catch (eHub) {
      out = [];
    }
    if (!out.length) out = await loadStaticGifts();
    if (global.GemtokGiftCatalogFilter && typeof global.GemtokGiftCatalogFilter.filterCatalogGifts === "function") {
      out = global.GemtokGiftCatalogFilter.filterCatalogGifts(out);
    }
    mem.gifts = out;
    mem.at = Date.now();
    return out;
  }

  /**
   * @param {string} gameId
   * @returns {Promise<Map<number, string>>} giftTiktokId -> action_key
   */
  async function loadMappingsMap(gameId) {
    var j = await jget("/api/v1/games/" + encodeURIComponent(gameId) + "/mappings-only");
    if (!j || !j.ok || !j.mappings) throw new Error("gift_hub_mappings");
    var m = new Map();
    for (var i = 0; i < j.mappings.length; i++) {
      m.set(j.mappings[i].gift_tiktok_id, j.mappings[i].action_key);
    }
    mem.mappings[gameId] = { map: m, at: Date.now() };
    return m;
  }

  async function getMappingsMapCached(gameId) {
    if (!canReachLocalGiftHub()) return new Map();
    var c = mem.mappings[gameId];
    if (c && Date.now() - c.at < CACHE_MS) return c.map;
    try {
      return loadMappingsMap(gameId);
    } catch (eMap) {
      return new Map();
    }
  }

  /**
   * @param {string} gameId
   * @param {object} tiktokLikeEvent
   * @returns {Promise<{ actionKey: string, giftId: number|null, giftMeta: object|null }>}
   */
  async function resolveGiftAction(gameId, tiktokLikeEvent) {
    var gid = extractGiftIdFromEvent(tiktokLikeEvent);
    var map = await getMappingsMapCached(gameId);
    var actionKey = gid != null ? map.get(gid) : null;
    if (!actionKey) actionKey = "default";
    var giftMeta = null;
    if (gid != null) {
      try {
        var g = await jget("/api/v1/gifts/" + gid);
        if (g && g.ok && g.gift) giftMeta = g.gift;
      } catch (eG) {}
    }
    return { actionKey: actionKey, giftId: gid, giftMeta: giftMeta };
  }

  /**
   * Sayfalı hediye listesi (global katalog; oyunlarda kopya tutulmaz).
   */
  async function fetchGiftsPage(opts) {
    if (!canReachLocalGiftHub()) {
      var all = await loadStaticGifts();
      var limit = Math.max(1, Math.floor(Number((opts && opts.limit) || 80) || 80));
      var offset = Math.max(0, Math.floor(Number((opts && opts.offset) || 0) || 0));
      var slice = all.slice(offset, offset + limit);
      return { ok: true, gifts: slice, total: all.length };
    }
    var q = new URLSearchParams();
    q.set("limit", String((opts && opts.limit) || 80));
    q.set("offset", String((opts && opts.offset) || 0));
    if (opts && opts.search) q.set("search", String(opts.search));
    if (opts && opts.unmappedForGame) q.set("unmappedForGame", String(opts.unmappedForGame));
    if (opts && opts.sort) q.set("sort", String(opts.sort));
    if (opts && opts.order) q.set("order", String(opts.order));
    if (opts && opts.active) q.set("active", String(opts.active));
    return jget("/api/v1/gifts?" + q.toString());
  }

  global.GemtokGiftHub = {
    hubBase: hubBase,
    setHubBase: setHubBase,
    jget: jget,
    extractGiftIdFromEvent: extractGiftIdFromEvent,
    loadMappingsMap: loadMappingsMap,
    getMappingsMapCached: getMappingsMapCached,
    resolveGiftAction: resolveGiftAction,
    fetchGiftsPage: fetchGiftsPage,
    getAllGifts: getAllGifts,
    invalidateGiftHubCaches: invalidateGiftHubCaches,
    subscribeGiftCatalog: subscribeGiftCatalog,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
