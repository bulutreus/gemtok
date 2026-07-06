import type { GiftType, LiveUser, WeaponMode } from "../types";
import { avatarImageUseAnonymousCors } from "../tiktok/viewerProfile";
import {
  GAMEPLAY,
  LEADERBOARD_ROWS,
  SPEED_BOOST_MS,
  WEAPON_DURATION_MS,
  giftToEffect,
} from "./gameConfig";
import { PlayerEntity, type ArenaBounds } from "./playerEntity";
import {
  applyContactDamage,
  applyProjectileDamage,
  type CombatCallbacks,
} from "./systems/combatSystem";
import { updateMovement, updateWeaponAim } from "./systems/movementSystem";
import {
  buildCollisionPairs,
  integratePositions,
  resolvePairCollision,
} from "./systems/physicsSystem";
import { findSpawnPosition } from "./systems/spawnSystem";
import type { GameSettings } from "./settings";
import { DEFAULT_GAME_SETTINGS, normalizeGameSettings } from "./settings";

export type ArenaRect = ArenaBounds;

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  life: number;
  vy: number;
  vx: number;
  color: string;
  rot: number;
  rotV: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  color: string;
  drag: number;
}

interface Shockwave {
  x: number;
  y: number;
  t0: number;
  maxR: number;
  hue: number;
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

export class GameEngine {
  players = new Map<string, PlayerEntity>();
  floatTexts: FloatingText[] = [];
  particles: Particle[] = [];
  shockwaves: Shockwave[] = [];
  stars: { x: number; y: number; s: number; tw: number; layer: number; vx: number; vy: number }[] =
    [];
  arena: ArenaBounds = { x: 0, y: 0, w: 400, h: 700, pad: 8 };
  roundEndAt = 0;
  lastFrame = 0;
  canvasW = 400;
  canvasH = 800;

  private readonly avatarCache = new Map<string, HTMLImageElement>();
  private bgGradInvalid = true;
  private bgLinear: CanvasGradient | null = null;
  private bgRadial: CanvasGradient | null = null;
  private arenaFillGrad: CanvasGradient | null = null;
  private simTick = 0;
  private roundDurationSec = DEFAULT_GAME_SETTINGS.roundSeconds;
  private maxPlayers = DEFAULT_GAME_SETTINGS.maxPlayers;
  private arenaBottomHudFraction = DEFAULT_GAME_SETTINGS.arenaBottomHudFraction;

  private readonly combatCb: CombatCallbacks = {
    onDamage: (_att, vic, _amt, showText) => {
      this.spawnHitSparks(vic.x, vic.y - vic.collisionRadius() * 0.3, 0.8);
      this.addFloating(vic.x, vic.y - vic.collisionRadius(), showText, GAMEPLAY.effects.damageFloatColor);
    },
    onEliminate: (vic, killer) => this.eliminate(vic, killer),
  };

  constructor() {
    for (let i = 0; i < GAMEPLAY.effects.starCount; i++) {
      const layer = Math.random() < 0.55 ? 0 : 1;
      this.stars.push({
        x: Math.random(),
        y: Math.random(),
        s: layer ? 0.8 + Math.random() * 1.8 : 0.2 + Math.random() * 0.9,
        tw: Math.random() * Math.PI * 2,
        layer,
        vx: (Math.random() - 0.5) * (layer ? 0.012 : 0.028),
        vy: (Math.random() - 0.5) * (layer ? 0.018 : 0.04),
      });
    }
  }

  applyGameSettings(s: GameSettings): void {
    const n = normalizeGameSettings(s);
    this.roundDurationSec = n.roundSeconds;
    this.maxPlayers = n.maxPlayers;
    this.arenaBottomHudFraction = n.arenaBottomHudFraction;
    this.resize(this.canvasW, this.canvasH);
  }

  getRoundDurationSeconds(): number {
    return this.roundDurationSec;
  }

  getGameSettingsSnapshot(): GameSettings {
    return normalizeGameSettings({
      roundSeconds: this.roundDurationSec,
      maxPlayers: this.maxPlayers,
      arenaBottomHudFraction: this.arenaBottomHudFraction,
    });
  }

