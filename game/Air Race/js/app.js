(function () {
  "use strict";

  const LS_SETTINGS = "hava_yarisi_settings";
  const TOTAL_STEPS = 100;
  const WIN_BONUS = 15;
  const AUTO_RESTART_MS = 4000;
  const PACK_VIS_LO = 0.05;
  const PACK_VIS_HI = 0.82;
  const OVERTAKE_PULL_BASE = 0.48;
  const OVERTAKE_PULL_OVER = 0.32;
  const TEAM_NAMES = ["Kırmızı", "Mavi"];
  const TEAM_JOIN_NAMES = ["Türkiye", "Kürdistan"];
  /** Sohbet: 1 = Türkiye (indeks 0), 2 = Kürdistan (indeks 1) */
  const SOHBET_TO_TEAM = { "1": 0, "2": 1 };
  const TEAM_COLORS = ["#e74c3c", "#3498db"];

  const BACKGROUND_MODES = ["war", "night", "dusk"];

  const DEFAULT_SETTINGS = {
    wsUrl: "",
    heli1Image: "helikoptertr.png",
    heli2Image: "helikopterkr.png",
    team1Name: "Türkiye",
    team2Name: "Kürdistan",
    giftRules: [
      { match: "rose", team: 0, label: "Gül → Kırmızı" },
      { match: "gül", team: 0, label: "Gül → Kırmızı" },
      { match: "heart", team: 1, label: "Kalp → Mavi" },
      { match: "kalp", team: 1, label: "Kalp → Mavi" },
      { match: "finger", team: 0, label: "Parmak → Kırmızı" },
      { match: "confetti", team: 1, label: "Konfeti → Mavi" },
    ],
    likesPerStep: 50,
    followSteps: 1,
    subscribeSteps: 2,
    shareSteps: 1,
    memberSteps: 0,
    showLaneLabels: true,
    backgroundMode: "dusk",
  };

  const LEADERBOARD_MAX = 3;
  const LIKE_DRIP_MS = 90;
  const LIKE_BOOST_EVERY = 6;

  const state = {
    steps: [0, 0],
    finished: false,
    winner: null,
    settings: loadSettings(),
    lastEvent: null,
    tikfinityPhase: "idle",
    leaderboard: new Map(),
    lbHighlightId: null,
    userTeams: new Map(),
    userTeamsByNick: new Map(),
    teamWins: [0, 0],
    giftCounts: [0, 0],
    likeDrip: {
      queue: [],
      timer: null,
      boostTick: 0,
    },
    likeAccumulator: new Map(),
  };

  const els = {
    stage: document.getElementById("stage"),
    heliWraps: [document.getElementById("heli0"), document.getElementById("heli1")],
    lanes: [document.getElementById("lane0"), document.getElementById("lane1")],
    heliImgs: [document.getElementById("heliImg0"), document.getElementById("heliImg1")],
    winnerOverlay: document.getElementById("winnerOverlay"),
    winnerTitle: document.getElementById("winnerTitle"),
    btnReset: document.getElementById("btnReset"),
    btnSettings: document.getElementById("btnSettings"),
    settingsPanel: document.getElementById("settingsPanel"),
    btnCloseSettings: document.getElementById("btnCloseSettings"),
    btnCancelSettings: document.getElementById("btnCancelSettings"),
    btnSaveSettings: document.getElementById("btnSaveSettings"),
    likeStepsInput: document.getElementById("likeStepsInput"),
    followStepsInput: document.getElementById("followStepsInput"),
    subscribeStepsInput: document.getElementById("subscribeStepsInput"),
    shareStepsInput: document.getElementById("shareStepsInput"),
    memberStepsInput: document.getElementById("memberStepsInput"),
    team1NameInput: document.getElementById("team1NameInput"),
    team2NameInput: document.getElementById("team2NameInput"),
    showLaneLabelsInput: document.getElementById("showLaneLabelsInput"),
    backgroundModeInput: document.getElementById("backgroundModeInput"),
    lbList: document.getElementById("lbList"),
    teamWin0: document.getElementById("teamWin0"),
    teamWin1: document.getElementById("teamWin1"),
  };

  function loadSettings() {
    try {
      const raw = localStorage.getItem(LS_SETTINGS);
      if (!raw) return structuredClone(DEFAULT_SETTINGS);
      const merged = { ...structuredClone(DEFAULT_SETTINGS), ...JSON.parse(raw) };
      return normalizeLegacyTeamNames(merged);
    } catch {
      return structuredClone(DEFAULT_SETTINGS);
    }
  }

  function normalizeLegacyTeamNames(settings) {
    const defaults = TEAM_JOIN_NAMES;
    const keys = ["team1Name", "team2Name"];
    keys.forEach((key, i) => {
      const n = String(settings[key] || "").toLocaleLowerCase("tr-TR");
      const isLegacy =
        /helikopter/.test(n) ||
        /^kırmızı(\s+helikopter)?$/.test(n) ||
        /^mavi(\s+helikopter)?$/.test(n) ||
        n === "kirmizi" ||
        n === "kirmizi helikopter" ||
        n === "mavi helikopter" ||
        n === "helikopter 1" ||
        n === "helikopter 2";
      if (isLegacy) settings[key] = defaults[i];
    });
    if (settings.likesPerStep == null) {
      const old = parseInt(settings.likeSteps, 10);
      if (old === 0) settings.likesPerStep = 0;
      else if (!Number.isFinite(old) || old <= 1) settings.likesPerStep = 50;
      else settings.likesPerStep = Math.max(1, old);
    }
    const h1 = String(settings.heli1Image || "").toLowerCase();
    const h2 = String(settings.heli2Image || "").toLowerCase();
    if (h1.endsWith("heli1.png") && h2.endsWith("heli2.png")) {
      settings.heli1Image = "helikoptertr.png";
      settings.heli2Image = "helikopterkr.png";
    }
    if (!BACKGROUND_MODES.includes(settings.backgroundMode)) {
      settings.backgroundMode = DEFAULT_SETTINGS.backgroundMode;
    }
    return settings;
  }

  function likeAccumulatorKey(userId, nickname) {
    const id = String(userId || "").trim();
    if (id) return id;
    const nick = normalizeNick(nickname);
    return nick ? "nick:" + nick : "";
  }

  function accumulateLikeSteps(userId, nickname, likeCount, likesPerStep) {
    const key = likeAccumulatorKey(userId, nickname);
    if (!key || likesPerStep <= 0) return 0;
    const lc = Math.max(1, Math.round(likeCount) || 1);
    const total = (state.likeAccumulator.get(key) || 0) + lc;
    const steps = Math.floor(total / likesPerStep);
    state.likeAccumulator.set(key, total % likesPerStep);
    return steps;
  }

  function saveSettings() {
    localStorage.setItem(LS_SETTINGS, JSON.stringify(state.settings));
    if (state.settings.wsUrl && String(state.settings.wsUrl).trim()) {
      try {
        localStorage.setItem("hava_yarisi_tikfinity_ws_url", String(state.settings.wsUrl).trim());
      } catch {}
    }
  }

  function clampSteps(n) {
    return Math.max(0, Math.min(TOTAL_STEPS, n));
  }

  /** Görünür ilerleme: 100 puanda biter */
  function computeVisualPositions(scores) {
    const min = Math.min(scores[0], scores[1]);
    const max = Math.max(scores[0], scores[1]);
    const span = max - min;

    function absPos(score) {
      const t = Math.max(0, Math.min(1, score / TOTAL_STEPS));
      return PACK_VIS_LO + Math.pow(t, 0.38) * (PACK_VIS_HI - PACK_VIS_LO);
    }

    if (span < 1e-9) {
      const p = absPos(scores[0]);
      return [p, p];
    }

    return scores.map((s) => {
      const rel = PACK_VIS_LO + ((s - min) / span) * (PACK_VIS_HI - PACK_VIS_LO);
      const abs = absPos(s);
      return Math.max(PACK_VIS_LO, Math.min(PACK_VIS_HI, rel * 0.55 + abs * 0.45));
    });
  }

  function applyHeliPosition(wrap, progress) {
    if (!wrap) return;
    const track = wrap.parentElement;
    const trackW = track && track.classList.contains("heli-track") ? track.clientWidth : 0;
    const pct = 0.03 + progress * 0.78;
    const x = trackW > 0 ? pct * trackW : pct * 300;
    wrap.style.transform = `translate3d(${x}px, -50%, 0)`;
  }

  function syncLaneLabelsUI() {
    if (!els.stage) return;
    const show = state.settings.showLaneLabels !== false;
    els.stage.classList.toggle("lane-tags-hidden", !show);
  }

  function applyBackgroundMode() {
    const mode = BACKGROUND_MODES.includes(state.settings.backgroundMode)
      ? state.settings.backgroundMode
      : DEFAULT_SETTINGS.backgroundMode;
    state.settings.backgroundMode = mode;
    if (els.stage) els.stage.dataset.bgMode = mode;
    document.documentElement.dataset.bgMode = mode;
  }

  function syncUI() {
    const vis = computeVisualPositions(state.steps);
    applyHeliPosition(els.heliWraps[0], vis[0]);
    applyHeliPosition(els.heliWraps[1], vis[1]);
    syncLaneOrder();
    syncLaneLabelsUI();
  }

  /** En çok hediye alan takım üst şeride geçer; eşitlikte Türkiye (0) üstte */
  function syncLaneOrder() {
    let topTeam = 0;
    if (state.giftCounts[1] > state.giftCounts[0]) topTeam = 1;

    [0, 1].forEach((team) => {
      const lane = els.lanes[team];
      if (!lane) return;
      const isTop = team === topTeam;
      lane.classList.toggle("is-top", isTop);
      lane.classList.toggle("is-bottom", !isTop);
    });
  }

  function normalizeNick(nickname) {
    return String(nickname || "")
      .trim()
      .toLocaleLowerCase("tr-TR");
  }

  function teamFromSohbet(pick) {
    const key = String(pick ?? "").trim();
    if (key === "2") return 1;
    if (key === "1") return 0;
    return null;
  }

  function teamFromPickPayload(p) {
    const fromPick = teamFromSohbet(p?.pick);
    if (fromPick != null) return fromPick;
    const fromChat = teamFromSohbet(p?.chat);
    if (fromChat != null) return fromChat;
    return null;
  }

  function collectUserIds(userId, userIds) {
    const ids = new Set();
    const add = (v) => {
      const s = String(v || "").trim().replace(/^@/, "");
      if (s) ids.add(s);
    };
    add(userId);
    if (Array.isArray(userIds)) userIds.forEach(add);
    return ids;
  }

  function registerUserTeam(userId, nickname, team, userIds) {
    const ids = collectUserIds(userId, userIds);
    const primary = String(userId || "").trim().replace(/^@/, "") || [...ids][0] || "";
    for (const id of ids) state.userTeams.set(id, team);
    const nick = normalizeNick(nickname);
    if (nick) {
      state.userTeamsByNick.set(nick, {
        team,
        userId: primary,
        userIds: [...ids],
        fromPick: true,
        at: Date.now(),
      });
    }
  }

  function resolveUserTeam(userId, nickname, userIds) {
    const ids = collectUserIds(userId, userIds);
    for (const id of ids) {
      const t = state.userTeams.get(id);
      if (t === 0 || t === 1) return t;
    }
    return null;
  }

  function mergeUserAliases(userId, nickname, userIds) {
    const ids = collectUserIds(userId, userIds);
    for (const id of ids) {
      if (state.userTeams.has(id)) {
        const team = state.userTeams.get(id);
        registerUserTeam(userId, nickname, team, userIds);
        return team;
      }
    }

    const nick = normalizeNick(nickname);
    if (!nick) return null;
    const rec = state.userTeamsByNick.get(nick);
    if (!rec || !rec.fromPick || (rec.team !== 0 && rec.team !== 1)) return null;

    registerUserTeam(userId, nickname, rec.team, userIds);
    return rec.team;
  }

  function syncLeaderboardTeam(userId, nickname, team) {
    const key = leaderboardKey(userId, nickname);
    if (!key) return;
    const entry = state.leaderboard.get(key);
    if (!entry) return;
    entry.team = team;
    renderLeaderboard();
  }

  function formatTeamJoined(teamName) {
    const n = String(teamName || "takım").trim();
    const lower = n.toLocaleLowerCase("tr-TR");
    const backVowels = "aıou";
    const frontVowels = "eiöü";
    let lastVowel = "";
    for (let i = lower.length - 1; i >= 0; i--) {
      const ch = lower[i];
      if (backVowels.includes(ch) || frontVowels.includes(ch)) {
        lastVowel = ch;
        break;
      }
    }
    const suffix = frontVowels.includes(lastVowel) ? "'ye" : "'a";
    return `${n}${suffix} katıldı`;
  }

  function handleTeamPick(p) {
    const userId = String(p.userId || "").trim();
    if (!userId && !normalizeNick(p.nickname)) return;

    let team = teamFromPickPayload(p);
    if (team == null) return;

    registerUserTeam(userId, p.nickname, team, p.userIds);
    syncLeaderboardTeam(userId, p.nickname, team);
    showJoinToast(p.nickname, team, p.avatarUrl);
  }

  function showJoinToast(nickname, team, avatarUrl) {
    let toast = document.getElementById("joinToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "joinToast";
      toast.className = "join-toast";
      els.stage.appendChild(toast);
    }
    const av = avatarUrl
      ? `<img class="join-toast-av" src="${escapeHtml(avatarUrl)}" alt="" referrerpolicy="no-referrer" />`
      : "";
    const joinName = TEAM_JOIN_NAMES[team === 1 ? 1 : 0];
    toast.innerHTML = `${av}<span><strong>${escapeHtml(nickname || "?")}</strong> ${escapeHtml(formatTeamJoined(joinName))}</span>`;
    toast.classList.remove("show");
    void toast.offsetWidth;
    toast.classList.add("show");
    clearTimeout(showJoinToast._t);
    showJoinToast._t = setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function showBoost(team, nickname, text) {
    const lane = els.lanes[team];
    const wrap = lane ? lane.querySelector(".heli-wrap") : els.heliWraps[team];
    if (!wrap) return;
    const pop = document.createElement("div");
    pop.className = "boost-pop";
    pop.innerHTML = `<strong>${escapeHtml(nickname || "İzleyici")}</strong><span>${escapeHtml(text)}</span>`;
    wrap.appendChild(pop);
    setTimeout(() => pop.remove(), 1800);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function syncTeamWinsUI() {
    if (els.teamWin0) els.teamWin0.textContent = String(state.teamWins[0]);
    if (els.teamWin1) els.teamWin1.textContent = String(state.teamWins[1]);
  }

  function awardWinPoints(winningTeam) {
    state.teamWins[winningTeam] += 1;
    let topKey = null;
    let topPts = -1;
    for (const entry of state.leaderboard.values()) {
      if (entry.team !== winningTeam) continue;
      entry.points += WIN_BONUS;
      if (entry.points > topPts) {
        topPts = entry.points;
        topKey = entry.key;
      }
    }
    if (topKey) {
      const top = state.leaderboard.get(topKey);
      if (top) top.roundWins = (top.roundWins || 0) + 1;
      state.lbHighlightId = topKey;
    }
    syncTeamWinsUI();
    renderLeaderboard();
  }

  function checkWinner() {
    if (state.finished) return;
    if (state.steps[0] >= TOTAL_STEPS) {
      state.finished = true;
      state.winner = 0;
      showWinner(0);
    } else if (state.steps[1] >= TOTAL_STEPS) {
      state.finished = true;
      state.winner = 1;
      showWinner(1);
    }
  }

  function showWinner(team) {
    clearLikeDrip();
    awardWinPoints(team);
    const name = state.settings[team === 0 ? "team1Name" : "team2Name"];
    els.winnerTitle.textContent = `${name} kazandı! (+${WIN_BONUS} puan)`;
    els.winnerTitle.style.color = TEAM_COLORS[team];
    els.winnerOverlay.classList.add("on");
    els.stage.classList.add("winner-flash");
    setTimeout(() => els.stage.classList.remove("winner-flash"), 1200);
    clearTimeout(showWinner._restartT);
    showWinner._restartT = setTimeout(startNewRound, AUTO_RESTART_MS);
  }

  function startNewRound() {
    clearLikeDrip();
    state.steps = [0, 0];
    state.giftCounts = [0, 0];
    state.finished = false;
    state.winner = null;
    els.winnerOverlay.classList.remove("on");
    syncUI();
  }

  function advanceTeam(team, steps, nickname, reason, meta) {
    if (state.finished) return;
    const m = meta && typeof meta === "object" ? meta : {};
    const uid = String(m.userId || "").trim();
    const nick = String(nickname || m.nickname || "").trim();
    if (uid || nick) {
      const joined = resolveUserTeam(uid, nick, m.userIds);
      if (joined == null) return;
      team = joined;
    }
    if (team == null || team < 0 || team > 1) return;
    const n = Math.max(1, Math.round(steps) || 1);
    const before = state.steps.slice();
    state.steps[team] = clampSteps(state.steps[team] + n);
    const ni = state.steps[team];

    for (let j = 0; j < 2; j++) {
      if (j === team) continue;
      if (before[team] <= before[j] && ni > before[j]) {
        const over = ni - before[j];
        const pull = n * OVERTAKE_PULL_BASE + over * OVERTAKE_PULL_OVER;
        state.steps[j] = Math.max(0, Math.round(before[j] - pull));
      }
    }

    recordLeaderboard(team, nickname, m.userId, n, m.avatarUrl);
    syncUI();
    if (!m.silentBoost) {
      showBoost(team, nickname, reason || `+${n} puan`);
    }
    checkWinner();
  }

  function clearLikeDrip() {
    const drip = state.likeDrip;
    drip.queue = [];
    drip.boostTick = 0;
    if (drip.timer) {
      clearInterval(drip.timer);
      drip.timer = null;
    }
  }

  function queueLikeSteps(_team, steps, meta) {
    if (state.finished) return;
    const uid = String(meta?.userId || "").trim();
    const nick = normalizeNick(meta?.nickname);
    const key = uid || (nick ? "nick:" + nick : "");
    if (!key) return;

    const joined = resolveUserTeam(uid, meta?.nickname, meta?.userIds);
    if (joined == null) return;

    const n = Math.max(1, Math.round(steps) || 1);
    const drip = state.likeDrip;
    let item = drip.queue.find((q) => q.key === key);
    if (!item) {
      item = {
        key,
        userId: uid,
        userIds: meta?.userIds || [],
        nickname: meta?.nickname || "İzleyici",
        avatarUrl: meta?.avatarUrl || "",
        remaining: 0,
      };
      drip.queue.push(item);
    } else {
      if (uid) item.userId = uid;
      if (Array.isArray(meta?.userIds)) item.userIds = meta.userIds;
      if (meta?.nickname) item.nickname = meta.nickname;
      if (meta?.avatarUrl) item.avatarUrl = meta.avatarUrl;
    }
    item.remaining += n;
    startLikeDrip();
  }

  function startLikeDrip() {
    const drip = state.likeDrip;
    if (drip.timer || state.finished) return;
    drip.timer = setInterval(tickLikeDrip, LIKE_DRIP_MS);
  }

  function tickLikeDrip() {
    if (state.finished) {
      clearLikeDrip();
      return;
    }

    const drip = state.likeDrip;
    const item = drip.queue.find((q) => q.remaining > 0);
    if (!item) {
      clearLikeDrip();
      return;
    }

    const team = resolveUserTeam(item.userId, item.nickname, item.userIds);
    item.remaining -= 1;
    if (team == null) return;

    drip.boostTick += 1;
    const showBoostPop = drip.boostTick % LIKE_BOOST_EVERY === 1;

    advanceTeam(team, 1, item.nickname, "❤️ beğeni", {
      userId: item.userId,
      userIds: item.userIds,
      avatarUrl: item.avatarUrl,
      silentBoost: !showBoostPop,
    });
  }

  function leaderboardKey(userId, nickname) {
    const id = String(userId || "").trim();
    if (id) return id;
    const nick = String(nickname || "").trim();
    if (nick) return "nick:" + nick.toLowerCase();
    return null;
  }

  function recordLeaderboard(team, nickname, userId, points, avatarUrl) {
    const key = leaderboardKey(userId, nickname);
    if (!key) return;
    let entry = state.leaderboard.get(key);
    if (!entry) {
      entry = {
        key,
        userId: userId || "",
        nickname: String(nickname || "?").slice(0, 24),
        avatarUrl: "",
        team,
        points: 0,
      };
      state.leaderboard.set(key, entry);
    }
    entry.points += Math.max(1, Math.round(points) || 1);
    if (nickname) entry.nickname = String(nickname).slice(0, 24);
    if (avatarUrl) entry.avatarUrl = String(avatarUrl);
    if (team != null) entry.team = team;
    state.lbHighlightId = key;
    renderLeaderboard();
  }

  function renderLeaderboard() {
    if (!els.lbList) return;
    const sorted = [...state.leaderboard.values()]
      .sort((a, b) => b.points - a.points || a.nickname.localeCompare(b.nickname))
      .slice(0, LEADERBOARD_MAX);

    if (!sorted.length) {
      els.lbList.innerHTML = '<li class="lb-empty">Henüz destek yok</li>';
      return;
    }

    els.lbList.innerHTML = sorted
      .map((e, i) => {
        const isNew = e.key === state.lbHighlightId;
        const avatar = e.avatarUrl
          ? `<img class="lb-avatar" src="${escapeHtml(e.avatarUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
          : '<span class="lb-avatar lb-ph" aria-hidden="true"></span>';
        return (
          `<li class="lb-row team-${e.team}${isNew ? " lb-new" : ""}">` +
          `<span class="lb-rank">${i + 1}</span>` +
          avatar +
          `<span class="lb-name" title="${escapeHtml(e.nickname)}">${escapeHtml(e.nickname)}</span>` +
          `<span class="lb-pts">${e.points}</span>` +
          `</li>`
        );
      })
      .join("");

    if (state.lbHighlightId) {
      setTimeout(() => {
        state.lbHighlightId = null;
      }, 500);
    }
  }

  function normalizeGiftKey(s) {
    return String(s || "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "_");
  }

  function resolveGiftTeam(giftId, giftName) {
    const id = normalizeGiftKey(giftId);
    const name = normalizeGiftKey(giftName);
    for (const rule of state.settings.giftRules) {
      const m = normalizeGiftKey(rule.match);
      if (!m) continue;
      if (id && (id === m || id.includes(m) || m.includes(id))) return rule.team;
      if (name && (name === m || name.includes(m) || m.includes(name))) return rule.team;
    }
    return null;
  }

  function giftPoints(p) {
    // TikTok'ta diamondCount birim basina degerdir; combo (repeatCount) ile
    // carpilir. Tek hediye en fazla bir tam pist kadar ilerletir.
    const combo = Math.max(1, parseInt(p.giftCombo || p.repeatCount, 10) || 1);
    const perUnit = Math.max(1, parseInt(p.diamondCount, 10) || 1);
    return Math.max(1, Math.min(TOTAL_STEPS, perUnit * combo));
  }

  function handlePayload(p) {
    if (!p || typeof p !== "object") return;
    state.lastEvent = p;

    if (p.type === "team_pick") {
      handleTeamPick(p);
      return;
    }

    if (state.finished) return;

    if (p.type === "gift") {
      const team = mergeUserAliases(p.userId, p.nickname, p.userIds);
      if (team == null) return;
      const pts = giftPoints(p);
      state.giftCounts[team] += pts;
      advanceTeam(team, pts, p.nickname, `🎁 +${pts} puan`, { userId: p.userId, userIds: p.userIds, avatarUrl: p.avatarUrl });
      return;
    }

    const userTeam = mergeUserAliases(p.userId, p.nickname, p.userIds);
    if (userTeam == null) return;

    if (p.type === "like") {
      const likesPerStep = Math.max(0, parseInt(state.settings.likesPerStep, 10) || 0);
      if (likesPerStep <= 0) return;
      const lc = Math.min(500, Math.max(1, parseInt(p.likeCount, 10) || 1));
      const steps = accumulateLikeSteps(p.userId, p.nickname, lc, likesPerStep);
      if (steps > 0) {
        queueLikeSteps(userTeam, steps, {
          userId: p.userId,
          userIds: p.userIds,
          nickname: p.nickname,
          avatarUrl: p.avatarUrl,
        });
      }
      return;
    }

    if (p.type === "follow" && state.settings.followSteps > 0) {
      advanceTeam(userTeam, state.settings.followSteps, p.nickname, "➕ takip", { userId: p.userId, userIds: p.userIds, avatarUrl: p.avatarUrl });
      return;
    }

    if (p.type === "subscribe" && state.settings.subscribeSteps > 0) {
      advanceTeam(userTeam, state.settings.subscribeSteps, p.nickname, "⭐ abone", { userId: p.userId, userIds: p.userIds, avatarUrl: p.avatarUrl });
      return;
    }

    if (p.type === "share" && state.settings.shareSteps > 0) {
      advanceTeam(userTeam, state.settings.shareSteps, p.nickname, "↗ paylaşım", { userId: p.userId, userIds: p.userIds, avatarUrl: p.avatarUrl });
      return;
    }

    if (p.type === "member" && state.settings.memberSteps > 0) {
      advanceTeam(userTeam, state.settings.memberSteps, p.nickname, "👋 katıldı", { userId: p.userId, userIds: p.userIds, avatarUrl: p.avatarUrl });
    }
  }

  function resetRace(fullReset) {
    clearTimeout(showWinner._restartT);
    startNewRound();
    if (fullReset !== false) {
      state.leaderboard.clear();
      state.lbHighlightId = null;
      state.userTeams.clear();
      state.userTeamsByNick.clear();
      state.likeAccumulator.clear();
      state.teamWins = [0, 0];
      state.giftCounts = [0, 0];
      renderLeaderboard();
      syncTeamWinsUI();
    }
  }

  function loadHeliImages() {
    const paths = [state.settings.heli1Image, state.settings.heli2Image];
    paths.forEach((src, i) => {
      const img = els.heliImgs[i];
      const wrap = els.heliWraps[i];
      if (!img || !wrap) return;
      img.onload = () => {
        img.classList.add("loaded");
        wrap.classList.add("has-image");
      };
      img.onerror = () => {
        img.classList.remove("loaded");
        wrap.classList.remove("has-image");
      };
      img.src = src;
      img.alt = state.settings[i === 0 ? "team1Name" : "team2Name"];
    });
  }

  function openSettings() {
    els.team1NameInput.value = state.settings.team1Name;
    els.team2NameInput.value = state.settings.team2Name;
    if (els.showLaneLabelsInput) {
      els.showLaneLabelsInput.checked = state.settings.showLaneLabels !== false;
    }
    if (els.backgroundModeInput) {
      els.backgroundModeInput.value = state.settings.backgroundMode || DEFAULT_SETTINGS.backgroundMode;
    }
    els.likeStepsInput.value = state.settings.likesPerStep ?? 50;
    els.followStepsInput.value = state.settings.followSteps;
    els.subscribeStepsInput.value = state.settings.subscribeSteps;
    els.shareStepsInput.value = state.settings.shareSteps;
    els.memberStepsInput.value = state.settings.memberSteps;
    els.settingsPanel.classList.add("open");
  }

  function closeSettings() {
    els.settingsPanel.classList.remove("open");
  }

  function collectSettingsFromForm() {
    state.settings = {
      ...state.settings,
      team1Name: els.team1NameInput.value.trim() || "Türkiye",
      team2Name: els.team2NameInput.value.trim() || "Kürdistan",
      showLaneLabels: els.showLaneLabelsInput ? els.showLaneLabelsInput.checked : true,
      backgroundMode: BACKGROUND_MODES.includes(els.backgroundModeInput?.value)
        ? els.backgroundModeInput.value
        : DEFAULT_SETTINGS.backgroundMode,
      likesPerStep: Math.max(0, parseInt(els.likeStepsInput.value, 10) || 0),
      followSteps: Math.max(0, parseInt(els.followStepsInput.value, 10) || 0),
      subscribeSteps: Math.max(0, parseInt(els.subscribeStepsInput.value, 10) || 0),
      shareSteps: Math.max(0, parseInt(els.shareStepsInput.value, 10) || 0),
      memberSteps: Math.max(0, parseInt(els.memberStepsInput.value, 10) || 0),
    };
    saveSettings();
    applyBackgroundMode();
    loadHeliImages();
    syncUI();
    closeSettings();
  }

  let tikfinityClient = null;

  function initTikfinity() {
    if (!window.GemTokTikFinity) return;
    tikfinityClient = window.GemTokTikFinity.createClient({
      eventsPerFrame: 32,
      onPayloads: (batch) => {
        const picks = [];
        const rest = [];
        for (const p of batch) {
          if (p && p.type === "team_pick") picks.push(p);
          else rest.push(p);
        }
        for (const p of picks) handlePayload(p);
        for (const p of rest) handlePayload(p);
      },
      onStatus: (s) => {
        state.tikfinityPhase = s.phase;
        document.body.dataset.tikfinity = s.phase || "idle";
      },
    });
    tikfinityClient.startAuto();

    // Lisans aktifken hediye akmiyorsa yayinci fark etsin.
    if (window.GemTokLiveConnAlert) {
      window.GemTokLiveConnAlert.install({
        isLiveOk: () => state.tikfinityPhase === "connected",
        isEnabled: () => !window.GemTokTikFinity.isTikfinityAutoDisabled(),
        reconnect: () => tikfinityClient && tikfinityClient.reconnect(),
      });
    }
  }

  els.btnReset.addEventListener("click", () => resetRace(true));
  els.btnSettings.addEventListener("click", openSettings);
  els.btnCloseSettings.addEventListener("click", closeSettings);
  if (els.btnCancelSettings) els.btnCancelSettings.addEventListener("click", closeSettings);
  els.btnSaveSettings.addEventListener("click", collectSettingsFromForm);

  els.settingsPanel.addEventListener("click", (e) => {
    if (e.target === els.settingsPanel) closeSettings();
  });

  function isTypingTarget(el) {
    if (!el || !el.tagName) return false;
    const tag = el.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
  }

  function ensureTestJoin(pick, userId, nickname) {
    const team = teamFromSohbet(pick);
    if (team == null) return null;
    if (resolveUserTeam(userId, nickname) == null) {
      handleTeamPick({ pick, userId, nickname });
    }
    return team;
  }

  function testAdvance(pick, userId, nickname, steps, label) {
    const team = ensureTestJoin(pick, userId, nickname);
    if (team == null) return;
    advanceTeam(team, steps, nickname, label, { userId });
  }

  function testLike(pick, userId, nickname, likeCount) {
    ensureTestJoin(pick, userId, nickname);
    handlePayload({
      type: "like",
      userId,
      userIds: [userId],
      nickname,
      likeCount,
    });
  }

  function testShare(pick, userId, nickname) {
    ensureTestJoin(pick, userId, nickname);
    handlePayload({
      type: "share",
      userId,
      userIds: [userId],
      nickname,
    });
  }

  window.addEventListener("keydown", (e) => {
    if (isTypingTarget(e.target)) return;

    if (e.key === "1") handleTeamPick({ pick: "1", userId: "test_1", nickname: "Test 1" });
    if (e.key === "2") handleTeamPick({ pick: "2", userId: "test_2", nickname: "Test 2" });
    if (e.key === "q" || e.key === "Q") testAdvance("1", "test_1", "Test 1", 5, "Klavye +5");
    if (e.key === "e" || e.key === "E") testAdvance("2", "test_2", "Test 2", 5, "Klavye +5");
    if (e.key === "a" || e.key === "A") testLike("1", "test_1", "Test 1", 50);
    if (e.key === "d" || e.key === "D") testLike("2", "test_2", "Test 2", 50);
    if (e.key === "w" || e.key === "W") testShare("1", "test_1", "Test 1");
    if (e.key === "s" || e.key === "S") testShare("2", "test_2", "Test 2");
    if (e.key === "r" || e.key === "R") resetRace(true);
    if (e.key === "Escape") closeSettings();
  });

  loadHeliImages();
  applyBackgroundMode();
  syncUI();
  syncTeamWinsUI();
  renderLeaderboard();
  initTikfinity();
  window.addEventListener("resize", () => syncUI());
})();
