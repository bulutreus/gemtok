/**
 * TikFinity masaüstü yerel WebSocket istemcisi.
 * URL sırası: localStorage → window.__TIKFINITY_WS_URL__ → meta tag → varsayılan ws://127.0.0.1:21213
 * Otomatik bağlantı: ?tikfinity=0 | ?tikfinityAuto=0 | ?notikfinity=1 ile kapatılır.
 */
(function (global) {
  "use strict";

  var LS_KEYS = ["hava_yarisi_tikfinity_ws_url", "streamxt_tikfinity_ws_url", "hottok_tikfinity_ws_url"];
  var DEFAULT_WS = "ws://127.0.0.1:21213";

  function isTikfinityAutoDisabled() {
    try {
      var q = new URLSearchParams(String(global.location && global.location.search ? global.location.search : ""));
      if (q.get("tikfinity") === "0" || String(q.get("tikfinity")).toLowerCase() === "false") return true;
      if (q.get("tikfinityAuto") === "0") return true;
      if (q.get("notikfinity") === "1") return true;
      return false;
    } catch (e) {
      return false;
    }
  }

  function getResolvedTikfinityWsUrl(serverSuggestedUrl) {
    var i;
    try {
      for (i = 0; i < LS_KEYS.length; i++) {
        var ls = global.localStorage && global.localStorage.getItem(LS_KEYS[i]);
        if (ls && String(ls).trim()) return String(ls).trim().slice(0, 512);
      }
    } catch (e0) {}
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

  function buildTikfinityUserBase(user, data) {
    var u = user && typeof user === "object" ? user : {};
    var d = data && typeof data === "object" ? data : {};
    var userIds = [];
    var fields = [u.uniqueId, u.userId, u.id, u.secUid, d.uniqueId, d.userId, d.secUid, d.userIdStr];
    var fi;
    for (fi = 0; fi < fields.length; fi++) {
      var s = String(fields[fi] || "").trim().replace(/^@/, "");
      if (s && userIds.indexOf(s) === -1) userIds.push(s);
    }
    var userId = userIds[0] || "";
    var nickname = String(u.nickname || d.nickname || u.uniqueId || userId || "?").slice(0, 32);
    var avatarUrl = String(u.profilePictureUrl || d.profilePictureUrl || "").trim();
    var userOut = jsonSafeUserForClient(u);
    return { userId: userId, userIds: userIds, nickname: nickname, avatarUrl: avatarUrl, user: userOut };
  }

  function streamxtPayloadsFromTikfinityJson(raw) {
    var out = [];
    var list = Array.isArray(raw) ? raw : [raw];
    var ri;
    for (ri = 0; ri < list.length; ri++) {
      var root = list[ri];
      if (!root || typeof root !== "object") continue;
      var ev = String(root.event != null ? root.event : root.type != null ? root.type : root.name != null ? root.name : "").toLowerCase();
      var data = root.data != null && typeof root.data === "object" ? root.data : root;
      if (!ev && (data.giftName != null || data.giftId != null || data.diamondCount != null)) ev = "gift";

      if (ev === "chat") {
        var comment = String(data.comment != null ? data.comment : data.text != null ? data.text : "").trim();
        var fw = { "\uFF11": "1", "\uFF12": "2" };
        var ck;
        for (ck in fw) {
          if (Object.prototype.hasOwnProperty.call(fw, ck) && comment.indexOf(ck) !== -1) {
            comment = comment.split(ck).join(fw[ck]);
          }
        }
        comment = comment.replace(/\s+/g, "");
        if (comment === "1" || comment === "2") {
          var jp = buildTikfinityUserBase(data.user, data);
          if (!jp.userId) continue;
          out.push({
            type: "team_pick",
            pick: comment,
            team: comment === "2" ? 1 : 0,
            userId: jp.userId,
            userIds: jp.userIds,
            nickname: jp.nickname,
            avatarUrl: jp.avatarUrl,
          });
        }
        continue;
      }

      if (ev === "gift") {
        var giftType = data.giftType === 1 ? 1 : 0;
        var repeatEnd = data.repeatEnd === true;
        if (giftType === 1 && !repeatEnd) continue;

        var gUser = buildTikfinityUserBase(data.user, data);
        var giftNameRaw = data.giftName != null ? data.giftName : data.name != null ? data.name : "";
        var gid = String(data.giftId != null ? data.giftId : data.gift_id != null ? data.gift_id : "").trim();
        var giftSlug = String(giftNameRaw || gid || "gift").toLowerCase().replace(/\s+/g, "_");
        var rawCombo = Math.max(
          Number(data.repeatCount) || 0,
          Number(data.comboCount) || 0,
          Number(data.groupCount) || 0,
          Number(data.combo) || 0,
          1
        );
        var giftCombo = Math.min(120, Math.max(1, Math.round(rawCombo) || 1));
        out.push({
          type: "gift",
          userId: gUser.userId,
          userIds: gUser.userIds,
          nickname: gUser.nickname,
          giftId: gid,
          giftName: giftSlug,
          giftKey: gid,
          giftType: giftType,
          repeatEnd: repeatEnd,
          diamondCount: data.diamondCount != null ? data.diamondCount : data.diamond_count,
          giftCombo: giftCombo,
          repeatCount: giftCombo,
          avatarUrl: gUser.avatarUrl,
        });
        continue;
      }

      if (ev === "like") {
        var lk = buildTikfinityUserBase(data.user, data);
        if (!lk.userId) continue;
        var lc = Math.min(500, Math.max(1, Math.round(Number(data.likeCount) || 1)));
        out.push({ type: "like", userId: lk.userId, userIds: lk.userIds, nickname: lk.nickname, likeCount: lc, avatarUrl: lk.avatarUrl });
        continue;
      }

      if (ev === "follow" || ev === "subscribe") {
        var fo = buildTikfinityUserBase(data.user, data);
        if (!fo.userId) continue;
        out.push({ type: ev === "subscribe" ? "subscribe" : "follow", userId: fo.userId, userIds: fo.userIds, nickname: fo.nickname, avatarUrl: fo.avatarUrl });
        continue;
      }

      if (ev === "share" || ev === "shared") {
        var sh = buildTikfinityUserBase(data.user, data);
        if (!sh.userId) continue;
        out.push({ type: "share", userId: sh.userId, userIds: sh.userIds, nickname: sh.nickname, avatarUrl: sh.avatarUrl });
        continue;
      }

      if (ev === "social") {
        var act = String(data.action != null ? data.action : data.shareType != null ? data.shareType : "").toLowerCase();
        var so = buildTikfinityUserBase(data.user, data);
        if (!so.userId) continue;
        if (act === "follow" || act === "follow_back") {
          out.push({ type: "follow", userId: so.userId, userIds: so.userIds, nickname: so.nickname, avatarUrl: so.avatarUrl });
        } else if (act === "share") {
          out.push({ type: "share", userId: so.userId, userIds: so.userIds, nickname: so.nickname, avatarUrl: so.avatarUrl });
        }
        continue;
      }

      if (ev === "member") {
        var mb = buildTikfinityUserBase(data.user, data);
        if (!mb.userId) continue;
        out.push({ type: "member", userId: mb.userId, userIds: mb.userIds, nickname: mb.nickname, avatarUrl: mb.avatarUrl });
      }
    }
    return out;
  }

  function createClient(options) {
    if (!options) options = {};
    var socket = null;
    var gen = 0;
    var reconnectTimer = null;
    var userClosed = false;
    var queue = [];
    var flushRaf = null;
    var eventsPerFrame = Math.max(4, Math.min(120, Number(options.eventsPerFrame) || 32));

    function clearReconnect() {
      if (reconnectTimer != null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    }

    function scheduleReconnect() {
      clearReconnect();
      if (userClosed) return;
      var delay = 3200 + Math.floor(Math.random() * 2200);
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
          payloads = streamxtPayloadsFromTikfinityJson(item);
        } catch (e) {
          payloads = [];
        }
        var pi;
        for (pi = 0; pi < payloads.length; pi++) batch.push(payloads[pi]);
      }
      if (batch.length && typeof onPayloads === "function") {
        try {
          onPayloads(batch);
        } catch (e2) {}
      }
      if (queue.length > 0) flushRaf = global.requestAnimationFrame(flushQueue);
    }

    function enqueueRaw(parsed) {
      queue.push(parsed);
      if (flushRaf == null) flushRaf = global.requestAnimationFrame(flushQueue);
    }

    function connect() {
      if (userClosed) return;
      var url = getResolvedTikfinityWsUrl();
      if (!/^wss?:\/\//i.test(url)) {
        if (typeof options.onStatus === "function") options.onStatus({ phase: "invalid_url", url: url });
        scheduleReconnect();
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
        scheduleReconnect();
        return;
      }
      socket = sock;

      sock.onopen = function () {
        if (gen !== myGen) return;
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
        if (typeof options.onStatus === "function") options.onStatus({ phase: "reconnecting", url: getResolvedTikfinityWsUrl() });
        scheduleReconnect();
      };

      sock.onerror = function () {};
    }

    return {
      startAuto: function () {
        if (isTikfinityAutoDisabled()) {
          if (typeof options.onStatus === "function") options.onStatus({ phase: "disabled_by_url" });
          return;
        }
        userClosed = false;
        connect();
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

  global.GemTokTikFinity = {
    DEFAULT_WS: DEFAULT_WS,
    LS_KEYS: LS_KEYS,
    isTikfinityAutoDisabled: isTikfinityAutoDisabled,
    getResolvedTikfinityWsUrl: getResolvedTikfinityWsUrl,
    streamxtPayloadsFromTikfinityJson: streamxtPayloadsFromTikfinityJson,
    createClient: createClient,
  };
})(typeof window !== "undefined" ? window : globalThis);
