/**
 * STREAMXT — TikTok Live iki takım savaş oyunu
 * TikFinity yerel WebSocket + sunucu WebSocket / POST /api/event ile etkileşim gelir.
 */
/** GemTok sıra / farklı porttan açılınca API+WS bu köke yönlendirilir (3847 tespiti). */
let streamxtEmbedApiBase = null;

async function tryStreamxtPingOrigin(originStr) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 420);
  try {
    const href = new URL("/api/ping", originStr).href;
    const r = await fetch(href, { cache: "no-store", signal: ac.signal });
    if (!r.ok) return false;
    const j = await r.json().catch(() => null);
    return !!(j && j.ok === true && j.streamxt === true);
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/** Sayfa STREAMXT kökünde değilse (ör. npx serve ile sıra) yerel köprü portunu bul. */
async function resolveStreamxtEmbedApiBase() {
  streamxtEmbedApiBase = null;
  /** `file://` için `location.origin` ping yok; 127.0.0.1 port taraması gerekir (WS URL boş host düşmesin). */

  try {
    const sp = new URLSearchParams(location.search);
    const rawOverride = (sp.get("streamxtApi") || sp.get("streamxt") || "").trim();
    if (rawOverride) {
      const o = new URL(rawOverride);
      if (o.protocol === "http:" || o.protocol === "https:") {
        const hn0 = o.hostname.replace(/^\[|\]$/g, "");
        if (
          hn0 === "127.0.0.1" ||
          hn0 === "localhost" ||
          hn0 === "::1" ||
          hn0 === "0:0:0:0:0:0:0:1"
        ) {
          const hn = hn0 === "localhost" || hn0 === "::1" || hn0 === "0:0:0:0:0:0:0:1" ? "127.0.0.1" : hn0;
          const originTry = `${o.protocol}//${hn}${o.port ? `:${o.port}` : ""}`;
          if (await tryStreamxtPingOrigin(originTry)) {
            streamxtEmbedApiBase = originTry;
            return;
          }
        }
      }
    }
  } catch {
    /* */
  }

  if (location.protocol !== "file:" && (await tryStreamxtPingOrigin(location.origin))) return;

  const extra = Number(new URLSearchParams(location.search).get("streamxtPort"));
  const ports = [3847, 3850, Number.isFinite(extra) && extra > 0 && extra < 65536 ? extra : null].filter(
    (p, i, a) => p != null && a.indexOf(p) === i,
  );
  for (let i = 0; i < ports.length; i++) {
    const originTry = `http://127.0.0.1:${ports[i]}`;
    if (await tryStreamxtPingOrigin(originTry)) {
      streamxtEmbedApiBase = originTry;
      return;
    }
  }
}

/** Tam URL; göreli `/api` bazen yanlış köke gider */
function streamxtApiUrl(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  let base = streamxtEmbedApiBase;
  if (!base) {
    if (location.protocol !== "file:" && location.origin && location.origin !== "null") {
      base = location.origin;
    } else {
      base = "http://127.0.0.1:3847";
    }
  }
  try {
    return new URL(p, base).href;
  } catch {
    return p;
  }
}

/**
 * WebSocket kök adresi. `localhost` / `::1` → tarayıcı IPv6 kullanıp sunucu yalnız 0.0.0.0 dinliyorsa
 * WS düşer; döngü için 127.0.0.1 kullan. Diğer durumlarda `location.host` (IPv6 köşeli parantez korunur).
 */
function streamxtWsUrl() {
  if (streamxtEmbedApiBase) {
    try {
      const u = new URL(streamxtEmbedApiBase);
      const pp = u.protocol === "https:" ? "wss" : "ws";
      let hn = u.hostname.replace(/^\[|\]$/g, "");
      if (hn === "localhost" || hn === "::1" || hn === "0:0:0:0:0:0:0:1") hn = "127.0.0.1";
      return u.port ? `${pp}://${hn}:${u.port}` : `${pp}://${hn}`;
    } catch {
      /* */
    }
  }
  const proto = location.protocol === "https:" ? "wss" : "ws";
  try {
    const u = new URL(location.href);
    const hn = u.hostname.replace(/^\[|\]$/g, "");
    if (u.hostname === "localhost" || hn === "::1" || hn === "0:0:0:0:0:0:0:1") {
      return u.port ? `${proto}://127.0.0.1:${u.port}` : `${proto}://127.0.0.1`;
    }
  } catch {
    /* location.host */
  }
  /** `file://` veya host yok: `ws://` tek başına geçersiz; köprü varsayılanı 3847. */
  if (location.protocol === "file:" || !location.host) {
    return `${proto}://127.0.0.1:3847`;
  }
  return `${proto}://${location.host}`;
}

function streamxtApiErrorHint(status) {
  if (status === 404) {
    return `API not found (404). Current host: ${location.host} — Open this page only via BASLAT.bat or «npm start» in the project folder (default http://localhost:3847). VS Code Live Preview or static «public» servers have no /api/config. Close any old server window and try BASLAT.bat again.`;
  }
  return `Server response ${status}`;
}

/** Hata nesnesi / [object Object] HUD ve form için okunur metin */
function formatStreamxtError(value) {
  if (value == null) return "Unknown error";
  if (typeof value === "string") return value.trim() || "Unknown error";
  if (value instanceof Error) return value.message || "Error";
  if (typeof value === "object") {
    const ex = value.exception ?? value.err ?? value.error;
    if (ex instanceof Error && ex.message) return String(ex.message).trim();
    if (typeof ex?.message === "string" && ex.message.trim()) return ex.message.trim();
    if (typeof value.message === "string" && value.message.trim()) return value.message.trim();
    const inf = value.info;
    if (typeof inf === "string" && inf.trim()) return inf.trim();
    try {
      const j = JSON.stringify(value);
      if (j && j !== "{}") return j.length > 280 ? `${j.slice(0, 280)}…` : j;
    } catch {
      /* */
    }
  }
  const s = String(value);
  return s === "[object Object]" ? "Connection error (no details)." : s;
}

/** TikTok CDN → canvas CORS için sunucu proxy’si (`/api/avatar-image`) */
function allowedAvatarHost(hostname) {
  const h = String(hostname || "").toLowerCase();
  const ok = [
    "tiktokcdn.com",
    "tiktokcdn-eu.com",
    "tiktokcdn-us.com",
    "byteimg.com",
    "ibyteimg.com",
    "muscdn.com",
    "tiktokv.com",
    "tiktokv.eu",
    "tiktok.com",
  ];
  return ok.some((s) => h === s || h.endsWith("." + s));
}

function toAvatarLoadUrl(originalUrl) {
  const s = String(originalUrl || "").trim();
  if (!s) return "";
  try {
    if (s.includes("/api/avatar-image")) {
      const u = new URL(s, location.href);
      return streamxtApiUrl(`${u.pathname}${u.search}`);
    }
    const u = new URL(s, location.href);
    if (u.origin === location.origin) return streamxtApiUrl(`${u.pathname}${u.search}`);
    if (allowedAvatarHost(u.hostname)) {
      return streamxtApiUrl("/api/avatar-image?u=" + encodeURIComponent(s));
    }
  } catch {
    return s;
  }
  return s;
}

const H = 780;
/**
 * Sol / sağ arka plan yarım görseli tasarım boyutu (px).
 * Arena genişliği = 2 × (1023/1537) × H; daha büyük görseller çizimde cover + clip ile kırpılır.
 */
const BG_HALF_DESIGN_W = 1023;
const BG_HALF_DESIGN_H = 1537;
const ARENA_W = Math.round((2 * BG_HALF_DESIGN_W * H) / BG_HALF_DESIGN_H);
let W = ARENA_W;
let MID = W / 2;

/** <1: tüm simülasyon (hareket, mermi, yetenek süreleri) daha yavaş */
const GAME_PACE = 0.52;
/** Takım başına yapay izleyici birimi (0: yalnızca sohbet 1/2 ile katılan gerçek oyuncular) */
const CROWD_UNITS_PER_TEAM = 0;
/** Başlangıç bot düellosu (α/β) ve otomatik T önizlemesi */
const ENABLE_SIM_DUELISTS = false;
const ENABLE_LOCAL_PREVIEW_BATTLE = false;
/** «joined the room» / «Left · 1» yüzen metinleri */
const SHOW_JOIN_FLOAT_TEXT = false;
/** Mermi hızı katsayısı — eskiden kare başına; şimdi saniye ile: vx * dt * PROJ_PACE */
const PROJ_PACE = 50;
/** Oyuncu birimleri: otomatik ateş ve rakibe yönelme menzili (px, arena ~800 geniş) */
const PLAYER_FIRE_RANGE = 680;
const PLAYER_FOE_SEEK_RANGE = 560;
/** Gerçek oyuncu başlangıç canı; hediye 2× ile üst sınır HP_MAX_CAP */
const PLAYER_BASE_HP = 165;
const HP_MAX_CAP = 330;
/** Gerçek oyuncuya gelen hasar çarpanı (seyirci 1.0) — daha uzun adil çatışma */
const PLAYER_INCOMING_DMG_SCALE = 0.72;
/** Rakip oyuncu öldürünce katilin aldığı can (kurban maxHp × oran, üst sınır HP_MAX_CAP) */
const KILL_HP_TRANSFER_RATIO = 1;

/** Arena5Gen fizik parametreleri (game/arena5gen — dikdörtgen yarı arena uyarlaması) */
const WARFRONT_PHYS = {
  collisionRestitution: 0.82,
  tangentDampPair: 0.16,
  wallRestitution: 0.86,
  massExponent: 2,
  maxSpeedBase: 520,
  maxSpeedMassDivisor: 5200,
  minSpeedBase: 0,
  minSpeedRadiusFactor: 0.62,
  minSpeedThreeScale: 0.88,
  /** false: küme halindeyken zorunlu hız yörünge/dönme yaratmasın */
  enforceMinSpeed: false,
  /** Çarpışmada teğet hızı söndür (orbit kaymasını kes) */
  killTangentOnCollision: true,
  /** 3+ birim yakınsa ek hız sönümü */
  clusterOrbitDamp: 12,
  heavyPackRadius: 86,
  wallPassesHeavy: 12,
  wallPassesNormal: 9,
  colPassesHeavy: 2,
  colPassesNormal: 1,
  wallEdge: 10,
  spawnSpeed: 300,
  badgeFrameOut: 6,
  badgePhysPad: 4,
};

function unitPhysicsRadius(u) {
  const r = u.r || 22;
  return r + WARFRONT_PHYS.badgeFrameOut + WARFRONT_PHYS.badgePhysPad;
}

function randomUnitVelocityArena5Gen(speed) {
  const angle = Math.random() * Math.PI * 2;
  return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
}

function assignRandomUnitVelocity(u) {
  if (!u) return;
  Object.assign(u, randomUnitVelocityArena5Gen(WARFRONT_PHYS.spawnSpeed));
}

/** Arena5Gen resolveBallCollision — birim çifti */
function resolveArena5GenUnitCollision(a, b, playEffects) {
  if (!a || !b || a.hp <= 0 || b.hp <= 0) return;
  const rA = unitPhysicsRadius(a);
  const rB = unitPhysicsRadius(b);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 0.0001;
  const minDist = rA + rB;
  if (dist >= minDist) return;

  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = minDist - dist;
  a.x -= nx * (overlap / 2);
  a.y -= ny * (overlap / 2);
  b.x += nx * (overlap / 2);
  b.y += ny * (overlap / 2);

  const relVel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (relVel <= 0) {
    if (playEffects && Math.abs(relVel) > 120) {
      spawnParticles(
        a.x + nx * rA,
        a.y + ny * rA,
        3,
        "rgba(210, 198, 170, 0.55)",
        24,
        100
      );
    }
    const P = WARFRONT_PHYS;
    const e = P.collisionRestitution;
    const mA = Math.max(1, rA ** P.massExponent);
    const mB = Math.max(1, rB ** P.massExponent);
    const invSum = 1 / mA + 1 / mB;
    const j = (-(1 + e) * relVel) / invSum;
    a.vx -= (j / mA) * nx;
    a.vy -= (j / mA) * ny;
    b.vx += (j / mB) * nx;
    b.vy += (j / mB) * ny;
    const tx = -ny;
    const ty = nx;
    const relT = (b.vx - a.vx) * tx + (b.vy - a.vy) * ty;
    if (P.killTangentOnCollision) {
      a.vx += tx * relT * 0.5;
      a.vy += ty * relT * 0.5;
      b.vx -= tx * relT * 0.5;
      b.vy -= ty * relT * 0.5;
    } else {
      const jt = relT * P.tangentDampPair * 0.5;
      a.vx += tx * jt;
      a.vy += ty * jt;
      b.vx -= tx * jt;
      b.vy -= ty * jt;
    }
  }
}

/** Arena5Gen reflectOnArenaWall — takım yarısı dikdörtgen sınırlar */
function reflectUnitOnHalfArena(u, wallPasses) {
  const P = WARFRONT_PHYS;
  const r = unitPhysicsRadius(u);
  const e = P.wallRestitution;
  const EDGE = P.wallEdge;
  const ut = unitTeamId(u);
  const yPad = Math.max(64, r + 48);
  const minXGlobal = 36 + r;
  const maxXGlobal = W - 36 - r;

  for (let pass = 0; pass < wallPasses; pass++) {
    if (u.y < yPad) {
      u.y = yPad;
      if (u.vy < 0) u.vy -= (1 + e) * u.vy;
    } else if (u.y > H - yPad) {
      u.y = H - yPad;
      if (u.vy > 0) u.vy -= (1 + e) * u.vy;
    }

    if (ut === 0) {
      const maxX = Math.min(MID - r - EDGE, maxXGlobal);
      if (u.x < minXGlobal) {
        u.x = minXGlobal;
        if (u.vx < 0) u.vx -= (1 + e) * u.vx;
      }
      if (u.x > maxX) {
        u.x = maxX;
        if (u.vx > 0) u.vx -= (1 + e) * u.vx;
      }
    } else {
      const minX = Math.max(MID + r + EDGE, minXGlobal);
      if (u.x < minX) {
        u.x = minX;
        if (u.vx < 0) u.vx -= (1 + e) * u.vx;
      }
      if (u.x > maxXGlobal) {
        u.x = maxXGlobal;
        if (u.vx > 0) u.vx -= (1 + e) * u.vx;
      }
    }
  }
}

/** Arena5Gen stepPhysics — birim listesi */
function stepWarFrontUnitPhysics(dt) {
  const live = state.units.filter((u) => u.hp > 0);
  if (!live.length) return;

  const P = WARFRONT_PHYS;
  const maxRAll = Math.max(...live.map((u) => unitPhysicsRadius(u)), 36);
  let maxTeamCount = 0;
  for (let team = 0; team < 2; team++) {
    const c = live.filter((u) => unitTeamId(u) === team).length;
    if (c > maxTeamCount) maxTeamCount = c;
  }
  const nt = maxTeamCount;
  const heavyPack = nt >= 3 && maxRAll >= P.heavyPackRadius;
  const wallPasses = heavyPack ? P.wallPassesHeavy : P.wallPassesNormal;
  const colPasses = heavyPack ? P.colPassesHeavy : P.colPassesNormal;

  live.forEach((u) => {
    u.x += u.vx * dt;
    u.y += u.vy * dt;
  });

  live.forEach((u) => reflectUnitOnHalfArena(u, wallPasses));

  for (let pass = 0; pass < colPasses; pass++) {
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        resolveArena5GenUnitCollision(live[i], live[j], pass === 0);
      }
    }
  }

  live.forEach((u) => reflectUnitOnHalfArena(u, wallPasses));

  let minSpeed = 0;
  if (P.enforceMinSpeed) {
    minSpeed = Math.max(P.minSpeedBase, Math.min(210, 312 - maxRAll * P.minSpeedRadiusFactor));
    if (nt >= 3) minSpeed *= P.minSpeedThreeScale;
  }
  const maxSpeedGlobal = P.enforceMinSpeed
    ? Math.max(minSpeed + 45, Math.min(P.maxSpeedBase, 1580 / (1 + maxRAll * 0.011)))
    : Math.min(P.maxSpeedBase, 1580 / (1 + maxRAll * 0.011));

  live.forEach((u) => {
    let nearCount = 0;
    for (const o of live) {
      if (o === u) continue;
      const ddx = u.x - o.x;
      const ddy = u.y - o.y;
      if (ddx * ddx + ddy * ddy < (unitPhysicsRadius(u) + unitPhysicsRadius(o) + 24) ** 2) nearCount++;
    }
    if (nearCount >= 2 && P.clusterOrbitDamp > 0) {
      const damp = Math.exp(-P.clusterOrbitDamp * dt);
      u.vx *= damp;
      u.vy *= damp;
    }

    const rad = unitPhysicsRadius(u);
    const mass = Math.max(1, rad ** P.massExponent);
    const maxSp = maxSpeedGlobal / (1 + mass / P.maxSpeedMassDivisor);
    let speed = Math.hypot(u.vx, u.vy);
    if (P.enforceMinSpeed && speed < minSpeed) {
      const factor = minSpeed / (speed || 1);
      u.vx *= factor;
      u.vy *= factor;
      speed = minSpeed;
    }
    if (speed > maxSp) {
      const f = maxSp / speed;
      u.vx *= f;
      u.vy *= f;
    }
  });
}

const canvas = document.getElementById("game");
const canvasStage = document.querySelector(".canvas-stage");
const ctx = canvas.getContext("2d", { alpha: false });
if (typeof ctx.imageSmoothingQuality === "string") ctx.imageSmoothingQuality = "high";
ctx.imageSmoothingEnabled = true;

function setArenaSize(newW) {
  W = Math.max(800, Math.round(newW));
  MID = W / 2;
  canvas.width = W;
  canvas.height = H;
  if (canvasStage) canvasStage.style.aspectRatio = `${W} / ${H}`;
}

setArenaSize(W);

const state = {
  units: [],
  projectiles: [],
  beams: [],
  zones: [],
  floatTexts: [],
  particles: [],
  pickups: [],
  kills: [0, 0],
  /** 0 = Alpha, 1 = Bravo — kill / ölüm ile kayar (15–100) */
  teamMorale: [52, 52],
  startTime: performance.now(),
  userTeam: new Map(),
  screenShake: 0,
  edgeFlash: 0,
  pickupSpawnT: 0,
  mvpLeader: null,
  _mvpAcc: 0,
  /** TikTok LIVE bağlıyken: hediye/beğeni yalnızca sohbette 1 veya 2 yazanlara uygulanır */
  tiktokJoinGate: false,
  joinedByChat: new Set(),
  /** Oturumda en az bir kez gerçek hediye (beğeni/takip değil) atan kullanıcılar */
  giftGivers: new Set(),
  /** Raunt süresi (sn); config’ten güncellenir */
  matchDurationSec: 300,
  matchDeadlineMs: 0,
  matchOver: false,
  /** Oyuncu skor geçmişi (ölünce birim silinse bile) */
  matchPlayerLedger: new Map(),
};

let sfxCtx = null;
/** Tüm SFX buradan geçer — daha yüksek ve tok ses */
let sfxBus = null;
/** Ana gain kapalı (Web Audio çalışırken) */
let sfxOutputMuted = false;
const SFX_MASTER_GAIN = 0.58;

/**
 * Chrome: AudioContext ilk kez kullanıcı jesti OLMADAN oluşursa kalıcı sorun çıkabiliyor.
 * Bu yüzden bağlamı sadece tıklama/tuş vb. içinde oluşturuyoruz; WS ile gelen ses öncesi sessiz kalır.
 */
function sfxCreateContextInGesture() {
  if (sfxCtx) return sfxCtx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    sfxCtx = new AC();
    sfxBus = null;
    return sfxCtx;
  } catch {
    return null;
  }
}

function sfxGetBus(c) {
  if (sfxBus) return sfxBus;
  const master = c.createGain();
  master.gain.value = sfxOutputMuted ? 0 : SFX_MASTER_GAIN;
  const comp = c.createDynamicsCompressor();
  comp.threshold.setValueAtTime(-22, c.currentTime);
  comp.knee.setValueAtTime(14, c.currentTime);
  comp.ratio.setValueAtTime(3.5, c.currentTime);
  comp.attack.setValueAtTime(0.003, c.currentTime);
  comp.release.setValueAtTime(0.2, c.currentTime);
  master.connect(comp);
  comp.connect(c.destination);
  sfxBus = master;
  return sfxBus;
}

/** Chrome: resume() bitmeden osilatör başlatılırsa çıkış sessiz kalabilir */
async function sfxEnsureRunning() {
  const c = sfxCtx;
  if (!c) return false;
  if (c.state === "running") return true;
  try {
    await c.resume();
  } catch {
    return false;
  }
  return c.state === "running";
}

/**
 * Her jestte bağlamı oluştur (ilk seferde) ve resume iste — oluşturma yalnızca burada (pencere jest dinleyicileri).
 */
function sfxTouchFromUser() {
  const c = sfxCreateContextInGesture();
  if (!c) return;
  try {
    void c.resume();
  } catch {
    /* yoksay */
  }
  void sfxLoadSamples(c).catch(() => {});
  killMusicEnsureElements();
  killMusicUpdate();
}

const sfxGestureOpts = { capture: true, passive: true };
for (const ev of ["pointerdown", "mousedown", "click", "touchstart", "touchend", "keydown"]) {
  window.addEventListener(ev, sfxTouchFromUser, sfxGestureOpts);
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void sfxEnsureRunning();
});

let sfxUnlockThrottle = 0;

/** İlk Web Audio jesti: bağlam + resume + kısa test tonu */
function sfxTryUnlockFromGesture(ev) {
  const now = performance.now();
  if (now - sfxUnlockThrottle < 350) return;
  sfxUnlockThrottle = now;
  if (ev && typeof ev.preventDefault === "function") {
    ev.preventDefault();
    ev.stopPropagation();
  }
  const c = sfxCreateContextInGesture();
  if (!c) return;
  void c.resume();
  try {
    const bus = sfxGetBus(c);
    const t0 = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(175, t0);
    o.frequency.linearRampToValueAtTime(98, t0 + 0.16);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.18, t0 + 0.025);
    g.gain.linearRampToValueAtTime(0.0001, t0 + 0.2);
    o.connect(g).connect(bus);
    o.start(t0);
    o.stop(t0 + 0.2);
  } catch {
    /* yoksay */
  }
}

function applySfxOutputMute(muted) {
  sfxOutputMuted = !!muted;
  const c = sfxCtx;
  const bus = sfxBus;
  if (bus && c && c.state === "running") {
    const t = c.currentTime;
    try {
      bus.gain.cancelScheduledValues(t);
    } catch {
      /* */
    }
    bus.gain.setValueAtTime(sfxOutputMuted ? 0 : SFX_MASTER_GAIN, t);
  }
}

/** Kill skoruna göre Alpha=1.mp3 / Bravo=2.mp3; beraberlikte son lider çalar; değişince diğeri kaldığı yerden devam eder. */
const KILL_MUSIC_SRC = ["/assets/1.mp3", "/assets/2.mp3"];
const killMusicState = {
  a0: null,
  a1: null,
  leader: null,
  inited: false,
};
/** F3 ile açılır: kill müziği (şarkı) varsayılan kapalı; oyun SFX’inden bağımsız */
let killMusicMutedByUser = true;

function killMusicEnsureElements() {
  if (killMusicState.inited) return;
  killMusicState.inited = true;
  for (let i = 0; i < 2; i++) {
    const a = new Audio(KILL_MUSIC_SRC[i]);
    a.loop = false;
    a.preload = "auto";
    a.volume = 0.35;
    a.addEventListener("ended", () => {
      try {
        a.currentTime = 0;
      } catch {
        /* */
      }
      if (!killMusicMutedByUser && killMusicState.leader === i) {
        a.play().catch(() => {});
      }
    });
    if (i === 0) killMusicState.a0 = a;
    else killMusicState.a1 = a;
  }
}

function killMusicLeaderFromKills() {
  const k0 = state.kills[0] | 0;
  const k1 = state.kills[1] | 0;
  if (k0 > k1) return 0;
  if (k1 > k0) return 1;
  return null;
}

function killMusicUpdate() {
  killMusicEnsureElements();
  const L = killMusicLeaderFromKills();
  const a0 = killMusicState.a0;
  const a1 = killMusicState.a1;
  if (!a0 || !a1) return;
  killMusicState.leader = L;
  if (killMusicMutedByUser) {
    if (!a0.paused) a0.pause();
    if (!a1.paused) a1.pause();
    return;
  }
  if (L === null) return;
  if (L === 0) {
    if (!a1.paused) a1.pause();
    if (a0.paused) a0.play().catch(() => {});
  } else {
    if (!a0.paused) a0.pause();
    if (a1.paused) a1.play().catch(() => {});
  }
}

function killMusicResetForNewRound() {
  killMusicState.leader = null;
  const a0 = killMusicState.a0;
  const a1 = killMusicState.a1;
  if (a0) {
    a0.pause();
    try {
      a0.currentTime = 0;
    } catch {
      /* */
    }
  }
  if (a1) {
    a1.pause();
    try {
      a1.currentTime = 0;
    } catch {
      /* */
    }
  }
}

/** F1 = oyun SFX sessiz, F2 = SFX aç; F3 = kill şarkısı aç/kapat (varsayılan kapalı, kill ile otomatik başlamaz) */
function wireSfxFKeyMuteControls() {
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.defaultPrevented || e.repeat) return;
      if (e.code !== "F1" && e.code !== "F2" && e.code !== "F3") return;
      const ae = document.activeElement;
      if (
        ae &&
        (ae.tagName === "INPUT" ||
          ae.tagName === "TEXTAREA" ||
          ae.tagName === "SELECT" ||
          ae.isContentEditable)
      ) {
        return;
      }
      if (e.code === "F3") {
        e.preventDefault();
        e.stopPropagation();
        killMusicMutedByUser = !killMusicMutedByUser;
        killMusicUpdate();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (e.code === "F1") {
        applySfxOutputMute(true);
        return;
      }
      if (!sfxCtx || sfxCtx.state !== "running") {
        sfxOutputMuted = false;
        sfxTryUnlockFromGesture(null);
        void sfxEnsureRunning().then(() => applySfxOutputMute(false));
      } else {
        applySfxOutputMute(false);
      }
    },
    { capture: true }
  );
}

