/**
 * GemTok — TikFinity masaüstü yerel WebSocket istemcisi (tarayıcı).
 * Sıra: localStorage **tikfinity_url** → (streamxt_tikfinity_ws_url, gemtok_tikfinity_ws_url) →
 * process.env.TIKFINITY_WS_URL / VITE_TIKFINITY_WS_URL (derleme enjekte) →
 * window.__TIKFINITY_WS_URL__ → <meta name="tikfinity-ws-url" content="..."> →
 * sunucunun önerdiği URL (createClient cachedServerUrl / getServerSuggestedWsUrl) →
 * ws://127.0.0.1:21213
 *
 * Otomatik bağlantı: ?autoconnect=false | ?tikfinity=0 | ?tikfinityAuto=0 | ?notikfinity=1 ile kapatılır.
 */
(function (global) {
  "use strict";

  var LS_KEYS = ["streamxt_tikfinity_ws_url", "gemtok_tikfinity_ws_url"];
  var DEFAULT_WS = "ws://127.0.0.1:21213";
  var BRIDGE_WS = "ws://127.0.0.1:29213";
  var GIFT_HUB_TIKFINITY_WS = "ws://127.0.0.1:8787/tikfinity";

  function isHostedPublicSite() {
    try {
      if (!global.location || global.location.protocol === "file:") return false;
      var h = String(global.location.hostname || "")
        .toLowerCase()
        .replace(/^\[|\]$/g, "");
      if (h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "0:0:0:0:0:0:0:1") return false;
      return global.location.protocol === "http:" || global.location.protocol === "https:";
    } catch (e0) {
      return false;
    }
  }

  function preflightHostedLocalBridge() {
    if (!isHostedPublicSite()) return Promise.resolve(true);
    var checks = ["http://127.0.0.1:29213/health", "http://127.0.0.1:8787/health"];
    var i = 0;
    function next() {
      if (i >= checks.length) return Promise.resolve(false);
      var url = checks[i++];
      return fetch(url, { mode: "cors", cache: "no-store", credentials: "omit" })
        .then(function (r) {
          if (r.ok) return true;
          return next();
        })
        .catch(function () {
          return next();
        });
    }
    return next();
  }

  /** HTTPS sitede yerel ağ izni + köprü testi (Chrome/Edge izin penceresini tetikler). */
  function requestHostedBridgeAccess() {
    return preflightHostedLocalBridge().then(function (ok) {
      try {
        global.dispatchEvent(
          new CustomEvent("gemtok-tikfinity-bridge-preflight", { detail: { ok: !!ok } })
        );
      } catch (eEv) {}
      return !!ok;
    });
  }

  function installHostedBridgeDefaults() {
    if (!isHostedPublicSite()) return;
    try {
      global.__GEMTOK_HOSTED_BRIDGE_FALLBACK__ = global.__GEMTOK_HOSTED_BRIDGE_FALLBACK__ || BRIDGE_WS;
    } catch (e0) {}
  }

  function pushUniqueUrl(list, url) {
    var u = String(url || "").trim().slice(0, 512);
    if (!u || !/^wss?:\/\//i.test(u)) return;
    for (var i = 0; i < list.length; i++) {
      if (list[i] === u) return;
    }
    list.push(u);
  }

  function isLocalDirectTikfinityUrl(url) {
    var u = String(url || "")
      .trim()
      .toLowerCase()
      .replace(/\/+$/, "");
    if (!u) return false;
    if (u.indexOf("127.0.0.1:21213") >= 0) return true;
    if (u.indexOf("localhost:21213") >= 0) return true;
    if (u.indexOf("[::1]:21213") >= 0) return true;
    return u === "ws://127.0.0.1:21213" || u === "ws://localhost:21213" || u === DEFAULT_WS.toLowerCase();
  }

  function pushCandidate(list, url) {
    var u = String(url || "").trim().slice(0, 512);
    if (!u || !/^wss?:\/\//i.test(u)) return;
    pushUniqueUrl(list, u);
  }

  function getEnvTikfinityWsUrl() {
    try {
      var proc = global.process;
      if (proc && proc.env) {
        return String(proc.env.TIKFINITY_WS_URL || proc.env.VITE_TIKFINITY_WS_URL || "").trim().slice(0, 512);
      }
    } catch (eEnv) {}
    try {
      var viteEnv = global.import && global.import.meta && global.import.meta.env;
      if (viteEnv) return String(viteEnv.VITE_TIKFINITY_WS_URL || "").trim().slice(0, 512);
    } catch (eVite) {}
    return "";
  }

  function getTikfinityWsUrlCandidates(serverSuggestedUrl) {
    var urls = [];
    var i;
    var hosted = isHostedPublicSite();
    try {
      if (global.localStorage) {
        var _tikUrl = global.localStorage.getItem("tikfinity_url");
        if (_tikUrl && String(_tikUrl).trim()) pushCandidate(urls, String(_tikUrl).trim());
      }
    } catch (eT0) {}
    try {
      for (i = 0; i < LS_KEYS.length; i++) {
        var ls = global.localStorage && global.localStorage.getItem(LS_KEYS[i]);
        if (ls && String(ls).trim()) pushCandidate(urls, String(ls).trim());
      }
    } catch (e0) {}
    pushCandidate(urls, getEnvTikfinityWsUrl());
    try {
      var w = global.__TIKFINITY_WS_URL__;
      if (typeof w === "string" && w.trim()) pushCandidate(urls, w.trim());
    } catch (e1) {}
    try {
      if (typeof document !== "undefined" && document.querySelector) {
        var m = document.querySelector('meta[name="tikfinity-ws-url"][content]');
        if (m) {
          var c = m.getAttribute("content");
          if (c && String(c).trim()) pushCandidate(urls, String(c).trim());
        }
      }
    } catch (e2) {}
    pushCandidate(urls, serverSuggestedUrl);
    pushUniqueUrl(urls, DEFAULT_WS);
    if (hosted) {
      pushUniqueUrl(urls, BRIDGE_WS);
      pushUniqueUrl(urls, GIFT_HUB_TIKFINITY_WS);
    }
    return urls.length ? urls : [DEFAULT_WS];
  }

  function isTikfinityAutoDisabled() {
    try {
      var q = new URLSearchParams(String(global.location && global.location.search ? global.location.search : ""));
      if (q.get("tikfinity") === "0" || String(q.get("tikfinity")).toLowerCase() === "false") return true;
      if (q.get("autoconnect") === "0" || String(q.get("autoconnect")).toLowerCase() === "false") return true;
      if (q.get("tikfinityAuto") === "0") return true;
      if (q.get("notikfinity") === "1") return true;
      return false;
    } catch (e) {
      return false;
    }
  }

  function getResolvedTikfinityWsUrl(serverSuggestedUrl) {
    var i;
    var u;
    try {
      if (global.localStorage) {
        var _tikUrl = global.localStorage.getItem("tikfinity_url");
        if (_tikUrl && String(_tikUrl).trim()) {
          u = String(_tikUrl).trim().slice(0, 512);
          return u;
        }
      }
    } catch (eTikUrl) {}
    try {
      if (global.localStorage) {
        var _gTok = global.localStorage.getItem("gemtok_tikfinity_ws_url");
        if (!_gTok || !String(_gTok).trim()) {
          var _oldTik = global.localStorage.getItem("hottok_tikfinity_ws_url");
          if (_oldTik && String(_oldTik).trim()) {
            try {
              global.localStorage.setItem("gemtok_tikfinity_ws_url", String(_oldTik).trim().slice(0, 512));
              global.localStorage.removeItem("hottok_tikfinity_ws_url");
            } catch (eM0) {}
          }
        }
      }
    } catch (eMig) {}
    try {
      for (i = 0; i < LS_KEYS.length; i++) {
        var ls = global.localStorage && global.localStorage.getItem(LS_KEYS[i]);
        if (ls && String(ls).trim()) {
          u = String(ls).trim().slice(0, 512);
          return u;
        }
      }
    } catch (e0) {}
    var envUrl = getEnvTikfinityWsUrl();
    if (envUrl) return envUrl;
    try {
      var w = global.__TIKFINITY_WS_URL__;
      if (typeof w === "string" && w.trim()) return w.trim().slice(0, 512);
    } catch (e1) {}
    try {
      if (typeof document !== "undefined" && document.querySelector) {
        var m = document.querySelector('meta[name="tikfinity-ws-url"][content]');
        if (m) {
          var c = m.getAttribute("content");
          if (c && String(c).trim()) return String(c).trim().slice(0, 512);
        }
      }
    } catch (e2) {}
    var srv = String(serverSuggestedUrl || "").trim();
    if (srv) return srv.slice(0, 512);
    return DEFAULT_WS;
  }

  function jsonSafeUserForClient(u) {
    if (!u || typeof u !== "object") return undefined;
    try {
      var seen = new WeakSet();
      var str = JSON.stringify(u, function (_k, value) {
        if (typeof value === "bigint") return value.toString();
        if (typeof value === "function" || typeof value === "symbol") return undefined;
        if (value instanceof Uint8Array) return undefined;
        if (value && typeof value === "object") {
          if (seen.has(value)) return undefined;
          seen.add(value);
        }
        return value;
      });
      return JSON.parse(str);
    } catch (e) {
      return undefined;
    }
  }

  function extractHttpUrl(v) {
    if (typeof v === "string") {
      var t = v.trim();
      if (t.indexOf("http://") === 0 || t.indexOf("https://") === 0) return t;
      return "";
    }
    if (!v || typeof v !== "object") return "";
    if (typeof v.url === "string") {
      var u = v.url.trim();
      if (u.indexOf("http") === 0) return u;
    }
    var list = v.url_list || v.urlList;
    if (Array.isArray(list)) {
      for (var li = 0; li < list.length; li++) {
        var inner = extractHttpUrl(list[li]);
        if (inner) return inner;
      }
    }
    if (Array.isArray(v.url)) {
      for (var ui = 0; ui < v.url.length; ui++) {
        var inner2 = extractHttpUrl(v.url[ui]);
        if (inner2) return inner2;
      }
    }
    return "";
  }

  function pickProfileFromPayload(u, d) {
    u = u && typeof u === "object" ? u : {};
    d = d && typeof d === "object" ? d : {};
    var candidates = [
      d.avatarUrl,
      d.profilePictureUrl,
      d.profileUrl,
      d.profile_picture_url,
      d.profilePicture,
      u.profilePictureUrl,
      u.avatarUrl,
      u.profile_url,
      u.profilePicture,
      u.avatarThumb,
      u.avatar_thumb,
      u.profilePictureLarge,
      u.profilePictureMedium,
    ];
    for (var ci = 0; ci < candidates.length; ci++) {
      var got = extractHttpUrl(candidates[ci]);
      if (got) return got;
    }
    return "";
  }

  function buildTikfinityUserBase(user, data) {
    var u = user && typeof user === "object" ? user : {};
    var d = data && typeof data === "object" ? data : {};
    var userId = String(u.uniqueId || u.userId || u.id || d.uniqueId || d.userId || "")
      .trim()
      .replace(/^@/, "");
    var nickname = String(u.nickname || d.nickname || u.uniqueId || userId || "?").slice(0, 32);
    var avatarUrl = pickProfileFromPayload(u, d);
    var userOut = jsonSafeUserForClient(u);
    return { userId: userId, nickname: nickname, avatarUrl: avatarUrl, user: userOut };
  }

  function parseChatDigitLane15(raw) {
    var t = String(raw || "").trim();
    if (!t) return null;
    var fw = { "\uFF11": "1", "\uFF12": "2", "\uFF13": "3", "\uFF14": "4", "\uFF15": "5" };
    var k;
    for (k in fw) {
      if (Object.prototype.hasOwnProperty.call(fw, k) && t.indexOf(k) !== -1) t = t.split(k).join(fw[k]);
    }
    if (/^[1-5]$/.test(t)) return parseInt(t, 10) - 1;
    return null;
  }

  /**
   * TikFinity / benzeri JSON → oyunların kullandığı düz payload dizisi.
   * @param {*} raw
   * @param {{ emitLanePickForChatDigits?: boolean }} options
   */
  function streamxtPayloadsFromTikfinityJson(raw, options) {
    var out = [];
    var emitLanePick = !!(options && options.emitLanePickForChatDigits);
    var list = Array.isArray(raw) ? raw : [raw];
    var ri;
    for (ri = 0; ri < list.length; ri++) {
      var root = list[ri];
      if (!root || typeof root !== "object") continue;
      var ev = String(root.event != null ? root.event : root.type != null ? root.type : root.name != null ? root.name : "").toLowerCase();
      var data = root.data != null && typeof root.data === "object" ? root.data : root;
      if (!ev && (data.giftName != null || data.giftId != null || data.giftKey != null || data.diamondCount != null))
        ev = "gift";

      if (ev === "chat") {
        var comment = String(data.comment != null ? data.comment : data.text != null ? data.text : "").trim();
        if (emitLanePick) {
          var laneIdx = parseChatDigitLane15(comment);
          if (laneIdx != null) {
            var lp = buildTikfinityUserBase(data.user, data);
            if (lp.userId) {
              out.push({
                type: "lane_pick",
                lane: laneIdx,
                userId: lp.userId,
                nickname: lp.nickname,
                avatarUrl: lp.avatarUrl,
                ...(lp.user ? { user: lp.user } : {}),
              });
              continue;
            }
          }
        }
        if (comment === "1" || comment === "2") {
          var team = comment === "1" ? 0 : 1;
          var jp = buildTikfinityUserBase(data.user, data);
          if (!jp.userId || jp.userId === "anon") continue;
          if (jp.user) out.push({ type: "join_pick", team: team, userId: jp.userId, nickname: jp.nickname, avatarUrl: jp.avatarUrl, user: jp.user });
          else out.push({ type: "join_pick", team: team, userId: jp.userId, nickname: jp.nickname, avatarUrl: jp.avatarUrl });
          continue;
        }
        continue;
      }

      if (ev === "gift") {
        var gUser = buildTikfinityUserBase(data.user, data);
        if (!gUser.userId) continue;
        var giftNameRaw = data.giftName != null ? data.giftName : data.name != null ? data.name : "";
        var gid = String(
          data.giftKey != null ? data.giftKey : data.giftId != null ? data.giftId : data.gift_id != null ? data.gift_id : "",
        ).trim();
        var giftSlug = String(giftNameRaw || gid || "gift")
          .toLowerCase()
          .replace(/\s+/g, "_");
        var giftImageUrl = String(
          data.giftImageUrl != null
            ? data.giftImageUrl
            : data.giftImage != null
              ? data.giftImage
              : data.imageUrl != null
                ? data.imageUrl
                : "",
        ).trim();
        var rawCombo = Math.max(
          Number(data.repeatCount) || 0,
          Number(data.comboCount) || 0,
          Number(data.groupCount) || 0,
          Number(data.combo) || 0,
          1,
        );
        var giftCombo = Math.min(120, Math.max(1, Math.round(rawCombo) || 1));
        out.push({
          type: "gift",
          userId: gUser.userId,
          nickname: gUser.nickname,
          giftId: giftSlug,
          giftKey: gid,
          giftName: String(giftNameRaw || "").slice(0, 200),
          giftImageUrl: giftImageUrl.slice(0, 2000),
          diamondCount: data.diamondCount != null ? data.diamondCount : data.diamond_count,
          giftCombo: giftCombo,
          repeatCount: giftCombo,
          avatarUrl: gUser.avatarUrl,
          team: "auto",
          ...(gUser.user ? { user: gUser.user } : {}),
        });
        continue;
      }

      if (ev === "like") {
        var lk = buildTikfinityUserBase(data.user, data);
        if (!lk.userId) continue;
        var lc = Math.min(20, Math.max(1, Math.round(Number(data.likeCount) || 1)));
        out.push({
          type: "like",
          userId: lk.userId,
          nickname: lk.nickname,
          avatarUrl: lk.avatarUrl,
          likeCount: lc,
          team: "auto",
          ...(lk.user ? { user: lk.user } : {}),
        });
        continue;
      }

      if (ev === "follow" || ev === "subscribe") {
        var fo = buildTikfinityUserBase(data.user, data);
        if (!fo.userId) continue;
        out.push({
          type: ev === "subscribe" ? "subscribe" : "follow",
          userId: fo.userId,
          nickname: fo.nickname,
          avatarUrl: fo.avatarUrl,
          team: "auto",
          ...(fo.user ? { user: fo.user } : {}),
        });
        continue;
      }

      if (ev === "share" || ev === "shared") {
        var sh = buildTikfinityUserBase(data.user, data);
        if (!sh.userId) continue;
        out.push({ type: "share", userId: sh.userId, nickname: sh.nickname, avatarUrl: sh.avatarUrl, team: "auto", ...(sh.user ? { user: sh.user } : {}) });
        continue;
      }

      if (ev === "social") {
        var act = String(data.action != null ? data.action : data.shareType != null ? data.shareType : "").toLowerCase();
        var so = buildTikfinityUserBase(data.user, data);
        if (!so.userId) continue;
        if (act === "follow" || act === "follow_back") {
          out.push({ type: "follow", userId: so.userId, nickname: so.nickname, avatarUrl: so.avatarUrl, team: "auto", ...(so.user ? { user: so.user } : {}) });
          continue;
        }
        if (act === "share") {
          out.push({ type: "share", userId: so.userId, nickname: so.nickname, avatarUrl: so.avatarUrl, team: "auto", ...(so.user ? { user: so.user } : {}) });
        }
        continue;
      }

      if (ev === "member") {
        var mb = buildTikfinityUserBase(data.user, data);
        if (!mb.userId) continue;
        out.push({ type: "member", userId: mb.userId, nickname: mb.nickname, avatarUrl: mb.avatarUrl, team: "auto", ...(mb.user ? { user: mb.user } : {}) });
      }
    }
    return out;
  }

  /**
   * @param {{
   *   emitLanePickForChatDigits?: boolean,
   *   eventsPerFrame?: number,
   *   getServerSuggestedWsUrl?: () => (string|Promise<string>),
   *   onPayloads?: (payloads: object[]) => void,
   *   onStatus?: (s: { phase: string, url?: string, message?: string }) => void,
   * }} options
   */
  function createClient(options) {
    if (!options) options = {};
    var socket = null;
    var gen = 0;
    var reconnectTimer = null;
    var reconnectAttempt = 0;
    var userClosed = false;
    var queue = [];
    var flushRaf = null;
    var eventsPerFrame = Math.max(4, Math.min(120, Number(options.eventsPerFrame) || 32));
    var cachedServerUrl = "";
    var urlCandidates = [];
    var urlCandidateIndex = 0;

    function clearReconnect() {
      if (reconnectTimer != null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    }

    function scheduleReconnect() {
      clearReconnect();
      if (userClosed) return;
      var delay = Math.min(30000, 1000 * Math.pow(2, reconnectAttempt));
      reconnectAttempt += 1;
      if (delay < 1000) delay = 1000;
      delay += Math.floor(Math.random() * 400);
      reconnectTimer = setTimeout(function () {
        reconnectTimer = null;
        connect();
      }, delay);
    }

    function flushQueue() {
      flushRaf = null;
      var onPayloads = options.onPayloads;
      var n = 0;
      var batch = [];
      while (queue.length > 0 && n < eventsPerFrame) {
        var item = queue.shift();
        n += 1;
        var payloads;
        try {
          payloads = streamxtPayloadsFromTikfinityJson(item, {
            emitLanePickForChatDigits: !!options.emitLanePickForChatDigits,
          });
        } catch (e) {
          if (typeof console !== "undefined" && console.warn) console.warn("[GemTokTikFinity] parse", e);
          payloads = [];
        }
        var pi;
        for (pi = 0; pi < payloads.length; pi++) batch.push(payloads[pi]);
      }
      if (batch.length && typeof onPayloads === "function") {
        try {
          onPayloads(batch);
        } catch (e2) {
          if (typeof console !== "undefined" && console.warn) console.warn("[GemTokTikFinity] onPayloads", e2);
        }
      }
      if (queue.length > 0) flushRaf = global.requestAnimationFrame(flushQueue);
    }

    function enqueueRaw(parsed) {
      queue.push(parsed);
      if (flushRaf == null) flushRaf = global.requestAnimationFrame(flushQueue);
    }

    function connect() {
      if (userClosed) return;
      urlCandidates = getTikfinityWsUrlCandidates(cachedServerUrl);
      urlCandidateIndex = 0;
      tryConnectCandidate();
    }

    function tryConnectCandidate() {
      if (userClosed) return;
      if (!urlCandidates.length) urlCandidates = [DEFAULT_WS];
      if (urlCandidateIndex >= urlCandidates.length) {
        if (typeof options.onStatus === "function") {
          options.onStatus({
            phase: "local_network_blocked",
            message: isHostedPublicSite()
              ? "TikFinity köprüsü yok. GemTok-TikFinity-Kopru.bat dosyasını çalıştırın; Chrome/Edge yerel ağ izni verin."
              : "TikFinity bağlantısı kurulamadı.",
          });
        }
        scheduleReconnect();
        return;
      }
      var url = urlCandidates[urlCandidateIndex];
      urlCandidateIndex += 1;
      if (!/^wss?:\/\//i.test(url)) {
        tryConnectCandidate();
        return;
      }
      var myGen = ++gen;
      try {
        if (socket) socket.close();
      } catch (e0) {}
      socket = null;
      if (typeof options.onStatus === "function") options.onStatus({ phase: "connecting", url: url });
      var sock;
      try {
        sock = new global.WebSocket(url);
      } catch (e1) {
        tryConnectCandidate();
        return;
      }
      socket = sock;

      sock.onopen = function () {
        if (gen !== myGen) return;
        reconnectAttempt = 0;
        clearReconnect();
        if (typeof options.onStatus === "function") options.onStatus({ phase: "connected", url: url });
      };

      sock.onmessage = function (ev) {
        if (gen !== myGen) return;
        var parsed;
        try {
          parsed = JSON.parse(String(ev.data));
        } catch (e2) {
          return;
        }
        enqueueRaw(parsed);
      };

      sock.onclose = function () {
        if (gen !== myGen) return;
        socket = null;
        if (userClosed) return;
        if (urlCandidateIndex < urlCandidates.length) {
          tryConnectCandidate();
          return;
        }
        if (typeof options.onStatus === "function")
          options.onStatus({ phase: "reconnecting", url: getResolvedTikfinityWsUrl(cachedServerUrl) });
        scheduleReconnect();
      };

      sock.onerror = function () {};
    }

    return {
      setCachedServerUrl: function (u) {
        cachedServerUrl = String(u || "").trim();
      },
      startAuto: function () {
        return new Promise(function (resolve) {
          if (isTikfinityAutoDisabled()) {
            if (typeof options.onStatus === "function") options.onStatus({ phase: "disabled_by_url" });
            resolve();
            return;
          }
          var getter = options.getServerSuggestedWsUrl;
          var chain = Promise.resolve().then(function () {
            return preflightHostedLocalBridge();
          });
          if (typeof getter === "function") {
            chain = chain
              .then(function () {
                return getter();
              })
              .then(function (u) {
                cachedServerUrl = String(u || "").trim();
              })
              .catch(function () {});
          }
          chain.then(function () {
            userClosed = false;
            connect();
            resolve();
          });
        });
      },
      stop: function () {
        userClosed = true;
        clearReconnect();
        gen += 1;
        try {
          if (socket) socket.close();
        } catch (e3) {}
        socket = null;
      },
      reconnect: function () {
        userClosed = false;
        connect();
      },
    };
  }

  installHostedBridgeDefaults();

  global.GemTokTikFinity = {
    DEFAULT_WS: DEFAULT_WS,
    BRIDGE_WS: BRIDGE_WS,
    LS_KEYS: LS_KEYS,
    isHostedPublicSite: isHostedPublicSite,
    isLocalDirectTikfinityUrl: isLocalDirectTikfinityUrl,
    isTikfinityAutoDisabled: isTikfinityAutoDisabled,
    getResolvedTikfinityWsUrl: getResolvedTikfinityWsUrl,
    getTikfinityWsUrlCandidates: getTikfinityWsUrlCandidates,
    preflightHostedLocalBridge: preflightHostedLocalBridge,
    requestHostedBridgeAccess: requestHostedBridgeAccess,
    installHostedBridgeDefaults: installHostedBridgeDefaults,
    streamxtPayloadsFromTikfinityJson: streamxtPayloadsFromTikfinityJson,
    createClient: createClient,
  };
})(typeof window !== "undefined" ? window : globalThis);
