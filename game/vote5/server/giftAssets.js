/**
 * TikTok gift/list ve gift event alanlarından görsel URL çıkarır.
 */

function firstHttpUrl(arr) {
  if (!Array.isArray(arr)) return null;
  const u = arr.find((x) => typeof x === 'string' && x.startsWith('http'));
  return u || null;
}

function thumbFromImageBlock(block) {
  if (!block || typeof block !== 'object') return null;
  const list = block.url_list || block.urlList;
  const fromList = firstHttpUrl(list);
  if (fromList) return fromList;
  if (typeof block.url === 'string' && block.url.startsWith('http')) return block.url;
  return null;
}

function giftThumbFromApiRecord(g) {
  if (!g || typeof g !== 'object') return null;
  if (typeof g.image === 'string' && g.image.startsWith('http')) return g.image;
  if (typeof g.icon === 'string' && g.icon.startsWith('http')) return g.icon;
  const direct =
    thumbFromImageBlock(g.image) ||
    thumbFromImageBlock(g.icon) ||
    thumbFromImageBlock(g.gif) ||
    thumbFromImageBlock(g.label) ||
    thumbFromImageBlock(g.panel);
  if (direct) return direct;
  if (typeof g.gift_picture === 'string' && g.gift_picture.startsWith('http')) return g.gift_picture;
  return null;
}

function catalogFromGiftList(gifts) {
  const map = Object.create(null);
  if (!Array.isArray(gifts)) return map;
  for (const g of gifts) {
    const id = g && g.id != null ? String(g.id) : null;
    if (!id) continue;
    const image = giftThumbFromApiRecord(g);
    map[id] = {
      id,
      name: g.name || '',
      diamond: g.diamond_count ?? g.diamondCount ?? 0,
      image: image || null,
    };
  }
  return map;
}

function giftThumbFromLiveEvent(data) {
  if (data.giftPictureUrl && String(data.giftPictureUrl).startsWith('http')) {
    return data.giftPictureUrl;
  }
  if (data.gift?.giftPictureUrl && String(data.gift.giftPictureUrl).startsWith('http')) {
    return data.gift.giftPictureUrl;
  }
  if (data.gift && typeof data.gift === 'object') {
    const fromGift = giftThumbFromApiRecord(data.gift);
    if (fromGift) return fromGift;
  }
  return giftThumbFromApiRecord(data.extendedGiftInfo);
}

function giftIdFromLiveEvent(data) {
  if (!data || typeof data !== 'object') return '';
  const candidates = [
    data.giftKey,
    data.giftId,
    data.gift_id,
    data.gift?.giftKey,
    data.gift?.giftId,
    data.gift?.gift_id,
    data.gift?.id,
    data.extendedGiftInfo?.id,
  ];
  for (const candidate of candidates) {
    if (candidate != null) {
      const value = String(candidate).trim();
      if (value) return value;
    }
  }
  return '';
}

function giftNameFromLiveEvent(data) {
  if (!data || typeof data !== 'object') return '';
  return (
    data.giftName ||
    data.gift?.name ||
    data.extendedGiftInfo?.name ||
    data.name ||
    data.describe ||
    data.label ||
    data.text ||
    ''
  ).trim();
}

/**
 * Katalogdaki hediye adında anahtar kelime eşlemesi.
 * 1–2 harfli kelimelerde yalnızca tam isim (ör. "gg" → "Egg" yanlış eşleşmesin);
 * daha uzun kelimelerde ad içinde alt dizgi aranır.
 */
function giftNameMatchesKeyword(giftName, keywordLower) {
  const name = (giftName || '').toLowerCase().trim();
  const kw = keywordLower;
  if (!name || !kw) return false;
  if (kw.length <= 2) {
    return name === kw;
  }
  return name.includes(kw);
}

/** Aynı hediye için TR/EN deneme sırası (önce Türkçe / kısa adlar). */
const KEYWORD_SYNONYM_GROUPS = [
  ['gül', 'gul', 'rose'],
  ['good game', 'gg'],
  ['dondurma', 'sorvete', 'helado', 'ice cream'],
  ['buz', 'kar', 'snow', 'ice cube', 'frozen', 'polar'],
  ['kalp', 'heart', 'love'],
];

function keywordLookupAttempts(primaryLower) {
  const k = primaryLower.trim().toLowerCase();
  for (const g of KEYWORD_SYNONYM_GROUPS) {
    if (g.includes(k)) return [...g];
  }
  return [k];
}

