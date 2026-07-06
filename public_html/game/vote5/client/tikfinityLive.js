/**
 * TikFinity masaüstü uygulamasının yerel WebSocket çıkışı (varsayılan ws://127.0.0.1:21213).
 * Olaylar: gift (+ benzeri), like, follow, member, subscribe, share — JSON { event, data }.
 */

import {
  applyGiftOverridesToColumns,
  giftIdFromLiveEvent,
  liveGiftSearchHaystack,
  resolveColumnForGift,
} from './fileModeColumns.js';
import { extractViewerProfileUrl } from '../shared/viewerProfileUrl.cjs';
import { computeGiftRepeatDelta, giftVisualPlan } from '../shared/giftStreak.cjs';

export { giftVisualPlan };

function giftThumbFromLiveTikfinity(data) {
  if (!data || typeof data !== 'object') return null;
  if (data.giftPictureUrl && String(data.giftPictureUrl).startsWith('http')) {
    return data.giftPictureUrl;
  }
  if (data.giftImageUrl && String(data.giftImageUrl).startsWith('http')) {
    return data.giftImageUrl;
  }
  if (data.gift?.giftPictureUrl && String(data.gift.giftPictureUrl).startsWith('http')) {
    return data.gift.giftPictureUrl;
  }
  return null;
}

export const TIKFINITY_WS_STORAGE_KEY = 'vote5_tikfinity_ws';
export const DEFAULT_TIKFINITY_WS = 'ws://127.0.0.1:21213';

export function getTikfinityWsUrl() {
  try {
    const s = localStorage.getItem(TIKFINITY_WS_STORAGE_KEY)?.trim();
    if (s) return s;
  } catch (_) {}
  const v = typeof import.meta !== 'undefined' && import.meta.env?.VITE_TIKFINITY_WS?.trim?.();
  if (v) return v;
  return DEFAULT_TIKFINITY_WS;
}

/** ?noTikfinity=1 veya ?tikfinity=0 → otomatik ws bağlantısı yok */
export function isTikfinityAutoConnectDisabled() {
  if (typeof window === 'undefined') return false;
  const q = new URLSearchParams(window.location.search);
  return q.get('noTikfinity') === '1' || q.get('tikfinity') === '0';
}

export function catalogMapFromClientList(list) {
  const m = Object.create(null);
  if (!Array.isArray(list)) return m;
  for (const g of list) {
    if (g && g.id != null) {
      m[String(g.id)] = {
        id: String(g.id),
        name: g.name || '',
        diamond: Number(g.diamond) || 0,
        image: g.image || null,
      };
    }
  }
  return m;
}