  resize(canvasWidth: number, canvasHeight: number): void {
    this.canvasW = Math.max(1, canvasWidth);
    this.canvasH = Math.max(1, canvasHeight);
    const padX = canvasWidth * 0.04;
    const padY = canvasHeight * 0.065;
    const aw = Math.max(100, canvasWidth - 2 * padX);
    const ah = Math.max(100, canvasHeight - padY - canvasHeight * this.arenaBottomHudFraction);
    this.arena = { x: padX, y: padY, w: aw, h: ah, pad: 8 };
    this.bgGradInvalid = true;
  }

  startRound(): void {
    this.roundEndAt = performance.now() + this.roundDurationSec * 1000;
    this.players.clear();
    this.floatTexts = [];
    this.particles = [];
    this.shockwaves = [];
    this.bgGradInvalid = true;
  }

  /** LIKE — yalnızca yeni oyuncu; mevcut oyuncuya dokunma. */
  spawnNewPlayer(user: LiveUser): PlayerEntity | null {
    if (this.players.has(user.id)) return null;
    return this.createPlayer(user);
  }

  /** Hediye / silah — oyuncu yoksa oluştur, varsa güncelle. */
  ensurePlayer(user: LiveUser): PlayerEntity {
    const existing = this.players.get(user.id);
    if (existing) {
      this.syncPlayerProfile(existing, user);
      return existing;
    }
    return this.createPlayer(user);
  }

  /** @deprecated Use spawnNewPlayer or ensurePlayer */
  spawnOrJoin(user: LiveUser): PlayerEntity {
    return this.ensurePlayer(user);
  }

  private createPlayer(user: LiveUser): PlayerEntity {
    if (this.players.size >= this.maxPlayers) {
      this.evictWeakestPlayer();
    }
    const now = performance.now();
    const tempR = GAMEPLAY.mass.baseRadius + 4;
    const pos =
      findSpawnPosition(this.arena, this.players.values(), tempR) ??
      { x: this.arena.x + this.arena.w * 0.5, y: this.arena.y + this.arena.h * 0.5 };
    const p = new PlayerEntity(user, pos, now);
    this.players.set(user.id, p);
    this.burstHeal(p);
    return p;
  }

  private syncPlayerProfile(p: PlayerEntity, user: LiveUser): void {
    const nick = user.displayName.trim();
    if (nick) p.name = nick;
    const url = user.avatarUrl.trim();
    if (url && url !== p.avatarUrl) p.avatarUrl = url;
  }

  private evictWeakestPlayer(): void {
    let worst: PlayerEntity | null = null;
    for (const q of this.players.values()) {
      if (!worst || q.mass < worst.mass) worst = q;
    }
    if (worst) this.players.delete(worst.id);
  }

  private burstHeal(p: PlayerEntity): void {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.random() * 0.4;
      const sp = 40 + Math.random() * 90;
      this.particles.push({
        x: p.x,
        y: p.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.35 + Math.random() * 0.25,
        size: 2 + Math.random() * 2,
        color: "rgba(120, 220, 255, 0.9)",
        drag: 0.93,
      });
    }
  }

  applyGiftToUser(user: LiveUser, gift: GiftType, count: number): void {
    const p = this.ensurePlayer(user);
    const n = Math.max(1, count);
    const eff = giftToEffect(gift);
    const now = performance.now();
    if (!eff) return;
    if (eff.type === "speed") {
      p.speedBoostUntil = Math.max(p.speedBoostUntil, now) + SPEED_BOOST_MS * n;
      this.burstSpeed(p);
      return;
    }
    const w = eff.weapon;
    p.weapon = w;
    p.weaponUntil = now + WEAPON_DURATION_MS[w] * n;
    this.addWeaponBurst(p, w);
  }