/**
 * Katalogdaki hediye adında anahtar kelime geçen ilk eşleşmeyi bulur (Türkçe/İngilizce isimler).
 * Aynı hediye iki kez eklenmez.
 */
function resolveGiftKeywordsToIds(catalogMap, keywords) {
  if (!catalogMap || !Array.isArray(keywords) || !keywords.length) return [];
  const entries = Object.values(catalogMap).filter((g) => g && g.id != null);
  const out = [];
  const seen = new Set();
  for (const raw of keywords) {
    const primary = String(raw || '').trim().toLowerCase();
    if (!primary) continue;
    let hit = null;
    for (const attempt of keywordLookupAttempts(primary)) {
      const candidates = entries.filter((g) => {
        if (seen.has(g.id)) return false;
        return giftNameMatchesKeyword(g.name, attempt);
      });
      if (!candidates.length) continue;
      candidates.sort((a, b) => (a.name || '').length - (b.name || '').length);
      hit = candidates[0];
      break;
    }
    if (hit) {
      out.push(String(hit.id));
      seen.add(hit.id);
    }
  }
  return out;
}

/** Elle yazılan giftIds + katalogdan giftKeywords ile çözülen ID'ler (yinelenmez). */
function mergedGiftIdsForColumn(col, catalogMap) {
  const manual = (col.giftIds || []).map(String).filter(Boolean);
  const fromKw = resolveGiftKeywordsToIds(catalogMap, col.giftKeywords || []);
  const merged = [];
  const seen = new Set();
  for (const id of [...manual, ...fromKw]) {
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
  }
  return merged;
}

/** Ayarlardan seçilen hediye ID'leri (sütun başına en fazla 2); giftKeywords bu sütunda yok sayılır. */
function applyGiftOverridesToColumns(columns, overrides) {
  const cols = Array.isArray(columns) ? [...columns] : [];
  while (cols.length < 5) {
    cols.push({
      giftIds: [],
      giftKeywords: [],
      stripeColors: ['#333', '#666'],
      icons: ['', ''],
    });
  }
  const trimmed = cols.slice(0, 5);
  if (!Array.isArray(overrides)) return trimmed;
  return trimmed.map((col, i) => {
    const ovr = overrides[i];
    if (!ovr || !ovr.length) return col;
    const ids = ovr.map(String).filter(Boolean).slice(0, 2);
    return { ...col, giftIds: ids, giftKeywords: [] };
  });
}

/** Üstteki iki hediye ikonunun TikTok giftId listesi (katalogda kayıtlı, sırayla ilk iki). */
function headerRoutingGiftIds(col, catalogMap) {
  const merged = mergedGiftIdsForColumn(col, catalogMap);
  const map = catalogMap && typeof catalogMap === 'object' ? catalogMap : {};
  const out = [];
  for (let idx = 0; idx < 2; idx++) {
    const gid = merged[idx] != null ? String(merged[idx]) : '';
    if (!gid || !map[gid]) continue;
    out.push(gid);
  }
  return out;
}

/** Hediye yönlendirmesi: ayarlarda seçilen ID’ler (katalog şart değil). */
function columnGiftIdsForRouting(col, catalogMap) {
  const explicit = (col.giftIds || []).map(String).filter(Boolean).slice(0, 2);
  if (explicit.length > 0) return explicit;
  return mergedGiftIdsForColumn(col, catalogMap);
}

function headerSlotsForColumn(col, catalogMap, colIndex) {
  const em = col.icons || ['', ''];
  const ids = mergedGiftIdsForColumn(col, catalogMap);
  const catalogKeys = Object.keys(catalogMap).sort();

  const slot = (idx) => {
    const gidConfigured = ids[idx] != null ? String(ids[idx]) : '';
    if (gidConfigured) {
      const fromConfig = catalogMap[gidConfigured];
      return {
        type: 'img',
        url: fromConfig?.image || null,
        giftId: gidConfigured,
        name: fromConfig?.name || gidConfigured,
      };
    }

    if (catalogKeys.length) {
      const pick = catalogKeys[(colIndex * 2 + idx) % catalogKeys.length];
      const rec = catalogMap[pick];
      if (rec?.image) {
        return { type: 'img', url: rec.image, giftId: pick, name: rec.name || '' };
      }
    }

    return { type: 'emoji', text: em[idx] != null ? em[idx] : em[0] || '' };
  };
  return [slot(0), slot(1)];
}

