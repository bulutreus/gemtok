(function (global) {
  'use strict';

  const DEFAULT_WS_URL = 'ws://127.0.0.1:21213';
  const STORAGE_KEY = 'tikfinity_url';
  const STORAGE_KEYS = ['tikfinity_url', 'tikfinity_ws_url', 'streamxt_tikfinity_ws_url', 'gemtok_tikfinity_ws_url'];
  const RECONNECT_MS = 3000;
  const MAX_QUEUE = 2000;

  function getQueryParam(name) {
    return new URLSearchParams(global.location.search).get(name);
  }

  function isAutoConnectDisabled() {
    const auto = String(getQueryParam('autoconnect') ?? '').toLowerCase();
    const tik = String(getQueryParam('tikfinity') ?? '').toLowerCase();
    const tikAuto = String(getQueryParam('tikfinityAuto') ?? '').toLowerCase();
    const noConnect = String(getQueryParam('noConnect') ?? getQueryParam('notikfinity') ?? '').toLowerCase();
    return auto === '0' || auto === 'false' || tik === '0' || tik === 'false' || tikAuto === '0' || noConnect === '1' || noConnect === 'true';
  }

  function resolveWsUrl() {
    try {
      for (const key of STORAGE_KEYS) {
        const fromStorage = global.localStorage?.getItem(key);
        if (fromStorage && /^wss?:\/\//i.test(fromStorage.trim())) return fromStorage.trim();
      }
    } catch {}

    const fromEnv =
      global.__ENV__?.TIKFINITY_WS_URL ??
      global.TIKFINITY_WS_URL ??
      global.process?.env?.TIKFINITY_WS_URL;
    if (fromEnv) return fromEnv;

    try {
      const w = global.__TIKFINITY_WS_URL__;
      if (typeof w === 'string' && w.trim()) return w.trim();
    } catch {}

    return DEFAULT_WS_URL;
  }

  function parseMessage(raw) {
    if (typeof raw !== 'string') return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function normalizeEvent(msg) {
    if (!msg || typeof msg !== 'object') return null;

    const event = (msg.event ?? msg.type ?? msg.action ?? '').toLowerCase();
    const data = msg.data ?? msg.payload ?? msg;

    if (!event) return null;

    if (event === 'social') {
      const action = (data.action ?? data.type ?? '').toLowerCase();
      if (action === 'follow' || action === 'share' || action === 'favourite' || action === 'favorite') {
        return { event: action === 'favourite' || action === 'favorite' ? 'follow' : action, data };
      }
    }

    if (event.includes('gift')) {
      return { event: 'gift', data };
    }

    return { event, data };
  }

  function hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (h << 5) - h + str.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h);
  }

  function extractGiftFields(data) {
    const gift = data.gift ?? data.giftInfo ?? data.extendedGiftInfo ?? {};
    const giftName = (
      data.giftName
      ?? data.gift_name
      ?? gift.name
      ?? gift.giftName
      ?? data.name
      ?? ''
    );
    const giftId = data.giftId ?? data.gift_id ?? gift.id ?? gift.giftId ?? null;
    const unitCost = Number(
      data.diamondCount
      ?? data.diamond_count
      ?? data.coins
      ?? gift.diamond_count
      ?? gift.diamondCount
      ?? 1,
    ) || 1;
    const repeatCount = Math.max(1, Number(data.repeatCount ?? data.repeat_count ?? 1) || 1);
    const repeatEnd = data.repeatEnd ?? data.repeat_end;

    return { giftName, giftId, unitCost, repeatCount, repeatEnd };
  }

  function shouldProcessGift({ repeatCount, repeatEnd }) {
    if (repeatEnd === true || repeatEnd === 1 || repeatEnd === 'true') return true;
    if (repeatEnd === false || repeatEnd === 0 || repeatEnd === 'false') {
      return repeatCount <= 1;
    }
    return true;
  }

  class TikFinityClient {
    constructor(options = {}) {
      this.onAction = options.onAction ?? (() => {});
      this.onStatus = options.onStatus ?? (() => {});
      this.laneCount = options.laneCount ?? 20;
      this.countryNames = options.countryNames ?? [];
      this.teamAliases = options.teamAliases ?? this.countryNames.map((name) => [name]);

      this.ws = null;
      this.url = options.url ?? resolveWsUrl();
      this.autoConnect = options.autoConnect ?? !isAutoConnectDisabled();
      this.reconnectTimer = null;
      this.shouldReconnect = false;
      this.queue = [];
      this.rafId = null;
      this.connected = false;
    }

    setUrl(url) {
      this.url = url;
      try {
        global.localStorage?.setItem(STORAGE_KEY, url);
      } catch { /* ignore */ }
    }

    connect() {
      this.shouldReconnect = true;
      this._open();
    }

    disconnect() {
      this.shouldReconnect = false;
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      if (this.ws) {
        this.ws.onclose = null;
        this.ws.close();
        this.ws = null;
      }
      this._setStatus('disconnected');
    }

    _open() {
      if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
        return;
      }

      this._setStatus('connecting');

      try {
        this.ws = new WebSocket(this.url);
      } catch {
        this._scheduleReconnect();
        return;
      }

      this.ws.onopen = () => {
        this.connected = true;
        this._setStatus('connected');
      };

      this.ws.onmessage = (ev) => {
        this._enqueue(ev.data);
      };

      this.ws.onerror = () => {
        this.connected = false;
        this._setStatus('error');
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.ws = null;
        this._setStatus('disconnected');
        if (this.shouldReconnect) this._scheduleReconnect();
      };
    }

    _scheduleReconnect() {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => {
        if (this.shouldReconnect) this._open();
      }, RECONNECT_MS);
    }

    _setStatus(status) {
      this.onStatus(status, this.url);
    }

    _enqueue(raw) {
      if (this.queue.length >= MAX_QUEUE) this.queue.shift();
      this.queue.push(raw);
      this._scheduleProcess();
    }

    _scheduleProcess() {
      if (this.rafId !== null) return;
      this.rafId = global.requestAnimationFrame(() => this._processQueue());
    }

    _processQueue() {
      this.rafId = null;
      const batch = Math.min(8, this.queue.length);

      for (let i = 0; i < batch; i++) {
        const raw = this.queue.shift();
        const parsed = parseMessage(raw);
        if (!parsed) continue;
        const normalized = normalizeEvent(parsed);
        if (!normalized) continue;
        const action = this._toAction(normalized.event, normalized.data);
        if (action) this.onAction(action);
      }

      if (this.queue.length > 0) this._scheduleProcess();
    }

    _laneFromUser(data) {
      const user = data.user ?? data;
      const uniqueId = user?.uniqueId ?? user?.username ?? user?.nickname ?? '';
      if (!uniqueId) return hashString(JSON.stringify(data)) % this.laneCount;

      const fromComment = this._laneFromComment(data.comment ?? data.message ?? '');
      if (fromComment !== null) return fromComment;

      return hashString(uniqueId) % this.laneCount;
    }

    _laneFromComment(text) {
      if (!text || !this.teamAliases.length) return null;
      const lower = text.toLowerCase().trim();
      for (let i = 0; i < this.teamAliases.length; i++) {
        const aliases = this.teamAliases[i];
        if (!Array.isArray(aliases)) continue;
        for (const alias of aliases) {
          const token = String(alias).toLowerCase();
          if (token.length >= 3 && lower.includes(token)) return i;
        }
      }
      return null;
    }

    _toAction(event, data) {
      const lane = this._laneFromUser(data);
      const user = data.user ?? {};
      const meta = {
        user: user.uniqueId ?? user.nickname ?? '',
        nickname: user.nickname ?? user.uniqueId ?? '',
      };

      switch (event) {
        case 'gift': {
          const giftFields = extractGiftFields(data);
          if (!shouldProcessGift(giftFields)) return null;

          const diamonds = giftFields.unitCost * giftFields.repeatCount;
          return {
            type: 'gift',
            lane,
            meta: {
              ...meta,
              giftName: giftFields.giftName,
              giftId: giftFields.giftId,
              diamonds,
              repeatCount: giftFields.repeatCount,
              repeatEnd: giftFields.repeatEnd,
            },
          };
        }
        case 'like':
          return {
            type: 'like',
            lane,
            meta: { ...meta, likeCount: data.likeCount ?? 1 },
          };
        case 'follow':
          return { type: 'follow', lane, meta };
        case 'member':
          return { type: 'member', lane, meta };
        case 'subscribe':
          return { type: 'subscribe', lane, meta };
        case 'share':
          return { type: 'share', lane, meta };
        case 'chat':
        case 'comment': {
          const comment = data.comment ?? data.message ?? '';
          const commentLane = this._laneFromComment(comment);
          if (commentLane !== null) {
            return {
              type: 'chat',
              lane: commentLane,
              meta: { ...meta, comment, matchedCountry: true },
            };
          }
          return null;
        }
        default:
          return null;
      }
    }
  }

  global.TikFinity = {
    Client: TikFinityClient,
    resolveWsUrl,
    isAutoConnectDisabled,
    setUrl(url) {
      try {
        global.localStorage?.setItem(STORAGE_KEY, url);
      } catch { /* ignore */ }
    },
    DEFAULT_WS_URL,
    STORAGE_KEY,
    STORAGE_KEYS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