  private burstSpeed(p: PlayerEntity): void {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 50 + Math.random() * 100;
      this.particles.push({
        x: p.x,
        y: p.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.3 + Math.random() * 0.2,
        size: 2 + Math.random() * 2,
        color: `hsla(${140 + Math.random() * 40}, 85%, 58%, 0.9)`,
        drag: 0.91,
      });
    }
    this.shockwaves.push({
      x: p.x,
      y: p.y,
      t0: performance.now(),
      maxR: 40 + p.getRadius() * 0.35,
      hue: 150,
    });
  }

  private addWeaponBurst(p: PlayerEntity, w: WeaponMode): void {
    const hues: Partial<Record<WeaponMode, number>> = {
      power_blade: 200,
      ultra_blade: 280,
      sniper: 140,
      minigun: 35,
      bomber: 20,
      hyper_blade: 310,
      god_mode: 48,
    };
    const hue = hues[w] ?? 200;
    this.shockwaves.push({
      x: p.x,
      y: p.y,
      t0: performance.now(),
      maxR: 28 + p.getRadius() * 0.6,
      hue,
    });
    const count = w === "god_mode" ? 28 : w === "minigun" ? 14 : 18;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 140;
      this.particles.push({
        x: p.x,
        y: p.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.25 + Math.random() * 0.35,
        size: 1.5 + Math.random() * 3,
        color: `hsla(${hue + (Math.random() - 0.5) * 40}, 90%, 62%, 0.95)`,
        drag: 0.9,
      });
    }
  }

  addFloating(x: number, y: number, text: string, color = GAMEPLAY.effects.damageFloatColor): void {
    this.floatTexts.push({
      x,
      y,
      text,
      life: GAMEPLAY.effects.floatTextLife,
      vy: -72 - Math.random() * 40,
      vx: (Math.random() - 0.5) * 55,
      color,
      rot: (Math.random() - 0.5) * 0.35,
      rotV: (Math.random() - 0.5) * 3.5,
    });
  }

  private spawnHitSparks(x: number, y: number, intensity: number): void {
    const n = Math.min(12, 3 + Math.floor(intensity * 2));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 80 + Math.random() * 120 * intensity;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.2 + Math.random() * 0.28,
        size: 1.5 + Math.random() * 2.5,
        color: Math.random() < 0.35 ? "#ffffff" : `hsl(${10 + Math.random() * 35}, 100%, 65%)`,
        drag: 0.88,
      });
    }
  }

  formatMass(m: number): string {
    if (m >= 1000) return `${(m / 1000).toFixed(1)}K`;
    return String(Math.floor(m));
  }

  getLeaderboard(): { user: LiveUser; mass: number; kills: number }[] {
    return [...this.players.values()]
      .filter((p) => p.mass >= GAMEPLAY.mass.min)
      .sort((a, b) => b.mass - a.mass || b.kills - a.kills)
      .slice(0, LEADERBOARD_ROWS)
      .map((p) => ({
        user: { id: p.id, displayName: p.name, avatarUrl: p.avatarUrl },
        mass: p.mass,
        kills: p.kills,
      }));
  }

  getRemainingSeconds(): number {
    if (!Number.isFinite(this.roundEndAt) || this.roundEndAt <= 0) {
      return this.roundDurationSec;
    }
    return Math.max(0, Math.ceil((this.roundEndAt - performance.now()) / 1000));
  }

  step(dt: number): void {
    const now = performance.now();
    const t = dt / 1000;
    if (this.lastFrame === 0) this.lastFrame = now;
    this.lastFrame = now;

    for (const p of this.players.values()) {
      if (p.weapon !== "none" && now >= p.weaponUntil) p.weapon = "none";
      const targetR = p.getRadius();
      p.displayRadius += (targetR - p.displayRadius) * Math.min(1, t * GAMEPLAY.mass.displayRadiusLerp);
      if (!Number.isFinite(p.displayRadius)) p.displayRadius = targetR;
      p.displayRadius = Math.max(
        GAMEPLAY.mass.displayRadiusMin,
        Math.min(GAMEPLAY.mass.displayRadiusMax, p.displayRadius)
      );
    }

    this.simTick += 1;
    const crowded = this.players.size >= GAMEPLAY.perf.crowdedPlayerThreshold;
    const skipAi = crowded && this.simTick % GAMEPLAY.perf.aiSkipModulo !== 0;

    if (!skipAi) {
      updateMovement(this.players.values(), this.arena, t, now);
      updateWeaponAim(this.players);
    }

    integratePositions(this.players.values(), this.arena, t, (px, py, nx, ny) =>
      this.wallSpark(px, py, nx, ny)
    );

    const pairs = buildCollisionPairs(this.players);
    for (const { a, b } of pairs) {
      const { touching } = resolvePairCollision(a, b);
      if (touching) applyContactDamage(a, b, now, this.combatCb);
    }

    this.weaponTicks(dt, now);
    this.updateEffects(t, now);
    this.trimEffectBudget();
  }

  private updateEffects(t: number, now: number): void {
    this.particles = this.particles.filter((pt) => {
      pt.life -= t * 1.15;
      pt.x += pt.vx * t;
      pt.y += pt.vy * t;
      pt.vx *= pt.drag;
      pt.vy *= pt.drag;
      return pt.life > 0;
    });

    this.shockwaves = this.shockwaves.filter((sw) => now - sw.t0 < 720);

    for (const s of this.stars) {
      s.x += s.vx * t * (s.layer ? 0.35 : 0.65);
      s.y += s.vy * t * (s.layer ? 0.35 : 0.65);
      s.x = ((s.x % 1) + 1) % 1;
      s.y = ((s.y % 1) + 1) % 1;
    }

    this.floatTexts = this.floatTexts.filter((ft) => {
      ft.life -= t * 0.85;
      ft.x += ft.vx * t;
      ft.y += ft.vy * t;
      ft.vx *= 0.94;
      ft.vy += 28 * t;
      ft.rot += ft.rotV * t;
      ft.rotV *= 0.9;
      return ft.life > 0;
    });
  }

  private trimEffectBudget(): void {
    const fx = GAMEPLAY.effects;
    if (this.particles.length > fx.maxParticles) {
      this.particles.splice(0, this.particles.length - fx.maxParticles);
    }
    if (this.floatTexts.length > fx.maxFloatTexts) {
      this.floatTexts.splice(0, this.floatTexts.length - fx.maxFloatTexts);
    }
    if (this.shockwaves.length > fx.maxShockwaves) {
      this.shockwaves.splice(0, this.shockwaves.length - fx.maxShockwaves);
    }
  }

  private wallSpark(px: number, py: number, nx: number, ny: number): void {
    if (this.particles.length > 200 && Math.random() > 0.08) return;
    if (Math.random() > 0.55) return;
    for (let i = 0; i < 2; i++) {
      this.particles.push({
        x: px,
        y: py,
        vx: (nx || (Math.random() - 0.5)) * (40 + Math.random() * 60),
        vy: (ny || (Math.random() - 0.5)) * (40 + Math.random() * 60),
        life: 0.12 + Math.random() * 0.1,
        size: 1 + Math.random(),
        color: "rgba(120, 200, 255, 0.85)",
        drag: 0.82,
      });
    }
  }

  private eliminate(victim: PlayerEntity, killer: PlayerEntity): void {
    if (!this.players.has(victim.id)) return;
    const now = performance.now();
    this.spawnDeathBurst(victim, now);
    if (killer !== victim && this.players.has(killer.id)) {
      killer.mass += Math.min(victim.mass + 15, 120);
      killer.kills += 1;
    }
    this.players.delete(victim.id);
  }

  private spawnDeathBurst(v: PlayerEntity, now: number): void {
    this.shockwaves.push({
      x: v.x,
      y: v.y,
      t0: now,
      maxR: 70 + v.getRadius() * 0.9,
      hue: 350,
    });
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2 + Math.random() * 0.5;
      const sp = 90 + Math.random() * 160;
      this.particles.push({
        x: v.x,
        y: v.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.45 + Math.random() * 0.35,
        size: 2 + Math.random() * 4,
        color:
          Math.random() < 0.4
            ? "rgba(255,255,255,0.95)"
            : `hsla(${340 + Math.random() * 25}, 95%, 62%, 0.9)`,
        drag: 0.9,
      });
    }
  }

  private weaponTicks(dt: number, now: number): void {
    const list = [...this.players.values()];
    for (const p of list) {
      if (!p.isWeaponActive(now)) continue;

      if (p.weapon === "sniper") {
        p.sniperCooldown -= dt;
        if (p.sniperCooldown <= 0) {
          p.sniperCooldown = 480;
          const tgt = this.findNearestEnemy(p, 320);
          if (tgt) {
            applyProjectileDamage(p, tgt, 12 + p.mass * 0.04, now, this.combatCb);
            this.beamSparks(p.x, p.y, tgt.x, tgt.y);
          }
        }
      }

      if (p.weapon === "minigun") {
        p.minigunTick += dt;
        let burst = 0;
        while (p.minigunTick > 70 && burst < 8) {
          burst += 1;
          p.minigunTick -= 70;
          const tgt = this.findNearestEnemy(p, 200);
          if (tgt) applyProjectileDamage(p, tgt, 2 + p.mass * 0.015, now, this.combatCb);
        }
      }

      if (p.weapon === "bomber") {
        p.bomberTick += dt;
        if (p.bomberTick > 900) {
          p.bomberTick = 0;
          this.shockwaves.push({ x: p.x, y: p.y, t0: now, maxR: 145, hue: 32 });
          for (let k = 0; k < 24; k++) {
            const a = (k / 24) * Math.PI * 2;
            this.particles.push({
              x: p.x + Math.cos(a) * 8,
              y: p.y + Math.sin(a) * 8,
              vx: Math.cos(a) * (180 + Math.random() * 80),
              vy: Math.sin(a) * (180 + Math.random() * 80),
              life: 0.35 + Math.random() * 0.2,
              size: 2 + Math.random() * 3,
              color: `hsla(${25 + Math.random() * 20}, 100%, 58%, 0.9)`,
              drag: 0.91,
            });
          }
          const r = 100;
          for (const o of list) {
            if (o === p) continue;
            if (Math.hypot(p.x - o.x, p.y - o.y) < r) {
              applyProjectileDamage(p, o, 8 + p.mass * 0.025, now, this.combatCb);
            }
          }
        }
      }
    }
  }

  private findNearestEnemy(p: PlayerEntity, maxDist: number): PlayerEntity | null {
    let best: PlayerEntity | null = null;
    let bd = maxDist;
    for (const o of this.players.values()) {
      if (o === p) continue;
      const d = Math.hypot(p.x - o.x, p.y - o.y);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  }

  private beamSparks(x0: number, y0: number, x1: number, y1: number): void {
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.particles.push({
        x: x0 + (x1 - x0) * t,
        y: y0 + (y1 - y0) * t,
        vx: (Math.random() - 0.5) * 40,
        vy: (Math.random() - 0.5) * 40,
        life: 0.14 + Math.random() * 0.1,
        size: 1.5 + Math.random() * 2,
        color: "rgba(200, 255, 140, 0.95)",
        drag: 0.88,
      });
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    const { canvasW, canvasH, arena } = this;
    const now = performance.now();
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.003);

    if (this.bgGradInvalid || !this.bgLinear) {
      const grd = ctx.createLinearGradient(0, 0, canvasW, canvasH);
      grd.addColorStop(0, "#0a1630");
      grd.addColorStop(0.45, "#060d1c");
      grd.addColorStop(1, "#010208");
      this.bgLinear = grd;
      const ng = ctx.createRadialGradient(
        canvasW * 0.5,
        canvasH * 0.32,
        0,
        canvasW * 0.5,
        canvasH * 0.32,
        canvasH * 0.55
      );
      ng.addColorStop(0, "rgba(50, 100, 180, 0.14)");
      ng.addColorStop(0.55, "rgba(10, 20, 40, 0.04)");
      ng.addColorStop(1, "rgba(0,0,0,0)");
      this.bgRadial = ng;
      const ag = ctx.createLinearGradient(arena.x, arena.y, arena.x, arena.y + arena.h);
      ag.addColorStop(0, "rgba(77, 184, 255, 0.5)");
      ag.addColorStop(1, "transparent");
      this.arenaFillGrad = ag;
      this.bgGradInvalid = false;
    }

    ctx.fillStyle = this.bgLinear!;
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.fillStyle = this.bgRadial!;
    ctx.fillRect(0, 0, canvasW, canvasH);

    ctx.save();
    for (const s of this.stars) {
      const spd = s.layer ? 0.02 : 0.011;
      const tw = 0.45 + 0.55 * Math.sin(now * spd + s.tw);
      ctx.globalAlpha = (s.layer ? 0.2 : 0.06) + tw * (s.layer ? 0.58 : 0.42);
      ctx.fillStyle = s.layer ? "#f0f8ff" : "#9ec8ff";
      ctx.beginPath();
      ctx.arc(s.x * canvasW, s.y * canvasH, s.s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    for (const sw of this.shockwaves) {
      const age = now - sw.t0;
      const t = Math.min(1, age / 680);
      const rad = t * sw.maxR;
      const alpha = (1 - t) * 0.62;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, Math.max(0, rad), 0, Math.PI * 2);
      ctx.strokeStyle = `hsla(${sw.hue}, 100%, 58%, ${alpha})`;
      ctx.lineWidth = 4 * (1 - t) + 1;
      ctx.stroke();
    }

    ctx.strokeStyle = `rgba(130, 215, 255, ${0.5 + pulse * 0.25})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(arena.x, arena.y, arena.w, arena.h);

    ctx.save();
    ctx.globalAlpha = 0.07 + pulse * 0.04;
    ctx.fillStyle = this.arenaFillGrad!;
    ctx.fillRect(arena.x, arena.y, arena.w, arena.h);
    ctx.restore();

    for (const p of this.players.values()) {
      this.drawPlayer(ctx, p, now, pulse);
    }

    for (const pt of this.particles) {
      ctx.globalAlpha = Math.min(1, pt.life * 2);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size * (0.55 + pt.life * 0.55), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const ft of this.floatTexts) {
      const a = Math.max(0, ft.life);
      const pop = 1 + 0.62 * (1 - a) * (1 - a);
      ctx.save();
      ctx.translate(ft.x, ft.y);
      ctx.rotate(ft.rot);
      ctx.scale(pop, pop);
      ctx.globalAlpha = a ** 0.82;
      ctx.font = "800 17px Orbitron";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.strokeText(ft.text, 0, 0);
      ctx.shadowColor = ft.color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, p: PlayerEntity, now: number, _pulse: number): void {
    const rBase = p.collisionRadius();
    const birthT = Math.min(1, (now - p.bornAt) / GAMEPLAY.spawn.birthAnimMs);
    const birthScale = birthT >= 1 ? 1 : Math.max(0.16, easeOutBack(birthT));
    const r = Math.max(4, rBase * Math.max(0.05, birthScale));
    const blade = p.hasBladeLook(now);
    const sun = p.hasSunLook(now);
    const sp = Math.hypot(p.vx, p.vy);
    const tilt = Math.atan2(p.vy, p.vx) * Math.min(0.14, sp * 0.00055);

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(tilt);

    if (now < p.invulnUntil) {
      ctx.globalAlpha = 0.55 + 0.45 * Math.sin(now * 0.018);
    }

    if (p.isWeaponActive(now)) {
      ctx.shadowBlur = sun ? 28 : blade ? 18 : 14;
      ctx.shadowColor = p.color;
    }

    ctx.strokeStyle = p.color;
    ctx.lineWidth = sun ? 4.5 : blade ? 2.5 : 3;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "#0a0e14";
    ctx.beginPath();
    ctx.arc(0, 0, r - 1, 0, Math.PI * 2);
    ctx.fill();

    const avatarUrl = p.avatarUrl.trim();
    let drewAvatar = false;
    if (avatarUrl) {
      let img = this.avatarCache.get(avatarUrl);
      if (!img) {
        while (this.avatarCache.size >= GAMEPLAY.effects.maxAvatarCache) {
          const firstKey = this.avatarCache.keys().next().value;
          if (firstKey === undefined) break;
          this.avatarCache.delete(firstKey);
        }
        img = new Image();
        if (avatarImageUseAnonymousCors(avatarUrl)) img.crossOrigin = "anonymous";
        img.referrerPolicy = "no-referrer";
        img.src = avatarUrl;
        this.avatarCache.set(avatarUrl, img);
      }
      if (img.complete && img.naturalWidth > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, r - 3, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, -r + 3, -r + 3, (r - 3) * 2, (r - 3) * 2);
        ctx.restore();
        drewAvatar = true;
      }
    }
    if (!drewAvatar) {
      ctx.fillStyle = "#2a3f55";
      ctx.font = `${Math.max(10, r * 0.45)}px Rajdhani`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(p.name.slice(0, 2).toUpperCase(), 0, 0);
    }

    if (now < p.hurtFlashUntil) {
      const f = (p.hurtFlashUntil - now) / GAMEPLAY.combat.hurtFlashMs;
      ctx.strokeStyle = `rgba(255,255,255,${f * 0.9})`;
      ctx.lineWidth = 3 * f + 1;
      ctx.beginPath();
      ctx.arc(0, 0, r + 5 * f, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.fillStyle = "#e8f4ff";
    ctx.font = `600 ${Math.max(9, 11 * (r / 28))}px Rajdhani`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.shadowColor = "rgba(0,0,0,0.7)";
    ctx.shadowBlur = 3;
    ctx.fillText(this.formatMass(p.mass), 0, r + 2);
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

// Re-export entity for tests / extensions
export { PlayerEntity } from "./playerEntity";