function buildColumnsVisual(cfg, catalogMap) {
  const columns = (cfg.columns || []).slice(0, 5);
  while (columns.length < 5) {
    columns.push({ giftIds: [], stripeColors: ['#333', '#666'], icons: ['', ''] });
  }
  return columns.map((col, colIndex) => {
    const mergedIds = mergedGiftIdsForColumn(col, catalogMap);
    const routingIds = columnGiftIdsForRouting(col, catalogMap);
    return {
      stripeColors: col.stripeColors || ['#333', '#666'],
      giftIds: mergedIds,
      routingGiftIds: routingIds,
      giftKeywords: col.giftKeywords || [],
      headerSlots: headerSlotsForColumn(col, catalogMap, colIndex),
    };
  });
}

/**
 * TikTok hediye olayından arama metni (ad, describe, label birleşik).
 */
function liveGiftSearchHaystack(data) {
  if (!data || typeof data !== 'object') return '';
  const g = data.gift;
  const parts = [
    data.giftName,
    data.gift?.name,
    data.extendedGiftInfo?.name,
    data.name,
    data.describe,
    data.label,
    data.text,
    g && typeof g === 'object' ? g.describe : null,
    g && typeof g === 'object' ? g.name : null,
    g && typeof g === 'object' ? g.title : null,
  ];
  return parts
    .filter((x) => typeof x === 'string' && x.trim())
    .join(' ')
    .toLowerCase();
}

function normalizeGiftWords(haystack) {
  return String(haystack || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** 1–2 harfli eşleşme: tam dize veya kelime token’ı (ör. "gg" ≠ "egg"). */
function haystackHasShortGiftToken(haystack, attempt) {
  const a = String(attempt || '').toLowerCase();
  if (!a) return false;
  const norm = normalizeGiftWords(haystack);
  if (norm === a) return true;
  const words = norm.split(/\s+/).filter(Boolean);
  return words.includes(a);
}

/**
 * Canlı hediye metni sütun anahtar kelimeleriyle eşleşiyor mu?
 * ID kataloğu uyuşmazsa yedek olarak kullanılır.
 */
function liveGiftNameMatchesColumn(col, liveHaystack) {
  const live = (liveHaystack || '').toLowerCase().trim();
  if (!live) return false;
  for (const raw of col.giftKeywords || []) {
    const primary = String(raw || '').trim().toLowerCase();
    if (!primary) continue;
    for (const attempt of keywordLookupAttempts(primary)) {
      if (attempt.length <= 2) {
        if (live === attempt || haystackHasShortGiftToken(live, attempt)) return true;
        continue;
      }
      if (live.includes(attempt)) return true;
    }
  }
  return false;
}

/**
 * Hediyeyi sütuna bağlar: önce üstteki hediye ikonlarına karşılık gelen giftId’ler,
 * olmazsa tüm çözümlü ID’ler; sonra canlı metin (giftKeywords), en sonda demo hash.
 */
function resolveColumnForGift(data, columns, demoRoute, catalogMap) {
  const sid = giftIdFromLiveEvent(data);
  const map = catalogMap && typeof catalogMap === 'object' ? catalogMap : {};
  const cols = Array.isArray(columns) ? columns : [];

  for (let i = 0; i < cols.length; i++) {
    const ids = columnGiftIdsForRouting(cols[i], map);
    if (sid && ids.map(String).includes(sid)) return i;
  }

  const liveHay = liveGiftSearchHaystack(data);
  if (liveHay) {
    for (let i = 0; i < cols.length; i++) {
      if (liveGiftNameMatchesColumn(cols[i], liveHay)) return i;
    }
  }

  if (demoRoute && sid) {
    const n = parseInt(sid, 10);
    if (!Number.isNaN(n)) return Math.abs(n) % Math.max(1, cols.length);
    let h = 0;
    for (let j = 0; j < sid.length; j++) h = (h * 31 + sid.charCodeAt(j)) >>> 0;
    return h % Math.max(1, cols.length);
  }
  return -1;
}

module.exports = {
  catalogFromGiftList,
  giftThumbFromLiveEvent,
  buildColumnsVisual,
  giftThumbFromApiRecord,
  mergedGiftIdsForColumn,
  applyGiftOverridesToColumns,
  headerRoutingGiftIds,
  columnGiftIdsForRouting,
  resolveGiftKeywordsToIds,
  keywordLookupAttempts,
  liveGiftSearchHaystack,
  liveGiftNameMatchesColumn,
  resolveColumnForGift,
  giftIdFromLiveEvent,
  giftNameFromLiveEvent,
};