wireSfxFKeyMuteControls();

/** Basit kahverengi gürültü (daha tok, tiz değil) */
function sfxBrownNoiseBuffer(c, dur) {
  const len = Math.max(32, Math.ceil(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let br = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    br = (br + 0.038 * w) * 0.982;
    d[i] = br * (1 - i / len) ** 0.48;
  }
  return buf;
}

/** Filtreli gürültü vızıltısı — ok uçuşu / kanca hızı vb. */
function sfxFilteredNoise({
  dur = 0.12,
  vol = 0.22,
  fStart = 3400,
  fEnd = 220,
  Q = 0.85,
} = {}) {
  const c = sfxCtx;
  if (!c || c.state !== "running") return;
  const bus = sfxGetBus(c);
  const t0 = c.currentTime;
  const buf = sfxBrownNoiseBuffer(c, dur);
  const src = c.createBufferSource();
  src.buffer = buf;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.value = Q;
  lp.frequency.setValueAtTime(Math.max(120, fStart), t0);
  lp.frequency.linearRampToValueAtTime(Math.max(80, fEnd), t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(1e-4, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + Math.min(0.028, dur * 0.22));
  g.gain.linearRampToValueAtTime(1e-4, t0 + dur);
  src.connect(lp).connect(g).connect(bus);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

/** Ok / dart fırlaması: hava vızıltısı + yay gövdesi (alçak) */
function sfxArrowRelease() {
  const c = sfxCtx;
  if (!c || c.state !== "running") return;
  const bus = sfxGetBus(c);
  const t0 = c.currentTime;
  sfxFilteredNoise({ dur: 0.1, vol: 0.26, fStart: 4800, fEnd: 260, Q: 0.75 });
  const o = c.createOscillator();
  o.type = "triangle";
  o.frequency.setValueAtTime(165, t0 + 0.001);
  o.frequency.linearRampToValueAtTime(72, t0 + 0.055);
  const g = c.createGain();
  g.gain.setValueAtTime(1e-4, t0 + 0.002);
  g.gain.linearRampToValueAtTime(0.2, t0 + 0.022);
  g.gain.linearRampToValueAtTime(1e-4, t0 + 0.085);
  o.connect(g).connect(bus);
  o.start(t0 + 0.001);
  o.stop(t0 + 0.1);
}

/** Yumruk / çarpma gövdesi */
function sfxImpactThud({ hard = false } = {}) {
  const c = sfxCtx;
  if (!c || c.state !== "running") return;
  const bus = sfxGetBus(c);
  const t0 = c.currentTime;
  const dur = hard ? 0.09 : 0.065;
  sfxFilteredNoise({ dur, vol: hard ? 0.24 : 0.16, fStart: 2200, fEnd: 140, Q: 1.1 });
  const o = c.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(hard ? 95 : 78, t0);
  o.frequency.linearRampToValueAtTime(hard ? 42 : 38, t0 + dur * 0.95);
  const g = c.createGain();
  g.gain.setValueAtTime(1e-4, t0);
  g.gain.linearRampToValueAtTime(hard ? 0.26 : 0.18, t0 + 0.012);
  g.gain.linearRampToValueAtTime(1e-4, t0 + dur + 0.02);
  o.connect(g).connect(bus);
  o.start(t0);
  o.stop(t0 + dur + 0.04);
}

/** freq: Hz, sweep: hedef farkı, noise 0–1 */
function sfxTone({ freq = 440, dur = 0.1, type = "sine", vol = 0.14, sweep = 0, noise = 0 }) {
  const c = sfxCtx;
  if (!c || c.state !== "running") return;
  const bus = sfxGetBus(c);
  const t0 = c.currentTime;

  if (noise > 0) {
    const buf = sfxBrownNoiseBuffer(c, dur);
    const src = c.createBufferSource();
    src.buffer = buf;
    const ng = c.createGain();
    ng.gain.setValueAtTime(Math.max(1e-4, noise * 0.36), t0);
    ng.gain.linearRampToValueAtTime(1e-4, t0 + dur);
    src.connect(ng).connect(bus);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  if (freq > 0) {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (sweep) o.frequency.linearRampToValueAtTime(Math.max(30, freq + sweep), t0 + dur * 0.95);
    const g = c.createGain();
    g.gain.setValueAtTime(1e-4, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + Math.min(0.02, dur * 0.2));
    g.gain.linearRampToValueAtTime(1e-4, t0 + dur);
    o.connect(g).connect(bus);
    o.start(t0);
    o.stop(t0 + dur + 0.06);
  }
}

/** Mixkit önizleme MP3 — https://mixkit.co/free-sound-effects/ (Mixkit License) */
const SFX_URLS = {
  spawn: "/assets/sfx/spawn_whoosh.mp3",
  missile: "/assets/sfx/arrow_missile.mp3",
  beam: "/assets/sfx/laser_beam.mp3",
  storm: "/assets/sfx/gun_laser.mp3",
  thunder: "/assets/sfx/electric_thunder.mp3",
  tornado: "/assets/sfx/whoosh_tornado.mp3",
  lotus: "/assets/sfx/magic_lotus.mp3",
  murad: "/assets/sfx/blade_murad.mp3",
  dragon: "/assets/sfx/dragon_swoosh.mp3",
  hook: "/assets/sfx/hook_whoosh.mp3",
  hit: "/assets/sfx/hit_impact.mp3",
  kill: "/assets/sfx/explosion_kill.mp3",
  combo: "/assets/sfx/combo_chime.mp3",
};

const SFX_SAMPLE_GAIN = {
  spawn: 0.32,
  missile: 0.4,
  beam: 0.3,
  storm: 0.26,
  thunder: 0.38,
  tornado: 0.28,
  lotus: 0.24,
  murad: 0.26,
  dragon: 0.3,
  hook: 0.36,
  hit: 0.4,
  kill: 0.36,
  combo: 0.36,
};

/** @type {Map<string, AudioBuffer> | null} */
let sfxSampleMap = null;
/** @type {Promise<Map<string, AudioBuffer>> | null} */
let sfxSampleLoadPromise = null;

function sfxPlayBuffer(c, buf, { vol = 0.45, rate = 1 } = {}) {
  if (!c || c.state !== "running" || !buf) return;
  const bus = sfxGetBus(c);
  const t0 = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = c.createGain();
  g.gain.setValueAtTime(1e-4, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.022);
  src.connect(g).connect(bus);
  const dur = buf.duration / Math.max(0.25, rate);
  src.start(t0);
  src.stop(t0 + dur + 0.04);
}

async function sfxLoadSamples(ctx) {
  if (sfxSampleMap) return sfxSampleMap;
  if (sfxSampleLoadPromise) return sfxSampleLoadPromise;
  sfxSampleLoadPromise = (async () => {
    const m = new Map();
    for (const [key, url] of Object.entries(SFX_URLS)) {
      try {
        const res = await fetch(url, { cache: "force-cache" });
        if (!res.ok) continue;
        const ab = await res.arrayBuffer();
        const buf = await ctx.decodeAudioData(ab.slice(0));
        m.set(key, buf);
      } catch {
        /* dosya yok / file:// / decode hatası */
      }
    }
    sfxSampleMap = m;
    return m;
  })();
  return sfxSampleLoadPromise;
}

/** Çok oyuncuda ses yığılmasını azaltır (hit / combo) */
const sfxGateT = { hit: 0, combo: 0, spawn: 0 };
function playSfx(name) {
  const t = performance.now() * 0.001;
  if (name === "hit") {
    if (t - sfxGateT.hit < 0.08) return;
    sfxGateT.hit = t;
  } else if (name === "combo") {
    if (t - sfxGateT.combo < 0.4) return;
    sfxGateT.combo = t;
  } else if (name === "spawn") {
    if (t - sfxGateT.spawn < 0.14) return;
    sfxGateT.spawn = t;
  }
  void runSfx(name);
}

function runSfxSynth(name) {
  const c = sfxCtx;
  if (!c || c.state !== "running") return;
  try {
    switch (name) {
      case "spawn":
        sfxFilteredNoise({ dur: 0.12, vol: 0.11, fStart: 1200, fEnd: 200, Q: 0.85 });
        break;
      case "missile":
        sfxArrowRelease();
        break;
      case "beam":
        sfxFilteredNoise({ dur: 0.22, vol: 0.1, fStart: 700, fEnd: 120, Q: 0.7 });
        break;
      case "storm":
        for (let i = 0; i < 3; i++)
          setTimeout(() => {
            sfxFilteredNoise({
              dur: 0.06,
              vol: 0.08,
              fStart: 1400 - i * 200,
              fEnd: 220,
              Q: 0.75,
            });
          }, i * 38);
        break;
      case "thunder":
        sfxFilteredNoise({ dur: 0.28, vol: 0.13, fStart: 380, fEnd: 50, Q: 1.05 });
        sfxTone({ freq: 52, dur: 0.22, type: "sine", vol: 0.12, noise: 0.35 });
        break;
      case "tornado":
        sfxFilteredNoise({ dur: 0.22, vol: 0.12, fStart: 1600, fEnd: 140, Q: 0.72 });
        break;
      case "lotus":
        sfxTone({ freq: 120, dur: 0.2, type: "sine", vol: 0.1, sweep: 60 });
        break;
      case "murad":
        sfxTone({ freq: 100, dur: 0.14, type: "triangle", vol: 0.09, sweep: -30 });
        break;
      case "dragon":
        sfxFilteredNoise({ dur: 0.16, vol: 0.11, fStart: 500, fEnd: 90, Q: 0.95 });
        break;
      case "hook":
        sfxFilteredNoise({ dur: 0.07, vol: 0.16, fStart: 4000, fEnd: 400, Q: 0.75 });
        break;
      case "hit":
        sfxImpactThud({ hard: false });
        break;
      case "kill":
        sfxImpactThud({ hard: true });
        break;
      case "combo":
        sfxTone({ freq: 220, dur: 0.14, type: "triangle", vol: 0.09, sweep: 120 });
        break;
      default:
        sfxTone({ freq: 155, dur: 0.07, type: "sine", vol: 0.07, sweep: -40 });
    }
  } catch {
    /* tarayıcı sesi kapalı olabilir */
  }
}

async function runSfx(name) {
  if (!(await sfxEnsureRunning())) return;
  const c = sfxCtx;
  try {
    const m = await sfxLoadSamples(c);
    const buf = m.get(name);
    const gBase = SFX_SAMPLE_GAIN[name] ?? 0.4;
    if (buf) {
      if (name === "storm") {
        sfxPlayBuffer(c, buf, { vol: gBase * 0.92, rate: 0.98 + Math.random() * 0.05 });
        setTimeout(() => {
          if (!sfxCtx || sfxCtx.state !== "running") return;
          sfxPlayBuffer(sfxCtx, buf, { vol: gBase * 0.55, rate: 1.04 + Math.random() * 0.06 });
        }, 45);
        return;
      }
      if (name === "combo") {
        sfxPlayBuffer(c, buf, { vol: gBase * 0.88, rate: 1.02 });
        return;
      }
      sfxPlayBuffer(c, buf, { vol: gBase, rate: 0.98 + Math.random() * 0.04 });
      return;
    }
  } catch {
    /* ağ / decode */
  }
  runSfxSynth(name);
}

function addShake(amt) {
  state.screenShake = Math.min(11, state.screenShake + amt * 0.55);
}

function spawnParticles(x, y, count, color, speedMin = 48, speedMax = 160) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = speedMin + Math.random() * (speedMax - speedMin);
    state.particles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0.1 + Math.random() * 0.32,
      color,
      size: 0.7 + Math.random() * 2.2,
      drag: 5.2 + Math.random() * 2.5,
      gy: 220 + Math.random() * 180,
    });
  }
}

function updateParticles(dt) {
  for (const p of state.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += (p.gy ?? 260) * dt;
    const k = Math.max(0, 1 - p.drag * dt);
    p.vx *= k;
    p.vy *= k;
    p.life -= dt;
  }
  state.particles = state.particles.filter((p) => p.life > 0);
}

const avatarCache = new Map();
const AVATAR_CACHE_MAX = 72;

/** Arka plan yolları — `loadConfig` ile `/api/config` üzerinden güncellenir */
let bgLeftPath = "/assets/sol.png";
let bgRightPath = "/assets/sag.png";
let bgCacheBust = 0;
const bgScreen = { left: null, right: null };
/** file://: Ayarlardan seçilen arka planlar (sunucu olmadan bu oturumda) */
let bgLocalOverrideLeft = null;
let bgLocalOverrideRight = null;

function bgUrl(path) {
  const p = String(path || "").trim() || "/assets/sol.png";
  if (location.protocol === "file:" && p.startsWith("/assets/")) {
    return `assets/${p.slice("/assets/".length)}`;
  }
  const sep = p.includes("?") ? "&" : "?";
  return `${p}${sep}cb=${bgCacheBust}`;
}

function loadImageOnce(src) {
  return new Promise((resolve) => {
    const im = new Image();
    im.decoding = "async";
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = src;
  });
}

function createFallbackBgImage(side) {
  const cw = BG_HALF_DESIGN_W;
  const ch = BG_HALF_DESIGN_H;
  const c = document.createElement("canvas");
  c.width = cw;
  c.height = ch;
  const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, cw, ch);
  if (side === "left") {
    g.addColorStop(0, "#1a3a5c");
    g.addColorStop(0.45, "#102638");
    g.addColorStop(1, "#081018");
  } else {
    g.addColorStop(0, "#081018");
    g.addColorStop(0.55, "#381828");
    g.addColorStop(1, "#5c1a2a");
  }
  x.fillStyle = g;
  x.fillRect(0, 0, cw, ch);
  x.strokeStyle = "rgba(255,255,255,0.07)";
  x.lineWidth = 2;
  const step = Math.max(48, Math.floor(ch / 12));
  for (let i = 0; i < 12; i++) {
    x.beginPath();
    x.moveTo(0, i * step);
    x.lineTo(cw, i * step + step * 0.45);
    x.stroke();
  }
  x.fillStyle = side === "left" ? "rgba(77,163,255,0.12)" : "rgba(255,77,94,0.12)";
  x.fillRect(0, 0, cw, ch);
  const im = new Image();
  im.src = c.toDataURL("image/png");
  return new Promise((resolve) => {
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
  });
}

function syncArenaSizeFromBackgrounds() {
  setArenaSize(Math.round((2 * BG_HALF_DESIGN_W * H) / BG_HALF_DESIGN_H));
}

async function loadBackgroundImages() {
  const fileProto = location.protocol === "file:";
  const loadLeft =
    fileProto && bgLocalOverrideLeft != null
      ? Promise.resolve(bgLocalOverrideLeft)
      : loadImageOnce(bgUrl(bgLeftPath));
  const loadRight =
    fileProto && bgLocalOverrideRight != null
      ? Promise.resolve(bgLocalOverrideRight)
      : loadImageOnce(bgUrl(bgRightPath));
  const [left, right] = await Promise.all([loadLeft, loadRight]);
  bgScreen.left = left || (await createFallbackBgImage("left"));
  bgScreen.right = right || (await createFallbackBgImage("right"));
  syncArenaSizeFromBackgrounds();
}

async function reloadBackgroundsAfterSettings() {
  bgCacheBust = Date.now();
  await loadBackgroundImages();
}

/** Görseli kırpmadan hedef dikdörtene sığdır (letterbox) */
function drawImageContain(ctx2, im, dx, dy, dw, dh) {
  if (!im || !im.naturalWidth) return;
  const iw = im.naturalWidth;
  const ih = im.naturalHeight;
  const s = Math.min(dw / iw, dh / ih);
  const rw = iw * s;
  const rh = ih * s;
  ctx2.drawImage(im, 0, 0, iw, ih, dx + (dw - rw) / 2, dy + (dh - rh) / 2, rw, rh);
}

/** Alanı doldur; taşan (çoğunlukla sol/sağ) kırpılır — object-fit: cover + clip */
function drawImageCoverClipped(ctx2, im, dx, dy, dw, dh) {
  if (!im || !im.naturalWidth) return;
  ctx2.save();
  ctx2.beginPath();
  ctx2.rect(dx, dy, dw, dh);
  ctx2.clip();
  const iw = im.naturalWidth;
  const ih = im.naturalHeight;
  const s = Math.max(dw / iw, dh / ih);
  const rw = iw * s;
  const rh = ih * s;
  const ox = dx + (dw - rw) / 2;
  const oy = dy + (dh - rh) / 2;
  ctx2.drawImage(im, 0, 0, iw, ih, ox, oy, rw, rh);
  ctx2.restore();
}

function drawGround() {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, W, H);
  if (bgScreen.left) {
    drawImageCoverClipped(ctx, bgScreen.left, 0, 0, MID, H);
  }
  if (bgScreen.right) {
    drawImageCoverClipped(ctx, bgScreen.right, MID, 0, W - MID, H);
  }
  ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
  ctx.fillRect(MID - 2, 0, 4, H);
}

function getCachedAvatar(url) {
  if (!url) return null;
  if (avatarCache.has(url)) return avatarCache.get(url);
  while (avatarCache.size >= AVATAR_CACHE_MAX) {
    const first = avatarCache.keys().next().value;
    if (first === undefined) break;
    avatarCache.delete(first);
  }
  const original = String(url).trim();
  const proxied = toAvatarLoadUrl(original);
  const primary = proxied || original;
  const useFallback = Boolean(proxied && proxied !== original);

  const entry = { img: new Image(), ready: false, _phase: useFallback ? "proxy" : "only" };

  function wire(image, loadUrl, withCors) {
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    if (withCors) {
      try {
        const t = new URL(loadUrl, location.href);
        if (t.origin === location.origin) image.crossOrigin = "anonymous";
        else image.removeAttribute("crossOrigin");
      } catch {
        image.removeAttribute("crossOrigin");
      }
    } else {
      image.removeAttribute("crossOrigin");
    }
    image.onload = () => {
      entry.ready = true;
    };
    image.onerror = () => {
      if (entry._phase === "proxy") {
        entry._phase = "direct";
        const im2 = new Image();
        wire(im2, original, false);
        entry.img = im2;
        return;
      }
      entry.ready = false;
    };
    image.src = loadUrl;
  }

  wire(entry.img, primary, true);
  avatarCache.set(url, entry);
  return entry;
}

/** TikTok hediye / etkileşim anahtarı (normalize) → oyun yeteneği — yayın legendası ile uyumlu */
const GIFT_MAP = {
  /** Gül → MISSILE */
  rose: "missile",
  roses: "missile",
  tiny_rose: "missile",
  /** Daha süslü gül / “bling” gül → BULLET STORM */
  bling_rose: "bullet_storm",
  galaxy_rose: "bullet_storm",
  gold_rose: "bullet_storm",
  rich_rose: "bullet_storm",
  super_rose: "bullet_storm",
  blooming_rose: "bullet_storm",
  detailed_rose_bloom: "bullet_storm",
  /** TikTok logosu / parmak kalp → LEISURE */
  tiktok: "leisure",
  finger: "leisure",
  finger_heart: "leisure",
  good_finger: "leisure",
  /** Ağırlık / para → BULLET STORM */
  dumbbell: "bullet_storm",
  money: "bullet_storm",
  /** Hediye kutusu → THUNDER BRIDGE */
  gift_box: "thunder_bridge",
  mystery_box: "thunder_bridge",
  /** Halka / fırlanan halka → Tornado */
  donut: "tornado",
  doughnut: "tornado",
  swirl: "tornado",
  /** Lotus / alev kalp → FIRE LOTUS */
  lotus: "fire_lotus",
  fire_heart: "fire_lotus",
  burning_heart: "fire_lotus",
  /** Taç / kanatlı kalp / “bulut” maskot → MURAD */
  crown: "murad",
  heart_wings: "murad",
  ghost: "murad",
  cloud: "murad",
  /** Ejder → Dragon's Palm */
  dragon: "dragons_palm",
  /** Yumruk / hazine → ALL COMBO */
  treasure_chest: "all_combo",
  boxing_glove: "all_combo",
  punch: "all_combo",
  fist: "all_combo",
  empire_treasure: "all_combo",
  /** Beğeni (kalp) → MISSILE; takip → HOOK */
  like: "missile",
  follow: "hook",
};

const LEGEND_ROWS = [
  { cls: "rose", label: "Rose → MISSILE", id: "rose" },
  { cls: "tiktok", label: "TikTok / finger → LEISURE", id: "tiktok" },
  { cls: "dumbbell", label: "Dumbbell / money → BULLET STORM", id: "dumbbell" },
  { cls: "box", label: "Gift box → THUNDER BRIDGE", id: "gift_box" },
  { cls: "donut", label: "Donut → Tornado", id: "donut" },
  { cls: "lotus", label: "Lotus → FIRE LOTUS", id: "lotus" },
  { cls: "crown", label: "Crown / cloud → MURAD", id: "crown" },
  { cls: "dragon", label: "Dragon → flying dragon + fire", id: "dragon" },
  { cls: "chest", label: "Glove / chest → ALL COMBO", id: "treasure_chest" },
];

/** Legend satırlarına karşılık tipik TikTok elmas (jeton) — bilinmeyen hediyede en yakın yetenek için */
const LEGEND_DIAMOND_BY_ID = {
  rose: 1,
  tiktok: 5,
  dumbbell: 15,
  donut: 40,
  gift_box: 120,
  lotus: 400,
  crown: 1400,
  dragon: 5000,
  treasure_chest: 12000,
};

function nearestLegendGiftByDiamond(diamonds) {
  const d = Number(diamonds) || 0;
  const rows = LEGEND_ROWS.map((row) => ({
    id: row.id,
    ref: LEGEND_DIAMOND_BY_ID[row.id] ?? 1,
  }));
  let best = rows[0];
  let bestDist = Math.abs(d - best.ref);
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const dist = Math.abs(d - row.ref);
    if (dist < bestDist || (dist === bestDist && row.ref < best.ref)) {
      best = row;
      bestDist = dist;
    }
  }
  return best;
}

/** `GIFT_MAP` isabeti yoksa jeton (diamond) ile legendadaki en yakın hediyenin yeteneği ve profil anahtarı */
function resolveGiftAbilityAndProfileKey(p, giftId) {
  const gid = String(giftId || "").trim().toLowerCase();
  const gk = String(p.giftKey || "").trim().toLowerCase();
  if (gid && Object.prototype.hasOwnProperty.call(GIFT_MAP, gid)) {
    return { ability: GIFT_MAP[gid], profileKey: gid };
  }
  if (gk && Object.prototype.hasOwnProperty.call(GIFT_MAP, gk)) {
    return { ability: GIFT_MAP[gk], profileKey: gk };
  }
  const diamonds = readPayloadGiftDiamonds(p);
  if (diamonds > 0) {
    const n = nearestLegendGiftByDiamond(diamonds);
    return { ability: GIFT_MAP[n.id], profileKey: n.id };
  }
  return { ability: "missile", profileKey: "rose" };
}

