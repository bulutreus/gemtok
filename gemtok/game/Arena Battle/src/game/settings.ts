import { ROUND_SECONDS } from "./constants";

export const SETTINGS_STORAGE_KEY = "arena_battle_settings";

export interface GameSettings {
  /** Round length in seconds (60–3600) */
  roundSeconds: number;
  /** Max concurrent players (8–100) */
  maxPlayers: number;
  /** Bottom HUD band as fraction of canvas height (0.18–0.30); must match engine resize */
  arenaBottomHudFraction: number;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  roundSeconds: ROUND_SECONDS,
  maxPlayers: 28,
  arenaBottomHudFraction: 0.22,
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function normalizeGameSettings(partial: Partial<GameSettings> | null | undefined): GameSettings {
  const d = DEFAULT_GAME_SETTINGS;
  return {
    roundSeconds: clamp(Math.round(Number(partial?.roundSeconds) || d.roundSeconds), 60, 3600),
    maxPlayers: clamp(Math.round(Number(partial?.maxPlayers) || d.maxPlayers), 8, 100),
    arenaBottomHudFraction: clamp(
      Number(partial?.arenaBottomHudFraction) || d.arenaBottomHudFraction,
      0.18,
      0.3
    ),
  };
}

export function loadGameSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GAME_SETTINGS };
    const o = JSON.parse(raw) as Partial<GameSettings>;
    return normalizeGameSettings(o);
  } catch {
    return { ...DEFAULT_GAME_SETTINGS };
  }
}

export function saveGameSettings(s: GameSettings): void {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalizeGameSettings(s)));
}

/** Percent string for CSS `calc(var(--arena-hud-band) - 12px)`, e.g. "22%" */
export function arenaHudBandCssPercent(fraction: number): string {
  return `${Math.round(clamp(fraction, 0.12, 0.35) * 1000) / 10}%`;
}
