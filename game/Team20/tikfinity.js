(function (global) {
  'use strict';

  const DEFAULT_WS_URL = 'ws://127.0.0.1:21213';
  const FALLBACK_WS_URLS = [
    DEFAULT_WS_URL,
    'ws://localhost:21213',
    'ws://127.0.0.1:29213',
    'ws://localhost:29213',
  ];
  const STORAGE_KEY = 'tikfinity_url';
  const STORAGE_KEYS = ['tikfinity_url', 'tikfinity_ws_url', 'streamxt_tikfinity_ws_url', 'gemtok_tikfinity_ws_url'];
  const RECONNECT_MS = 3000;
  const MAX_QUEUE = 2000;
  const MAX_BATCH = 12;

  function getQueryParam(name) {
    try {
      return new URLSearchParams(global.location?.search ?? '').get(name);
    } catch {
      return null;
    }
  }

  function cleanWsUrl(value) {
    const url = String(value ?? '').trim();
    return /^wss?:\/\//i.test(url) ? url : '';
  }

  function pushUnique(list, value) {
    const url = cleanWsUrl(value);
    if (url && !list.includes(url)) list.push(url);
  }

  function isTruthy(value) {
    const v = String(value ?? '').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes' || v === 'on';
  }

  function isFalsey(value) {
    const v = String(value ?? '').trim().toLowerCase();
    return v === '0' || v === 'false' || v === 'no' || v === 'off';
  }

  function isAutoConnectDisabled() {
    const auto = getQueryParam('autoconnect');
    const tik = getQueryParam('tikfinity');
    const tikAuto = getQueryParam('tikfinityAuto');
    const noConnect = getQueryParam('noConnect') ?? getQueryParam('notikfinity');

    if (noConnect != null) return isTruthy(noConnect);
    if (auto != null) return isFalsey(auto);
    if (tik != null) return isFalsey(tik);
    if (tikAuto != null) return isFalsey(tikAuto);
    return false;
  }

  function resolveWsUrls() {
    const urls = [];

    pushUnique(urls, getQueryParam('ws'));
    pushUnique(urls, getQueryParam('tikfinityUrl'));
    pushUnique(urls, getQueryParam('tikfinity_ws_url'));

    try {
      for (const key of STORAGE_KEYS) {
        pushUnique(urls, global.localStorage?.getItem(key));
      }
    } catch { /* ignore */ }

    pushUnique(urls, global.__ENV__?.TIKFINITY_WS_URL);
    pushUnique(urls, global.TIKFINITY_WS_URL);
    pushUnique(urls, global.process?.env?.TIKFINITY_WS_URL);
    pushUnique(urls, global.__TIKFINITY_WS_URL__);

    FALLBACK_WS_URLS.forEach((url) => pushUnique(urls, url));
    return urls;
  }

  function resolveWsUrl() {
    return resolveWsUrls()[0] ?? DEFAULT_WS_URL;
  }

  function parseMessage(raw) {
    if (!raw) return null;
    if (typeof raw === 'object' && !(raw instanceof ArrayBuffer)) return raw;
    if (raw instanceof ArrayBuffer) {
      try {
        raw = new TextDecoder().decode(raw);
      } catch {
        return null;
      }
    }
    if (typeof raw !== 'string') return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function normalizeEventName(value) {
    return String(value ?? '').trim().toLowerCase().replace(/[\s:-]+/g, '_');
  }

  function normalizeEvent(msg) {
    if (!msg || typeof msg !== 'object') return null;

    const event = normalizeEventName(msg.event ?? msg.type ?? msg.action ?? msg.eventName ?? msg.name);
    const data = msg.data ?? msg.payload ?? msg.detail ?? msg;
    const dataEvent = normalizeEventName(data?.event ?? data?.type ?? data?.action);
    const combined = event || dataEvent;

    if (!combined) return null;

    if (combined === 'social') {
      const action = normalizeEventName(data.action ?? data.type);
      if (action === 'follow' || action === 'share' || action === 'favourite' || action === 'favorite') {
        return { event: action === 'favourite' || action === 'favorite' ? 'follow' : action, data };
      }
    }

    if (combined.includes('gift')) return { event: 'gift', data };
    if (combined.includes('like')) return { event: 'like', data };
    if (combined.includes('follow')) return { event: 'follow', data };
    if (combined.includes('share')) return { event: 'share', data };
    if (combined.includes('member') || combined.includes('join')) return { event: 'member', data };
    if (combined.includes('subscribe') || combined.includes('sub')) return { event: 'subscribe', data };
    if (combined.includes('chat') || combined.includes('comment')) return { event: 'chat', data };

    return { event: combined, data };
  }

  function hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (h << 5) - h + str.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h);
  }

  function firstValue(...values) {
    for (const value of values) {
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return '';
  }

  function asNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function extractUser(data) {
    return data.user ?? data.userInfo ?? data.member ?? data.viewer ?? data;
  }

  function extractGiftFields(data) {
    const gift = data.gift ?? data.giftInfo ?? data.extendedGiftInfo ?? data.giftDetails ?? {};
    const giftName = firstValue(
      data.giftName,
      data.gift_name,
      data.gift?.name,
      data.gift?.giftName,
      gift.name,
      gift.giftName,
      data.name,
    );
    const giftId = firstValue(
      data.giftId,
      data.gift_id,
      data.gift?.id,
      data.gift?.giftId,
      gift.id,
      gift.giftId,
      gift.gift_id,
    ) || null;
    const unitCost = Math.max(1, asNumber(firstValue(
      data.diamondCount,
      data.diamond_count,
      data.coins,
      data.giftValue,
      gift.diamond_count,
      gift.diamondCount,
      gift.coins,
    ), 1));
    const repeatCount = Math.max(1, asNumber(firstValue(data.repeatCount, data.repeat_count, data.comboCount, data.repeat_count_display), 1));
    const repeatEnd = firstValue(data.repeatEnd, data.repeat_end, data.isEnded, data.comboEnd);

    return { giftName, giftId, unitCost, repeatCount, repeatEnd };
  }

  function shouldProcessGift({ repeatCount, repeatEnd }) {
    if (repeatEnd === true || repeatEnd === 1 || repeatEnd === 'true') return true;
    if (repeatEnd === false || repeatEnd === 0 || repeatEnd === 'false') {
      return repeatCount <= 1;
    }
    return true;
  }

  function normalizeText(text) {
    return String(text ?? '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  class TikFinityClient {
    constructor(options = {}) {
      this.onAction = options.onAction ?? (() => {});
      this.onStatus = options.onStatus ?? (() => {});
      this.laneCount = Math.max(1, Number(options.laneCount ?? 20) || 20);
      this.countryNames = options.countryNames ?? [];
      this.teamAliases = options.teamAliases ?? this.countryNames.map((name) => [name]);

      this.ws = null;
      this.urls = Array.isArray(options.urls) && options.urls.length ? options.urls : resolveWsUrls();
      if (options.url) {
        const preferred = cleanWsUrl(options.url);
        if (preferred) this.urls = [preferred, ...this.urls.filter((url) => url !== preferred)];
      }
      if (!this.urls.length) this.urls = [DEFAULT_WS_URL];
      this.urlIndex = 0;
      this.url = this.urls[this.urlIndex];
      this.autoConnect = options.autoConnect ?? !isAutoConnectDisabled();
      this.reconnectTimer = null;
      this.shouldReconnect = false;
      this.queue = [];
      this.rafId = null;
      this.connected = false;
      this.lastError = '';
    }

    setUrl(url) {
      const clean = cleanWsUrl(url);
      if (!clean) {
        this.lastError = 'invalid_url';
        this._setStatus('error');
        return false;
      }
      this.urls = [clean, ...this.urls.filter((item) => item !== clean)];
      this.urlIndex = 0;
      this.url = clean;
      try {
        for (const key of STORAGE_KEYS) global.localStorage?.setItem(key, clean);
      } catch { /* ignore */ }
      return true;
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
      this.connected = false;
      this._setStatus('disconnected');
    }

    _open() {
      if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
        return;
      }
      if (typeof WebSocket === 'undefined') {
        this.lastError = 'websocket_unavailable';
        this._setStatus('error');
        this._scheduleReconnect(false);
        return;
      }

      this.url = this.urls[this.urlIndex] ?? DEFAULT_WS_URL;
      this._setStatus('connecting');

      try {
        this.ws = new WebSocket(this.url);
      } catch (err) {
        this.lastError = err?.message ?? 'open_failed';
        this.ws = null;
        this._scheduleReconnect(true);
        return;
      }

      this.ws.onopen = () => {
        this.connected = true;
        this.lastError = '';
        this._setStatus('connected');
      };

      this.ws.onmessage = (ev) => {
        this._enqueue(ev.data);
      };

      this.ws.onerror = () => {
        this.connected = false;
        this.lastError = 'socket_error';
        this._setStatus('error');
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.ws = null;
        this._setStatus('disconnected');
        if (this.shouldReconnect) this._scheduleReconnect(true);
      };
    }

    _scheduleReconnect(rotateUrl) {
      clearTimeout(this.reconnectTimer);
      if (rotateUrl && this.urls.length > 1) {
        this.urlIndex = (this.urlIndex + 1) % this.urls.length;
        this.url = this.urls[this.urlIndex];
      }
      this.reconnectTimer = setTimeout(() => {
        if (this.shouldReconnect) this._open();
      }, RECONNECT_MS);
    }

    _setStatus(status) {
      try {
        this.onStatus(status, this.url, this.lastError);
      } catch { /* keep the game alive */ }
    }

    _enqueue(raw) {
      if (this.queue.length >= MAX_QUEUE) this.queue.shift();
      this.queue.push(raw);
      this._scheduleProcess();
    }

    _scheduleProcess() {
      if (this.rafId !== null) return;
      const raf = global.requestAnimationFrame ?? ((cb) => global.setTimeout(cb, 16));
      this.rafId = raf(() => this._processQueue());
    }

    _processQueue() {
      this.rafId = null;
      const batch = Math.min(MAX_BATCH, this.queue.length);

      for (let i = 0; i < batch; i++) {
        const raw = this.queue.shift();
        const parsed = parseMessage(raw);
        if (!parsed) continue;
        const normalized = normalizeEvent(parsed);
        if (!normalized) continue;
        const action = this._toAction(normalized.event, normalized.data);
        if (!action) continue;
        try {
          this.onAction(action);
        } catch (err) {
          this.lastError = err?.message ?? 'action_failed';
          this._setStatus('action_error');
        }
      }

      if (this.queue.length > 0) this._scheduleProcess();
    }

    _laneFromUser(data) {
      const user = extractUser(data);
      const uniqueId = firstValue(user?.uniqueId, user?.unique_id, user?.username, user?.nickname, data.uniqueId, data.nickname);
      const fromComment = this._laneFromComment(firstValue(data.comment, data.message, data.content, data.text));
      if (fromComment !== null) return fromComment;
      if (!uniqueId) return hashString(JSON.stringify(data)) % this.laneCount;
      return hashString(String(uniqueId)) % this.laneCount;
    }

    _laneFromComment(text) {
      const lower = normalizeText(text);
      if (!lower || !this.teamAliases.length) return null;
      for (let i = 0; i < this.teamAliases.length; i++) {
        const aliases = this.teamAliases[i];
        if (!Array.isArray(aliases)) continue;
        for (const alias of aliases) {
          const token = normalizeText(alias);
          if (token.length >= 2 && (` ${lower} `).includes(` ${token} `)) return i;
          if (token.length >= 4 && lower.includes(token)) return i;
        }
      }
      return null;
    }

    _toAction(event, data) {
      const lane = this._laneFromUser(data);
      const user = extractUser(data);
      const meta = {
        user: firstValue(user?.uniqueId, user?.unique_id, user?.username, user?.nickname),
        nickname: firstValue(user?.nickname, user?.uniqueId, user?.username),
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
            meta: { ...meta, likeCount: Math.max(1, asNumber(firstValue(data.likeCount, data.like_count, data.count), 1)) },
          };
        case 'follow':
          return { type: 'follow', lane, meta };
        case 'member':
          return { type: 'member', lane, meta };
        case 'subscribe':
          return { type: 'subscribe', lane, meta };
        case 'share':
          return { type: 'share', lane, meta };
        case 'chat': {
          const comment = firstValue(data.comment, data.message, data.content, data.text);
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
    resolveWsUrls,
    isAutoConnectDisabled,
    setUrl(url) {
      const clean = cleanWsUrl(url);
      if (!clean) return false;
      try {
        for (const key of STORAGE_KEYS) global.localStorage?.setItem(key, clean);
      } catch { /* ignore */ }
      return true;
    },
    DEFAULT_WS_URL,
    FALLBACK_WS_URLS,
    STORAGE_KEY,
    STORAGE_KEYS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
