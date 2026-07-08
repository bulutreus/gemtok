import "./styles.css";
import "../../../sira/gemtok-settings-theme.css";
import { GameEngine } from "./game/engine";
import { GIFT_LABELS } from "./game/constants";
import {
  arenaHudBandCssPercent,
  DEFAULT_GAME_SETTINGS,
  loadGameSettings,
  normalizeGameSettings,
  saveGameSettings,
} from "./game/settings";
import { startMockStream, type EventHandler } from "./tiktok/mockEmitter";
import { PLAYROOM_UI_ATTR, resetPlayroomTikTokMount } from "./tiktok/playroomReset";
import { connectTikFinityWebSocket, TIKFINITY_DEFAULT_WS_URL } from "./tiktok/tikfinityBridge";
import type { LiveEvent } from "./types";

function padTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

function formatK(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)}K`;
  return String(Math.floor(m));
}

/** Left dock: TikTok gift → in-game effect */
function buildLeaderboardHelpHtml(): string {
  const gifts = GIFT_LABELS.map(
    (r) =>
      `<div class="lb-gift-row"><span class="lb-gift-lab">${escapeHtml(r.label)}</span><span class="lb-gift-act">${escapeHtml(r.action)}</span></div>`
  ).join("");
  return `
    <p class="lb-help-heading">TikTok gifts</p>
    <div class="lb-gift-list">${gifts}</div>
  `;
}

function readStoredPlayroomGameId(): string | undefined {
  const s =
    (localStorage.getItem("playroom_game_id") ?? "").trim() ||
    (import.meta.env.VITE_PLAYROOM_GAME_ID as string | undefined)?.trim() ||
    "";
  return s || undefined;
}

function readStoredTikfinityWs(): string {
  const custom = (localStorage.getItem("tikfinity_ws_url") ?? "").trim();
  if (custom) return custom;
  const fromEnv = import.meta.env.VITE_TIKFINITY_WS_URL?.trim();
  if (fromEnv) return fromEnv;
  return TIKFINITY_DEFAULT_WS_URL;
}

function init(): void {
  document.body.removeAttribute(PLAYROOM_UI_ATTR);
  const root = document.querySelector<HTMLDivElement>("#app")!;
  root.innerHTML = `
    <div class="game-shell">
      <canvas id="game-canvas" width="360" height="640" tabindex="-1" aria-label="Arena — tap to open settings"></canvas>
      <div class="hud">
        <div class="hud-top">
          <div class="timer-box">TIMER: <span id="timer-val">4:00</span></div>
        </div>
        <div class="leaderboard leaderboard--dock">
          <div class="lb-split">
            <aside class="lb-help" aria-label="TikTok gift effects">
              ${buildLeaderboardHelpHtml()}
            </aside>
            <div class="lb-rank-col">
              <h3 class="lb-rank-title">LEADERBOARD</h3>
              <div id="lb-rows"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <button type="button" id="gemtok-open-settings" class="gemtok-game-settings-fab" aria-controls="settings-backdrop" aria-label="Ayarlar" title="Ayarlar" aria-haspopup="dialog" aria-expanded="false">
      <svg class="gemtok-game-settings-fab__icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32a.51.51 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54A.51.51 0 0 0 9.25 2.4H5.41a.51.51 0 0 0-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.51.51 0 0 0-.59.22L.06 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.31-.09.63-.09.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z"/></svg>
      <span class="gemtok-game-settings-fab__label">Ayarlar</span>
    </button>
    <div class="settings-overlay gemtok-settings-theme" id="settings-backdrop" hidden>
      <div class="settings-overlay__backdrop" aria-hidden="true"></div>
      <div class="settings-panel" role="dialog" aria-labelledby="settings-title" aria-modal="true">
        <h2 class="settings-panel__title" id="settings-title">Oyun ayarları</h2>
        <div class="settings-panel__timer-wrap">
          <span class="settings-panel__timer-label">Tur sayacı</span>
          <time class="settings-panel__timer" id="roundTimerSettings">0:00</time>
        </div>
        <div class="settings-panel__body">
          <label class="settings-row settings-row--num">
            <span class="settings-label">Tur süresi (dakika)</span>
            <input class="settings-num" type="number" id="settings-round-min" min="1" max="60" step="1" value="4" />
          </label>

          <div class="settings-row">
            <div class="settings-labelrow">
              <span class="settings-label">Maksimum oyuncu</span>
              <span class="settings-value" id="settings-max-val">28</span>
            </div>
            <input class="settings-slider" type="range" id="settings-max-players" min="8" max="100" step="1" />
          </div>

          <div class="settings-row">
            <div class="settings-labelrow">
              <span class="settings-label">Alt HUD yüksekliği (ekran yüksekliği %)</span>
              <span class="settings-value" id="settings-hud-pct">22%</span>
            </div>
            <input class="settings-slider" type="range" id="settings-hud-band" min="18" max="30" step="1" />
          </div>
        </div>
        <div class="settings-panel__actions">
          <button type="button" class="settings-btn settings-btn--ghost" id="settings-reset">Varsayılan</button>
          <button type="button" class="settings-btn settings-btn--ghost" id="settings-cancel">İptal</button>
          <button type="button" class="settings-btn settings-btn--primary" id="settings-save">Kaydet</button>
        </div>
      </div>
    </div>
  `;

  const engine = new GameEngine();
  const canvas = root.querySelector<HTMLCanvasElement>("#game-canvas")!;
  const timerEl = root.querySelector<HTMLSpanElement>("#timer-val")!;
  const lbEl = root.querySelector<HTMLDivElement>("#lb-rows")!;
  const gameShell = root.querySelector<HTMLDivElement>(".game-shell")!;
  const settingsBackdrop = root.querySelector<HTMLDivElement>("#settings-backdrop")!;
  const settingsPanel = root.querySelector<HTMLDivElement>(".settings-panel")!;
  const elRoundMin = root.querySelector<HTMLInputElement>("#settings-round-min")!;
  const elMaxPlayers = root.querySelector<HTMLInputElement>("#settings-max-players")!;
  const elMaxVal = root.querySelector<HTMLSpanElement>("#settings-max-val")!;
  const elHudBand = root.querySelector<HTMLInputElement>("#settings-hud-band")!;
  const elHudPct = root.querySelector<HTMLSpanElement>("#settings-hud-pct")!;
  const settingsSaveBtn = root.querySelector<HTMLButtonElement>("#settings-save")!;
  const settingsCancelBtn = root.querySelector<HTMLButtonElement>("#settings-cancel")!;
  const settingsResetBtn = root.querySelector<HTMLButtonElement>("#settings-reset")!;

  function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function applyHudBandCss(fraction: number): void {
    gameShell.style.setProperty("--arena-hud-band", arenaHudBandCssPercent(fraction));
  }

  const bootSettings = loadGameSettings();
  engine.applyGameSettings(bootSettings);
  applyHudBandCss(bootSettings.arenaBottomHudFraction);

  function syncSettingsFormFromEngine(): void {
    const s = engine.getGameSettingsSnapshot();
    elRoundMin.value = String(Math.max(1, Math.ceil(s.roundSeconds / 60)));
    elMaxPlayers.value = String(s.maxPlayers);
    elHudBand.value = String(Math.round(s.arenaBottomHudFraction * 100));
    elMaxVal.textContent = String(s.maxPlayers);
    elHudPct.textContent = String(Math.round(s.arenaBottomHudFraction * 100));
  }

  function openSettings(): void {
    syncSettingsFormFromEngine();
    settingsBackdrop.hidden = false;
    elRoundMin.focus();
  }

  function closeSettings(): void {
    settingsBackdrop.hidden = true;
    canvas.focus({ preventScroll: true });
  }

  function persistSettingsFromForm(): void {
    const roundMin = Math.max(1, Math.min(60, Math.round(Number(elRoundMin.value) || 4)));
    const roundSeconds = roundMin * 60;
    const maxPlayers = Math.max(8, Math.min(100, Math.round(Number(elMaxPlayers.value) || 28)));
    const hudPct = Math.max(18, Math.min(30, Math.round(Number(elHudBand.value) || 22)));
    const next = normalizeGameSettings({
      roundSeconds,
      maxPlayers,
      arenaBottomHudFraction: hudPct / 100,
    });
    saveGameSettings(next);
    engine.applyGameSettings(next);
    applyHudBandCss(next.arenaBottomHudFraction);
    engine.startRound();
    engine.roundEndAt = performance.now() + next.roundSeconds * 1000;
    closeSettings();
  }

  canvas.addEventListener("click", (e) => {
    if (!settingsBackdrop.hidden) return;
    const ar = engine.arena;
    const x = e.offsetX;
    const y = e.offsetY;
    if (x >= ar.x && x <= ar.x + ar.w && y >= ar.y && y <= ar.y + ar.h) {
      openSettings();
    }
  });
  settingsCancelBtn.addEventListener("click", () => closeSettings());
  settingsSaveBtn.addEventListener("click", () => persistSettingsFromForm());
  if (typeof (globalThis as typeof globalThis & { GemtokGameSettingsFab?: { wire: (fn: () => void, o?: object) => void } }).GemtokGameSettingsFab !== "undefined") {
    (globalThis as typeof globalThis & { GemtokGameSettingsFab: { wire: (fn: () => void, o?: object) => void } }).GemtokGameSettingsFab.wire(openSettings, {
      backdropId: "settings-backdrop",
    });
  } else {
    root.querySelector("#gemtok-open-settings")?.addEventListener("click", (e) => {
      e.stopPropagation();
      openSettings();
    });
  }
  settingsResetBtn.addEventListener("click", () => {
    const d = normalizeGameSettings(DEFAULT_GAME_SETTINGS);
    elRoundMin.value = String(Math.max(1, Math.ceil(d.roundSeconds / 60)));
    elMaxPlayers.value = String(d.maxPlayers);
    elHudBand.value = String(Math.round(d.arenaBottomHudFraction * 100));
    elMaxVal.textContent = String(d.maxPlayers);
    elHudPct.textContent = String(Math.round(d.arenaBottomHudFraction * 100));
  });
  elMaxPlayers.addEventListener("input", () => {
    elMaxVal.textContent = elMaxPlayers.value;
  });
  elHudBand.addEventListener("input", () => {
    elHudPct.textContent = elHudBand.value;
  });
  settingsPanel.addEventListener("click", (e) => e.stopPropagation());
  settingsBackdrop.addEventListener("click", () => closeSettings());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !settingsBackdrop.hidden) closeSettings();
  });

  function dispatchLive(e: LiveEvent): void {
    try {
      if (e.kind === "like") {
        engine.spawnNewPlayer(e.user);
        return;
      }
      engine.applyGiftToUser(e.user, e.gift, e.count);
    } catch (err) {
      if (import.meta.env.DEV) console.warn("[Arena] dispatchLive", err);
    }
  }

  const handler: EventHandler = (e) => dispatchLive(e);

  let stopMock = () => {};
  let tiktokConnected = false;
  let tikfinityConnected = false;
  let tikfinityWsPending = false;
  const tikfinitySession = { release: null as null | (() => void) };
  let activeTikFinityToken: object | null = null;
  let tikfinityAutoReconnect = false;
  let tikfinityAutoTimer: ReturnType<typeof setTimeout> | null = null;
  const TIKFINITY_RETRY_MS = 3500;

  function resolveTikFinityWsUrl(): string {
    return readStoredTikfinityWs();
  }

  function clearTikfinityAutoTimer(): void {
    if (tikfinityAutoTimer != null) {
      clearTimeout(tikfinityAutoTimer);
      tikfinityAutoTimer = null;
    }
  }

  function scheduleTikfinityAutoRetry(): void {
    clearTikfinityAutoTimer();
    tikfinityAutoTimer = setTimeout(() => {
      tikfinityAutoTimer = null;
      if (!tikfinityAutoReconnect || tiktokConnected) return;
      startTikFinitySession({ manual: false, silent: true });
    }, TIKFINITY_RETRY_MS);
  }

  function stopTikFinityWs(): void {
    tikfinityAutoReconnect = false;
    clearTikfinityAutoTimer();
    activeTikFinityToken = null;
    tikfinitySession.release?.();
    tikfinitySession.release = null;
    tikfinityWsPending = false;
    tikfinityConnected = false;
  }

  function startTikFinitySession(opts: { manual: boolean; silent: boolean }): void {
    if (tiktokConnected) return;

    if (opts.manual) {
      tikfinityAutoReconnect = false;
      clearTikfinityAutoTimer();
    } else {
      tikfinityAutoReconnect = true;
    }

    activeTikFinityToken = null;
    const oldRelease = tikfinitySession.release;
    tikfinitySession.release = null;
    oldRelease?.();

    tikfinityWsPending = true;
    tikfinityConnected = false;

    const url = resolveTikFinityWsUrl();

    if (opts.manual) {
      stopMock();
      stopMock = () => {};
    }

    const sessionToken = {};

    const closeLib = connectTikFinityWebSocket(url, dispatchLive, {
      onStatus(msg) {
        if (import.meta.env.DEV && !opts.silent) console.info("[Arena TikFinity]", msg);
      },
      onOpen() {
        if (activeTikFinityToken !== sessionToken) return;
        tikfinityWsPending = false;
        tikfinityConnected = true;
        clearTikfinityAutoTimer();
        stopMock();
        stopMock = () => {};
        if (import.meta.env.DEV) {
          console.info(
            "[Arena TikFinity]",
            opts.silent ? "Connected (auto-retry)." : "WebSocket connected."
          );
        }
      },
      onClose() {
        if (activeTikFinityToken !== sessionToken) return;
        activeTikFinityToken = null;
        tikfinitySession.release = null;
        tikfinityWsPending = false;
        tikfinityConnected = false;
        if (tikfinityAutoReconnect && !tiktokConnected && !opts.manual) {
          scheduleTikfinityAutoRetry();
        } else if (opts.manual && !opts.silent && import.meta.env.DEV) {
          console.info("[Arena TikFinity] WebSocket closed.");
        }
      },
    });

    if (closeLib == null) {
      tikfinityWsPending = false;
      if (tikfinityAutoReconnect && !tiktokConnected && !opts.manual) {
        scheduleTikfinityAutoRetry();
      }
      return;
    }

    tikfinitySession.release = closeLib;
    activeTikFinityToken = sessionToken;
  }

  async function tryAutoConnectPlayroom(): Promise<void> {
    if (tiktokConnected || tikfinityConnected || tikfinityWsPending) return;
    stopTikFinityWs();
    const gid = readStoredPlayroomGameId();
    stopMock();
    stopMock = () => {};
    try {
      const { connectPlayroomTikTok } = await import("./tiktok/playroomTikTok");
      await connectPlayroomTikTok(dispatchLive, { gameId: gid });
      tiktokConnected = true;
      if (import.meta.env.DEV) {
        console.info("[Arena Playroom] Listening for TikTok events (gameId:", gid ?? "env default", ").");
      }
    } catch (err) {
      console.error("[Arena Playroom]", err instanceof Error ? err.message : String(err));
      resetPlayroomTikTokMount();
    }
  }

  let lastLbAt = 0;
  const LB_REFRESH_MS = 120;

  function syncHud(now: number): void {
    let sec = engine.getRemainingSeconds();
    if (sec <= 0) {
      engine.startRound();
      const rs = engine.getRoundDurationSeconds();
      engine.roundEndAt = performance.now() + rs * 1000;
      sec = rs;
    }
    timerEl.textContent = padTime(sec);
    timerEl.closest(".timer-box")?.classList.toggle("timer-urgent", sec <= 15);

    if (now - lastLbAt < LB_REFRESH_MS) return;
    lastLbAt = now;

    const rows = engine.getLeaderboard();
    lbEl.innerHTML = rows
      .map((r) => {
        const initials = escapeHtml(r.user.displayName.slice(0, 2).toUpperCase() || "?");
        const avatar = r.user.avatarUrl.trim()
          ? `<img class="lb-avatar" src="${escapeHtml(r.user.avatarUrl)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" />`
          : `<span class="lb-avatar lb-avatar--initials" aria-hidden="true">${initials}</span>`;
        return `
      <div class="lb-row">
        ${avatar}
        <span class="lb-name" title="${escapeHtml(r.user.displayName)}">${escapeHtml(r.user.displayName)}</span>
        <span class="lb-score">${formatK(r.mass)}</span>
        <span class="lb-kills">💀${r.kills}</span>
      </div>`;
      })
      .join("");
  }

  let canvasCtx: CanvasRenderingContext2D | null = null;

  function fitCanvas(): void {
    const shell = root.querySelector<HTMLDivElement>(".game-shell")!;
    const rawW = shell.clientWidth;
    const rawH = shell.clientHeight;
    const w = Math.max(260, rawW > 8 ? rawW : 360);
    const h = Math.max(420, rawH > 8 ? rawH : 640);
    let dpr = Math.min(2, window.devicePixelRatio || 1);
    let bw = Math.floor(w * dpr);
    let bh = Math.floor(h * dpr);
    const maxCanvasPixels = 1_100_000;
    while (bw * bh > maxCanvasPixels && dpr > 0.65) {
      dpr *= 0.88;
      bw = Math.floor(w * dpr);
      bh = Math.floor(h * dpr);
    }
    canvas.width = bw;
    canvas.height = bh;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvasCtx = canvas.getContext("2d");
    if (!canvasCtx) return;
    canvasCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    engine.resize(w, h);
  }

  let last = performance.now();
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) last = performance.now();
  });

  function frame(now: number): void {
    const dt = Math.min(50, now - last);
    last = now;
    try {
      engine.step(dt);
      if (canvasCtx) engine.render(canvasCtx);
    } catch (err) {
      if (import.meta.env.DEV) console.warn("[Arena] frame", err);
    }
    syncHud(now);
    requestAnimationFrame(frame);
  }

  engine.startRound();
  engine.roundEndAt = performance.now() + engine.getRoundDurationSeconds() * 1000;
  timerEl.textContent = padTime(engine.getRoundDurationSeconds());
  window.addEventListener("resize", fitCanvas);

  const params = new URLSearchParams(window.location.search);
  const wantPlayroom = params.get("playroom") === "1";

  requestAnimationFrame(() => {
    fitCanvas();
    if (params.get("mock") === "1") {
      stopMock = startMockStream(handler, 1300);
    } else if (import.meta.env.DEV && params.get("mock") !== "0") {
      console.info("[Arena] Test akışı için ?mock=1 ekleyin.");
    }
    if (params.get("tikfinity") !== "0" && !wantPlayroom) {
      setTimeout(() => {
        if (tiktokConnected) return;
        startTikFinitySession({ manual: false, silent: true });
      }, 800);
    }
    if (wantPlayroom) {
      setTimeout(() => void tryAutoConnectPlayroom(), 900);
    }
    requestAnimationFrame(frame);
  });
}

const boot = window as Window & { __arenaBattleBooted?: boolean };
if (boot.__arenaBattleBooted) {
  console.warn(
    "[Arena Battle] init skipped: module loaded twice. Check for duplicate scripts or host page injection."
  );
} else {
  boot.__arenaBattleBooted = true;
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      delete boot.__arenaBattleBooted;
    });
  }
  try {
    init();
  } catch (err) {
    const app = document.querySelector("#app");
    const msg = err instanceof Error ? err.message : String(err);
    if (app) {
      app.innerHTML = `<div style="padding:1rem;font-family:system-ui,sans-serif;background:#020817;color:#fecaca;min-height:100vh;box-sizing:border-box;"><p style="margin:0 0 0.5rem;font-weight:700;">Arena Battle başlatılamadı</p><p style="margin:0;color:#94a3b8;font-size:0.9rem;">Oyun Merkezi’nde lisansı uygulayıp tekrar deneyin. Yerel dosyada açıyorsanız sayfayı bir HTTP sunucusu veya siteden açın.</p><pre style="margin-top:0.75rem;white-space:pre-wrap;word-break:break-word;font-size:12px;color:#64748b;">${escapeHtml(msg)}</pre></div>`;
    }
    console.error("[Arena Battle]", err);
  }
}