function getGiftName(data) {
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

function getDiamondCost(data, catalogMap) {
  if (typeof data.diamondCount === 'number' && data.diamondCount > 0) {
    return data.diamondCount;
  }
  const ext = data.extendedGiftInfo;
  if (ext && typeof ext.diamond_count === 'number' && ext.diamond_count > 0) {
    return ext.diamond_count;
  }
  if (ext && typeof ext.diamondCount === 'number' && ext.diamondCount > 0) {
    return ext.diamondCount;
  }
  const gid = giftIdFromLiveEvent(data);
  const fromCat =
    gid && catalogMap && catalogMap[gid] && typeof catalogMap[gid].diamond === 'number'
      ? catalogMap[gid].diamond
      : 0;
  if (fromCat > 0) return fromCat;
  return 0;
}

function mergeGiftEnvelope(inner) {
  if (!inner || typeof inner !== 'object') return inner;
  const avatar = extractViewerProfileUrl(inner);
  const u = inner.user;
  if (!u || typeof u !== 'object') {
    return {
      ...inner,
      uniqueId: inner.uniqueId || inner.userId || inner.unique_id || '',
      nickname: inner.nickname || inner.userId || '',
      profilePictureUrl: avatar,
      profileUrl: avatar,
    };
  }
  return {
    ...inner,
    uniqueId: inner.uniqueId || u.uniqueId || u.unique_id || inner.userId,
    nickname: inner.nickname || u.nickname || u.nickName,
    profilePictureUrl: avatar,
    profileUrl: avatar,
  };
}

function dicebear(seed) {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(String(seed || 'x'))}`;
}

/**
 * @param {object} inner TikFinity `data` gövdesi
 * @param {{ config: object, columnGiftsNorm: string[][], catalogGifts: array }} snapshot
 * @returns {object|null} game:gift şekli
 */
export function buildGiftPayloadFromTikfinity(inner, snapshot) {
  const data = mergeGiftEnvelope(inner);
  const giftType = Number(data.giftType ?? data.gift_type ?? data.gift?.gift_type);
  if (giftType === 1 && data.repeatEnd === false) {
    return null;
  }

  const cfg = snapshot.config;
  if (!cfg?.columns) return null;

  const effCols = applyGiftOverridesToColumns(cfg.columns, snapshot.columnGiftsNorm);
  const lastCatalog = catalogMapFromClientList(snapshot.catalogGifts);

  const col = resolveColumnForGift(data, effCols, !!cfg.demoRouteUnmatchedGifts, lastCatalog);
  if (col < 0) return null;

  const diamondRaw = getDiamondCost(data, lastCatalog);
  const diamondPerUnit = diamondRaw > 0 ? diamondRaw : 1;
  const gid = giftIdFromLiveEvent(data) || '';
  const delta = computeGiftRepeatDelta(data, gid);
  const plan = giftVisualPlan(diamondPerUnit, delta, cfg);
  if (!plan) return null;

  const profileUrl = extractViewerProfileUrl(data) || dicebear(data.uniqueId || data.userId || 'oyuncu');
  const giftImageUrl = giftThumbFromLiveTikfinity(data) || null;
  const giftNameFinal =
    getGiftName(data) ||
    liveGiftSearchHaystack(data).replace(/\s+/g, ' ').trim() ||
    '';

  return {
    columnIndex: col,
    size: plan.size,
    avatarCount: plan.count,
    profileUrl,
    nickname: data.nickname || data.uniqueId || 'Oyuncu',
    pointsDelta: plan.points,
    giftId: gid,
    giftName: giftNameFinal,
    giftImageUrl,
    _catalogEntry: (() => {
      const gid = giftIdFromLiveEvent(data);
      if (!gid) return undefined;
      return {
        id: gid,
        name: giftNameFinal || gid,
        diamond: diamondPerUnit,
        image: giftImageUrl,
      };
    })(),
  };
}

function normalizeEventName(raw) {
  if (!raw || typeof raw !== 'object') return { ev: '', data: null };
  const ev = String(raw.event ?? raw.type ?? raw.eventType ?? raw.name ?? '').toLowerCase();
  let data = raw.data && typeof raw.data === 'object' ? raw.data : raw;
  if (typeof raw.type === 'string' && !raw.event) {
    data = { ...raw, ...(raw.data && typeof raw.data === 'object' ? raw.data : {}) };
  }
  return { ev, data };
}

function dispatchTikfinityMessage(raw, snapshot, onGameGift) {
  const { ev, data } = normalizeEventName(raw);
  if (!data || typeof data !== 'object') return;

  if (ev === 'gift' || ev === 'gift_received' || ev === 'webcast_gift') {
    const pl = buildGiftPayloadFromTikfinity(data, snapshot);
    if (pl) onGameGift(pl);
    return;
  }

  /* Beğeni / takip vb. — profil yağmurunu önlemek için yalnızca hediye */
}

/**
 * @param {() => { config: object, columnGiftsNorm: string[][], catalogGifts: array }} getSnapshot
 * @param {(payload: object) => void} onGameGift
 * @returns {() => void} cleanup
 */
export function attachTikfinityBridge(getSnapshot, onGameGift) {
  if (isTikfinityAutoConnectDisabled()) return () => {};

  if (typeof window !== 'undefined' && window.GemTokLiveGameBridge && window.GemTokTikTokLive) {
    const hub = window.__GEMTOK_GIFT_HUB_URL__ || 'http://127.0.0.1:8787';
    if (window.GemTokLiveGameBridge.ensure({ hubBase: hub, showHud: false })) {
      let stopped = false;
      const queue = [];
      let rafId = 0;
      const MAX_PER_FRAME = 4;

      const flush = () => {
        rafId = 0;
        const n = Math.min(MAX_PER_FRAME, queue.length);
        for (let i = 0; i < n; i++) {
          const msg = queue.shift();
          try {
            dispatchTikfinityMessage(msg, getSnapshot(), onGameGift);
          } catch (_) {
            /* sessiz */
          }
        }
        if (queue.length > 0 && !stopped) {
          rafId = requestAnimationFrame(flush);
        }
      };

      const scheduleFlush = () => {
        if (stopped || rafId) return;
        rafId = requestAnimationFrame(flush);
      };

      const unsub = window.GemTokLiveGameBridge.onPayload((raw) => {
        if (stopped) return;
        queue.push(raw);
        scheduleFlush();
      });

      return () => {
        stopped = true;
        unsub();
        if (rafId) cancelAnimationFrame(rafId);
        queue.length = 0;
      };
    }
  }

  if (typeof WebSocket === 'undefined') return () => {};
  let reconnectTimer = null;
  let stopped = false;
  const queue = [];
  let rafId = 0;
  const MAX_PER_FRAME = 4;

  const flush = () => {
    rafId = 0;
    const n = Math.min(MAX_PER_FRAME, queue.length);
    for (let i = 0; i < n; i++) {
      const msg = queue.shift();
      try {
        dispatchTikfinityMessage(msg, getSnapshot(), onGameGift);
      } catch (_) {
        /* sessiz */
      }
    }
    if (queue.length > 0 && !stopped) {
      rafId = requestAnimationFrame(flush);
    }
  };

  const scheduleFlush = () => {
    if (stopped || rafId) return;
    rafId = requestAnimationFrame(flush);
  };

  const scheduleReconnect = () => {
    if (stopped) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = window.setTimeout(connect, 3600);
  };

  function connect() {
    if (stopped || isTikfinityAutoConnectDisabled()) return;
    const url = getTikfinityWsUrl();
    try {
      ws = new WebSocket(url);
    } catch (_) {
      scheduleReconnect();
      return;
    }

    ws.onmessage = (e) => {
      let j;
      try {
        j = JSON.parse(e.data);
      } catch {
        return;
      }
      queue.push(j);
      scheduleFlush();
    };

    ws.onclose = () => {
      ws = null;
      if (!stopped) scheduleReconnect();
    };

    ws.onerror = () => {
      try {
        ws?.close();
      } catch (_) {}
    };
  }

  connect();

  return () => {
    stopped = true;
    clearTimeout(reconnectTimer);
    if (rafId) cancelAnimationFrame(rafId);
    queue.length = 0;
    try {
      ws?.close();
    } catch (_) {}
    ws = null;
  };
}
