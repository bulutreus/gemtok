import type { LiveUser, WeaponMode } from "../types";
import { GAMEPLAY, PLAYER_COLORS } from "./gameConfig";

export interface ArenaBounds {
  x: number;
  y: number;
  w: number;
  h: number;
  pad: number;
}

/** Per-player wander target — avoids lock-on / orbit bugs. */
export interface WanderState {
  targetX: number;
  targetY: number;
  targetUntil: number;
  stuckFrames: number;
  lastX: number;
  lastY: number;
}

export class PlayerEntity {
  id: string;
  name: string;
  avatarUrl: string;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  mass: number;
  kills = 0;
  color: string;
  weapon: WeaponMode = "none";
  weaponUntil = 0;
  speedBoostUntil = 0;
  aimAngle = 0;
  sniperCooldown = 0;
  minigunTick = 0;
  bomberTick = 0;
  invulnUntil = 0;
  displayRadius = 0;
  bornAt = 0;
  hurtFlashUntil = 0;
  lastContactDamageAt = 0;
  wander: WanderState;

  constructor(user: LiveUser, pos: { x: number; y: number }, now: number) {
    const { mass: mc } = GAMEPLAY;
    this.id = user.id;
    this.name = user.displayName;
    this.avatarUrl = user.avatarUrl;
    this.mass = mc.spawnMin + Math.random() * (mc.spawnMax - mc.spawnMin);
    this.bornAt = now;
    this.invulnUntil = now + GAMEPLAY.spawn.invulnMs;
    this.displayRadius = this.getRadius();
    this.color = PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)]!;
    this.x = pos.x;
    this.y = pos.y;
    this.wander = {
      targetX: pos.x,
      targetY: pos.y,
      targetUntil: now + 1000,
      stuckFrames: 0,
      lastX: pos.x,
      lastY: pos.y,
    };
  }

  getRadius(): number {
    const { baseRadius, radiusScale, maxRadius } = GAMEPLAY.mass;
    const s = Math.sqrt(this.mass);
    return Math.min(maxRadius, baseRadius + s * radiusScale);
  }

  /** Collision / render use smoothed radius when available. */
  collisionRadius(): number {
    const r = Number.isFinite(this.displayRadius) ? this.displayRadius : this.getRadius();
    return Math.max(4, Math.min(GAMEPLAY.mass.displayRadiusMax, r));
  }

  speedMultiplier(now: number): number {
    const { godModeSpeedMult, speedBoostMult } = GAMEPLAY.movement;
    let m = 1;
    if (this.weapon === "god_mode") m *= godModeSpeedMult;
    if (now < this.speedBoostUntil) m *= speedBoostMult;
    return m;
  }

  isWeaponActive(now: number): boolean {
    return this.weapon !== "none" && now < this.weaponUntil;
  }

  damageMultiplier(): number {
    const mults = GAMEPLAY.combat.weaponMultipliers;
    return mults[this.weapon] ?? 1;
  }

  hasBladeLook(now: number): boolean {
    if (!this.isWeaponActive(now)) return false;
    return (
      this.weapon === "power_blade" ||
      this.weapon === "ultra_blade" ||
      this.weapon === "hyper_blade"
    );
  }

  hasSunLook(now: number): boolean {
    return this.mass > 120 && this.isWeaponActive(now) && this.weapon === "god_mode";
  }

  isMeleeWeapon(now: number): boolean {
    return (
      this.isWeaponActive(now) &&
      (this.weapon === "power_blade" ||
        this.weapon === "ultra_blade" ||
        this.weapon === "hyper_blade" ||
        this.weapon === "god_mode")
    );
  }
}
