import type { GiftType, WeaponMode } from "../types";

/** Central gameplay tuning — avoid magic numbers elsewhere. */
export const GAMEPLAY = {
  /** Player mass / size */
  mass: {
    min: 3,
    spawnMin: 8,
    spawnMax: 14,
    rejoinBoostMin: 0,
    rejoinBoostMax: 0,
    maxRadius: 72,
    baseRadius: 14,
    radiusScale: 1.35,
    displayRadiusLerp: 11,
    displayRadiusMax: 90,
    displayRadiusMin: 2,
  },

  /** Wander movement — no chase / lock-on */
  movement: {
    baseSpeed: 72,
    maxSpeed: 200,
    heavyMassThreshold: 80,
    heavySpeedPenalty: 40,
    godModeSpeedMult: 1.15,
    speedBoostMult: 1.45,
    friction: 0.988,
    turnRate: 4.2,
    wanderNoise: 0.22,
    targetMinDist: 48,
    targetPickMsMin: 2200,
    targetPickMsMax: 5200,
    targetReachDist: 36,
    stuckDistThreshold: 3,
    stuckFramesLimit: 45,
    wallSlideFriction: 0.55,
    wallBounce: 0.32,
  },

  /** Collision resolution */
  physics: {
    separationSlop: 0.98,
    positionCorrection: 0.55,
    velocityRestitution: 0.38,
    spatialHashCellSize: 96,
    spatialHashMinPlayers: 24,
  },

  /** Contact combat — tick-based, not per-frame */
  combat: {
    contactIntervalMs: 500,
    contactBaseDamage: 1,
    contactStrongRatio: 1.08,
    contactWeakRatio: 0.92,
    maxAttackersPerVictim: 2,
    projectileInvulnMs: 120,
    hurtFlashMs: 220,
    weaponMultipliers: {
      power_blade: 1.35,
      ultra_blade: 1.65,
      hyper_blade: 2.1,
      god_mode: 3,
    } as Partial<Record<WeaponMode, number>>,
  },

  /** Spawn */
  spawn: {
    invulnMs: 2200,
    birthAnimMs: 480,
    maxAttempts: 48,
    minGap: 12,
    edgePadding: 8,
  },

  /** Visual / FX budgets */
  effects: {
    maxParticles: 260,
    maxFloatTexts: 28,
    maxShockwaves: 10,
    maxAvatarCache: 64,
    starCount: 96,
    floatTextLife: 1,
    damageFloatColor: "#ff4466",
  },

  /** Simulation throttling at high player counts */
  perf: {
    crowdedPlayerThreshold: 20,
    aiSkipModulo: 2,
    collisionSkipModulo: 1,
    maxCanvasPixels: 1_100_000,
  },
} as const;

export const ROUND_SECONDS = 4 * 60;
export const LEADERBOARD_ROWS = 4;

const WEAPON_BY_GIFT: Record<Exclude<GiftType, "like" | "perfume">, WeaponMode> = {
  rose: "power_blade",
  finger_heart: "ultra_blade",
  rosa: "sniper",
  confetti: "minigun",
  donut: "bomber",
  sunglasses: "hyper_blade",
  corgi: "god_mode",
};

export function giftToEffect(
  gift: GiftType
): { type: "weapon"; weapon: WeaponMode } | { type: "speed" } | null {
  if (gift === "like") return null;
  if (gift === "perfume") return { type: "speed" };
  const weapon = WEAPON_BY_GIFT[gift as keyof typeof WEAPON_BY_GIFT];
  return weapon ? { type: "weapon", weapon } : null;
}

export const WEAPON_DURATION_MS: Record<WeaponMode, number> = {
  none: 0,
  power_blade: 6000,
  ultra_blade: 5000,
  sniper: 4500,
  minigun: 5500,
  bomber: 4000,
  hyper_blade: 7000,
  god_mode: 8000,
};

export const SPEED_BOOST_MS = 5000;

export const GIFT_LABELS: { gift: GiftType; label: string; action: string }[] = [
  { gift: "like", label: "LIKE", action: "Spawn player" },
  { gift: "rose", label: "ROSE", action: "Power Blade" },
  { gift: "finger_heart", label: "HEART", action: "Ultra Blade" },
  { gift: "rosa", label: "ROSA", action: "Sniper" },
  { gift: "perfume", label: "PERF", action: "Speed boost" },
  { gift: "confetti", label: "CONF", action: "Minigun" },
  { gift: "donut", label: "DONUT", action: "Bomber" },
  { gift: "sunglasses", label: "GLASS", action: "Hyper Blade" },
  { gift: "corgi", label: "CORGI", action: "God Mode" },
];

export const PLAYER_COLORS = [
  "#ff5c5c",
  "#4db8ff",
  "#b388ff",
  "#69f0ae",
  "#ffd54a",
  "#ff9800",
] as const;
