/**
 * GemTok — merkezi TikTok Live (TikFinity) köprüsü + Event Bus + BroadcastChannel (çok sekme).
 * Önkoşul: GemTokTikFinity (gemtok-tikfinity-client.js).
 *
 * GemTokTikTokLive.bootstrap({ hubBase: "http://127.0.0.1:8787", showHud: true })
 */
(function (global) {
  "use strict";

  var BC_NAME = "gemtok-tiktok-live-v1";
  var LS_HUB = "gemtok_gift_hub_url";

  function uuid() {
    return "c_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function getClientId() {
    try {
      var k = "gemtok_tiktok_live_client_id";
      var c = global.localStorage && global.localStorage.getItem(k);
      if (c && String(c).trim()) return String(c).trim();
      c = uuid();
      global.localStorage.setItem(k, c);
      return c;
    } catch (e) {
      return uuid();
    }
  }

  function resolveHubBase(opt) {
    var o = String((opt && opt.hubBase) || "").trim().replace(/\/$/, "");
    if (o) return o;
    try {
      if (global.__GEMTOK_GIFT_HUB_URL__) return String(global.__GEMTOK_GIFT_HUB_URL__).replace(/\/$/, "");
    } catch (e0) {}
    try {
      var ls = global.localStorage && global.localStorage.getItem(LS_HUB);
      if (ls && String(ls).trim()) return String(ls).trim().replace(/\/$/, "");
    } catch (e1) {}
    return "http://127.0.0.1:8787";
  }

  function createEventBus() {
    var map = {};
    return {
      on: function (ev, fn) {
        if (!map[ev]) map[ev] = [];
        map[ev].push(fn);
      },
      off: function (ev, fn) {
        if (!map[ev]) return;
        map[ev] = map[ev].filter(function (f) {
          return f !== fn;
        });
      },
      emit: function (ev, payload) {
        var list = map[ev] || [];
        var i;
        for (i = 0; i < list.length; i++) {
          try {
            list[i](payload);
          } catch (e) {}
        }
      },
    };
  }

  var eventBus = createEventBus();
  var state = "disconnected";
  var lastWsUrl = "";
  var lastEventType = "";
  var lastEventAt = 0;
  var hubBase = "";
  var bc = null;
  var isLeader = false;
  var claimTimer = null;
  var tikClient = null;
  var hbTimer = null;
  var remoteLeader = false;
  var unloadBound = false;
  var licenseListenerBound = false;
  var bridgeWatchTimer = null;
  var bridgeStatusHint = "";

  function setState(s, extra) {
    state = s;
    if (extra && extra.url) lastWsUrl = String(extra.url);
  }

  function touchEvent(typ) {
    lastEventType = String(typ || "");
    lastEventAt = Date.now();
  }

  function isLocalOnlyHubBase(base) {
    try {
      var u = new URL(String(base || "http://127.0.0.1:8787"));
      var h = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
      return h === "127.0.0.1" || h === "localhost" || h === "::1" || h === "0:0:0:0:0:0:0:1";
    } catch (e0) {
      return true;
    }
  }

  function shouldUseGiftHubApi() {
    if (!hubBase) return false;
    if (!isLocalOnlyHubBase(hubBase)) return true;
    try {
      var GT = global.GemTokTikFinity;
      if (GT && typeof GT.isHostedPublicSite === "function" && GT.isHostedPublicSite()) return false;
    } catch (e1) {}
    return true;
  }

  function postHeartbeat() {
    if (!hubBase || !shouldUseGiftHubApi()) return;
    var url = hubBase + "/api/v1/live/heartbeat";
    try {
      global.fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          client_id: getClientId(),
          state: state,
          url: lastWsUrl,
          last_event_type: lastEventType,
          last_event_at: lastEventAt ? new Date(lastEventAt).toISOString() : "",
        }),
      }).catch(function () {});
    } catch (e) {}
  }

  function discoverGiftFromPayload(p) {
    if (!hubBase || !shouldUseGiftHubApi() || !p || p.type !== "gift") return;
    var gid = parseInt(String(p.giftKey || "").trim(), 10);
    if (!Number.isFinite(gid) || gid <= 0) return;
    var nameHuman = String(p.giftName || p.name || "").trim();
    var slug = String(p.giftId != null ? p.giftId : "").trim();
    var displayName = nameHuman.slice(0, 200) || (slug ? String(slug).replace(/_/g, " ").slice(0, 200) : "Gift " + gid);
    var body = {
      tiktok_id: gid,
      name: displayName,
      diamond_count: Number(p.diamondCount || p.diamond_count) || 0,
      imageUrl: String(p.giftImageUrl || p.imageUrl || "").trim().slice(0, 2000),
      category: String(p.giftCategory || p.category || "").trim().slice(0, 120),
    };
    try {
      global
        .fetch(hubBase + "/api/v1/live/discover-gift", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(body),
        })
        .then(function (r) {
          return r.json().catch(function () {
            return {};
          });
        })
        .then(function (j) {
          if (!j || !j.ok) return;
          try {
            global.dispatchEvent(new CustomEvent("gemtok-gifts-updated", { detail: j }));
          } catch (e1) {}
          try {
            var ch = new global.BroadcastChannel("gemtok-gifts-v1");
            ch.postMessage({ t: "invalidate", detail: j });
            ch.close();
          } catch (e2) {}
          try {
            eventBus.emit("giftmanager:discovered", {
              tiktokId: gid,
              name: body.name,
              diamondCount: body.diamond_count,
              source: "live",
              giftsCatalogVersion: j.giftsCatalogVersion,
            });
          } catch (e3) {}
        })
        .catch(function () {});
    } catch (e) {}
  }

  function dispatchPayloads(batch) {
    var i;
    for (i = 0; i < batch.length; i++) {
      var p = batch[i];
      if (!p || typeof p !== "object") continue;
      var t = String(p.type || "");
      touchEvent(t);
      if (t === "gift") {
        eventBus.emit("gift", p);
        if (isLeader) discoverGiftFromPayload(p);
      } else if (t === "like") eventBus.emit("like", p);
      else if (t === "follow") eventBus.emit("follow", p);
      else if (t === "share") eventBus.emit("share", p);
      else if (t === "member") eventBus.emit("member", p);
      else if (t === "subscribe") eventBus.emit("subscribe", p);
      else eventBus.emit("chat", p);
    }
  }

  function wireBc() {
    if (bc) return;
    try {
      bc = new global.BroadcastChannel(BC_NAME);
    } catch (e) {
      bc = null;
      return;
    }
    bc.onmessage = function (ev) {
      var d = ev && ev.data;
      if (!d || typeof d !== "object") return;
      if (d.t === "IAM_LEADER") {
        if (d.id !== getClientId()) {
          remoteLeader = true;
          if (claimTimer) {
            global.clearTimeout(claimTimer);
            claimTimer = null;
          }
          if (isLeader) {
            try {
              tikClient && tikClient.stop();
            } catch (e2) {}
            tikClient = null;
            isLeader = false;
            lastEventAt = 0;
            lastEventType = "";
            setState("disconnected", {});
          }
        }
        return;
      }
      if (d.t === "LEADER_DEAD") {
        remoteLeader = false;
        if (!isLeader) {
          lastEventAt = 0;
          lastEventType = "";
          scheduleBecomeLeader();
        }
        return;
      }
      if (d.t === "FBATCH" && !isLeader && Array.isArray(d.batch)) {
        dispatchPayloads(d.batch);
      }
    };
  }

  function broadcastBatches(batch) {
    if (!bc || !isLeader || !Array.isArray(batch) || !batch.length) return;
    try {
      bc.postMessage({ t: "FBATCH", batch: batch.slice() });
    } catch (e) {}
  }

  function patchTikfinityClientOnce() {
    var GT = global.GemTokTikFinity;
    if (!GT || GT.__gemtokLiveBridgePatched) return;
    GT.__gemtokLiveBridgePatched = true;
    var origCreate = GT.createClient;
    GT.createClient = function (opts) {
      opts = opts || {};
      var origOn = opts.onPayloads;
      opts.onPayloads = function (batch) {
        if (isLeader) broadcastBatches(batch);
        if (typeof origOn === "function") origOn(batch);
      };
      return origCreate.call(GT, opts);
    };
  }

  function startLeaderSocket() {
    var GT = global.GemTokTikFinity;
    if (!GT || typeof GT.createClient !== "function") {
      setState("error", {});
      return;
    }
    patchTikfinityClientOnce();
    if (tikClient) {
      try {
        tikClient.stop();
      } catch (e0) {}
    }
    tikClient = GT.createClient({
      emitLanePickForChatDigits: true,
      eventsPerFrame: 48,
      onPayloads: function (batch) {
        dispatchPayloads(batch);
      },
      onStatus: function (s) {
        var ph = String(s.phase || "");
        if (ph === "local_network_blocked") {
          bridgeStatusHint = String(s.message || "").trim();
        } else if (ph === "connected") {
          bridgeStatusHint = "";
        }
        if (ph === "connecting") setState("connecting", s);
        else if (ph === "connected") setState("connected", s);
        else if (ph === "reconnecting") setState("reconnecting", s);
        else if (ph === "disabled_by_url") setState("disconnected", s);
        else if (ph === "invalid_url") setState("error", s);
        else if (ph === "local_network_blocked") setState("reconnecting", s);
      },
    });
    tikClient.startAuto().catch(function () {});
  }

  function shouldAttemptTikfinityBridge() {
    try {
      var GT = global.GemTokTikFinity;
      if (GT && typeof GT.isTikfinityAutoDisabled === "function" && GT.isTikfinityAutoDisabled()) {
        return false;
      }
    } catch (e) {}
    return true;
  }

  function stopLeaderIfRunning() {
    if (isLeader) {
      try {
        tikClient && tikClient.stop();
      } catch (e0) {}
      tikClient = null;
      isLeader = false;
    }
    setState("disconnected", {});
  }

  function onLicenseChanged() {
    if (!shouldAttemptTikfinityBridge()) {
      stopLeaderIfRunning();
      return;
    }
    startHostedBridgeWatch();
    if (!isLeader && !remoteLeader && !claimTimer) scheduleBecomeLeader();
  }

  function scheduleBecomeLeader() {
    if (!shouldAttemptTikfinityBridge()) {
      setState("disconnected", {});
      return;
    }
    if (isLeader || remoteLeader) return;
    if (claimTimer) return;
    claimTimer = global.setTimeout(function () {
      claimTimer = null;
      if (remoteLeader) return;
      isLeader = true;
      try {
        bc && bc.postMessage({ t: "IAM_LEADER", id: getClientId() });
      } catch (e) {}
      setState("connecting", {});
      startLeaderSocket();
    }, 250);
  }

  function onBeforeUnload() {
    if (isLeader) {
      try {
        bc && bc.postMessage({ t: "LEADER_DEAD", from: getClientId() });
      } catch (e) {}
      try {
        tikClient && tikClient.stop();
      } catch (e2) {}
      tikClient = null;
      isLeader = false;
    }
  }

  function startHb() {
    if (!shouldUseGiftHubApi()) return;
    if (hbTimer) return;
    hbTimer = global.setInterval(postHeartbeat, 2500);
  }

  function stopHb() {
    if (hbTimer) {
      global.clearInterval(hbTimer);
      hbTimer = null;
    }
  }

  function reconnect() {
    if (!shouldAttemptTikfinityBridge()) return;
    if (isLeader && tikClient && tikClient.reconnect) tikClient.reconnect();
  }

  function getConnectionState() {
    return {
      state: state,
      url: lastWsUrl,
      leader: isLeader,
      lastEventType: lastEventType,
      lastEventAt: lastEventAt,
    };
  }

  function isLiveSignalOk() {
    if (!shouldAttemptTikfinityBridge()) return false;
    if (isLeader && state === "connected") return true;
    if (!isLeader && lastEventAt && Date.now() - lastEventAt < 3500) return true;
    return false;
  }

  function isHostedPublicSite() {
    try {
      var GT = global.GemTokTikFinity;
      if (GT && typeof GT.isHostedPublicSite === "function") return GT.isHostedPublicSite();
    } catch (e0) {}
    return false;
  }

  function startHostedBridgeWatch() {
    if (!isHostedPublicSite() || bridgeWatchTimer) return;
    bridgeWatchTimer = global.setInterval(function () {
      if (!shouldAttemptTikfinityBridge()) return;
      if (isLiveSignalOk()) return;
      var GT = global.GemTokTikFinity;
      if (!GT || typeof GT.preflightHostedLocalBridge !== "function") return;
      GT.preflightHostedLocalBridge().then(function (ok) {
        if (!ok) return;
        if (isLeader && tikClient && tikClient.reconnect) tikClient.reconnect();
        else if (!isLeader && !remoteLeader && !claimTimer) scheduleBecomeLeader();
      });
    }, 4500);
  }

  function triggerHostedBridgeAccess() {
    var GT = global.GemTokTikFinity;
    if (!GT || typeof GT.requestHostedBridgeAccess !== "function") return Promise.resolve(false);
    return GT.requestHostedBridgeAccess().then(function (ok) {
      if (ok) reconnect();
      return ok;
    });
  }

  function installNavConnectionStatus(opt) {
    var slotId = (opt && opt.navConnectionSlot) || "";
    if (!slotId || !global.document) return;
    var host = global.document.getElementById(String(slotId));
    if (!host || global.document.getElementById("gemtok-live-nav-pill")) return;
    var pill = global.document.createElement("div");
    pill.id = "gemtok-live-nav-pill";
    pill.setAttribute("role", "status");
    pill.style.cssText =
      "display:inline-flex;align-items:center;gap:8px;padding:6px 10px;border-radius:9999px;font:600 12px/1.2 system-ui,sans-serif;cursor:default;white-space:nowrap;max-width:min(42vw,220px);border:1px solid rgba(255,255,255,0.12);background:rgba(15,30,55,0.75);color:#e2e8f0;";
    pill.innerHTML =
      '<span id="gemtok-live-nav-dot" style="flex-shrink:0;width:9px;height:9px;border-radius:50%;background:#ef4444;box-shadow:0 0 0 2px rgba(239,68,68,0.35)"></span><span id="gemtok-live-nav-label" style="overflow:hidden;text-overflow:ellipsis">TikTok Live · Bağlı değil</span>';
    host.appendChild(pill);
    pill.addEventListener("click", function () {
      if (!hasActiveLicenseSession() || isLiveSignalOk()) return;
      if (!isHostedPublicSite()) {
        reconnect();
        return;
      }
      triggerHostedBridgeAccess().then(function (ok) {
        if (ok) return;
        try {
          global.alert(
            "TikFinity köprüsü bulunamadı.\n\n1) TikFinity masaüstü uygulamasını açın\n2) Bilgisayarınızda GemTok-TikFinity-Kopru.bat çalıştırın\n3) Chrome/Edge yerel ağ erişimine izin verin\n4) Bu düğmeye tekrar tıklayın"
          );
        } catch (eA) {}
      });
    });
    function syncNavPill() {
      var s = getConnectionState();
      var dot = global.document.getElementById("gemtok-live-nav-dot");
      var lab = global.document.getElementById("gemtok-live-nav-label");
      var ok = isLiveSignalOk();
      var hosted = false;
      try {
        hosted = isHostedPublicSite();
      } catch (eH) {}
      if (dot) {
        dot.style.background = ok ? "#22c55e" : "#ef4444";
        dot.style.boxShadow = ok ? "0 0 0 2px rgba(34,197,94,0.35)" : "0 0 0 2px rgba(239,68,68,0.35)";
      }
      if (lab) {
        if (!hasActiveLicenseSession()) {
          lab.textContent = "TikTok Live · Lisans gerekli";
        } else if (ok) {
          lab.textContent = "TikTok Live · Bağlı";
        } else if (hosted) {
          lab.textContent = "TikTok Live · Köprü gerekli";
        } else {
          lab.textContent = "TikTok Live · Bağlı değil";
        }
      }
      if (pill) pill.style.cursor = !ok && hasActiveLicenseSession() ? "pointer" : "default";
      var tip =
        (s.leader ? "Öncü sekme (TikFinity)" : "İzleyici sekme") +
        " · " +
        s.state +
        (s.url ? "\n" + s.url : "") +
        (s.lastEventType ? "\nSon: " + s.lastEventType : "") +
        (!hasActiveLicenseSession()
          ? "\nTikFinity için Oyun Merkezi'nde lisans anahtarı uygulayın."
          : !ok
            ? hosted
              ? "\nTıklayın: yerel ağ izni + köprü testi\n1) TikFinity açık\n2) GemTok-TikFinity-Kopru.bat\n3) Chrome yerel ağ izni" +
                (bridgeStatusHint ? "\n" + bridgeStatusHint : "")
              : "\nTikFinity masaüstü uygulamasını açın (ws://127.0.0.1:21213)"
            : "");
      pill.setAttribute("title", tip);
    }
    syncNavPill();
    global.setInterval(syncNavPill, 600);
  }

  function installHud() {
    if (!global.document || global.document.querySelector("#gemtok-tiktok-live-hud")) return;
    var el = global.document.createElement("div");
    el.id = "gemtok-tiktok-live-hud";
    el.style.cssText =
      "position:fixed;bottom:12px;right:12px;z-index:9999;max-width:280px;padding:10px 12px;border-radius:10px;font:12px/1.35 system-ui,sans-serif;color:#e2e8f0;background:rgba(15,30,55,0.92);border:1px solid rgba(0,212,255,0.25);box-shadow:0 4px 24px rgba(0,0,0,0.35);";
    el.innerHTML =
      '<div style="font-weight:600;color:#7dd3fc;margin-bottom:6px">TikTok Live</div><div id="gemtok-live-hud-status" style="color:#94a3b8">…</div><div style="margin-top:8px"><button type="button" id="gemtok-live-hud-reconnect" style="cursor:pointer;padding:4px 10px;border-radius:6px;border:1px solid rgba(0,212,255,0.4);background:rgba(0,212,255,0.12);color:#7dd3fc;font-weight:600">Yeniden bağlan</button></div>';
    global.document.body.appendChild(el);
    global.setInterval(function () {
      var s = getConnectionState();
      var n = global.document.getElementById("gemtok-live-hud-status");
      if (n)
        n.textContent =
          (s.leader ? "Bağlantı (öncü sekme)" : "İzleyici") +
          " · " +
          s.state +
          (s.url ? "\n" + s.url : "") +
          (s.lastEventType ? "\nSon: " + s.lastEventType : "");
    }, 800);
    global.document.getElementById("gemtok-live-hud-reconnect").onclick = function () {
      reconnect();
    };
  }

  function bootstrap(opt) {
    hubBase = resolveHubBase(opt || {});
    wireBc();
    patchTikfinityClientOnce();
    try {
      var GT0 = global.GemTokTikFinity;
      if (GT0 && typeof GT0.installHostedBridgeDefaults === "function") GT0.installHostedBridgeDefaults();
    } catch (eDef) {}
    function startBridge() {
      try {
        bc && bc.postMessage({ t: "CLAIM", id: getClientId() });
      } catch (e) {}
      // Yerel HTTP saglik kontrolu WebSocket baslangicini engellememeli.
      // Canli HTTPS sayfasinda da once dogrudan TikFinity 21213 baglantisini
      // baslat; kopru kontrolu yalnizca arka planda yardimci/fallback olarak kalir.
      scheduleBecomeLeader();
      if (isHostedPublicSite()) {
        startHostedBridgeWatch();
        triggerHostedBridgeAccess().then(function (ok) {
          if (ok && !isLiveSignalOk()) reconnect();
        }).catch(function () {});
      }
    }
    var L = global.GemtokLicense;
    if (L && typeof L.whenReady === "function") {
      L.whenReady().then(startBridge);
    } else {
      startBridge();
    }
    if (!unloadBound) {
      unloadBound = true;
      global.addEventListener("beforeunload", onBeforeUnload);
    }
    if (!licenseListenerBound) {
      licenseListenerBound = true;
      try {
        global.addEventListener("gemtok-license-changed", onLicenseChanged);
      } catch (eLic) {}
    }
    startHb();
    if (opt && opt.showHud) installHud();
    if (opt && opt.navConnectionSlot) installNavConnectionStatus(opt);
  }

  global.GemTokTikTokLive = {
    eventBus: eventBus,
    on: function (e, fn) {
      eventBus.on(e, fn);
    },
    off: function (e, fn) {
      eventBus.off(e, fn);
    },
    emit: function (e, p) {
      eventBus.emit(e, p);
    },
    bootstrap: bootstrap,
    reconnect: reconnect,
    getConnectionState: getConnectionState,
    triggerHostedBridgeAccess: triggerHostedBridgeAccess,
  };
})(typeof window !== "undefined" ? window : globalThis);
