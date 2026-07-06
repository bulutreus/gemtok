/**
 * GemTok hediye kataloğu: yalnızca TR bölgesinde geçerli, yabancı yerel isimleri elenen kayıtlar.
 */
(function () {
  var PREFERRED_REGION = "TR";
  var POLISH_RE = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;

  function giftRegions(row) {
    if (!row || typeof row !== "object") return null;
    if (Array.isArray(row.regions)) return row.regions;
    var meta = row.metadata;
    if (meta && typeof meta === "object" && Array.isArray(meta.original && meta.original.regions)) {
      return meta.original.regions;
    }
    var raw = row.metadata_json;
    if (typeof raw === "string" && raw) {
      try {
        var parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.original && parsed.original.regions)) return parsed.original.regions;
      } catch (_e) {}
    }
    return null;
  }

  function giftTiktokId(row) {
    if (!row || typeof row !== "object") return null;
    var id = row.tiktok_id != null ? row.tiktok_id : row.code != null ? row.code : row.gift_tiktok_id;
    id = Math.floor(Number(id));
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  function hasForeignLocaleName(name) {
    var n = String(name || "").trim();
    if (!n) return false;
    if (POLISH_RE.test(n)) return true;
    if (/[\u0400-\u04FF]/.test(n)) return true;
    if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(n)) return true;
    return false;
  }

  function includesPreferredRegion(row) {
    var regions = giftRegions(row);
    if (!regions || !regions.length) return false;
    return regions.indexOf(PREFERRED_REGION) !== -1;
  }

  function isCatalogGiftAllowed(row, allowIds) {
    if (!row || typeof row !== "object") return false;
    var id = giftTiktokId(row);
    if (id == null) return false;
    if (allowIds && allowIds.has(id)) return true;
    if (hasForeignLocaleName(row.name)) return false;
    return includesPreferredRegion(row);
  }

  function dedupeCatalogGifts(rows) {
    if (!Array.isArray(rows)) return [];
    var out = [];
    var keyToIdx = new Map();
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row || typeof row !== "object") continue;
      var id = giftTiktokId(row);
      var name = String(row.name || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
      var diamonds = Math.max(
        0,
        Math.floor(Number(row.diamond_count != null ? row.diamond_count : row.coins != null ? row.coins : row.diamond != null ? row.diamond : 0) || 0),
      );
      var key = name ? name + "\0" + diamonds : id != null ? "#" + id : "";
      if (!key) continue;
      var idx = keyToIdx.get(key);
      if (idx === undefined) {
        keyToIdx.set(key, out.length);
        out.push(row);
        continue;
      }
      if (id == null) continue;
      var prevId = giftTiktokId(out[idx]);
      if (prevId == null || id < prevId) out[idx] = row;
    }
    return out;
  }

  function filterCatalogGifts(rows, allowIds) {
    if (!Array.isArray(rows)) return [];
    return dedupeCatalogGifts(
      rows.filter(function (r) {
        return isCatalogGiftAllowed(r, allowIds);
      }),
    );
  }

  function buildAllowIdSetFromGiftList(arr) {
    var set = new Set();
    if (!Array.isArray(arr)) return set;
    for (var i = 0; i < arr.length; i++) {
      if (includesPreferredRegion(arr[i]) && !hasForeignLocaleName(arr[i] && arr[i].name)) {
        var id = giftTiktokId(arr[i]);
        if (id != null) set.add(id);
      }
    }
    return set;
  }

  var api = {
    PREFERRED_REGION: PREFERRED_REGION,
    giftTiktokId: giftTiktokId,
    giftRegions: giftRegions,
    hasForeignLocaleName: hasForeignLocaleName,
    includesPreferredRegion: includesPreferredRegion,
    isCatalogGiftAllowed: isCatalogGiftAllowed,
    filterCatalogGifts: filterCatalogGifts,
    dedupeCatalogGifts: dedupeCatalogGifts,
    buildAllowIdSetFromGiftList: buildAllowIdSetFromGiftList,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (typeof globalThis !== "undefined") {
    globalThis.GemtokGiftCatalogFilter = api;
  } else if (typeof self !== "undefined") {
    self.GemtokGiftCatalogFilter = api;
  } else if (typeof window !== "undefined") {
    window.GemtokGiftCatalogFilter = api;
  }
})();