/** Jeton ~500 / para tabancası: elmas eksik olsa bile mega paket için isim ipuçları */
function looksLikelyJeton500MoneyGun(p, giftId) {
  const s = `${String(giftId || "")} ${String(p?.giftName || "")} ${String(p?.gift?.name || "")} ${String(p?.describe || "")}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (/\b500\b|x500|500_|_500|besyuz|bes\s*yuz|five\s*hundred/i.test(s) && /money|cash|para|jeton|coin|currency|bank/i.test(s))
    return true;
  if (/(money|cash|para)_?(gun|cannon|shooter|blast|rain)|gun_?(money|cash)|para_?tabanc|money_?gun|cash_?gun|cannon_?money/i.test(s))
    return true;
  return false;
}

/** Rakip takımın tüm birimleri (seyirci dahil) + rakip mermi / alan etkileri — mega jeton */
function wipeEntireEnemyBattlefield(actor) {
  if (!actor) return;
  const t = unitTeamId(actor);
  const foe = t === 0 ? 1 : 0;
  for (const u of state.units) {
    if (unitTeamId(u) === t || u.hp <= 0) continue;
    u.lastHitBy = actor.userId;
    if (isCrowdUnit(u)) u.noKillScore = true;
    u.hp = 0;
  }
  state.projectiles = state.projectiles.filter((pr) => pr.team !== foe);
  state.beams = state.beams.filter((b) => b.team !== foe);
  state.zones = state.zones.filter((z) => z.team !== foe);
}

/** WS / webhook hediye yükü: köprü `diamondCount` veya ham TikTok alanları */
function readPayloadGiftDiamonds(p) {
  if (!p || typeof p !== "object") return 0;
  const from = (o) => diamondFromGiftLikeObject(o);
  return (
    coercePositiveGiftDiamond(p.diamondCount) ||
    coercePositiveGiftDiamond(p.diamonds) ||
    coercePositiveGiftDiamond(p.diamond_count) ||
    coercePositiveGiftDiamond(p.coinCount) ||
    coercePositiveGiftDiamond(p.coins) ||
    coercePositiveGiftDiamond(p.price) ||
    from(p.giftDetails) ||
    from(p.gift_detail) ||
    from(p.extendedGiftInfo) ||
    from(p.gift) ||
    from(p?.gift?.giftDetails) ||
    from(p?.gift?.gift_detail) ||
    from(p?.gift?.extendedGiftInfo) ||
    0
  );
}

function coercePositiveGiftDiamond(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "bigint") {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  }
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.round(v));
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return 0;
    const n = Number(t);
    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  }
  if (typeof v === "object") {
    if (typeof v.toNumber === "function") {
      try {
        const n = Number(v.toNumber());
        return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
      } catch {
        /* */
      }
    }
    if (typeof v.low === "number" && typeof v.high === "number") {
      const n = v.low + v.high * 0x100000000;
      return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
    }
  }
  return 0;
}

function diamondFromGiftLikeObject(o) {
  if (!o || typeof o !== "object") return 0;
  return (
    coercePositiveGiftDiamond(o.diamondCount) ||
    coercePositiveGiftDiamond(o.diamond_count) ||
    coercePositiveGiftDiamond(o.coinCount) ||
    coercePositiveGiftDiamond(o.coin_count) ||
    coercePositiveGiftDiamond(o.coins) ||
    coercePositiveGiftDiamond(o.price) ||
    0
  );
}

/**
 * TikTok `diamondCount` jeton bandı — isim haritasından önce uygulanır.
 * 1 = tek ağır mermi; 2–15 = 5 ağır; 16+ diğer paketler.
 */
function resolveJetonDiamondPackAbility(diamonds) {
  const v = Math.round(Number(diamonds) || 0);
  if (v <= 0) return null;
  if (v >= 380 && v <= 580) return "jeton_mega_500";
  if (v >= 140 && v <= 210) return "jeton_dragon_wipe";
  if (v >= 85 && v <= 120) return "jeton_lotus_all";
  if (v >= 26 && v <= 36) return "jeton_vortex";
  if (v >= 16 && v <= 25) return "jeton_lightning_10";
  if (v === 1) return "jeton_heavy_1";
  if (v >= 2 && v <= 15) return "jeton_big5";
  return null;
}

/** Sohbette 1/2 ile seçilen takımı koru; yalnızca payload’da açık alpha/bravo/0/1 varsa güncelle */
function resolveTeamForUser(userId, hint) {
  if (hint === "alpha" || hint === 0 || hint === "0") return 0;
  if (hint === "bravo" || hint === 1 || hint === "1") return 1;
  const s = hint != null ? String(hint).toLowerCase() : "";
  if (s === "alpha") return 0;
  if (s === "bravo") return 1;
  const prev = state.userTeam.get(userId);
  if (prev === 0 || prev === 1) return prev;
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return h % 2;
}

/** 0 veya 1 — mermi / AoE için (köprü bazen takımı string gönderir; yanlış eşleşme dost ateşi yapar) */
function unitTeamId(u) {
  if (u == null || typeof u !== "object") return 0;
  const x = u.team;
  if (x === 1 || x === "1" || x === true) return 1;
  if (typeof x === "string") {
    const s = x.trim().toLowerCase();
    if (s === "bravo" || s === "right" || s === "sağ" || s === "2" || s === "b") return 1;
    if (s === "alpha" || s === "left" || s === "sol" || s === "0" || s === "a") return 0;
  }
  const n = Number(x);
  if (Number.isFinite(n) && n === 1) return 1;
  return 0;
}

function colorForUser(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h ^= id.charCodeAt(i), h = Math.imul(h, 16777619);
  const hue = h % 360;
  return `hsl(${hue} 70% 55%)`;
}

/** Başlangıç avatar yarıçapı; hediyelerle büyür (üst sınır PROFILE_R_MAX) */
const PROFILE_R_MIN = 22;
const PROFILE_R_MAX = 44;
const POWER_MAX = 2.85;

/** Hediye atan gerçek oyuncular: max / mevcut can 2× (HP_MAX_CAP ile sınırlı) */
function applyGiftGiverDoubleHp(unit) {
  if (!unit || isCrowdUnit(unit) || unit.hp <= 0) return;
  const m = Math.min(HP_MAX_CAP, Math.round((unit.maxHp || PLAYER_BASE_HP) * 2));
  unit.maxHp = m;
  unit.hp = Math.min(m, Math.round((unit.hp || m) * 2));
}

/** Hediye kimliğine göre profil yarıçapına eklenecek piksel (yoksa ~ucuz hediye) */
const GIFT_PROFILE_DELTA = {
  like: 1.14,
  rose: 1.15,
  follow: 1.05,
  tiktok: 1.75,
  finger: 1.75,
  dumbbell: 2,
  money: 2,
  gift_box: 2.65,
  donut: 2.15,
  lotus: 2.35,
  fire_heart: 2.35,
  crown: 2.75,
  heart_wings: 2.75,
  dragon: 3.1,
  treasure_chest: 4.8,
  /** Rakip gerçek oyuncu öldürme — cleanupDead içinde */
  kill_reward: 0.98,
};

function growUnitFromGift(unit, giftId, opts = {}) {
  if (!unit || unit.hp <= 0) return;
  const raw = (giftId || "").toLowerCase().replace(/\s+/g, "_");
  const base = GIFT_PROFILE_DELTA[raw] ?? 1.05;
  const scale =
    opts && typeof opts.scale === "number" && opts.scale > 0
      ? Math.min(2.6, Math.max(0.55, opts.scale))
      : 1;
  const add = base * scale;
  unit.r = Math.min(PROFILE_R_MAX, Math.max(PROFILE_R_MIN, (unit.r || PROFILE_R_MIN) + add));
  unit.power = Math.min(POWER_MAX, (unit.power || 1) + add * 0.065);
  unit.maxHp = Math.min(HP_MAX_CAP, unit.maxHp + add * 1.25);
  const heal = Math.min(38, 6 + add * 3.2);
  unit.hp = Math.min(unit.maxHp, unit.hp + heal);
}

function spawnUnit(userId, nickname, team, avatarUrl, opts = {}) {
  const teamN = unitTeamId({ team });
  let u = state.units.find((x) => x.userId === userId);
  if (u) {
    if (avatarUrl) u.avatarUrl = avatarUrl;
    if (!u.trail) u.trail = [];
    if (u.animBirth === undefined) u.animBirth = 1;
    if (u.hitFlash === undefined) u.hitFlash = 0;
    if (u.r == null || u.r < PROFILE_R_MIN) u.r = PROFILE_R_MIN;
    if (u.power == null || u.power < 1) u.power = 1;
    if (u.damageDealt === undefined) u.damageDealt = 0;
    if (u.kills === undefined) u.kills = 0;
    if (u.killStreak === undefined) u.killStreak = 0;
    if (u.shield === undefined) u.shield = 0;
    if (u.lastHitBy === undefined) u.lastHitBy = null;
    if (!isCrowdUnit(u) && unitTeamId(u) !== teamN) {
      u.team = teamN;
      placeJoinerOnTeamHalf(u, teamN);
    }
    return u;
  }
  const y = 140 + Math.random() * (H - 280);
  const x = teamN === 0 ? 80 + Math.random() * (MID - 120) : MID + 80 + Math.random() * (MID - 120);
  const crowd = String(userId).startsWith("crowd_");
  const baseHp = crowd
    ? Math.max(48, Math.round(PLAYER_BASE_HP * 0.58))
    : !crowd && state.giftGivers.has(userId)
      ? Math.min(HP_MAX_CAP, PLAYER_BASE_HP * 2)
      : PLAYER_BASE_HP;
  u = {
    userId,
    nickname: nickname?.slice(0, 16) || "?",
    team: teamN,
    x,
    y,
    vx: 0,
    vy: 0,
    hp: baseHp,
    maxHp: baseHp,
    r: PROFILE_R_MIN,
    cd: 0,
    power: 1,
    avatarUrl: avatarUrl || "",
    trail: [],
    animBirth: 0,
    hitFlash: 0,
    damageDealt: 0,
    kills: 0,
    killStreak: 0,
    shield: 0,
    lastHitBy: null,
  };
  assignRandomUnitVelocity(u);
  state.units.push(u);
  if (!opts.silent) playSfx("spawn");
  return u;
}

function nearestEnemy(from, maxDist = 9999) {
  const ft = unitTeamId(from);
  let best = null;
  let d2 = maxDist * maxDist;
  for (const e of state.units) {
    if (unitTeamId(e) === ft || e.hp <= 0) continue;
    const dx = e.x - from.x;
    const dy = e.y - from.y;
    const s = dx * dx + dy * dy;
    if (s < d2) {
      d2 = s;
      best = e;
    }
  }
  return best;
}

/** Savaş hedefi: önce rakip takımdaki gerçek oyuncular (crowd değil), yoksa en yakın crowd */
function nearestBattleTarget(from, maxDist = 9999) {
  const ft = unitTeamId(from);
  let best = null;
  let d2 = maxDist * maxDist;
  let bestCrowd = null;
  let d2c = maxDist * maxDist;
  for (const e of state.units) {
    if (unitTeamId(e) === ft || e.hp <= 0) continue;
    const dx = e.x - from.x;
    const dy = e.y - from.y;
    const s = dx * dx + dy * dy;
    if (isCrowdUnit(e)) {
      if (s < d2c) {
        d2c = s;
        bestCrowd = e;
      }
    } else if (s < d2) {
      d2 = s;
      best = e;
    }
  }
  return best || bestCrowd;
}

/** Jeton ağır mermi: her karede en yakın rakibe (önce gerçek oyuncu) doğru hız vektörünü yumuşak çevirir */
function applyJetonHomingVelocity(pr, dt) {
  if (!pr || !pr.jetonHoming) return;
  const spd0 = Math.hypot(pr.vx, pr.vy);
  const spd = spd0 > 0.35 ? spd0 : 10;
  const tgt = nearestBattleTarget({ team: unitTeamId(pr), x: pr.x, y: pr.y }, 880);
  if (!tgt) return;
  const dx = tgt.x - pr.x;
  const dy = tgt.y - pr.y;
  const L = Math.hypot(dx, dy);
  if (L < 6) return;
  const desVx = (dx / L) * spd;
  const desVy = (dy / L) * spd;
  const steer = 1 - Math.exp(-9 * dt);
  let vx = pr.vx + (desVx - pr.vx) * steer;
  let vy = pr.vy + (desVy - pr.vy) * steer;
  const n = Math.hypot(vx, vy);
  if (n > 1e-5) {
    pr.vx = (vx / n) * spd;
    pr.vy = (vy / n) * spd;
  }
}

/** TikTok olayı olmayan seyirci birimi — savaşmaz, sadece sahada dolaşır */
function isCrowdUnit(u) {
  return u && String(u.userId).startsWith("crowd_");
}

/** Kararlı 0..1 — her birimin kendi yarısında dağılmış hedefi */
function unitLaneHash(userId, team) {
  const s = `${String(userId)}:${team}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  const u1 = (h >>> 0) / 2 ** 32;
  h = Math.imul(h ^ 0x9e3779b9, 0x85ebca6b);
  const u2 = (h >>> 0) / 2 ** 32;
  return { u1, u2 };
}

/** Ortaya toplanmadan: yarı içinde yayılmış slot + hafif dikey nefes */
function preferredAnchorXY(u, t) {
  const ut = unitTeamId(u);
  const { u1, u2 } = unitLaneHash(u.userId, ut);
  const w = MID - 105;
  const ax = ut === 0 ? 52 + u1 * w : MID + 52 + u1 * w;
  const ay = 88 + u2 * (H - 176) + Math.sin(t * 0.48 + u1 * 6.1) * 42;
  return { ax, ay };
}

function addFloat(x, y, text, color = "#fff") {
  state.floatTexts.push({ x, y, text, color, t: 0, pop: 0, vy: -36 });
}

/** Her kare aynı şimşek çizgisi — titreme az, daha sinematik */
function makeLightningBolts(cx, cy, jeton = false) {
  const bolts = [];
  const branches = jeton ? 7 : 4;
  const segs = jeton ? 11 : 8;
  for (let b = 0; b < branches; b++) {
    let x = cx + (Math.random() - 0.5) * (jeton ? 22 : 14);
    let y = cy - (jeton ? 58 : 46);
    for (let s = 0; s < segs; s++) {
      const nx = x + (Math.random() - 0.5) * (jeton ? 32 : 26);
      const ny = y + (jeton ? 110 : 92) / segs + (Math.random() - 0.5) * (jeton ? 7 : 5);
      bolts.push({ x1: x, y1: y, x2: nx, y2: ny });
      x = nx;
      y = ny;
    }
  }
  return bolts;
}

/** Şimşek çarpması: rakip oyuncuların konumunda (rastgele boş zemine değil) */
function lightningStrikePositions(actor, count, jitter = 14) {
  const t = unitTeamId(actor);
  let foes = state.units.filter((e) => unitTeamId(e) !== t && e.hp > 0 && !isCrowdUnit(e));
  if (foes.length === 0) foes = state.units.filter((e) => unitTeamId(e) !== t && e.hp > 0);
  if (foes.length === 0) {
    const cx = t === 0 ? MID + 95 : MID - 95;
    const pts = [];
    for (let i = 0; i < count; i++) {
      pts.push({
        x: cx + Math.sin(i * 1.7) * 36,
        y: 120 + ((i * 79) % (H - 240)),
      });
    }
    return pts;
  }
  foes.sort((a, b) => {
    const da = (a.x - actor.x) ** 2 + (a.y - actor.y) ** 2;
    const db = (b.x - actor.x) ** 2 + (b.y - actor.y) ** 2;
    return da - db;
  });
  const pts = [];
  for (let k = 0; k < count; k++) {
    const e = foes[Math.min(k, foes.length - 1)];
    pts.push({
      x: e.x + (Math.random() - 0.5) * jitter,
      y: e.y + (Math.random() - 0.5) * jitter,
    });
  }
  return pts;
}

/** Rakip oyuncular (seyirci crowd değil) — şimşek için rastgele seçim */
function lightningStrikeRandomFoes(actor, count, jitter = 16) {
  const t = unitTeamId(actor);
  let foes = state.units.filter((e) => unitTeamId(e) !== t && e.hp > 0 && !isCrowdUnit(e));
  if (foes.length === 0) foes = state.units.filter((e) => unitTeamId(e) !== t && e.hp > 0);
  for (let i = foes.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const tmp = foes[i];
    foes[i] = foes[j];
    foes[j] = tmp;
  }
  const n = Math.min(count, foes.length);
  const pts = [];
  for (let k = 0; k < n; k++) {
    const e = foes[k];
    pts.push({
      x: e.x + (Math.random() - 0.5) * jitter,
      y: e.y + (Math.random() - 0.5) * jitter,
    });
  }
  return pts;
}

/** Alpha sol yarıda, Bravo sağ yarıda — Arena5Gen duvar sekmesi */
function clampUnitToArena(u) {
  reflectUnitOnHalfArena(u, WARFRONT_PHYS.wallPassesNormal);
}

/** Ateş lotusu: rakip yarıda — rakip varsa kitle merkezine yakın, yoksa o yarıda güvenli nokta */
function fireLotusEnemyHalfXY(sourceTeam, hintActor = null) {
  const st = unitTeamId({ team: sourceTeam });
  const foes = state.units.filter((e) => unitTeamId(e) !== st && e.hp > 0);
  let cx = st === 0 ? MID + (W - MID) * 0.4 : MID * 0.4;
  let cy = hintActor ? hintActor.y : H * 0.48;
  if (foes.length) {
    let sx = 0;
    let sy = 0;
    for (const e of foes) {
      sx += e.x;
      sy += e.y;
    }
    cx = sx / foes.length;
    cy = sy / foes.length;
  }
  if (st === 0) cx = Math.max(MID + 56, Math.min(W - 52, cx));
  else cx = Math.max(52, Math.min(MID - 56, cx));
  cy = Math.max(118, Math.min(H - 118, cy));
  return { x: cx, y: cy };
}

/** Rakip gerçek oyuncu öldürünce kalan can havuzunu katille paylaş */
function transferVictimHpToKiller(victim, killer) {
  if (!victim || !killer || killer.hp <= 0 || isCrowdUnit(victim) || isCrowdUnit(killer)) return 0;
  if (unitTeamId(victim) === unitTeamId(killer)) return 0;
  const pool = Math.max(0, Math.round(victim.maxHp || PLAYER_BASE_HP));
  if (pool <= 0) return 0;
  const gain = Math.round(pool * KILL_HP_TRANSFER_RATIO);
  if (gain <= 0) return 0;
  killer.maxHp = Math.min(HP_MAX_CAP, (killer.maxHp || PLAYER_BASE_HP) + gain);
  killer.hp = Math.min(killer.maxHp, (killer.hp || 0) + gain);
  return gain;
}

/** Kalkan varsa önce onu eritir */
function applyShieldedDamage(e, rawDmg) {
  let d = Math.max(0, rawDmg);
  if (e && !isCrowdUnit(e)) d *= PLAYER_INCOMING_DMG_SCALE;
  const sh = e.shield || 0;
  if (sh > 0) {
    const use = Math.min(sh, d);
    e.shield = sh - use;
    d -= use;
  }
  e.hp -= d;
}

function damageCircle(ox, oy, rad, dmg, sourceTeam, knock = 0, attackerUserId = null) {
  const st = unitTeamId({ team: sourceTeam });
  for (const e of state.units) {
    if (unitTeamId(e) === st || e.hp <= 0) continue;
    const dx = e.x - ox;
    const dy = e.y - oy;
    if (dx * dx + dy * dy <= rad * rad) {
      if (attackerUserId) e.lastHitBy = attackerUserId;
      applyShieldedDamage(e, dmg);
      e.hitFlash = Math.max(e.hitFlash || 0, 0.18);
      if (knock) {
        const L = Math.hypot(dx, dy) || 1;
        e.vx += (dx / L) * knock * 7.5;
        e.vy += (dy / L) * knock * 7.5;
        e.x += (dx / L) * knock;
        e.y += (dy / L) * knock;
        clampUnitToArena(e);
      }
    }
  }
}

/** Jeton süper saldırıları: rakip gerçek oyuncular (crowd hariç) anında elenir */
function eliminateEnemyPlayers(actor) {
  if (!actor) return;
  const t = unitTeamId(actor);
  for (const e of state.units) {
    if (unitTeamId(e) === t || e.hp <= 0) continue;
    if (isCrowdUnit(e)) continue;
    e.lastHitBy = actor.userId;
    e.hp = 0;
  }
}

function updateMoraleDom() {
  const a = document.getElementById("moraleAlpha");
  const b = document.getElementById("moraleBravo");
  const ma = state.teamMorale[0];
  const mb = state.teamMorale[1];
  if (a) a.style.width = `${Math.max(8, Math.min(100, ma))}%`;
  if (b) b.style.width = `${Math.max(8, Math.min(100, mb))}%`;
}

function registerKill(teamIndex) {
  state.kills[teamIndex] += 1;
  document.getElementById(teamIndex === 0 ? "killsAlpha" : "killsBravo").textContent =
    String(state.kills[teamIndex]);
}

/** TikTok combo / repeat — yetenek başına üst sınır (performans + spam ses) */
function abilityComboCap(ability) {
  const a = String(ability || "");
  if (a.startsWith("jeton_")) {
    if (a === "jeton_mega_500" || a === "jeton_dragon_wipe" || a === "jeton_lotus_all") return 1;
    if (a === "jeton_vortex" || a === "jeton_lightning_10") return 2;
    if (a === "jeton_big5") return 2;
    if (a === "jeton_heavy_1") return 1;
    return 2;
  }
  switch (a) {
    case "missile":
      return 96;
    case "hook":
      return 48;
    case "leisure":
      return 44;
    case "bullet_storm":
      return 16;
    case "thunder_bridge":
      return 12;
    case "tornado":
      return 10;
    case "fire_lotus":
      return 9;
    case "murad":
      return 14;
    case "dragons_palm":
      return 12;
    case "all_combo":
      return 4;
    default:
      return 14;
  }
}

function abilityComboStaggerMs(ability) {
  const a = String(ability || "");
  if (a.startsWith("jeton_")) return 120;
  if (a === "bullet_storm" || a === "thunder_bridge" || a === "all_combo") return 78;
  if (a === "tornado" || a === "fire_lotus" || a === "murad") return 68;
  if (a === "dragons_palm") return 72;
  return 36;
}

/** Hediye combo: aynı yeteneği N kez (gecikmeli); birim ölürse kalan vuruşlar iptal */
function applyGiftAbilityBurst(actor, ability, comboRaw) {
  if (!actor || !ability) return;
  const uid = String(actor.userId || "");
  if (!uid) return;
  const cap = abilityComboCap(ability);
  const n = Math.min(cap, Math.max(1, Math.round(Number(comboRaw) || 1)));
  const step = abilityComboStaggerMs(ability);
  for (let i = 0; i < n; i++) {
    setTimeout(() => {
      const u = state.units.find((x) => x.userId === uid && !isCrowdUnit(x));
      if (!u || u.hp <= 0) return;
      applyAbility(u, ability);
    }, i * step);
  }
}

function applyAbility(actor, ability) {
  if (!actor) return;
  const t = unitTeamId(actor);
  const ex = t === 0 ? 1 : -1;

  switch (ability) {
    case "missile": {
      const tgt = nearestBattleTarget(actor, 420);
      if (!tgt) {
        addFloat(actor.x, actor.y - 30, "MISSILE", "#8aa4b8");
        playSfx("missile");
        spawnParticles(actor.x, actor.y, 5, "rgba(72, 88, 102, 0.65)", 32, 85);
        return;
      }
      const ang = Math.atan2(tgt.y - actor.y, tgt.x - actor.x);
      state.projectiles.push({
        kind: "missile",
        team: t,
        ownerId: actor.userId,
        x: actor.x,
        y: actor.y,
        vx: Math.cos(ang) * 12.8,
        vy: Math.sin(ang) * 12.8,
        life: 2.35,
        dmg: 38,
        r: 6.5,
      });
      addFloat(actor.x, actor.y - 28, "MISSILE", "#9a9e8c");
      playSfx("missile");
      spawnParticles(actor.x, actor.y, 8, "rgba(110, 82, 58, 0.65)", 48, 130);
      addShake(2);
      break;
    }
    case "leisure": {
      const tgt = nearestBattleTarget(actor, 380);
      const ang = tgt
        ? Math.atan2(tgt.y - actor.y, tgt.x - actor.x)
        : t === 0
          ? 0
          : Math.PI;
      state.beams.push({
        team: t,
        ownerId: actor.userId,
        x0: actor.x,
        y0: actor.y,
        ang,
        width: 48,
        life: 0.98,
        dmgTick: 24,
        t: 0,
      });
      addFloat(actor.x, actor.y - 28, "LEISURE", "#b8d8e8");
      playSfx("beam");
      spawnParticles(actor.x, actor.y, 14, t === 0 ? "rgba(120, 210, 255, 0.6)" : "rgba(255, 170, 210, 0.62)", 58, 165);
      addShake(3);
      break;
    }
    case "bullet_storm": {
      const focus = nearestBattleTarget(actor, 520);
      const baseAng = focus
        ? Math.atan2(focus.y - actor.y, focus.x - actor.x)
        : t === 0
          ? 0
          : Math.PI;
      for (let i = -11; i <= 11; i++) {
        const spread = (i / 18) * 0.92;
        const a = baseAng + spread;
        const spd = 7.85 + Math.abs(i) * 0.07;
        state.projectiles.push({
          kind: "bullet",
          team: t,
          ownerId: actor.userId,
          x: actor.x,
          y: actor.y,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          life: 1.75,
          dmg: 7.5,
          r: 3.1,
        });
      }
      addFloat(actor.x, actor.y - 30, "BULLET STORM", "#9a8f78");
      playSfx("storm");
      spawnParticles(actor.x, actor.y, 18, "rgba(72, 68, 62, 0.65)", 65, 190);
      addShake(4);
      break;
    }
    case "thunder_bridge": {
      const hits = lightningStrikePositions(actor, 8, 14);
      for (let k = 0; k < hits.length; k++) {
        const { x, y } = hits[k];
        state.zones.push({
          kind: "lightning",
          team: t,
          ownerId: actor.userId,
          x,
          y,
          life: 0.36,
          dmg: 32,
          delay: k * 0.048,
          bolts: makeLightningBolts(x, y),
        });
      }
      addFloat(MID, 80, "THUNDER", "#8a9aad");
      playSfx("thunder");
      state.edgeFlash = 0.35;
      addShake(8);
      spawnParticles(MID, H * 0.35, 16, "rgba(62, 74, 90, 0.65)", 85, 220);
      break;
    }
    case "tornado": {
      state.zones.push({
        kind: "tornado",
        team: t,
        ownerId: actor.userId,
        x: actor.x + ex * 40,
        y: actor.y,
        vx: ex * 62,
        life: 3.05,
        rad: 52,
        dmgPerS: 50,
        angle: 0,
      });
      addFloat(actor.x, actor.y - 28, "TORNADO", "#8a868e");
      playSfx("tornado");
      spawnParticles(actor.x + ex * 40, actor.y, 14, "rgba(58, 58, 64, 0.6)", 55, 170);
      addShake(5);
      break;
    }
    case "fire_lotus": {
      const { x: lx, y: ly } = fireLotusEnemyHalfXY(t, actor);
      state.zones.push({
        kind: "lotus",
        team: t,
        ownerId: actor.userId,
        x: lx,
        y: ly,
        life: 1.68,
        maxR: 208,
        dmgTick: 18,
        t: 0,
        lotusPullAll: true,
        lotusPull: 480,
        lotusInferno: true,
        burnDps: 108,
      });
      addFloat(lx, ly - 34, "FIRE LOTUS", "#ff5520");
      playSfx("lotus");
      spawnParticles(lx, ly, 26, "rgba(255, 130, 45, 0.82)", 68, 205);
      addShake(6);
      state.edgeFlash = 0.22;
      break;
    }
    case "murad": {
      damageCircle(actor.x + ex * 30, actor.y, 140, 105, t, 30, actor.userId);
      state.zones.push({
        kind: "shock",
        team: t,
        ownerId: actor.userId,
        x: actor.x + ex * 30,
        y: actor.y,
        life: 0.45,
        r: 140,
      });
      addFloat(actor.x + ex * 20, actor.y - 36, "MURAD", "#a89858");
      playSfx("murad");
      spawnParticles(actor.x + ex * 30, actor.y, 20, "rgba(95, 88, 48, 0.7)", 72, 200);
      addShake(10);
      break;
    }
    case "dragons_palm": {
      const startX = t === 0 ? 58 + Math.random() * 28 : W - 58 - Math.random() * 28;
      const startY = Math.max(110, Math.min(H - 110, actor.y + (Math.random() - 0.5) * 50));
      state.projectiles.push({
        kind: "dragon_fly",
        team: t,
        ownerId: actor.userId,
        x: startX,
        y: startY,
        dir: t === 0 ? 1 : -1,
        spd: 238,
        life: 2.85,
        dmgTick: 56,
        t: 0,
      });
      addFloat(actor.x, actor.y - 28, "DRAGON", "#c89868");
      playSfx("dragon");
      spawnParticles(startX, startY, 18, "rgba(255, 140, 60, 0.65)", 62, 175);
      addShake(6);
      state.edgeFlash = 0.18;
      break;
    }
    case "hook": {
      const tgt = nearestBattleTarget(actor, 260);
      if (!tgt) {
        addFloat(actor.x, actor.y - 26, "HOOK", "#7a8a98");
        playSfx("hook");
        return;
      }
      const dx = actor.x - tgt.x;
      const dy = actor.y - tgt.y;
      const L = Math.hypot(dx, dy) || 1;
      tgt.x += (dx / L) * 90;
      tgt.y += (dy / L) * 40;
      clampUnitToArena(tgt);
      tgt.lastHitBy = actor.userId;
      applyShieldedDamage(tgt, 22);
      actor.damageDealt = (actor.damageDealt || 0) + 22;
      state.projectiles.push({
        kind: "chain",
        team: t,
        x0: actor.x,
        y0: actor.y,
        x1: tgt.x,
        y1: tgt.y,
        life: 0.25,
        dmg: 0,
      });
      addFloat(actor.x, actor.y - 26, "HOOK", "#7a8a98");
      playSfx("hook");
      spawnParticles(tgt.x, tgt.y, 12, "rgba(72, 88, 102, 0.75)", 55, 170);
      addShake(5);
      break;
    }
    case "jeton_lightning_10": {
      const hits = lightningStrikeRandomFoes(actor, 10, 16);
      for (let k = 0; k < hits.length; k++) {
        const { x, y } = hits[k];
        state.zones.push({
          kind: "lightning",
          team: t,
          ownerId: actor.userId,
          visualJeton: true,
          x,
          y,
          life: 0.5,
          dmg: 42,
          hitR: 58,
          delay: k * 0.048,
          bolts: makeLightningBolts(x, y, true),
        });
      }
      addFloat(actor.x, actor.y - 32, "10× LIGHTNING", "#c8d8ff");
      playSfx("thunder");
      state.edgeFlash = 0.36;
      addShake(12);
      spawnParticles(actor.x, actor.y, 22, "rgba(100, 120, 200, 0.72)", 72, 210);
      break;
    }
    case "jeton_heavy_1": {
      const tgt = nearestBattleTarget(actor, 520);
      const a = tgt
        ? Math.atan2(tgt.y - actor.y, tgt.x - actor.x)
        : t === 0
          ? 0
          : Math.PI;
      const spd = 12.4;
      state.projectiles.push({
        kind: "heavy_ball",
        team: t,
        ownerId: actor.userId,
        jetonHoming: true,
        x: actor.x + Math.cos(a) * 18,
        y: actor.y + Math.sin(a) * 18,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        life: 2.85,
        dmg: 30,
        r: 11,
      });
      addFloat(actor.x, actor.y - 28, "HEAVY SLUG", "#d4c4a8");
      playSfx("storm");
      addShake(4);
      spawnParticles(actor.x, actor.y, 10, "rgba(110, 98, 82, 0.72)", 52, 165);
      break;
    }
    case "jeton_big5": {
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 9.8 + Math.random() * 1.6;
        state.projectiles.push({
          kind: "heavy_ball",
          team: t,
          ownerId: actor.userId,
          jetonHoming: true,
          x: actor.x,
          y: actor.y,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          life: 2.55,
          dmg: 78,
          r: 12.5,
        });
      }
      addFloat(actor.x, actor.y - 30, "5× HEAVY", "#c8b8a0");
      playSfx("storm");
      addShake(5);
      spawnParticles(actor.x, actor.y, 16, "rgba(90, 82, 70, 0.7)", 58, 175);
      break;
    }
    case "jeton_vortex": {
      state.zones.push({
        kind: "vortex",
        team: t,
        ownerId: actor.userId,
        visualJeton: true,
        x: actor.x + ex * 48,
        y: actor.y,
        life: 3.55,
        rad: 148,
        dmgPerS: 58,
        angle: 0,
        pull: 440,
        suckDmg: 34,
      });
      addFloat(actor.x + ex * 24, actor.y - 34, "MEGA VORTEX", "#c8c8f8");
      playSfx("tornado");
      spawnParticles(actor.x + ex * 48, actor.y, 30, "rgba(90, 88, 140, 0.72)", 82, 230);
      addShake(11);
      break;
    }
    case "jeton_lotus_all": {
      const { x: lx, y: ly } = fireLotusEnemyHalfXY(t, actor);
      state.zones.push({
        kind: "lotus",
        team: t,
        ownerId: actor.userId,
        visualJeton: true,
        x: lx,
        y: ly,
        life: 1.72,
        maxR: 218,
        dmgTick: 26,
        t: 0,
        lotusPullAll: true,
        lotusPull: 540,
        lotusInferno: true,
        burnDps: 145,
      });
      addFloat(lx, ly - 36, "LOTUS SALVO", "#ff6a28");
      playSfx("lotus");
      addShake(10);
      state.edgeFlash = 0.36;
      spawnParticles(lx, ly, 32, "rgba(255, 100, 35, 0.78)", 78, 225);
      break;
    }
    case "jeton_dragon_wipe": {
      eliminateEnemyPlayers(actor);
      addFloat(actor.x, actor.y - 38, "DRAGON WIPE", "#d8c898");
      playSfx("dragon");
      spawnParticles(actor.x, actor.y, 36, "rgba(120, 100, 160, 0.78)", 96, 265);
      addShake(22);
      state.edgeFlash = 0.5;
      break;
    }
    case "jeton_mega_500": {
      wipeEntireEnemyBattlefield(actor);
      const foe = t === 0 ? 1 : 0;
      const burstX = foe === 0 ? W * 0.26 : W * 0.74;
      const burstY = H * 0.46;
      addFloat(burstX, burstY - 90, "ENEMY SIDE · FULL CLEAR", "#ff5a28");
      addFloat(actor.x, actor.y - 52, "500◇ MONEY GUN", "#ffe866");
      for (let i = 0; i < 20; i++) {
        const rx = foe === 0 ? 24 + Math.random() * (MID - 40) : MID + 24 + Math.random() * (MID - 40);
        const ry = 64 + Math.random() * (H - 128);
        const gold = i % 2 === 0;
        spawnParticles(
          rx,
          ry,
          16 + (i % 6),
          gold ? "rgba(255, 220, 100, 0.78)" : "rgba(255, 85, 35, 0.72)",
          92 + (i % 50),
          255 + (i % 70),
        );
      }
      playSfx("combo");
      playSfx("storm");
      addShake(34);
      state.edgeFlash = 1.08;
      state.teamMorale[t] = Math.min(100, (state.teamMorale[t] || 50) + 22);
      updateMoraleDom();
      break;
    }
    case "all_combo": {
      applyAbility(actor, "missile");
      setTimeout(() => applyAbility(actor, "bullet_storm"), 85);
      setTimeout(() => applyAbility(actor, "thunder_bridge"), 200);
      setTimeout(() => applyAbility(actor, "fire_lotus"), 320);
      addFloat(actor.x, actor.y - 34, "COMBO!", "#a89a72");
      playSfx("combo");
      spawnParticles(actor.x, actor.y, 22, "rgba(88, 82, 58, 0.65)", 72, 220);
      addShake(6);
      break;
    }
    default:
      applyAbility(actor, "missile");
  }
}

/** Webhook / ham payload: user nesnesinde kalan TikTok CDN URL’leri */
function harvestHttpsProfileUrls(node, depth, acc) {
  if (depth > 18 || node == null) return acc;
  if (typeof node === "string") {
    const s = node.trim();
    if (/^https?:\/\//i.test(s) && /(tiktokcdn|byteimg|ibyteimg|muscdn|tiktokv\.com)/i.test(s)) acc.push(s);
    return acc;
  }
  if (Array.isArray(node)) {
    for (const x of node) harvestHttpsProfileUrls(x, depth + 1, acc);
    return acc;
  }
  if (typeof node === "object") {
    for (const v of Object.values(node)) harvestHttpsProfileUrls(v, depth + 1, acc);
  }
  return acc;
}

function pickOneProfileUrlFromList(list) {
  if (!list?.length) return "";
  const picked =
    list.find((x) => /\.(webp|jpe?g|avif)$/i.test(x) && (/100x100|200x200|:100:|:200:|cropcenter/i.test(x))) ||
    list.find((x) => !/shrink|tplv-tiktokx-resize/i.test(x)) ||
    list[list.length - 1] ||
    list[0];
  return picked ? String(picked).trim() : "";
}

/** Köprü / webhook: düz URL veya TikTok protobuf User { profilePicture: { url[] } } */
function extractTiktokAvatarUrl(p) {
  if (!p || typeof p !== "object") return "";
  const direct = String(
    p.avatarUrl ||
      p.profilePictureUrl ||
      p.profilePicturUrl ||
      p.profile_picture ||
      p.userPhotoUrl ||
      p.avatar_thumb ||
      "",
  ).trim();
  if (direct && /^https?:\/\//i.test(direct)) return direct;
  const u = p.user || {};
  const flat = String(
    u.profilePictureUrl || u.avatarUrl || u.userPhotoUrl || u.avatar_thumb || "",
  ).trim();
  if (flat && /^https?:\/\//i.test(flat)) return flat;
  const lists = [];
  const pushImg = (im) => {
    if (!im) return;
    if (typeof im === "string" && /^https?:/i.test(im)) {
      lists.push([im.trim()]);
      return;
    }
    const arr = im?.url;
    if (typeof arr === "string" && /^https?:/i.test(arr)) {
      lists.push([arr.trim()]);
      return;
    }
    if (Array.isArray(arr) && arr.length) {
      const row = [];
      for (const x of arr) {
        if (typeof x === "string" && /^https?:/i.test(x)) row.push(x.trim());
        else if (x && typeof x === "object" && typeof x.url === "string" && /^https?:/i.test(x.url)) row.push(x.url.trim());
      }
      if (row.length) lists.push(row);
    }
    if (typeof arr === "object" && !Array.isArray(arr)) {
      const vals = Object.values(arr).filter((v) => typeof v === "string" && /^https?:/i.test(v));
      if (vals.length) lists.push(vals.map((s) => s.trim()));
    }
  };
  pushImg(u.profilePictureLarge);
  pushImg(u.profilePictureMedium);
  pushImg(u.profilePicture);
  pushImg(u.avatarJpg);
  pushImg(u.avatar_thumb);
  pushImg(u.avatarThumb);
  pushImg(p.profilePictureLarge);
  pushImg(p.profilePictureMedium);
  pushImg(p.profilePicture);
  for (const list of lists) {
    const picked = pickOneProfileUrlFromList(list);
    if (picked) return picked;
  }
  const harvested = [...new Set(harvestHttpsProfileUrls(u, 0, []))];
  return pickOneProfileUrlFromList(harvested);
}

function placeJoinerOnTeamHalf(u, team) {
  if (!u || isCrowdUnit(u)) return;
  const tn = unitTeamId({ team });
  const y = 140 + Math.random() * (H - 280);
  const x = tn === 0 ? 80 + Math.random() * (MID - 120) : MID + 80 + Math.random() * (MID - 120);
  u.x = x;
  u.y = y;
  u.team = tn;
  assignRandomUnitVelocity(u);
}

/** Sohbet «1» / «2» — tam eşleşme (Tam genişlik rakamları normalize) */
function normalizeChatJoinComment(raw) {
  let t = String(raw ?? "").trim();
  if (!t) return "";
  const fw = { "\uFF11": "1", "\uFF12": "2" };
  for (const k of Object.keys(fw)) {
    if (t.includes(k)) t = t.split(k).join(fw[k]);
  }
  return t.trim();
}

function handleJoinPick(p, opts = {}) {
  const bypass = opts.allowWithoutLiveGate === true;
  if (!bypass && !state.tiktokJoinGate) return;
  state.units = state.units.filter((u) => u.userId !== SIM_DUEL_A && u.userId !== SIM_DUEL_B);
  const team = unitTeamId({ team: p.team });
  const userId = String(p.userId || p.uniqueId || "").trim();
  if (!userId || userId === "anon") return;
  const nickname = (p.nickname || p.uniqueId || "?").slice(0, 16);
  const avatarUrl = extractTiktokAvatarUrl(p) || String(p.avatarUrl || "").trim();
  state.joinedByChat.add(userId);
  state.userTeam.set(userId, team);
  let u = state.units.find((x) => x.userId === userId && !isCrowdUnit(x));
  if (!u) {
    spawnUnit(userId, nickname, team, avatarUrl, { silent: true });
    u = state.units.find((x) => x.userId === userId && !isCrowdUnit(x));
  } else {
    if (nickname && nickname !== "?") u.nickname = nickname.slice(0, 16);
    if (avatarUrl) u.avatarUrl = avatarUrl;
    placeJoinerOnTeamHalf(u, team);
  }
  if (avatarUrl) getCachedAvatar(avatarUrl);
  if (u) upsertMatchPlayerLedger(u);
  if (SHOW_JOIN_FLOAT_TEXT && u) {
    addFloat(u.x, u.y - 30, team === 0 ? "Left · 1" : "Right · 2", team === 0 ? "#8ec5f4" : "#f0a0a8");
  }
  topUpCrowdUnits();
}

function handleTikTokPayload(p, opts = {}) {
  if (p == null || typeof p !== "object") return;
  const bypass = opts.allowWithoutLiveGate === true;
  const type = String(p.type || "gift").toLowerCase();

  /** GemTok köprüsü: chat «1»/«2» → lane_pick (0=sol, 1=sağ) */
  if (type === "lane_pick") {
    const lane = Number(p.lane);
    if (lane === 0 || lane === 1) {
      handleJoinPick({ ...p, team: lane }, opts);
    }
    return;
  }

  if (type === "chat") {
    const comment = normalizeChatJoinComment(p.comment ?? p.text);
    if (comment === "1" || comment === "2") {
      handleJoinPick({ ...p, team: comment === "1" ? 0 : 1 }, opts);
    }
    return;
  }

  if (type === "join_pick") {
    handleJoinPick(p, opts);
    return;
  }

  if (type === "member") {
    if (!bypass && !state.tiktokJoinGate) return;
    const mid = String(p.userId || p.uniqueId || "").trim();
    if (!mid || mid === "anon") return;
    const mAvatar = extractTiktokAvatarUrl(p) || String(p.avatarUrl || "").trim();
    if (mAvatar) getCachedAvatar(mAvatar);
    return;
  }

  /* Sunucu / TikTok LIVE bağlı değilken: WS ile gelen hediye vb. yok sayılır (saha boş). Yerel T/sim: bypass. */
  if (!bypass && !state.tiktokJoinGate) return;

  const userId = String(p.userId || p.uniqueId || "").trim();
  if (!userId || userId === "anon") return;
  if (state.tiktokJoinGate && !state.joinedByChat.has(userId)) return;

  const nickname = p.nickname || p.uniqueId || "Viewer";
  const avatarUrl = extractTiktokAvatarUrl(p);
  const teamHint = p.team ?? p.side;

  let giftId = String(p.giftId || p.giftName || "")
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (type === "like") giftId = "like";
  if (type === "follow" || type === "subscribe" || type === "share") giftId = "follow";

  const team = resolveTeamForUser(userId, teamHint);
  state.userTeam.set(userId, team);
  const unit = spawnUnit(userId, nickname, team, avatarUrl);

  if (type === "like") {
    const lc = Math.min(20, Math.max(1, Math.round(Number(p.likeCount) || 1)));
    const scale = Math.min(2.5, Math.sqrt(lc));
    growUnitFromGift(unit, giftId, { scale });
    applyAbility(unit, "missile");
    topUpCrowdUnits();
    return;
  }
  if (type === "follow" || type === "subscribe" || type === "share") {
    growUnitFromGift(unit, giftId);
    applyAbility(unit, "hook");
    topUpCrowdUnits();
    return;
  }

  const firstRealGift = !state.giftGivers.has(userId);
  state.giftGivers.add(userId);
  if (firstRealGift) applyGiftGiverDoubleHp(unit);

  let diamonds = readPayloadGiftDiamonds(p);
  if (diamonds < 380 && looksLikelyJeton500MoneyGun(p, giftId)) diamonds = 500;
  const jetPack = resolveJetonDiamondPackAbility(diamonds);
  const resolved = resolveGiftAbilityAndProfileKey(p, giftId);
  const ability = jetPack || resolved.ability;
  const profileKey = resolved.profileKey;
  const rawCombo = Math.max(
    Number(p.giftCombo) || 0,
    Number(p.repeatCount) || 0,
    Number(p.comboCount) || 0,
    Number(p.groupCount) || 0
  );
  const giftCombo = Math.min(120, Math.max(1, Math.round(rawCombo) || 1));
  const growScale = Math.min(2.65, 0.84 + Math.sqrt(giftCombo) * 0.13);
  growUnitFromGift(unit, profileKey, { scale: growScale });
  if (giftCombo >= 6) {
    addFloat(unit.x, unit.y - 44, `×${giftCombo}`, "#d4b878");
  }
  applyGiftAbilityBurst(unit, ability, giftCombo);
  topUpCrowdUnits();
}

/** TikFinity masaüstü uygulaması yerel WebSocket (varsayılan ws://127.0.0.1:21213). */
const DEFAULT_TIKFINITY_WS = "ws://127.0.0.1:21213";
const LS_STREAMXT_TIKFINITY_WS_URL = "streamxt_tikfinity_ws_url";

let cachedServerTikfinityWsUrl = "";

let tfSocket = null;
let tfGen = 0;
let tfReconnectTimer = null;
let tfUserClosed = false;
/** GemTok merkezi köprü (GemTokLiveGameBridge) aboneliği kapatıcı */
let tfPortalUnsub = null;
let tfPortalHudTimer = null;
/** HUD yalnızca durum değişince resetBattlefield çağırır (500ms poll tekrar silmesin) */
let tiktokLiveHudPhase = "";

function isTikfinityAutoDisabledByUrlParams() {
  const G = typeof GemTokTikFinity !== "undefined" ? GemTokTikFinity : null;
  if (G && typeof G.isTikfinityAutoDisabled === "function") return G.isTikfinityAutoDisabled();
  try {
    const q = new URLSearchParams(location.search);
    if (q.get("tikfinity") === "0") return true;
    if (String(q.get("tikfinity") || "").toLowerCase() === "false") return true;
    if (q.get("tikfinityAuto") === "0") return true;
    if (q.get("notikfinity") === "1") return true;
    return false;
  } catch {
    return false;
  }
}

function getResolvedTikfinityWsUrl() {
  const G = typeof GemTokTikFinity !== "undefined" ? GemTokTikFinity : null;
  if (G && typeof G.getResolvedTikfinityWsUrl === "function") {
    return G.getResolvedTikfinityWsUrl(cachedServerTikfinityWsUrl);
  }
  try {
    const lsH = localStorage.getItem("gemtok_tikfinity_ws_url");
    if (lsH && String(lsH).trim()) return String(lsH).trim().slice(0, 512);
  } catch {
    /* */
  }
  try {
    const lsLegacy = localStorage.getItem("hottok_tikfinity_ws_url");
    if (lsLegacy && String(lsLegacy).trim()) return String(lsLegacy).trim().slice(0, 512);
  } catch {
    /* */
  }
  try {
    const ls = localStorage.getItem(LS_STREAMXT_TIKFINITY_WS_URL);
    if (ls && String(ls).trim()) return String(ls).trim().slice(0, 512);
  } catch {
    /* */
  }
  try {
    const proc = typeof process !== "undefined" ? process : undefined;
    if (proc && proc.env) {
      const envUrl = String(
        proc.env.TIKFINITY_WS_URL || proc.env.VITE_TIKFINITY_WS_URL || ""
      ).trim();
      if (envUrl) return envUrl.slice(0, 512);
    }
  } catch {
    /* */
  }
  try {
    const w = typeof globalThis !== "undefined" ? globalThis.__TIKFINITY_WS_URL__ : undefined;
    if (typeof w === "string" && w.trim()) return w.trim().slice(0, 512);
  } catch {
    /* */
  }
  const fromSrv = String(cachedServerTikfinityWsUrl || "").trim();
  if (fromSrv) return fromSrv.slice(0, 512);
  return DEFAULT_TIKFINITY_WS;
}

const tikfinityQueue = [];
let tikfinityFlushRaf = null;
const TIKFINITY_EVENTS_PER_FRAME = 36;

function flushTikfinityQueue() {
  tikfinityFlushRaf = null;
  let n = 0;
  while (tikfinityQueue.length > 0 && n < TIKFINITY_EVENTS_PER_FRAME) {
    const item = tikfinityQueue.shift();
    n += 1;
    try {
      handleTikTokPayload(item);
    } catch (e) {
      console.warn("[TikFinity] event handler failed:", e);
    }
  }
  if (tikfinityQueue.length > 0) tikfinityFlushRaf = requestAnimationFrame(flushTikfinityQueue);
}

function enqueueTikfinityGamePayload(p) {
  if (p == null || typeof p !== "object") return;
  tikfinityQueue.push(p);
  if (tikfinityFlushRaf == null) tikfinityFlushRaf = requestAnimationFrame(flushTikfinityQueue);
}

/** TikFinity JSON → `handleTikTokPayload` (kök `gemtok-tikfinity-client.js`: gift/like/follow/subscribe/share/member, kuyruk+rAF orada ve burada) */
function streamxtPayloadsFromTikfinityJson(raw) {
  const G = typeof GemTokTikFinity !== "undefined" ? GemTokTikFinity : null;
  if (!G || typeof G.streamxtPayloadsFromTikfinityJson !== "function") {
    console.warn("[WarFront] gemtok-tikfinity-client.js yüklenmedi; TikFinity olayları işlenmeyecek.");
    return [];
  }
  const out = G.streamxtPayloadsFromTikfinityJson(raw, { emitLanePickForChatDigits: false });
  for (const p of out) {
    if (!p || typeof p !== "object") continue;
    if (!String(p.avatarUrl || "").trim()) {
      const enriched = extractTiktokAvatarUrl({ ...p, user: p.user || {} });
      if (enriched) p.avatarUrl = enriched;
    }
  }
  return out;
}

function clearTfReconnectTimer() {
  if (tfReconnectTimer != null) {
    clearTimeout(tfReconnectTimer);
    tfReconnectTimer = null;
  }
}

function scheduleTfReconnect() {
  clearTfReconnectTimer();
  if (tfUserClosed) return;
  const delay = 3200 + Math.floor(Math.random() * 2200);
  tfReconnectTimer = setTimeout(() => {
    tfReconnectTimer = null;
    connectTikfinityWebSocket();
  }, delay);
}

function disconnectTikfinityClient() {
  tfUserClosed = true;
  if (tfPortalUnsub) {
    try {
      tfPortalUnsub();
    } catch (_e) {}
    tfPortalUnsub = null;
  }
  if (tfPortalHudTimer) {
    clearInterval(tfPortalHudTimer);
    tfPortalHudTimer = null;
  }
  clearTfReconnectTimer();
  tfGen += 1;
  try {
    tfSocket?.close();
  } catch {
    /* */
  }
  tfSocket = null;
  applyTiktokLiveHud({ status: "tikfinity_idle", url: getResolvedTikfinityWsUrl() });
}

function connectTikfinityWebSocket() {
  if (tfUserClosed) return;
  const url = getResolvedTikfinityWsUrl();
  if (!/^wss?:\/\//i.test(url)) {
    applyTiktokLiveHud({ status: "tikfinity_error", message: "Enter a valid ws:// or wss:// URL." });
    return;
  }
  const myGen = ++tfGen;
  try {
    tfSocket?.close();
  } catch {
    /* */
  }
  tfSocket = null;
  applyTiktokLiveHud({ status: "tikfinity_connecting", url });
  let socket;
  try {
    socket = new WebSocket(url);
  } catch {
    scheduleTfReconnect();
    return;
  }
  tfSocket = socket;

  socket.onopen = () => {
    if (tfGen !== myGen) return;
    clearTfReconnectTimer();
    applyTiktokLiveHud({ status: "tikfinity_connected", url });
  };

  socket.onmessage = (ev) => {
    if (tfGen !== myGen) return;
    let parsed;
    try {
      parsed = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    const payloads = streamxtPayloadsFromTikfinityJson(parsed);
    for (const p of payloads) enqueueTikfinityGamePayload(p);
  };

  socket.onclose = () => {
    if (tfGen !== myGen) return;
    tfSocket = null;
    if (tfUserClosed) return;
    applyTiktokLiveHud({ status: "tikfinity_reconnecting", url: getResolvedTikfinityWsUrl() });
    scheduleTfReconnect();
  };

  socket.onerror = () => {
    /* sessiz; kopuşta yeniden deneme onclose ile */
  };
}

/** Sayfa açılışında otomatik (URL parametresi ile kapatılabilir). Merkezi köprü varsa tek WebSocket. */
function startTikfinityAutoConnect() {
  if (isTikfinityAutoDisabledByUrlParams()) return;
  tfUserClosed = false;
  if (typeof GemTokLiveGameBridge !== "undefined" && typeof GemTokTikTokLive !== "undefined") {
    try {
      if (tfPortalUnsub) {
        tfPortalUnsub();
        tfPortalUnsub = null;
      }
      const hubBase =
        (typeof window !== "undefined" && window.__GEMTOK_GIFT_HUB_URL__) || "http://127.0.0.1:8787";
      if (
        GemTokLiveGameBridge.ensure({
          hubBase: String(hubBase),
          showHud: false,
        })
      ) {
        tfPortalUnsub = GemTokLiveGameBridge.onPayload((p) => {
          if (!tfUserClosed) enqueueTikfinityGamePayload(p);
        });
        if (tfPortalHudTimer) clearInterval(tfPortalHudTimer);
        tfPortalHudTimer = setInterval(() => {
          try {
            const st = GemTokTikTokLive.getConnectionState?.();
            if (!st) return;
            const u = st.url || getResolvedTikfinityWsUrl();
            if (st.state === "connected") applyTiktokLiveHud({ status: "tikfinity_connected", url: u });
            else if (st.state === "reconnecting") applyTiktokLiveHud({ status: "tikfinity_reconnecting", url: u });
            else if (st.state === "connecting") applyTiktokLiveHud({ status: "tikfinity_connecting", url: u });
            else applyTiktokLiveHud({ status: "tikfinity_idle", url: u });
          } catch (_e) {}
        }, 500);
        return;
      }
    } catch (_e) {}
  }
  connectTikfinityWebSocket();
}

let simBattleGeneration = 0;
/** T düellosu: sabit iki gerçek oyuncu (karşılıklı) */
const SIM_DUEL_A = "simduel_0";
const SIM_DUEL_B = "simduel_1";

function simClearTransientVfx() {
  state.projectiles = [];
  state.beams = [];
  state.zones = [];
}

function simEnsureDuelists() {
  if (!ENABLE_SIM_DUELISTS) return;
  state.units = state.units.filter((u) => u.userId !== SIM_DUEL_A && u.userId !== SIM_DUEL_B);
  spawnUnit(SIM_DUEL_A, "α", 0, "", { silent: true });
  spawnUnit(SIM_DUEL_B, "β", 1, "", { silent: true });
  const ya = state.units.find((x) => x.userId === SIM_DUEL_A);
  const yb = state.units.find((x) => x.userId === SIM_DUEL_B);
  if (ya) {
    ya.x = MID - 68;
    ya.y = H * 0.48;
    ya.hp = ya.maxHp = 210;
    ya.shield = 0;
    ya.killStreak = 0;
    ya.lastHitBy = null;
    clampUnitToArena(ya);
  }
  if (yb) {
    yb.x = MID + 68;
    yb.y = H * 0.48;
    yb.hp = yb.maxHp = 210;
    yb.shield = 0;
    yb.killStreak = 0;
    yb.lastHitBy = null;
    clampUnitToArena(yb);
  }
  topUpCrowdUnits();
}

function simDuelistsSomeoneDead() {
  const ya = state.units.find((x) => x.userId === SIM_DUEL_A);
  const yb = state.units.find((x) => x.userId === SIM_DUEL_B);
  return !ya || ya.hp <= 0 || !yb || yb.hp <= 0;
}
let crowdSeq = 0;

const CROWD_NAMES_A = [
  "Alex",
  "Jordan",
  "Casey",
  "Riley",
  "Morgan",
  "Quinn",
  "Avery",
  "Skyler",
  "Drew",
  "Reese",
  "Cameron",
  "Parker",
  "Logan",
  "Harper",
  "Blake",
  "Rowan",
];
const CROWD_NAMES_B = [
  "Taylor",
  "Jamie",
  "Sam",
  "Dakota",
  "River",
  "Phoenix",
  "Emerson",
  "Finley",
  "Hayden",
  "Sage",
  "Reagan",
  "Kendall",
  "Peyton",
  "Marley",
  "Charlie",
  "Eden",
];

function upsertMatchPlayerLedger(u) {
  const L = state.matchPlayerLedger;
  if (!L || !u || isCrowdUnit(u)) return;
  const id = u.userId;
  const prev = L.get(id);
  L.set(id, {
    userId: id,
    nickname: u.nickname || prev?.nickname || "?",
    avatarUrl: String(u.avatarUrl || "").trim() || prev?.avatarUrl || "",
    team: unitTeamId(u),
    damageDealt: Math.max(Math.round(u.damageDealt || 0), prev?.damageDealt || 0),
    kills: Math.max(u.kills || 0, prev?.kills || 0),
  });
}

function syncMatchPlayerLedger() {
  for (const u of state.units) {
    if (isCrowdUnit(u)) continue;
    upsertMatchPlayerLedger(u);
  }
}

function hideMatchFinishOverlay() {
  const ov = document.getElementById("matchFinishOverlay");
  if (!ov) return;
  ov.hidden = true;
  ov.setAttribute("aria-hidden", "true");
}

function computeMatchEndResults() {
  const rows = [...state.matchPlayerLedger.values()];
  rows.sort((a, b) => (b.damageDealt - a.damageDealt) || (b.kills - a.kills));
  const top3 = rows.slice(0, 3);
  let aDmg = 0;
  let bDmg = 0;
  for (const r of rows) {
    if (r.team === 0) aDmg += r.damageDealt;
    else bDmg += r.damageDealt;
  }
  let winTeam = -1;
  if (aDmg > bDmg) winTeam = 0;
  else if (bDmg > aDmg) winTeam = 1;
  else {
    if (state.kills[0] > state.kills[1]) winTeam = 0;
    else if (state.kills[1] > state.kills[0]) winTeam = 1;
  }
  return { top3, winTeam, aDmg, bDmg, rows };
}

function showMatchFinishOverlay() {
  const ov = document.getElementById("matchFinishOverlay");
  const winEl = document.getElementById("matchFinishWinner");
  const subEl = document.getElementById("matchFinishSub");
  const podEl = document.getElementById("matchFinishPodium");
  if (!ov || !winEl || !subEl || !podEl) return;

  const nameA = document.getElementById("nameAlpha")?.textContent?.trim() || "ALPHA";
  const nameB = document.getElementById("nameBravo")?.textContent?.trim() || "BRAVO";
  const { top3, winTeam, aDmg, bDmg, rows } = computeMatchEndResults();

  winEl.replaceChildren();
  const wrap = document.createElement("div");
  wrap.className = "match-finish-winner-inner";

  const lab = document.createElement("div");
  lab.className = "match-finish-winner-label";
  lab.textContent = "WINNING TEAM";

  const nm = document.createElement("div");
  if (rows.length === 0) {
    lab.textContent = "RESULT";
    nm.className = "match-finish-winner-name match-finish-winner-name--tie";
    nm.textContent = "No score recorded";
  } else if (winTeam === -1) {
    lab.textContent = "RESULT";
    nm.className = "match-finish-winner-name match-finish-winner-name--tie";
    nm.textContent = "DRAW";
  } else if (winTeam === 0) {
    nm.className = "match-finish-winner-name match-finish-winner-name--alpha";
    nm.textContent = nameA;
  } else {
    nm.className = "match-finish-winner-name match-finish-winner-name--bravo";
    nm.textContent = nameB;
  }
  wrap.appendChild(lab);
  wrap.appendChild(nm);
  winEl.appendChild(wrap);

  const baseSub =
    rows.length > 0
      ? `Team damage — ${nameA}: ${Math.round(aDmg)}  ·  ${nameB}: ${Math.round(bDmg)}`
      : "No live player damage recorded yet.";
  subEl.textContent = `${baseSub}  ·  New round starts automatically in 5 seconds.`;

  podEl.replaceChildren();
  if (top3.length === 0) {
    const empty = document.createElement("div");
    empty.className = "match-finish-empty";
    empty.textContent = "Not enough player data for a top 3.";
    podEl.appendChild(empty);
  } else {
    const order = [
      { rank: 2, row: top3[1] },
      { rank: 1, row: top3[0] },
      { rank: 3, row: top3[2] },
    ];
    for (const { rank, row } of order) {
      if (!row) continue;
      const card = document.createElement("div");
      card.className = `match-finish-place match-finish-place--${rank}`;

      const badge = document.createElement("div");
      badge.className = "match-finish-rank-badge";
      badge.textContent = rank === 1 ? "1." : rank === 2 ? "2." : "3.";
      card.appendChild(badge);

      const av = document.createElement("div");
      av.className = "match-finish-av";
      const url = String(row.avatarUrl || "").trim();
      const loadUrl = url ? toAvatarLoadUrl(url) || url : "";
      if (loadUrl) {
        const im = document.createElement("img");
        im.alt = "";
        im.decoding = "async";
        im.loading = "lazy";
        im.src = loadUrl;
        im.referrerPolicy = "no-referrer";
        av.appendChild(im);
      } else {
        const fb = document.createElement("div");
        fb.className = "match-finish-av-fb";
        fb.style.background = colorForUser(row.userId);
        fb.textContent = String(row.nickname || "?").slice(0, 2).toUpperCase();
        av.appendChild(fb);
      }
      card.appendChild(av);

      const nick = document.createElement("div");
      nick.className = "match-finish-nick";
      nick.textContent = row.nickname || "?";
      card.appendChild(nick);

      const tag = document.createElement("div");
      tag.className =
        row.team === 0 ? "match-finish-teamtag match-finish-teamtag--alpha" : "match-finish-teamtag match-finish-teamtag--bravo";
      tag.textContent = row.team === 0 ? nameA : nameB;
      card.appendChild(tag);

      const st = document.createElement("div");
      st.className = "match-finish-stats";
      st.textContent = `${row.damageDealt} DMG · ${row.kills} kill`;
      card.appendChild(st);

      podEl.appendChild(card);
    }
  }

  ov.hidden = false;
  ov.setAttribute("aria-hidden", "false");
}

/** Raunt süresi dakika (1–120): önce ayar kutusundaki yazı, yoksa kayıtlı süre (sn), yoksa 5. */
function getEffectiveRoundMinutes() {
  const inp = document.getElementById("settingsRoundDuration");
  if (inp) {
    const raw = String(inp.value).trim();
    if (raw !== "") {
      const n = Number(raw);
      if (Number.isFinite(n)) return Math.min(120, Math.max(1, Math.round(n)));
    }
  }
  const fromSec = Number(state.matchDurationSec);
  if (Number.isFinite(fromSec) && fromSec >= 60) {
    return Math.min(120, Math.max(1, Math.round(fromSec / 60)));
  }
  return 5;
}

function beginMatchCountdown() {
  if (matchAutoRestartTimer != null) {
    clearTimeout(matchAutoRestartTimer);
    matchAutoRestartTimer = null;
  }
  state.matchOver = false;
  if (!state.matchPlayerLedger) state.matchPlayerLedger = new Map();
  else state.matchPlayerLedger.clear();
  for (const u of state.units) {
    if (isCrowdUnit(u)) continue;
    u.damageDealt = 0;
    u.kills = 0;
    u.killStreak = 0;
  }
  state.kills = [0, 0];
  state.mvpLeader = null;
  state._mvpAcc = 0;
  const ka = document.getElementById("killsAlpha");
  const kb = document.getElementById("killsBravo");
  if (ka) ka.textContent = "0";
  if (kb) kb.textContent = "0";
  const minutes = getEffectiveRoundMinutes();
  const sec = minutes * 60;
  state.matchDurationSec = sec;
  state.matchDeadlineMs = performance.now() + sec * 1000;
  hideMatchFinishOverlay();
}

function setupMatchFinishOverlay() {
  const btn = document.getElementById("matchFinishRestartBtn");
  btn?.addEventListener("click", () => {
    beginMatchCountdown();
  });
}

function topUpCrowdUnits() {
  for (let team = 0; team < 2; team++) {
    const have = state.units.filter((u) => unitTeamId(u) === team && String(u.userId).startsWith("crowd_")).length;
    const names = team === 0 ? CROWD_NAMES_A : CROWD_NAMES_B;
    for (let k = have; k < CROWD_UNITS_PER_TEAM; k++) {
      crowdSeq += 1;
      spawnUnit(`crowd_${team}_${crowdSeq}`, names[k % names.length], team, "", { silent: true });
    }
  }
}

function resetBattlefield() {
  state.units = [];
  state.projectiles = [];
  state.beams = [];
  state.zones = [];
  state.floatTexts = [];
  state.particles = [];
  state.pickups = [];
  state.kills = [0, 0];
  killMusicResetForNewRound();
  state.teamMorale = [52, 52];
  state.userTeam = new Map();
  state.startTime = performance.now();
  state.screenShake = 0;
  state.edgeFlash = 0;
  state.pickupSpawnT = 0;
  state.mvpLeader = null;
  state._mvpAcc = 0;
  state.joinedByChat.clear();
  document.getElementById("killsAlpha").textContent = "0";
  document.getElementById("killsBravo").textContent = "0";
  crowdSeq = 0;
  updateMoraleDom();
  topUpCrowdUnits();
  beginMatchCountdown();
}

/** Test (T): her adımda α / β karşılıklı canlanır; saldırı uygulanır, biri ölene kadar (veya süre dolunca) beklenir; sonra sıradaki */
function startSimBattle() {
  if (state.tiktokJoinGate) {
    addFloat(MID, H * 0.42, "TikFinity / live: T test disabled", "#d4b060");
    return;
  }
  simBattleGeneration++;
  const gen = simBattleGeneration;
  resetBattlefield();

  const steps = [
    { label: "TEST · MISSILE (Rose)", p: { type: "gift", userId: SIM_DUEL_A, nickname: "α", giftId: "rose", team: "alpha" } },
    { label: "TEST · LEISURE", p: { type: "gift", userId: SIM_DUEL_B, nickname: "β", giftId: "tiktok", team: "bravo" } },
    { label: "TEST · BULLET STORM", p: { type: "gift", userId: SIM_DUEL_A, nickname: "α", giftId: "dumbbell", team: "alpha" } },
    { label: "TEST · THUNDER BRIDGE", p: { type: "gift", userId: SIM_DUEL_B, nickname: "β", giftId: "gift_box", team: "bravo" } },
    { label: "TEST · TORNADO", p: { type: "gift", userId: SIM_DUEL_A, nickname: "α", giftId: "donut", team: "alpha" } },
    { label: "TEST · FIRE LOTUS", p: { type: "gift", userId: SIM_DUEL_B, nickname: "β", giftId: "lotus", team: "bravo" } },
    { label: "TEST · MURAD", p: { type: "gift", userId: SIM_DUEL_A, nickname: "α", giftId: "crown", team: "alpha" } },
    { label: "TEST · DRAGON'S PALM", p: { type: "gift", userId: SIM_DUEL_B, nickname: "β", giftId: "dragon", team: "bravo" } },
    { label: "TEST · HOOK (Follow)", p: { type: "follow", userId: SIM_DUEL_A, nickname: "α", team: "alpha" } },
    { label: "TEST · MISSILE (Like)", p: { type: "like", userId: SIM_DUEL_B, nickname: "β", likeCount: 1, team: "bravo" } },
    { label: "TEST · ALL COMBO", p: { type: "gift", userId: SIM_DUEL_A, nickname: "α", giftId: "treasure_chest", team: "alpha" } },
    {
      label: "TEST · Coins 1◇ Heavy slug",
      p: { type: "gift", userId: SIM_DUEL_B, nickname: "β", giftId: "unknown_gift", diamondCount: 1, team: "bravo" },
    },
    {
      label: "TEST · Coins 10◇ 5× heavy",
      p: { type: "gift", userId: SIM_DUEL_A, nickname: "α", giftId: "unknown_gift", diamondCount: 10, team: "alpha" },
    },
    {
      label: "TEST · Coins 20◇ 10× lightning",
      p: { type: "gift", userId: SIM_DUEL_B, nickname: "β", giftId: "unknown_gift", diamondCount: 20, team: "bravo" },
    },
    {
      label: "TEST · Coins 30◇ Mega vortex",
      p: { type: "gift", userId: SIM_DUEL_A, nickname: "α", giftId: "unknown_gift", diamondCount: 30, team: "alpha" },
    },
    {
      label: "TEST · Coins 100◇ Lotus salvo",
      p: { type: "gift", userId: SIM_DUEL_B, nickname: "β", giftId: "unknown_gift", diamondCount: 100, team: "bravo" },
    },
    {
      label: "TEST · Coins 175◇ Dragon wipe",
      p: { type: "gift", userId: SIM_DUEL_A, nickname: "α", giftId: "unknown_gift", diamondCount: 175, team: "alpha" },
    },
    {
      label: "TEST · Coins 450◇ wipe + morale",
      p: { type: "gift", userId: SIM_DUEL_B, nickname: "β", giftId: "unknown_gift", diamondCount: 450, team: "bravo" },
    },
    {
      label: "TEST · Coins 500◇ map wipe",
      p: { type: "gift", userId: SIM_DUEL_A, nickname: "α", giftId: "unknown_gift", diamondCount: 500, team: "alpha" },
    },
  ];

  const pauseBetweenMs = 900;
  const pollMs = 100;
  const maxStepMs = 32000;
  let idx = 0;

  function runStep() {
    if (gen !== simBattleGeneration) return;
    if (idx >= steps.length) {
      addFloat(MID, H * 0.14, "TEST · Round complete", "#9ad89a");
      return;
    }
    simClearTransientVfx();
    simEnsureDuelists();
    const step = steps[idx];
    addFloat(MID, H * 0.1, step.label, "#e8d090");
    try {
      handleTikTokPayload(step.p, { allowWithoutLiveGate: true });
    } catch (e) {
      console.warn("[STREAMXT] sim duel step failed:", e);
    }
    const t0 = performance.now();
    const iv = setInterval(() => {
      if (gen !== simBattleGeneration) {
        clearInterval(iv);
        return;
      }
      if (simDuelistsSomeoneDead() || performance.now() - t0 > maxStepMs) {
        clearInterval(iv);
        idx += 1;
        setTimeout(runStep, pauseBetweenMs);
      }
    }, pollMs);
  }

  setTimeout(runStep, 450);
}

function updateProjectiles(dt) {
  for (const pr of state.projectiles) {
    if (pr.kind === "chain") {
      pr.life -= dt;
      continue;
    }
    if (pr.kind === "dragon_fly") {
      pr.t = (pr.t || 0) + dt;
      pr.x += pr.dir * pr.spd * dt;
      pr.y += Math.sin(pr.t * 2.55) * 34 * dt;
      pr.y = Math.max(88, Math.min(H - 88, pr.y));
      if (Math.random() < 0.48) {
        spawnParticles(
          pr.x - pr.dir * 44 + (Math.random() - 0.5) * 16,
          pr.y + 16 + (Math.random() - 0.5) * 12,
          2,
          "rgba(255, 150, 45, 0.82)",
          34,
          102,
        );
      }
      const ptm = unitTeamId(pr);
      const hw = 62;
      const hh = 44;
      for (const e of state.units) {
        if (e.hp <= 0 || unitTeamId(e) === ptm) continue;
        if (pr.ownerId && e.userId === pr.ownerId) continue;
        if (Math.abs(e.x - pr.x) < hw + e.r * 0.85 && Math.abs(e.y - pr.y) < hh + e.r * 0.55) {
          if (pr.ownerId) e.lastHitBy = pr.ownerId;
          applyShieldedDamage(e, pr.dmgTick * dt);
          e.hitFlash = Math.max(e.hitFlash || 0, 0.35);
          if (Math.random() < 0.55) {
            spawnParticles(e.x, e.y - e.r * 0.4, 1, "rgba(255, 200, 80, 0.75)", 26, 82);
          }
        }
      }
      pr.life -= dt;
      if (pr.x < -90 || pr.x > W + 90) pr.life = 0;
      continue;
    }
    if (pr.jetonHoming) applyJetonHomingVelocity(pr, dt);
    const pm = PROJ_PACE * dt;
    pr.x += pr.vx * pm;
    pr.y += pr.vy * pm;
    if (pr.kind === "bullet" || pr.kind === "missile" || pr.kind === "dart" || pr.kind === "slayer" || pr.kind === "heavy_ball") {
      if (!pr.trail) pr.trail = [];
      pr.trail.push({ x: pr.x, y: pr.y });
      const cap =
        pr.kind === "slayer"
          ? 22
          : pr.kind === "missile"
            ? 16
            : pr.kind === "dart"
              ? 7
              : pr.kind === "heavy_ball"
                ? 14
                : 11;
      while (pr.trail.length > cap) pr.trail.shift();
    }
    pr.life -= dt;
    if (pr.kind === "missile" && Math.random() < 0.6) {
      spawnParticles(pr.x, pr.y, 1, "rgba(120, 110, 100, 0.55)", 18, 55);
    }
    if (pr.kind === "heavy_ball" && Math.random() < 0.45) {
      spawnParticles(pr.x, pr.y, 1, "rgba(160, 150, 130, 0.5)", 22, 62);
    }
    if (pr.kind === "dart" && Math.random() < 0.38) {
      spawnParticles(pr.x, pr.y, 1, "rgba(255, 170, 200, 0.42)", 12, 42);
    }
    if (pr.kind === "slayer" && Math.random() < 0.5) {
      spawnParticles(pr.x, pr.y, 1, "rgba(232, 200, 90, 0.55)", 22, 68);
    }
    if (pr.kind === "wave") {
      pr.w += 128 * dt;
      const ptm = unitTeamId(pr);
      damageCircle(
        pr.x + (ptm === 0 ? 1 : -1) * pr.w * 0.35,
        pr.y,
        pr.h * 0.6,
        pr.dmg * dt * 2.2,
        ptm,
        0,
        pr.ownerId,
      );
      continue;
    }
    for (const e of state.units) {
      if (e.hp <= 0) continue;
      if (unitTeamId(e) === unitTeamId(pr)) continue;
      if (pr.ownerId && e.userId === pr.ownerId) continue;
      const dx = e.x - pr.x;
      const dy = e.y - pr.y;
      if (dx * dx + dy * dy <= (e.r + pr.r) ** 2) {
        if (pr.ownerId) {
          e.lastHitBy = pr.ownerId;
          const atk = state.units.find((x) => x.userId === pr.ownerId);
          if (atk) atk.damageDealt = (atk.damageDealt || 0) + pr.dmg;
        }
        applyShieldedDamage(e, pr.dmg);
        e.hitFlash = Math.max(e.hitFlash || 0, 0.32);
        const killed = e.hp <= 0;
        const col = unitTeamId(pr) === 0 ? "rgba(200, 72, 58, 0.88)" : "rgba(72, 118, 168, 0.88)";
        const burst =
          pr.kind === "slayer" ? 22 : pr.kind === "missile" ? 8 : pr.kind === "dart" ? 4 : pr.kind === "heavy_ball" ? 14 : 5;
        const sh =
          pr.kind === "slayer" ? 14 : pr.kind === "missile" ? 6 : pr.kind === "dart" ? 2 : pr.kind === "heavy_ball" ? 9 : 3;
        if (pr.jetonHoming && !killed) {
          spawnParticles(pr.x, pr.y, Math.max(4, (burst / 3) | 0), col, 42, 140);
          playSfx("hit");
          addShake(Math.min(5, sh));
          break;
        }
        pr.life = 0;
        spawnParticles(pr.x, pr.y, burst, col, 55, 180);
        playSfx("hit");
        addShake(sh);
        break;
      }
    }
  }
  state.projectiles = state.projectiles.filter((p) => p.life > 0);
}

function updateBeams(dt) {
  for (const b of state.beams) {
    b.t += dt;
    b.life -= dt;
    const len = 420;
    const x1 = b.x0 + Math.cos(b.ang) * len;
    const y1 = b.y0 + Math.sin(b.ang) * len;
    for (const e of state.units) {
      if (unitTeamId(e) === unitTeamId(b) || e.hp <= 0) continue;
      const dist = pointSegmentDist(e.x, e.y, b.x0, b.y0, x1, y1);
      if (dist < b.width * 0.5 + e.r) {
        let dmg = b.dmgTick * dt;
        if (b.ownerId) e.lastHitBy = b.ownerId;
        applyShieldedDamage(e, dmg);
      }
    }
  }
  state.beams = state.beams.filter((b) => b.life > 0);
}

function pointSegmentDist(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const L2 = dx * dx + dy * dy || 1;
  let t = ((px - x0) * dx + (py - y0) * dy) / L2;
  t = Math.max(0, Math.min(1, t));
  const qx = x0 + t * dx;
  const qy = y0 + t * dy;
  return Math.hypot(px - qx, py - qy);
}

function updateZones(dt) {
  for (const z of state.zones) {
    if (z.delay > 0) {
      const was = z.delay;
      z.delay -= dt;
      if (z.kind === "lightning" && was > 0 && z.delay <= 0) {
        playSfx("hit");
        addShake(z.visualJeton ? 5.5 : 3.5);
        spawnParticles(
          z.x,
          z.y,
          z.visualJeton ? 20 : 10,
          z.visualJeton ? "rgba(120, 140, 220, 0.82)" : "rgba(72, 88, 105, 0.75)",
          z.visualJeton ? 58 : 48,
          z.visualJeton ? 185 : 150,
        );
      }
      continue;
    }
    z.life -= dt;
    if (z.kind === "lightning") {
      const hitRad = z.hitR != null ? z.hitR : 40;
      damageCircle(z.x, z.y, hitRad, z.dmg, z.team, 10, z.ownerId);
    } else if (z.kind === "tornado") {
      z.x += z.vx * dt;
      z.angle += dt * 8;
      damageCircle(z.x, z.y, z.rad, z.dmgPerS * dt, z.team, 0, z.ownerId);
      const zt = unitTeamId(z);
      if ((zt === 0 && z.x > MID + 40) || (zt === 1 && z.x < MID - 40)) z.life = 0;
    } else if (z.kind === "vortex") {
      z.angle += dt * 9;
      const inner = z.visualJeton ? 0.48 : 0.42;
      damageCircle(z.x, z.y, z.rad * inner, z.dmgPerS * dt, z.team, 0, z.ownerId);
      const pull = (z.pull || 280) * dt;
      const radPull = z.rad * 1.35;
      for (const pr of state.projectiles) {
        if (pr.kind === "chain" || pr.kind === "wave" || pr.kind === "dragon_fly") continue;
        if (unitTeamId(pr) === unitTeamId(z)) continue;
        const dx = z.x - pr.x;
        const dy = z.y - pr.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d > radPull) continue;
        if (d < 16) {
          pr.life = 0;
          spawnParticles(pr.x, pr.y, 11, "rgba(200, 205, 235, 0.82)", 52, 165);
          damageCircle(pr.x, pr.y, 46, z.suckDmg || 28, z.team, 0, z.ownerId);
          playSfx("hit");
        } else {
          pr.vx += (dx / d) * pull * 95;
          pr.vy += (dy / d) * pull * 95;
        }
      }
    } else if (z.kind === "lotus") {
      z.t += dt;
      const rr = (z.t / 1.4) * z.maxR;
      const zt = unitTeamId(z);
      if (z.lotusPullAll) {
        const pull = (z.lotusPull || 400) * dt;
        const burn = z.lotusInferno ? (z.burnDps || 130) * dt : 0;
        for (const e of state.units) {
          if (e.hp <= 0 || unitTeamId(e) === zt) continue;
          if (burn > 0) {
            if (z.ownerId) e.lastHitBy = z.ownerId;
            applyShieldedDamage(e, burn);
            e.hitFlash = Math.max(e.hitFlash || 0, 0.55);
            if (Math.random() < 0.48) {
              spawnParticles(
                e.x + (Math.random() - 0.5) * e.r * 1.2,
                e.y - e.r * 0.35 + (Math.random() - 0.5) * 8,
                2,
                "rgba(255, 200, 60, 0.92)",
                32,
                102,
              );
            }
            if (e.hp <= 0) {
              const atk = z.ownerId ? state.units.find((x) => x.userId === z.ownerId) : null;
              if (atk) atk.damageDealt = (atk.damageDealt || 0) + 55;
              spawnParticles(e.x, e.y, 24, "rgba(255, 220, 80, 0.92)", 72, 220);
              continue;
            }
          }
          const dx = z.x - e.x;
          const dy = z.y - e.y;
          const d = Math.hypot(dx, dy) || 1;
          if (d <= e.r + 18) {
            if (z.ownerId) {
              e.lastHitBy = z.ownerId;
            }
            if (isCrowdUnit(e)) {
              e.hp = 0;
            } else {
              applyShieldedDamage(e, e.maxHp * 0.38 + 22);
            }
            e.hitFlash = Math.max(e.hitFlash || 0, 0.4);
            spawnParticles(e.x, e.y, 18, "rgba(255, 140, 40, 0.85)", 62, 195);
            if (z.ownerId && e.hp <= 0) {
              const atk = state.units.find((x) => x.userId === z.ownerId);
              if (atk) atk.damageDealt = (atk.damageDealt || 0) + Math.min(220, (e.maxHp || 100) * 0.6);
            }
          } else {
            const k = Math.min(1.2, 340 / (d + 38));
            e.x += (dx / d) * pull * k;
            e.y += (dy / d) * pull * k;
            clampUnitToArena(e);
          }
        }
      }
      damageCircle(z.x, z.y, rr, z.dmgTick * dt, z.team, 0, z.ownerId);
    }
  }
  state.zones = state.zones.filter((z) => z.life > 0);
}

function updatePickups(dt) {
  outer: for (const pk of state.pickups) {
    pk.y += pk.vy * dt;
    pk.life -= dt;
    for (const u of state.units) {
      if (u.hp <= 0) continue;
      const dx = u.x - pk.x;
      const dy = u.y - pk.y;
      if (dx * dx + dy * dy <= (u.r + pk.r) ** 2) {
        u.hp = Math.min(u.maxHp, u.hp + 28);
        u.shield = Math.min(36, (u.shield || 0) + 14);
        addFloat(u.x, u.y - u.r - 18, "DELIVERY", "#7cb97c");
        playSfx("spawn");
        spawnParticles(pk.x, pk.y, 10, "rgba(90, 150, 110, 0.55)", 38, 110);
        pk.life = 0;
        continue outer;
      }
    }
  }
  state.pickups = state.pickups.filter((p) => p.life > 0 && p.y < H + 55);
}

function cleanupDead() {
  const alive = [];
  for (const u of state.units) {
    if (u.hp <= 0) {
      if (u.noKillScore) {
        spawnParticles(u.x, u.y, 8, "rgba(255, 200, 100, 0.55)", 40, 130);
        u.noKillScore = false;
      } else {
        registerKill(unitTeamId(u) === 0 ? 1 : 0);
        const killerId = u.lastHitBy;
        const killer = killerId ? state.units.find((x) => x.userId === killerId) : null;
        if (killer && killer.hp > 0) {
          killer.killStreak = (killer.killStreak || 0) + 1;
          addFloat(killer.x, killer.y - killer.r - 16, `STREAK ×${killer.killStreak}`, "#d4c078");
          if (killer.killStreak >= 3) playSfx("combo");
          if (killer.killStreak >= 2 && killer.killStreak % 2 === 0) {
            killer.shield = Math.min(38, (killer.shield || 0) + 10);
            addFloat(killer.x, killer.y - killer.r - 30, "SHIELD", "#7eb8d8");
          }
          if (
            !isCrowdUnit(killer) &&
            !isCrowdUnit(u) &&
            unitTeamId(killer) !== unitTeamId(u)
          ) {
            killer.kills = (killer.kills || 0) + 1;
            const absorbed = transferVictimHpToKiller(u, killer);
            if (absorbed > 0) {
              addFloat(killer.x, killer.y - killer.r - 44, `+${absorbed} HP`, "#8ed4a0");
            }
            growUnitFromGift(killer, "kill_reward", { scale: 1 });
          }
        }
        const winTeam = unitTeamId(u) === 0 ? 1 : 0;
        state.teamMorale[winTeam] = Math.min(100, state.teamMorale[winTeam] + 7);
        state.teamMorale[unitTeamId(u)] = Math.max(14, state.teamMorale[unitTeamId(u)] - 5);
        updateMoraleDom();
        addFloat(u.x, u.y - 20, "ELIMINATED", "#b85c5c");
        playSfx("kill");
        addShake(9);
        spawnParticles(u.x, u.y, 26, "rgba(70, 62, 60, 0.9)", 70, 220);
      }
    } else alive.push(u);
  }
  state.units = alive;
}

function updateUnits(dt) {
  for (const u of state.units) {
    if (!u.trail) u.trail = [];
    u.trail.push({ x: u.x, y: u.y });
    if (u.trail.length > 12) u.trail.shift();

    if (u.animBirth !== undefined && u.animBirth < 1) u.animBirth = Math.min(1, u.animBirth + dt * 1.25);
    if (u.hitFlash > 0) u.hitFlash = Math.max(0, u.hitFlash - dt * 4.2);

    u.cd -= dt;
    const isCrowd = isCrowdUnit(u);
    if (!isCrowd && u.cd <= 0) {
      const tgt = nearestBattleTarget(u, PLAYER_FIRE_RANGE);
      if (tgt) {
        const ang = Math.atan2(tgt.y - u.y, tgt.x - u.x);
        const bspd = 8.6 + Math.min(2.4, (u.power || 1) * 0.45);
        state.projectiles.push({
          kind: "bullet",
          team: unitTeamId(u),
          ownerId: u.userId,
          x: u.x,
          y: u.y,
          vx: Math.cos(ang) * bspd,
          vy: Math.sin(ang) * bspd,
          life: 2.05,
          dmg: 5.8 * (u.power || 1),
          r: 3.1,
        });
        u.cd = 0.42 + Math.min(0.14, (u.power || 1) * 0.032);
      }
    }
  }

  stepWarFrontUnitPhysics(dt);
}

function updateFloatTexts(dt) {
  for (const f of state.floatTexts) {
    f.t += dt;
    f.pop = Math.min(1, f.pop + dt * 2.8);
    f.y += f.vy * dt;
    f.vy *= Math.pow(0.92, dt * 60);
  }
  state.floatTexts = state.floatTexts.filter((f) => f.t < 1.2);
}

let last = performance.now();
let shakePhase = 0;
let streamxtLbDomSig = "";
let streamxtLbIdentitySig = "";
let streamxtLbStatsSig = "";
let streamxtLbLastAt = 0;
const STREAMXT_LB_INTERVAL_MS = 280;

/** Alt HUD tutorial satırları (yayın görseli: sarı kod + beyaz aksiyon) */
const STREAMXT_TUTORIAL_ROWS = [
  { code: "ROSE", action: "MISSILE" },
  { code: "FINGER", action: "LEISURE" },
  { code: "ROSA", action: "BULLET STORM" },
  { code: "PERFUME", action: "THUNDER BRIDGE" },
  { code: "DOUGHNUT", action: "TORNADO" },
  { code: "HAND HEARTS", action: "FIRE LOTUS" },
  { code: "HEARTS", action: "MURAD" },
  { code: "BOXING GLOVES", action: "DRAGON'S PALM" },
  { code: "MONEY GUN", action: "ALL COMBO" },
];

function initStreamxtBottomHud() {
  const leg = document.getElementById("streamxtGiftLegend");
  if (!leg) return;
  leg.replaceChildren();
  const list = document.createElement("div");
  list.className = "streamxt-tutorial-list";
  for (const row of STREAMXT_TUTORIAL_ROWS) {
    const wrap = document.createElement("div");
    wrap.className = "streamxt-tutorial-row";
    const code = document.createElement("span");
    code.className = "streamxt-tutorial-code";
    code.textContent = row.code;
    const act = document.createElement("span");
    act.className = "streamxt-tutorial-action";
    act.textContent = row.action;
    wrap.appendChild(code);
    wrap.appendChild(act);
    list.appendChild(wrap);
  }
  leg.appendChild(list);
}

function getStreamxtLeaderboardRows() {
  const map = new Map();
  if (state.matchPlayerLedger) {
    for (const row of state.matchPlayerLedger.values()) {
      map.set(row.userId, { ...row });
    }
  }
  for (const u of state.units) {
    if (isCrowdUnit(u) || u.hp <= 0) continue;
    const id = u.userId;
    const prev = map.get(id) || {};
    map.set(id, {
      userId: id,
      nickname: u.nickname || prev.nickname || "?",
      avatarUrl: String(u.avatarUrl || "").trim() || prev.avatarUrl || "",
      team: unitTeamId(u),
      damageDealt: Math.max(Math.round(u.damageDealt || 0), prev.damageDealt || 0),
      kills: Math.max(u.kills || 0, prev.kills || 0),
    });
  }
  return [...map.values()]
    .sort((a, b) => (b.damageDealt - a.damageDealt) || (b.kills - a.kills))
    .slice(0, 5);
}

function mountStreamxtLbAvatar(container, userId, nickname, avatarUrl) {
  container.replaceChildren();
  const url = String(avatarUrl || "").trim();
  const showFallback = () => {
    container.replaceChildren();
    const fb = document.createElement("div");
    fb.className = "streamxt-lb-av-fallback";
    fb.style.background = colorForUser(userId);
    fb.textContent = String(nickname || "?").slice(0, 2).toUpperCase();
    container.appendChild(fb);
  };
  if (!url) {
    showFallback();
    return;
  }
  getCachedAvatar(url);
  const candidates = [];
  const proxied = toAvatarLoadUrl(url);
  if (proxied) candidates.push(proxied);
  if (!candidates.includes(url)) candidates.push(url);
  const cached = avatarCache.get(url);
  if (cached?.ready && cached.img?.src) {
    const im = document.createElement("img");
    im.alt = "";
    im.decoding = "async";
    im.referrerPolicy = "no-referrer";
    im.src = cached.img.src;
    im.onerror = showFallback;
    container.appendChild(im);
    return;
  }
  const im = document.createElement("img");
  im.alt = "";
  im.decoding = "async";
  im.referrerPolicy = "no-referrer";
  let idx = 0;
  im.onerror = () => {
    idx += 1;
    if (idx < candidates.length) im.src = candidates[idx];
    else showFallback();
  };
  im.src = candidates[0] || url;
  container.appendChild(im);
}

function buildStreamxtLbRow(u) {
  const row = document.createElement("div");
  row.className = "streamxt-lb-row";
  row.dataset.userId = u.userId;

  const avWrap = document.createElement("div");
  avWrap.className = "streamxt-lb-av";
  mountStreamxtLbAvatar(avWrap, u.userId, u.nickname, u.avatarUrl);

  const mid = document.createElement("div");
  mid.className = "streamxt-lb-mid";
  const nick = document.createElement("span");
  nick.className = "streamxt-lb-nick";
  nick.textContent = u.nickname || "?";
  mid.appendChild(nick);

  const sc = document.createElement("div");
  sc.className = "streamxt-lb-scorewrap";
  const score = document.createElement("span");
  score.className = "streamxt-lb-score";
  score.textContent = String(Math.round(u.damageDealt || 0));
  const killsRow = document.createElement("div");
  killsRow.className = "streamxt-lb-kills";
  const skull = document.createElement("span");
  skull.className = "streamxt-lb-skull";
  skull.setAttribute("aria-hidden", "true");
  skull.textContent = "\u2620";
  const kn = document.createElement("span");
  kn.className = "streamxt-lb-killnum";
  kn.textContent = String(u.kills || 0);
  killsRow.appendChild(skull);
  killsRow.appendChild(kn);
  sc.appendChild(score);
  sc.appendChild(killsRow);

  row.appendChild(avWrap);
  row.appendChild(mid);
  row.appendChild(sc);
  return row;
}

function patchStreamxtLbRowStats(row, u) {
  const score = row.querySelector(".streamxt-lb-score");
  const kn = row.querySelector(".streamxt-lb-killnum");
  if (score) score.textContent = String(Math.round(u.damageDealt || 0));
  if (kn) kn.textContent = String(u.kills || 0);
  const nick = row.querySelector(".streamxt-lb-nick");
  if (nick && u.nickname) nick.textContent = u.nickname;
  const avWrap = row.querySelector(".streamxt-lb-av");
  const url = String(u.avatarUrl || "").trim();
  if (avWrap && url) {
    const img = avWrap.querySelector("img");
    const hasFallback = avWrap.querySelector(".streamxt-lb-av-fallback");
    if (hasFallback || !img || (img.complete && !img.naturalWidth)) {
      mountStreamxtLbAvatar(avWrap, u.userId, u.nickname, url);
    }
  }
}

function updateStreamxtLeaderboardDom() {
  const root = document.getElementById("streamxtLeaderboard");
  if (!root) return;
  const now = performance.now();
  if (now - streamxtLbLastAt < STREAMXT_LB_INTERVAL_MS) return;
  streamxtLbLastAt = now;

  if (!state.tiktokJoinGate) {
    if (streamxtLbDomSig !== "__stream_off__") {
      streamxtLbDomSig = "__stream_off__";
      streamxtLbIdentitySig = "";
      streamxtLbStatsSig = "";
      root.replaceChildren();
    }
    return;
  }

  const top = getStreamxtLeaderboardRows();
  const identitySig = top.map((u) => `${u.userId}|${u.nickname}|${u.avatarUrl || ""}`).join(";");
  const statsSig = top.map((u) => `${u.userId}:${u.damageDealt}:${u.kills}`).join(";");

  if (identitySig !== streamxtLbIdentitySig) {
    streamxtLbIdentitySig = identitySig;
    streamxtLbStatsSig = statsSig;
    streamxtLbDomSig = identitySig;
    root.replaceChildren();
    for (const u of top) {
      root.appendChild(buildStreamxtLbRow(u));
    }
    return;
  }

  if (statsSig === streamxtLbStatsSig) return;
  streamxtLbStatsSig = statsSig;
  streamxtLbDomSig = `${identitySig}#${statsSig}`;

  const rows = root.querySelectorAll(".streamxt-lb-row");
  const byId = new Map();
  for (const row of rows) {
    const id = row.dataset.userId;
    if (id) byId.set(id, row);
  }
  for (const u of top) {
    const row = byId.get(u.userId);
    if (row) patchStreamxtLbRowStats(row, u);
  }
}

function tick(now) {
  const raw = (now - last) / 1000;
  last = now;
  const wallDt = Math.min(1 / 20, Math.max(1 / 180, raw));
  const dt = wallDt * GAME_PACE;
  shakePhase += dt * (5.5 + state.screenShake * 0.85);

  if (!state.matchOver) {
    updateUnits(dt);
    updateProjectiles(dt);
    updateBeams(dt);
    updateZones(dt);
    updatePickups(dt);
    syncMatchPlayerLedger();
    cleanupDead();
    if (performance.now() >= state.matchDeadlineMs) {
      state.matchOver = true;
      syncMatchPlayerLedger();
      showMatchFinishOverlay();
      if (matchAutoRestartTimer != null) {
        clearTimeout(matchAutoRestartTimer);
        matchAutoRestartTimer = null;
      }
      matchAutoRestartTimer = setTimeout(() => {
        matchAutoRestartTimer = null;
        beginMatchCountdown();
      }, 5000);
    }
  }

  killMusicUpdate();
  if (!state.matchOver) {
    updateFloatTexts(dt);
    updateParticles(dt);
    state.pickupSpawnT += dt;
    if (state.pickupSpawnT > 26 && state.pickups.length < 2) {
      state.pickupSpawnT = 0;
      state.pickups.push({
        x: 70 + Math.random() * (W - 140),
        y: -18,
        vy: 42 + Math.random() * 28,
        r: 12,
        life: 30,
      });
    }
    state._mvpAcc = (state._mvpAcc || 0) + dt;
    if (state._mvpAcc >= 0.8) {
      state._mvpAcc = 0;
      let best = null;
      for (const u of state.units) {
        if (isCrowdUnit(u)) continue;
        const d = u.damageDealt || 0;
        if (d > 0 && (!best || d > best.d))
          best = { userId: u.userId, nick: u.nickname, d };
      }
      state.mvpLeader = best;
    }
  }
  state.screenShake *= Math.pow(0.88, dt * 62);
  if (state.edgeFlash > 0) state.edgeFlash -= dt;
  draw();
  updateStreamxtLeaderboardDom();
  requestAnimationFrame(tick);
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  drawGround();

  const sh = state.screenShake;
  const ox =
    Math.sin(shakePhase) * sh * 0.38 + Math.sin(shakePhase * 1.31) * sh * 0.16;
  const oy =
    Math.cos(shakePhase * 1.03) * sh * 0.34 + Math.cos(shakePhase * 1.67) * sh * 0.12;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  for (const b of state.beams) {
    const len = 420;
    const x1 = b.x0 + Math.cos(b.ang) * len;
    const y1 = b.y0 + Math.sin(b.ang) * len;
    const tm = unitTeamId(b);
    const pulse = 0.86 + 0.14 * Math.sin(b.t * 28 + b.ang * 2);
    const flick = 0.92 + 0.08 * Math.sin(performance.now() * 0.018 + b.x0 * 0.02);
    const cx = Math.cos(b.ang);
    const cy = Math.sin(b.ang);
    const px = -cy;
    const py = cx;

    const muzzle = Math.exp(-b.t * 6.2);
    if (muzzle > 0.04) {
      const rg = ctx.createRadialGradient(b.x0, b.y0, 0, b.x0, b.y0, 36 * muzzle);
      if (tm === 0) {
        rg.addColorStop(0, `rgba(220, 255, 255, ${0.55 * muzzle * flick})`);
        rg.addColorStop(0.35, `rgba(80, 200, 255, ${0.35 * muzzle})`);
        rg.addColorStop(1, "rgba(20, 80, 140, 0)");
      } else {
        rg.addColorStop(0, `rgba(255, 240, 250, ${0.55 * muzzle * flick})`);
        rg.addColorStop(0.35, `rgba(255, 140, 200, ${0.38 * muzzle})`);
        rg.addColorStop(1, "rgba(120, 30, 80, 0)");
      }
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(b.x0, b.y0, 36 * muzzle, 0, Math.PI * 2);
      ctx.fill();
    }

    const tipPulse = 0.75 + 0.25 * Math.sin(b.t * 35);
    ctx.fillStyle =
      tm === 0
        ? `rgba(120, 230, 255, ${0.12 * tipPulse * flick})`
        : `rgba(255, 160, 210, ${0.14 * tipPulse * flick})`;
    ctx.beginPath();
    ctx.arc(x1, y1, 14 * tipPulse, 0, Math.PI * 2);
    ctx.fill();

    const segs = 24;
    const wiggleAmp = 2.8 * pulse;
    const drawWigglePath = (wigScale) => {
      ctx.beginPath();
      for (let i = 0; i <= segs; i++) {
        const u = i / segs;
        const wx = b.x0 + cx * len * u;
        const wy = b.y0 + cy * len * u;
        const wig = Math.sin(b.t * 24 + u * 20) * wiggleAmp * wigScale;
        const qx = wx + px * wig;
        const qy = wy + py * wig;
        if (i === 0) ctx.moveTo(qx, qy);
        else ctx.lineTo(qx, qy);
      }
    };

    ctx.lineCap = "round";
    ctx.shadowBlur = 0;
    drawWigglePath(1.35);
    ctx.strokeStyle =
      tm === 0 ? `rgba(30, 160, 255, ${0.14 * pulse})` : `rgba(255, 80, 150, ${0.15 * pulse})`;
    ctx.lineWidth = b.width * pulse * 1.85;
    ctx.stroke();

    drawWigglePath(1);
    ctx.strokeStyle =
      tm === 0 ? `rgba(60, 200, 255, ${0.22 * flick})` : `rgba(255, 120, 190, ${0.24 * flick})`;
    ctx.lineWidth = b.width * pulse * 1.05;
    ctx.stroke();

    const grd = ctx.createLinearGradient(b.x0, b.y0, x1, y1);
    if (tm === 0) {
      grd.addColorStop(0, `rgba(255, 255, 255, ${0.95 * flick})`);
      grd.addColorStop(0.12, "rgba(180, 245, 255, 0.85)");
      grd.addColorStop(0.45, "rgba(80, 210, 255, 0.55)");
      grd.addColorStop(0.78, "rgba(40, 120, 220, 0.28)");
      grd.addColorStop(1, "rgba(20, 40, 90, 0.06)");
    } else {
      grd.addColorStop(0, `rgba(255, 255, 255, ${0.95 * flick})`);
      grd.addColorStop(0.12, "rgba(255, 220, 240, 0.88)");
      grd.addColorStop(0.45, "rgba(255, 130, 190, 0.52)");
      grd.addColorStop(0.78, "rgba(200, 60, 140, 0.3)");
      grd.addColorStop(1, "rgba(80, 20, 60, 0.06)");
    }
    drawWigglePath(0.55);
    ctx.strokeStyle = grd;
    ctx.lineWidth = b.width * pulse * 0.68;
    ctx.shadowColor = tm === 0 ? "rgba(100, 220, 255, 0.45)" : "rgba(255, 150, 200, 0.48)";
    ctx.shadowBlur = 14 * pulse;
    ctx.stroke();
    ctx.shadowBlur = 0;

    drawWigglePath(0.25);
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.55 + 0.25 * flick})`;
    ctx.lineWidth = Math.max(1.2, b.width * 0.14 * pulse);
    ctx.stroke();

    drawWigglePath(0.25);
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.55 + 0.25 * flick})`;
    ctx.lineWidth = Math.max(1.2, b.width * 0.14 * pulse);
    ctx.stroke();

    const sparkPhase = b.t * 32;
    for (let k = 0; k < 6; k++) {
      const u = 0.1 + ((k * 0.16 + sparkPhase * 0.008) % 0.82);
      const wx = b.x0 + cx * len * u + Math.sin(sparkPhase + k * 2.1) * 4;
      const wy = b.y0 + cy * len * u + Math.cos(sparkPhase * 0.9 + k) * 3;
      ctx.globalAlpha = 0.35 * flick * pulse;
      ctx.fillStyle = tm === 0 ? "rgba(200, 255, 255, 0.9)" : "rgba(255, 230, 250, 0.9)";
      ctx.beginPath();
      ctx.arc(wx, wy, 2 + (k % 2), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  for (const z of state.zones) {
    if (z.kind === "lightning" && z.delay <= 0) {
      const bolts = z.bolts || [];
      const flick = 0.92 + 0.08 * Math.sin(performance.now() * 0.012 + z.x * 0.01);
      const j = z.visualJeton === true;
      ctx.shadowColor = j ? "rgba(180, 140, 255, 0.55)" : "rgba(200, 220, 255, 0.35)";
      ctx.shadowBlur = (j ? 14 : 6) * flick;
      ctx.strokeStyle = j ? `rgba(110, 80, 200, ${0.62 * flick})` : `rgba(70, 95, 130, ${0.45 * flick})`;
      ctx.lineWidth = (j ? 7.2 : 5) * flick;
      for (const seg of bolts) {
        ctx.beginPath();
        ctx.moveTo(seg.x1, seg.y1);
        ctx.lineTo(seg.x2, seg.y2);
        ctx.stroke();
      }
      ctx.strokeStyle = j ? `rgba(240, 230, 255, ${0.88 * flick})` : `rgba(230, 238, 255, ${0.75 * flick})`;
      ctx.lineWidth = (j ? 2.2 : 1.4) * flick;
      for (const seg of bolts) {
        ctx.beginPath();
        ctx.moveTo(seg.x1, seg.y1);
        ctx.lineTo(seg.x2, seg.y2);
        ctx.stroke();
      }
      if (j) {
        const hr = (z.hitR != null ? z.hitR : 58) * 0.42;
        ctx.strokeStyle = `rgba(160, 120, 255, ${0.22 * flick})`;
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 10]);
        ctx.beginPath();
        ctx.arc(z.x, z.y, hr * flick, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.shadowBlur = 0;
      const throb = 0.96 + 0.04 * Math.sin(z.angle * 0.35);
      const scale = z.kind === "vortex" ? (z.rad || 118) / 52 : 1;
      const jv = z.kind === "vortex" && z.visualJeton === true;
      ctx.strokeStyle =
        z.kind === "vortex"
          ? jv
            ? `rgba(120, 100, 190, ${0.58 * throb})`
            : `rgba(88, 86, 118, ${0.48 * throb})`
          : `rgba(55, 58, 62, ${0.42 * throb})`;
      ctx.lineWidth = (z.kind === "vortex" ? (jv ? 6.2 : 5.2) : 4.2) * throb;
      ctx.beginPath();
      const x0 = z.x + Math.cos(z.angle) * 20 * scale;
      const y0 = z.y + Math.sin(z.angle) * 11 * scale;
      ctx.moveTo(x0, y0);
      for (let i = 1; i < 44; i++) {
        const a = z.angle + i * 0.34;
        const rr = (20 + i * 1.85) * scale;
        ctx.lineTo(z.x + Math.cos(a) * rr * throb, z.y + Math.sin(a) * rr * 0.56);
      }
      ctx.stroke();
      ctx.strokeStyle =
        z.kind === "vortex" ? (jv ? "rgba(220, 200, 255, 0.22)" : "rgba(200, 198, 230, 0.14)") : "rgba(180, 182, 188, 0.12)";
      ctx.lineWidth = jv ? 1.65 : 1.2;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      for (let i = 1; i < 44; i++) {
        const a = z.angle + i * 0.34;
        const rr = (20 + i * 1.85) * scale;
        ctx.lineTo(z.x + Math.cos(a) * rr * throb, z.y + Math.sin(a) * rr * 0.56);
      }
      ctx.stroke();
      if (jv) {
        ctx.strokeStyle = `rgba(180, 160, 255, ${0.35 * throb})`;
        ctx.lineWidth = 2.4 * throb;
        ctx.beginPath();
        const x1 = z.x + Math.cos(-z.angle * 1.1) * 18 * scale;
        const y1 = z.y + Math.sin(-z.angle * 1.1) * 10 * scale;
        ctx.moveTo(x1, y1);
        for (let i = 1; i < 36; i++) {
          const a = -z.angle * 1.1 + i * -0.31;
          const rr = (16 + i * 1.9) * scale;
          ctx.lineTo(z.x + Math.cos(a) * rr * throb, z.y + Math.sin(a) * rr * 0.52);
        }
        ctx.stroke();
        const gr = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.rad * 0.55);
        gr.addColorStop(0, `rgba(200, 180, 255, ${0.12 * throb})`);
        gr.addColorStop(0.55, `rgba(80, 60, 140, ${0.06 * throb})`);
        gr.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.rad * 0.55 * throb, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (z.kind === "lotus") {
      const rr = (z.t / 1.4) * z.maxR;
      const inferno = z.lotusInferno === true;
      if (inferno) {
        const pulse = 0.86 + 0.14 * Math.sin(z.t * 15 + performance.now() * 0.005);
        ctx.shadowColor = "rgba(255, 160, 40, 0.65)";
        ctx.shadowBlur = 26 * pulse;
        const gr = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, rr * 0.62);
        gr.addColorStop(0, `rgba(255, 255, 245, ${0.72 * pulse})`);
        gr.addColorStop(0.18, `rgba(255, 220, 80, ${0.58 * pulse})`);
        gr.addColorStop(0.42, `rgba(255, 120, 25, ${0.5 * pulse})`);
        gr.addColorStop(0.72, `rgba(220, 40, 10, ${0.38 * pulse})`);
        gr.addColorStop(1, "rgba(60, 10, 0, 0.04)");
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(z.x, z.y, rr * 0.62 * pulse, 0, Math.PI * 2);
        ctx.fill();
        const petals = z.visualJeton ? 14 : 12;
        for (let p = 0; p < petals; p++) {
          const a = (p / petals) * Math.PI * 2 + z.t * 2.35;
          const al = Math.max(0.08, 0.52 - z.t * 0.12);
          const hot = p % 2 === 0;
          ctx.fillStyle = hot
            ? `rgba(255, 200, 40, ${al * pulse})`
            : `rgba(255, 70, 20, ${al * 0.95 * pulse})`;
          ctx.beginPath();
          ctx.ellipse(
            z.x + Math.cos(a) * rr * 0.5,
            z.y + Math.sin(a) * rr * 0.5,
            hot ? 32 : 28,
            hot ? 15 : 13,
            a,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
        ctx.strokeStyle = `rgba(255, 245, 180, ${0.62 * pulse})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(z.x, z.y, rr * 0.78 * pulse, 0, Math.PI * 2);
        ctx.stroke();
        if (z.visualJeton) {
          ctx.strokeStyle = `rgba(200, 120, 255, ${0.28 * pulse})`;
          ctx.lineWidth = 1.8;
          ctx.setLineDash([7, 11]);
          ctx.beginPath();
          ctx.arc(z.x, z.y, rr * 0.88 * pulse, z.t * 2.2, z.t * 2.2 + Math.PI * 1.6);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.shadowBlur = 0;
      } else {
        const jl = z.visualJeton === true;
        ctx.shadowColor = jl ? "rgba(255, 200, 120, 0.2)" : "rgba(255, 80, 20, 0.12)";
        ctx.shadowBlur = jl ? 16 : 10;
        const petals = jl ? 14 : 10;
        for (let p = 0; p < petals; p++) {
          const a = (p / petals) * Math.PI * 2 + z.t * 2.1;
          const al = Math.max(0, (jl ? 0.34 : 0.28) - z.t * 0.1);
          const alt = jl && p % 2 === 1;
          ctx.fillStyle = alt
            ? `rgba(60, 200, 220, ${al * 0.95})`
            : `rgba(${jl ? "220, 90, 40" : "180, 55, 28"}, ${al})`;
          const ex = jl ? 30 : 26;
          const ey = jl ? 14 : 12;
          ctx.beginPath();
          ctx.ellipse(z.x + Math.cos(a) * rr * 0.52, z.y + Math.sin(a) * rr * 0.52, ex, ey, a, 0, Math.PI * 2);
          ctx.fill();
        }
        if (jl) {
          ctx.strokeStyle = `rgba(255, 220, 140, ${0.35 - z.t * 0.12})`;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(z.x, z.y, rr * 0.35 + 8, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
      }
    } else if (z.kind === "shock") {
      const prog = 1 - z.life / 0.45;
      ctx.strokeStyle = `rgba(120, 118, 100, ${0.55 - prog * 0.42})`;
      ctx.lineWidth = 7 - prog * 4;
      ctx.shadowColor = "rgba(255, 200, 80, 0.12)";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r * (1 - prog * 0.95), 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r * (1 - prog * 0.55) * 0.55, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  for (const pr of state.projectiles) {
    if (pr.kind === "chain") {
      ctx.strokeStyle = "rgba(90, 98, 108, 0.9)";
      ctx.lineWidth = 3.2;
      ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.moveTo(pr.x0, pr.y0);
      ctx.lineTo(pr.x1, pr.y1);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(200, 210, 220, 0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pr.x0, pr.y0);
      ctx.lineTo(pr.x1, pr.y1);
      ctx.stroke();
      continue;
    }
    if (pr.kind === "missile" || pr.kind === "slayer" || pr.kind === "heavy_ball") {
      const heavy = pr.kind === "slayer" || pr.kind === "heavy_ball";
      const tr = pr.trail || [];
      if (tr.length >= 2) {
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = heavy ? "rgba(232, 197, 71, 0.38)" : "rgba(255, 95, 45, 0.22)";
        ctx.lineWidth = heavy ? 10 : 5;
        ctx.beginPath();
        ctx.moveTo(tr[0].x, tr[0].y);
        for (let i = 1; i < tr.length; i++) ctx.lineTo(tr[i].x, tr[i].y);
        ctx.stroke();
        ctx.strokeStyle = heavy ? "rgba(255, 236, 180, 0.28)" : "rgba(255, 210, 140, 0.16)";
        ctx.lineWidth = heavy ? 4 : 2;
        ctx.beginPath();
        ctx.moveTo(tr[0].x, tr[0].y);
        for (let i = 1; i < tr.length; i++) ctx.lineTo(tr[i].x, tr[i].y);
        ctx.stroke();
      }
      const spd = Math.hypot(pr.vx, pr.vy) || 1;
      const ang = Math.atan2(pr.vy, pr.vx);
      const len = (heavy ? 40 : 26) + pr.r * (heavy ? 2.75 : 2.4);
      ctx.save();
      ctx.translate(pr.x, pr.y);
      ctx.rotate(ang);
      const gr = ctx.createLinearGradient(-len * 0.55, 0, len * 0.45, 0);
      if (heavy) {
        gr.addColorStop(0, "rgba(40, 32, 18, 0.12)");
        gr.addColorStop(0.2, "rgba(120, 88, 28, 0.92)");
        gr.addColorStop(0.45, "rgba(232, 197, 71, 0.95)");
        gr.addColorStop(0.58, "rgba(255, 248, 210, 0.88)");
        gr.addColorStop(0.72, "rgba(200, 140, 40, 0.75)");
        gr.addColorStop(0.88, "rgba(90, 62, 22, 0.55)");
        gr.addColorStop(1, "rgba(30, 24, 12, 0.2)");
      } else {
        gr.addColorStop(0, "rgba(28, 26, 24, 0.05)");
        gr.addColorStop(0.25, "rgba(45, 42, 40, 0.92)");
        gr.addColorStop(0.52, "rgba(62, 58, 55, 0.95)");
        gr.addColorStop(0.62, "rgba(255, 90, 40, 0.55)");
        gr.addColorStop(0.72, "rgba(255, 200, 120, 0.35)");
        gr.addColorStop(0.88, "rgba(90, 85, 80, 0.5)");
        gr.addColorStop(1, "rgba(40, 38, 36, 0.2)");
      }
      ctx.fillStyle = gr;
      ctx.shadowColor = heavy ? "rgba(232, 197, 71, 0.55)" : "rgba(0, 0, 0, 0.45)";
      ctx.shadowBlur = heavy ? 16 : 8;
      ctx.beginPath();
      ctx.ellipse(0, 0, len * 0.5, pr.r + (heavy ? 4 : 2.5), 0, 0, Math.PI * 2);
      ctx.fill();
      if (heavy && pr.jetonHoming) {
        const ph = performance.now() * 0.005;
        ctx.strokeStyle = `rgba(255, 235, 180, ${0.42 + 0.18 * Math.sin(ph)})`;
        ctx.lineWidth = 2.4;
        ctx.setLineDash([5, 9]);
        ctx.beginPath();
        ctx.arc(0, 0, pr.r + 17 + Math.sin(ph * 1.4) * 2.5, ph, ph + Math.PI * 1.35);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.shadowBlur = 0;
      ctx.restore();
    
    } else if (pr.kind === "dragon_fly") {
      const flap = Math.sin((pr.t || 0) * 11) * 10;
      const d = pr.dir === 1 ? 1 : -1;
      ctx.save();
      ctx.translate(pr.x, pr.y);
      ctx.scale(d, 1);
      ctx.rotate(Math.sin((pr.t || 0) * 1.8) * 0.06);
      const grb = ctx.createLinearGradient(-55, 0, 35, 0);
      grb.addColorStop(0, "rgba(255, 200, 60, 0.45)");
      grb.addColorStop(0.35, "rgba(255, 120, 30, 0.55)");
      grb.addColorStop(1, "rgba(255, 60, 10, 0.15)");
      ctx.fillStyle = grb;
      ctx.beginPath();
      ctx.ellipse(-8, 0, 52, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(45, 38, 62, 0.92)";
      ctx.beginPath();
      ctx.ellipse(-6, 0, 26, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(70, 55, 95, 0.88)";
      ctx.beginPath();
      ctx.moveTo(-32, 0);
      ctx.quadraticCurveTo(-58, -flap * 0.4, -78, -6 + flap * 0.15);
      ctx.quadraticCurveTo(-62, 10, -34, 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(55, 42, 78, 0.9)";
      ctx.beginPath();
      ctx.moveTo(18, -2);
      ctx.lineTo(44, -8 + flap * 0.12);
      ctx.lineTo(40, 10 + flap * 0.08);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(35, 28, 48, 0.95)";
      ctx.beginPath();
      ctx.arc(38, -2, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 220, 120, 0.95)";
      ctx.beginPath();
      ctx.moveTo(46, -2);
      ctx.lineTo(52, -7);
      ctx.lineTo(50, 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(120, 200, 255, 0.35)";
      ctx.beginPath();
      ctx.ellipse(-18, -16 - flap, 22, 10, -0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-18, 16 + flap, 22, 10, 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 180, 80, 0.55)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.shadowColor = "rgba(255, 100, 30, 0.45)";
      ctx.shadowBlur = 18;
      ctx.fillStyle = "rgba(255, 200, 80, 0.25)";
      ctx.beginPath();
      ctx.ellipse(-42, 0, 28, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    } else if (pr.kind === "wave") {
      const gx = pr.x - (unitTeamId(pr) === 0 ? 0 : pr.w);
      const gr = ctx.createLinearGradient(gx, pr.y, gx + pr.w, pr.y);
      gr.addColorStop(0, "rgba(35, 32, 42, 0.5)");
      gr.addColorStop(0.45, "rgba(80, 70, 95, 0.22)");
      gr.addColorStop(1, "rgba(20, 18, 26, 0.12)");
      ctx.fillStyle = gr;
      ctx.fillRect(gx, pr.y - pr.h * 0.5, pr.w, pr.h);
      ctx.strokeStyle = "rgba(140, 135, 155, 0.18)";
      ctx.strokeRect(gx, pr.y - pr.h * 0.5, pr.w, pr.h);
    } else {
      const spd = Math.hypot(pr.vx, pr.vy) || 1;
      const bx = pr.x - (pr.vx / spd) * 14;
      const by = pr.y - (pr.vy / spd) * 14;
      ctx.strokeStyle = "rgba(255, 140, 60, 0.35)";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(pr.x, pr.y);
      ctx.stroke();
      ctx.fillStyle = "rgba(255, 210, 160, 0.75)";
      ctx.shadowColor = "rgba(0,0,0,0.4)";
      ctx.shadowBlur = 3;
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, Math.max(1.2, pr.r * 0.55), 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }


  for (const pk of state.pickups) {
    ctx.save();
    ctx.translate(pk.x, pk.y);
    ctx.fillStyle = "rgba(38, 52, 42, 0.95)";
    ctx.strokeStyle = "rgba(110, 175, 125, 0.55)";
    ctx.lineWidth = 1.5;
    ctx.fillRect(-11, -9, 22, 18);
    ctx.strokeRect(-11, -9, 22, 18);
    ctx.fillStyle = "rgba(255, 95, 70, 0.92)";
    ctx.beginPath();
    ctx.moveTo(-3, -3);
    ctx.lineTo(3, -3);
    ctx.lineTo(0, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }


  for (const p of state.particles) {
    const alpha = Math.min(1, p.life * 6);
    const spd = Math.hypot(p.vx, p.vy) + 0.001;
    const ang = Math.atan2(p.vy, p.vx);
    const streak = Math.min(11, 2.5 + spd * 0.045);
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = p.color;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.ellipse(0, 0, streak, p.size * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  for (const u of state.units) {
    const tr = u.trail || [];
    for (let i = 0; i < tr.length; i++) {
      const ji = tr.length > 1 ? i / (tr.length - 1) : 1;
      const dustA = ji ** 1.8 * 0.14;
      ctx.globalAlpha = dustA;
      const base = unitTeamId(u) === 0 ? "55, 72, 92" : "72, 48, 52";
      ctx.fillStyle = `rgba(${base}, ${0.35 + ji * 0.25})`;
      ctx.beginPath();
      ctx.ellipse(tr[i].x, tr[i].y, u.r * (0.22 + ji * 0.28), u.r * (0.14 + ji * 0.2), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  for (const u of state.units) {
    const mvp = state.mvpLeader;
    const isMvp = Boolean(mvp && mvp.userId != null && u.userId === mvp.userId && (mvp.d || 0) > 0);
    const mvpVisScale = isMvp ? 1.24 : 1;
    const pulse = 1 + 0.008 * Math.sin(performance.now() * 0.0022 + u.userId.length);
    const birth = u.animBirth ?? 1;
    const birthSc = birth >= 1 ? 1 : 0.9 + 0.1 * (1 - (1 - birth) ** 3);
    const spd = Math.hypot(u.vx, u.vy);
    const roll = 0;

    if (spd > 35) {
      const ux = u.vx / spd;
      const uy = u.vy / spd;
      ctx.globalAlpha = Math.min(0.12, spd * 0.00045);
      ctx.fillStyle = "rgba(35, 36, 40, 0.55)";
      ctx.beginPath();
      ctx.ellipse(u.x - ux * 10, u.y - uy * 10, u.r * 0.75, u.r * 0.42, Math.atan2(uy, ux), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }


    if ((u.shield || 0) > 0.5) {
      const sa = Math.min(0.85, 0.25 + (u.shield / 40) * 0.45);
      ctx.strokeStyle = `rgba(130, 200, 230, ${sa})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(u.x, u.y, u.r * mvpVisScale + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }


    if (u.hitFlash > 0) {
      const hf = Math.min(1, u.hitFlash * 1.2);
      const hr = u.r * mvpVisScale;
      const rg = ctx.createRadialGradient(u.x, u.y, hr * 0.2, u.x, u.y, hr + 14);
      rg.addColorStop(0, `rgba(255, 255, 255, ${0.35 * hf})`);
      rg.addColorStop(0.45, `rgba(255, 60, 40, ${0.22 * hf})`);
      rg.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(u.x, u.y, hr + 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 240, 230, ${0.5 * hf})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(u.x, u.y, hr + 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(u.x, u.y);
    ctx.scale(birthSc * mvpVisScale, birthSc * mvpVisScale);
    ctx.rotate(roll);
    ctx.translate(-u.x, -u.y);

    ctx.beginPath();
    ctx.arc(u.x, u.y, (u.r + 2.5) * pulse, 0, Math.PI * 2);
    ctx.strokeStyle = unitTeamId(u) === 0 ? "rgba(72, 98, 128, 0.55)" : "rgba(128, 72, 78, 0.55)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(u.x, u.y, u.r + 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(12, 14, 18, 0.75)";
    ctx.lineWidth = 1;
    ctx.stroke();

    const av = u.avatarUrl ? getCachedAvatar(u.avatarUrl) : null;
    const showPhoto = av && av.ready && (av.img.naturalWidth || av.img.width);
    if (showPhoto) {
      ctx.beginPath();
      ctx.arc(u.x, u.y, u.r, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(av.img, u.x - u.r, u.y - u.r, u.r * 2, u.r * 2);
    } else {
      ctx.fillStyle = colorForUser(u.userId);
      ctx.beginPath();
      ctx.arc(u.x, u.y, u.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#0d1117";
      ctx.font = isMvp ? "700 13px Segoe UI,sans-serif" : "700 12px Segoe UI,sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(u.nickname.slice(0, 2).toUpperCase(), u.x, u.y);
    }
    if (showPhoto) {
      ctx.beginPath();
      ctx.arc(u.x, u.y, u.r + 1, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255, 248, 235, 0.55)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();

    if (isMvp) {
      const t = performance.now() * 0.0018;
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
      const ringR = u.r * mvpVisScale * birthSc + 7;
      ctx.save();
      ctx.translate(u.x, u.y);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const glow = ctx.createRadialGradient(0, 0, ringR * 0.35, 0, 0, ringR + 18);
      glow.addColorStop(0, `rgba(255, 235, 160, ${0.14 + 0.12 * pulse})`);
      glow.addColorStop(0.55, `rgba(255, 180, 60, ${0.09 * pulse})`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, ringR + 14, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 14 + 10 * pulse;
      ctx.shadowColor = `rgba(255, 200, 80, ${0.5 * pulse})`;
      ctx.beginPath();
      ctx.arc(0, 0, ringR + 1.2, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 228, 140, ${0.75 + 0.15 * pulse})`;
      ctx.lineWidth = 3.2;
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.setLineDash([6, 4]);
      ctx.lineDashOffset = -t * 28;
      ctx.beginPath();
      ctx.arc(0, 0, ringR - 0.5, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(55, 38, 14, ${0.55 + 0.22 * pulse})`;
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(0, 0, ringR - 2.2, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 252, 245, ${0.38 + 0.2 * pulse})`;
      ctx.lineWidth = 1.1;
      ctx.stroke();

      const badgeW = 52;
      const badgeH = 20;
      const badgeY = -ringR - badgeH * 0.5 - 5;
      const bx = -badgeW / 2;
      const by = badgeY - badgeH / 2;
      const bRad = 8;
      const bg = ctx.createLinearGradient(bx, by, bx + badgeW, by + badgeH);
      bg.addColorStop(0, "#7a4810");
      bg.addColorStop(0.42, "#f0d070");
      bg.addColorStop(0.58, "#ffd888");
      bg.addColorStop(1, "#8a5818");
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") ctx.roundRect(bx, by, badgeW, badgeH, bRad);
      else ctx.rect(bx, by, badgeW, badgeH);
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.5 + 0.22 * pulse})`;
      ctx.lineWidth = 1.35;
      ctx.stroke();

      ctx.font = "900 11px Segoe UI,system-ui,sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.strokeText("MVP", 0, badgeY);
      ctx.fillStyle = "#fff8e6";
      ctx.fillText("MVP", 0, badgeY);

      ctx.rotate(t * 0.55);
      ctx.beginPath();
      ctx.arc(0, 0, ringR + 0.4, -0.52, 0.52);
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.42 * pulse})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.restore();
    }

    const prMult = isMvp ? mvpVisScale : 1;
    const hw = (u.r * prMult * 2 + 8) * (u.hp / u.maxHp);
    ctx.fillStyle = "rgba(6, 8, 10, 0.82)";
    ctx.fillRect(u.x - u.r * prMult - 4, u.y - u.r * prMult - 12, u.r * prMult * 2 + 8, 5);
    ctx.strokeStyle = "rgba(30, 32, 36, 0.9)";
    ctx.lineWidth = 1;
    ctx.strokeRect(u.x - u.r * prMult - 4.5, u.y - u.r * prMult - 12.5, u.r * prMult * 2 + 9, 6);
    const hpGrd = ctx.createLinearGradient(u.x - u.r * prMult - 4, 0, u.x + u.r * prMult + 4, 0);
    hpGrd.addColorStop(0, "#4a5c3a");
    hpGrd.addColorStop(0.55, "#7a8568");
    hpGrd.addColorStop(1, "#3d4534");
    ctx.fillStyle = hpGrd;
    ctx.fillRect(u.x - u.r * prMult - 4, u.y - u.r * prMult - 12, hw, 5);
  }

  for (const f of state.floatTexts) {
    const pEase = 1 - (1 - Math.min(1, f.pop)) ** 2.2;
    const sc = 0.88 + 0.14 * pEase;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.scale(sc, sc);
    ctx.font = "800 13px Segoe UI,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.globalAlpha = 1 - f.t;
    ctx.strokeText(f.text, 0, 0);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, 0, 0);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  const mvp = state.mvpLeader;
  if (mvp && mvp.nick) {
    const nick = String(mvp.nick).slice(0, 14);
    const line = `MVP: ${nick}  ${Math.round(mvp.d)} DMG`;
    ctx.font = "600 11px Segoe UI, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.72)";
    ctx.strokeText(line, 10, H - 12);
    ctx.fillStyle = "rgba(228, 210, 165, 0.94)";
    ctx.fillText(line, 10, H - 12);
  }

  if (state.edgeFlash > 0) {
    const e = Math.min(0.35, state.edgeFlash * 0.42);
    ctx.fillStyle = `rgba(255, 92, 48, ${e * 0.35})`;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = `rgba(255, 240, 220, ${e * 0.12})`;
    ctx.fillRect(0, 0, W, H);
  }

  const rt = document.getElementById("roundTimer");
  const rtBox = document.getElementById("roundTimerBox");
  if (rt) {
    const over = state.matchOver || performance.now() >= state.matchDeadlineMs;
    const remainSec = over ? 0 : Math.max(0, Math.ceil((state.matchDeadlineMs - performance.now()) / 1000));
    const mm = Math.floor(remainSec / 60);
    const ss = remainSec % 60;
    rt.textContent = `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
    rt.classList.toggle("timer-value--urgent", !over && remainSec <= 30);
    rtBox?.classList.toggle("timer-box--urgent", !over && remainSec <= 30);
  }
}

function buildSim() {
  const grid = document.getElementById("simGrid");
  if (!grid) return;
  for (const row of LEGEND_ROWS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = row.id;
    btn.addEventListener("click", () => fireSim(row.id));
    grid.appendChild(btn);
  }
  const jetWrap = document.createElement("div");
  jetWrap.className = "sim-jeton-row";
  jetWrap.setAttribute("aria-label", "Jeton test");
  const jetonDefs = [
    { label: "1◇", d: 1 },
    { label: "10◇", d: 10 },
    { label: "20◇", d: 20 },
    { label: "30◇", d: 30 },
    { label: "100◇", d: 100 },
    { label: "175◇", d: 175 },
    { label: "450◇", d: 450 },
    { label: "500◇", d: 500 },
  ];
  for (const j of jetonDefs) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = j.label;
    b.addEventListener("click", () => fireSimJetonPack(j.d));
    jetWrap.appendChild(b);
  }
  grid.appendChild(jetWrap);
  window.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.repeat) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key !== "t" && e.key !== "T") return;
    const ae = document.activeElement;
    if (
      ae &&
      (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.tagName === "SELECT" || ae.isContentEditable)
    ) {
      return;
    }
    e.preventDefault();
    startSimBattle();
  });
}

function fireSimJetonPack(diamondCount) {
  if (state.tiktokJoinGate) return;
  const team = document.getElementById("simTeam").value;
  const userId = document.getElementById("simUser").value.trim() || "u1";
  const nickname = document.getElementById("simNick").value.trim() || "Test";
  const payload = {
    type: "gift",
    userId,
    nickname,
    giftId: "unknown_gift",
    diamondCount,
    team,
  };
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ channel: "clientSim", payload }));
  } else {
    try {
      handleTikTokPayload(payload, { allowWithoutLiveGate: true });
    } catch (e) {
      console.warn("[STREAMXT] fireSimJetonPack:", e);
    }
  }
}

function fireSim(giftId) {
  if (state.tiktokJoinGate) return;
  const team = document.getElementById("simTeam").value;
  const userId = document.getElementById("simUser").value.trim() || "u1";
  const nickname = document.getElementById("simNick").value.trim() || "Test";
  const payload = { type: "gift", userId, nickname, giftId, team };
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ channel: "clientSim", payload }));
  } else {
    try {
      handleTikTokPayload(payload, { allowWithoutLiveGate: true });
    } catch (e) {
      console.warn("[STREAMXT] fireSim:", e);
    }
  }
}

function applyTiktokLiveHud(payload) {
  const el = document.getElementById("tiktokLiveBar");
  if (!el || payload == null || typeof payload !== "object") return;
  const t = payload.status;
  const prev = tiktokLiveHudPhase;
  const entering = prev !== t;
  tiktokLiveHudPhase = t;
  const u = payload.uniqueId ? `@${payload.uniqueId}` : "";
  const wurl = String(payload.url || "").trim();
  const wshort = wurl.length > 56 ? `${wurl.slice(0, 54)}…` : wurl;

  if (t === "tikfinity_connected") {
    state.tiktokJoinGate = true;
    if (entering) resetBattlefield();
    el.textContent = `TikFinity connected ${wshort ? `(${wshort})` : ""} · type «1» left, «2» right`;
    el.hidden = false;
    el.classList.remove("tiktok-live-error");
  } else if (t === "tikfinity_connecting") {
    if (entering) state.tiktokJoinGate = false;
    el.textContent = `TikFinity connecting… ${wshort || DEFAULT_TIKFINITY_WS}`;
    el.hidden = false;
    el.classList.remove("tiktok-live-error");
  } else if (t === "tikfinity_reconnecting") {
    el.textContent = `TikFinity disconnected — retrying silently…`;
    el.hidden = false;
    el.classList.add("tiktok-live-error");
  } else if (t === "tikfinity_idle") {
    state.tiktokJoinGate = false;
    if (entering) resetBattlefield();
    el.textContent =
      "TikFinity idle — opens the desktop app to auto-connect. Disable auto-connect: add ?tikfinity=0 to the URL.";
    el.hidden = false;
    el.classList.remove("tiktok-live-error");
  } else if (t === "tikfinity_error") {
    state.tiktokJoinGate = false;
    if (entering) resetBattlefield();
    const full = formatStreamxtError(payload.message);
    el.textContent = `TikFinity: ${full.length > 220 ? `${full.slice(0, 220)}…` : full}`;
    el.title = full;
    el.hidden = false;
    el.classList.add("tiktok-live-error");
  } else if (t === "connected") {
    state.tiktokJoinGate = true;
    if (entering) resetBattlefield();
    el.textContent = `Live connected ${u} · room ${payload.roomId || "?"} · «1» left, «2» right`;
    el.hidden = false;
    el.classList.remove("tiktok-live-error");
  } else if (t === "connecting") {
    if (entering) state.tiktokJoinGate = false;
    el.textContent = `Live connecting ${u}…`;
    el.hidden = false;
    el.classList.remove("tiktok-live-error");
  } else if (t === "config" && payload.uniqueId) {
    if (entering) state.tiktokJoinGate = false;
    el.textContent = `Target ${u} — configuration loaded`;
    el.hidden = false;
    el.classList.remove("tiktok-live-error");
  } else if (t === "idle") {
    state.tiktokJoinGate = false;
    if (entering) resetBattlefield();
    el.textContent =
      "TikFinity idle — default ws://127.0.0.1:21213 is tried automatically. ?tikfinity=0 disables.";
    el.hidden = false;
    el.classList.remove("tiktok-live-error");
  } else if (t === "stopped") {
    state.tiktokJoinGate = false;
    if (entering) resetBattlefield();
    el.textContent = "Live stream stopped";
    el.hidden = false;
  } else if (t === "error") {
    state.tiktokJoinGate = false;
    if (entering) resetBattlefield();
    const full = formatStreamxtError(payload.message);
    el.textContent = `Live: ${full.length > 380 ? `${full.slice(0, 380)}…` : full}`;
    el.title = full;
    el.hidden = false;
    el.classList.add("tiktok-live-error");
  } else if (t === "disconnected") {
    state.tiktokJoinGate = false;
    if (entering) resetBattlefield();
    el.textContent = `Live disconnected ${u} — reconnecting…`;
    el.hidden = false;
    el.classList.add("tiktok-live-error");
  } else if (t === "stream_end") {
    state.tiktokJoinGate = false;
    if (entering) resetBattlefield();
    el.textContent = `Stream ended ${u}`;
    el.hidden = false;
    el.classList.remove("tiktok-live-error");
  }
}

let ws;
let wsEverOpened = false;
/** Yeniden bağlanma zamanlayıcısı (üst üste birikmesin) */
let wsReconnectTimer = null;
/** Raunt bitince otomatik yeniden başlatma (ms) */
let matchAutoRestartTimer = null;
/** Başarısız deneme sayısı — açılınca sıfırlanır */
let wsFailStreak = 0;
/** Eski soketin onclose'u yeni denemeyi tetiklemesin */
let wsGen = 0;
/** wsWarn kutusu: ilk bağlantı başarılı olunca eski metne dönmek için */
const WS_WARN_DEFAULT_HTML =
  'Live connection dropped. If you did not close the server window, it should reconnect in a few seconds; otherwise run <strong>BASLAT.bat</strong> again.';

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ""));
    fr.onerror = () => reject(new Error("Could not read file"));
    fr.readAsDataURL(file);
  });
}

/**
 * Tek geniş harita görselini dikey ortadan ikiye böler (sol = Alpha, sağ = Bravo).
 * Çıktı JPEG (daha küçük istek gövdesi); şeffaflık kaybolur.
 */
async function splitFullMapImageToHalves(file) {
  const dataUrl = await fileToDataUrl(file);
  const img = await loadImageOnce(dataUrl);
  if (!img || !img.naturalWidth || !img.naturalHeight) {
    throw new Error("Map image could not be loaded or is empty.");
  }
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w < 4) throw new Error("Map image width is too small.");
  const leftW = Math.floor(w / 2);
  const rightW = w - leftW;
  const c = document.createElement("canvas");
  const x = c.getContext("2d");
  if (!x) throw new Error("This browser does not support canvas.");

  c.width = leftW;
  c.height = h;
  x.drawImage(img, 0, 0, leftW, h, 0, 0, leftW, h);
  const leftDataUrl = c.toDataURL("image/jpeg", 0.91);

  c.width = rightW;
  c.height = h;
  x.drawImage(img, leftW, 0, rightW, h, 0, 0, rightW, h);
  const rightDataUrl = c.toDataURL("image/jpeg", 0.91);

  return { leftDataUrl, rightDataUrl };
}

async function postStreamxtSettings(payload) {
  const r = await fetch(streamxtApiUrl("/api/settings"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  let j = {};
  try {
    j = await r.json();
  } catch {
    /* */
  }
  if (!r.ok) {
    let msg =
      typeof j.error === "string"
        ? j.error
        : (r.statusText || "").trim() || "Save failed";
    if (r.status === 413) {
      msg =
        "Request body too large (413). Restart the server on the latest code; saving two large images is split into two requests automatically.";
    }
    throw new Error(msg);
  }
  return j;
}

function setupSettingsUi() {
  const openBtn = document.getElementById("openSettingsBtn");
  const appEl = document.getElementById("app");
  const modal = document.getElementById("settingsModal");
  const backdrop = document.getElementById("settingsBackdrop");
  const closeBtn = document.getElementById("settingsCloseBtn");
  const cancelBtn = document.getElementById("settingsCancelBtn");
  const saveBtn = document.getElementById("settingsSaveBtn");
  const resetBgBtn = document.getElementById("settingsResetBgBtn");
  const statusEl = document.getElementById("settingsStatus");
  const alphaName = document.getElementById("settingsTeamAlphaName");
  const alphaSub = document.getElementById("settingsTeamAlphaSub");
  const bravoName = document.getElementById("settingsTeamBravoName");
  const bravoSub = document.getElementById("settingsTeamBravoSub");
  const leftFile = document.getElementById("settingsBgLeftFile");
  const rightFile = document.getElementById("settingsBgRightFile");
  const fullMapFile = document.getElementById("settingsBgFullMapFile");
  if (!modal || !alphaName || !alphaSub || !bravoName || !bravoSub || !saveBtn) return;

  const isFile = location.protocol === "file:";

  function setStatus(msg, isErr) {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.classList.toggle("settings-status-err", Boolean(isErr));
  }

  async function fillFromServer() {
    if (isFile) {
      const emb = document.getElementById("streamxt-embedded-config");
      if (emb && emb.textContent && emb.textContent.trim()) {
        try {
          const c = JSON.parse(emb.textContent);
          alphaName.value = c.teamAlphaName != null ? String(c.teamAlphaName) : "";
          alphaSub.value = c.teamAlphaSubtitle != null ? String(c.teamAlphaSubtitle) : "";
          bravoName.value = c.teamBravoName != null ? String(c.teamBravoName) : "";
          bravoSub.value = c.teamBravoSubtitle != null ? String(c.teamBravoSubtitle) : "";
          const rdEmb = document.getElementById("settingsRoundDuration");
          if (rdEmb && c.roundDurationMinutes != null) {
            const n = Number(c.roundDurationMinutes);
            if (Number.isFinite(n)) rdEmb.value = String(Math.min(120, Math.max(1, Math.round(n))));
          }
        } catch {
          /* */
        }
      }
      if (!alphaName.value) alphaName.value = document.getElementById("nameAlpha")?.textContent || "";
      if (!alphaSub.value) alphaSub.value = document.getElementById("subAlpha")?.textContent || "";
      if (!bravoName.value) bravoName.value = document.getElementById("nameBravo")?.textContent || "";
      if (!bravoSub.value) bravoSub.value = document.getElementById("subBravo")?.textContent || "";
      const tfIn = document.getElementById("tikfinityWsUrlInput");
      if (tfIn) tfIn.value = DEFAULT_TIKFINITY_WS;
      if (leftFile) leftFile.value = "";
      if (rightFile) rightFile.value = "";
      if (fullMapFile) fullMapFile.value = "";
      return;
    }
    try {
      const r = await fetch(streamxtApiUrl("/api/config"), { cache: "no-store" });
      if (!r.ok) return;
      const c = await r.json();
      cachedServerTikfinityWsUrl = typeof c.tikfinityWsUrl === "string" ? c.tikfinityWsUrl.trim() : "";
      alphaName.value = c.teamAlphaName != null ? String(c.teamAlphaName) : "";
      alphaSub.value = c.teamAlphaSubtitle != null ? String(c.teamAlphaSubtitle) : "";
      bravoName.value = c.teamBravoName != null ? String(c.teamBravoName) : "";
      bravoSub.value = c.teamBravoSubtitle != null ? String(c.teamBravoSubtitle) : "";
      const rdSrv = document.getElementById("settingsRoundDuration");
      if (rdSrv && c.roundDurationMinutes != null) {
        const n = Number(c.roundDurationMinutes);
        if (Number.isFinite(n)) rdSrv.value = String(Math.min(120, Math.max(1, Math.round(n))));
      }
      const tfIn = document.getElementById("tikfinityWsUrlInput");
      if (tfIn) {
        try {
          const fromLs = localStorage.getItem(LS_STREAMXT_TIKFINITY_WS_URL);
          tfIn.value = (fromLs && String(fromLs).trim()) || cachedServerTikfinityWsUrl || DEFAULT_TIKFINITY_WS;
        } catch {
          tfIn.value = cachedServerTikfinityWsUrl || DEFAULT_TIKFINITY_WS;
        }
      }
    } catch {
      /* */
    }
    if (leftFile) leftFile.value = "";
    if (rightFile) rightFile.value = "";
    if (fullMapFile) fullMapFile.value = "";
  }

  function closeModal() {
    modal.hidden = true;
  }

  function openModal() {
    modal.hidden = false;
    setStatus("");
    void fillFromServer();
    alphaName.focus();
  }

  if (typeof GemtokGameSettingsFab !== "undefined") {
    GemtokGameSettingsFab.wire(openModal, { buttonId: "openSettingsBtn", backdropId: "settingsModal" });
  } else {
    openBtn?.addEventListener("click", () => openModal());
  }

  /** Ayarlar düğmesi kapalı: sahne dışı (HUD, letterbox) tıklanınca aç; savaş alanı ve form kontrolleri hariç. */
  appEl?.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.closest("#settingsModal")) return;
    if (t.closest("#matchFinishOverlay")) return;
    if (t.closest(".canvas-stage")) return;
    if (t.closest(".sim-panel")) return;
    if (t.closest("button, input, select, textarea, a, label")) return;
    if (!modal.hidden) return;
    openModal();
  });

  backdrop?.addEventListener("click", closeModal);
  closeBtn?.addEventListener("click", closeModal);
  cancelBtn?.addEventListener("click", closeModal);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) closeModal();
  });

  resetBgBtn?.addEventListener("click", async () => {
    setStatus("Saving…", false);
    if (isFile) {
      try {
        bgLocalOverrideLeft = null;
        bgLocalOverrideRight = null;
        applyWarfrontHudFromConfig({ bgLeftPath: "/assets/sol.png", bgRightPath: "/assets/sag.png" });
        await reloadBackgroundsAfterSettings();
        setStatus("Backgrounds reset to defaults for this session (local file). Use BASLAT.bat for a persistent server.", false);
      } catch (err) {
        setStatus(formatStreamxtError(err), true);
      }
      return;
    }
    try {
      await postStreamxtSettings({ resetBackgrounds: true });
      await loadConfig();
      await reloadBackgroundsAfterSettings();
      setStatus("Backgrounds reset to default (sol.png / sag.png).", false);
    } catch (err) {
      setStatus(formatStreamxtError(err), true);
    }
  });

  function readRoundMinutes() {
    return getEffectiveRoundMinutes();
  }

  saveBtn.addEventListener("click", async () => {
    setStatus("Saving…", false);
    const rm = readRoundMinutes();
    const team = {
      teamAlphaName: alphaName.value,
      teamAlphaSubtitle: alphaSub.value,
      teamBravoName: bravoName.value,
      teamBravoSubtitle: bravoSub.value,
      roundDurationMinutes: rm,
    };
    const fullF = fullMapFile?.files?.[0];
    const lf = leftFile?.files?.[0];
    const rf = rightFile?.files?.[0];
    if (isFile) {
      let warnLeft = false;
      let warnRight = false;
      try {
        applyWarfrontHudFromConfig(team);
        if (fullF) {
          const { leftDataUrl, rightDataUrl } = await splitFullMapImageToHalves(fullF);
          const imL = await loadImageOnce(leftDataUrl);
          const imR = await loadImageOnce(rightDataUrl);
          if (imL) bgLocalOverrideLeft = imL;
          else warnLeft = true;
          if (imR) bgLocalOverrideRight = imR;
          else warnRight = true;
        } else {
          if (lf) {
            const dataUrl = await fileToDataUrl(lf);
            const im = await loadImageOnce(dataUrl);
            if (im) bgLocalOverrideLeft = im;
            else warnLeft = true;
          }
          if (rf) {
            const dataUrl = await fileToDataUrl(rf);
            const im = await loadImageOnce(dataUrl);
            if (im) bgLocalOverrideRight = im;
            else warnRight = true;
          }
        }
        await reloadBackgroundsAfterSettings();
        if (leftFile) leftFile.value = "";
        if (rightFile) rightFile.value = "";
        if (fullMapFile) fullMapFile.value = "";
        const bits = ["Team / background updated for this session."];
        if (fullF || lf || rf) bits.push("Opened as local file — use BASLAT.bat for persistent saves.");
        if (fullF) bits.push("Full map split into two halves from the center.");
        if (warnLeft) bits.push("Left map half could not be read.");
        if (warnRight) bits.push("Right map half could not be read.");
        beginMatchCountdown();
        setStatus(bits.join(" "), warnLeft || warnRight);
        closeModal();
      } catch (err) {
        setStatus(formatStreamxtError(err), true);
      }
      return;
    }
    try {
      bgLocalOverrideLeft = null;
      bgLocalOverrideRight = null;
      if (fullF) {
        const { leftDataUrl, rightDataUrl } = await splitFullMapImageToHalves(fullF);
        await postStreamxtSettings({ ...team, leftImage: { dataUrl: leftDataUrl } });
        setStatus("Uploading right half…", false);
        await postStreamxtSettings({ ...team, rightImage: { dataUrl: rightDataUrl } });
      } else if (lf && rf) {
        await postStreamxtSettings({ ...team, leftImage: { dataUrl: await fileToDataUrl(lf) } });
        setStatus("Uploading right image…", false);
        await postStreamxtSettings({ ...team, rightImage: { dataUrl: await fileToDataUrl(rf) } });
      } else {
        const payload = { ...team };
        if (lf) payload.leftImage = { dataUrl: await fileToDataUrl(lf) };
        if (rf) payload.rightImage = { dataUrl: await fileToDataUrl(rf) };
        await postStreamxtSettings(payload);
      }
      await loadConfig();
      beginMatchCountdown();
      await reloadBackgroundsAfterSettings();
      if (leftFile) leftFile.value = "";
      if (rightFile) rightFile.value = "";
      if (fullMapFile) fullMapFile.value = "";
      setStatus("Settings saved.", false);
      closeModal();
    } catch (err) {
      setStatus(formatStreamxtError(err), true);
    }
  });
}

function setupTikfinityConnectUi() {
  const form = document.getElementById("tiktokConnectForm");
  const input = document.getElementById("tikfinityWsUrlInput");
  const submitBtn = document.getElementById("tiktokConnectSubmit");
  const disconnectBtn = document.getElementById("tiktokDisconnectBtn");
  if (!form || !input || !submitBtn || !disconnectBtn) return;

  try {
    const fromLs = localStorage.getItem(LS_STREAMXT_TIKFINITY_WS_URL);
    input.value = (fromLs && String(fromLs).trim()) || cachedServerTikfinityWsUrl || DEFAULT_TIKFINITY_WS;
  } catch {
    input.value = cachedServerTikfinityWsUrl || DEFAULT_TIKFINITY_WS;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const raw = String(input.value || "").trim();
    const url = raw || DEFAULT_TIKFINITY_WS;
    if (!/^wss?:\/\//i.test(url)) {
      applyTiktokLiveHud({ status: "tikfinity_error", message: "WebSocket URL must start with ws:// or wss://." });
      return;
    }
    submitBtn.disabled = true;
    disconnectBtn.disabled = true;
    try {
      localStorage.setItem(LS_STREAMXT_TIKFINITY_WS_URL, url.slice(0, 512));
    } catch {
      /* */
    }
    tfUserClosed = false;
    tfGen += 1;
    clearTfReconnectTimer();
    try {
      tfSocket?.close();
    } catch {
      /* */
    }
    tfSocket = null;
    connectTikfinityWebSocket();
    submitBtn.disabled = false;
    disconnectBtn.disabled = false;
  });

  disconnectBtn.addEventListener("click", () => {
    try {
      localStorage.removeItem(LS_STREAMXT_TIKFINITY_WS_URL);
      localStorage.removeItem("gemtok_tikfinity_ws_url");
      localStorage.removeItem("hottok_tikfinity_ws_url");
    } catch {
      /* */
    }
    input.value = DEFAULT_TIKFINITY_WS;
    disconnectTikfinityClient();
  });
}

function scheduleWsReconnect(delayMs) {
  if (wsReconnectTimer != null) {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }
  wsReconnectTimer = setTimeout(() => {
    wsReconnectTimer = null;
    connectWs();
  }, delayMs);
}

function connectWs() {
  if (location.protocol === "file:") return;
  const prev = ws;
  if (prev && (prev.readyState === WebSocket.OPEN || prev.readyState === WebSocket.CONNECTING)) return;

  const myGen = ++wsGen;
  const socket = new WebSocket(streamxtWsUrl());
  ws = socket;

  socket.onopen = () => {
    if (wsGen !== myGen) return;
    wsFailStreak = 0;
    wsEverOpened = true;
    const w = document.getElementById("wsWarn");
    if (w) {
      w.innerHTML = WS_WARN_DEFAULT_HTML;
      w.hidden = true;
    }
  };
  socket.onmessage = (ev) => {
    if (wsGen !== myGen) return;
    try {
      const msg = JSON.parse(ev.data);
      if (msg.channel === "tiktok" && msg.payload != null && typeof msg.payload === "object") {
        try {
          handleTikTokPayload(msg.payload);
        } catch (e) {
          console.warn("[STREAMXT] tiktok payload failed:", e);
        }
      } else if (msg.channel === "tiktokLive" && msg.payload != null && typeof msg.payload === "object") {
        try {
          applyTiktokLiveHud(msg.payload);
        } catch (e) {
          console.warn("[STREAMXT] tiktokLive HUD:", e);
        }
      } else if (msg.channel === "streamxtSettings") {
        void (async () => {
          try {
            await loadConfig();
            await reloadBackgroundsAfterSettings();
          } catch (e) {
            console.warn("[STREAMXT] settings refresh failed:", e);
          }
        })();
      }
    } catch {
      /* geçersiz JSON */
    }
  };
  socket.onclose = () => {
    if (wsGen !== myGen) return;
    wsFailStreak += 1;
    const w = document.getElementById("wsWarn");
    if (!wsEverOpened && w) {
      w.hidden = false;
      w.innerHTML =
        '<strong>WebSocket could not connect.</strong> Run the server (<code>npm start</code>) and refresh with <strong>Ctrl+F5</strong>. If it still fails, try <code>http://127.0.0.1:3847</code> or <code>http://localhost:3847</code>.';
    } else if (wsEverOpened && w) {
      w.hidden = false;
    }
    const base = Math.min(10_000, 400 + wsFailStreak * 500);
    const jitter = Math.floor(Math.random() * 500);
    scheduleWsReconnect(base + jitter);
  };
}

function applyWarfrontHudFromConfig(c) {
  if (!c || typeof c !== "object") return;
  const subA = document.getElementById("subAlpha");
  const subB = document.getElementById("subBravo");
  const nameA = document.getElementById("nameAlpha");
  const nameB = document.getElementById("nameBravo");
  if (c.teamAlphaSubtitle != null && subA) subA.textContent = String(c.teamAlphaSubtitle);
  if (c.teamBravoSubtitle != null && subB) subB.textContent = String(c.teamBravoSubtitle);
  if (c.teamAlphaName != null && nameA) nameA.textContent = String(c.teamAlphaName);
  if (c.teamBravoName != null && nameB) nameB.textContent = String(c.teamBravoName);
  if (typeof c.bgLeftPath === "string" && c.bgLeftPath.startsWith("/assets/")) bgLeftPath = c.bgLeftPath.trim();
  if (typeof c.bgRightPath === "string" && c.bgRightPath.startsWith("/assets/")) bgRightPath = c.bgRightPath.trim();
  if (c.roundDurationMinutes != null) {
    const n = Number(c.roundDurationMinutes);
    if (Number.isFinite(n)) {
      const mins = Math.min(120, Math.max(1, Math.round(n)));
      state.matchDurationSec = mins * 60;
      const inp = document.getElementById("settingsRoundDuration");
      if (inp) inp.value = String(mins);
    }
  }
}

async function loadConfig() {
  if (location.protocol === "file:") {
    const emb = document.getElementById("streamxt-embedded-config");
    if (emb && emb.textContent && emb.textContent.trim()) {
      try {
        applyWarfrontHudFromConfig(JSON.parse(emb.textContent));
      } catch (e) {
        console.warn("[STREAMXT] streamxt-embedded-config parse failed:", e);
      }
    }
    const tfIn = document.getElementById("tikfinityWsUrlInput");
    if (tfIn) tfIn.value = DEFAULT_TIKFINITY_WS;
    applyTiktokLiveHud({ status: "tikfinity_idle" });
    return;
  }
  try {
    const r = await fetch(streamxtApiUrl("/api/config"), { cache: "no-store" });
    if (!r.ok) throw new Error(streamxtApiErrorHint(r.status));
    const c = await r.json();
    applyWarfrontHudFromConfig(c);
    cachedServerTikfinityWsUrl = typeof c.tikfinityWsUrl === "string" ? c.tikfinityWsUrl.trim() : "";
    const tfIn = document.getElementById("tikfinityWsUrlInput");
    if (tfIn) {
      try {
        const fromLs = localStorage.getItem(LS_STREAMXT_TIKFINITY_WS_URL);
        tfIn.value = (fromLs && String(fromLs).trim()) || cachedServerTikfinityWsUrl || DEFAULT_TIKFINITY_WS;
      } catch {
        tfIn.value = cachedServerTikfinityWsUrl || DEFAULT_TIKFINITY_WS;
      }
    }
    if (isTikfinityAutoDisabledByUrlParams()) {
      applyTiktokLiveHud({ status: "tikfinity_idle" });
    }
  } catch (e) {
    if (location.protocol !== "file:") {
      const w = document.getElementById("fileProtocolWarn");
      if (w) {
        w.hidden = false;
        const detail = typeof e?.message === "string" && e.message ? e.message : "";
        w.innerHTML = detail
          ? `<strong>Could not load configuration.</strong> ${detail}`
          : "<strong>Could not reach the server.</strong> Run <code>BASLAT.bat</code> in the project folder, then refresh this page.";
      }
    }
  }
}

buildSim();
initStreamxtBottomHud();
updateMoraleDom();

const isFilePage = location.protocol === "file:";
if (isFilePage) {
  const w = document.getElementById("fileProtocolWarn");
  if (w) w.hidden = true;
  const wsWarn = document.getElementById("wsWarn");
  if (wsWarn) wsWarn.hidden = true;
}

function scheduleLocalPreviewIfEmpty(delayMs) {
  if (!ENABLE_LOCAL_PREVIEW_BATTLE) return;
  setTimeout(() => {
    if (state.tiktokJoinGate) return;
    const active = state.units.filter((u) => u.hp > 0 && !isCrowdUnit(u));
    if (active.length >= 2) return;
    try {
      startSimBattle();
    } catch (e) {
      console.warn("[STREAMXT] local preview failed to start:", e);
    }
  }, delayMs);
}

void (async function boot() {
  /** Haritalar hemen yüklensin; port taraması /api/config beklemesin (2–3 sn boş sahne). */
  const portScan = resolveStreamxtEmbedApiBase();
  await loadBackgroundImages();
  await portScan;
  await loadConfig();
  await loadBackgroundImages();
  setupTikfinityConnectUi();
  setupSettingsUi();
  setupMatchFinishOverlay();
  if (!isFilePage) {
    connectWs();
  }
  startTikfinityAutoConnect();
  resetBattlefield();
  requestAnimationFrame(tick);
})();
