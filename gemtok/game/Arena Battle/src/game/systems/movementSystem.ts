import type { PlayerEntity } from "../playerEntity";
import type { ArenaBounds } from "../playerEntity";
import { GAMEPLAY } from "../gameConfig";

function pickWanderTarget(p: PlayerEntity, arena: ArenaBounds, now: number): void {
  const r = p.collisionRadius();
  const margin = arena.pad + r + GAMEPLAY.spawn.edgePadding;
  const minX = arena.x + margin;
  const maxX = arena.x + arena.w - margin;
  const minY = arena.y + margin;
  const maxY = arena.y + arena.h - margin;
  const { targetPickMsMin, targetPickMsMax } = GAMEPLAY.movement;

  p.wander.targetX = minX + Math.random() * Math.max(1, maxX - minX);
  p.wander.targetY = minY + Math.random() * Math.max(1, maxY - minY);
  p.wander.targetUntil =
    now + targetPickMsMin + Math.random() * (targetPickMsMax - targetPickMsMin);
  p.wander.stuckFrames = 0;
  p.wander.lastX = p.x;
  p.wander.lastY = p.y;
}

function needsNewTarget(p: PlayerEntity, arena: ArenaBounds, now: number): boolean {
  const { targetReachDist, stuckDistThreshold, stuckFramesLimit } = GAMEPLAY.movement;
  const w = p.wander;

  if (now >= w.targetUntil) return true;

  const toTarget = Math.hypot(w.targetX - p.x, w.targetY - p.y);
  if (toTarget < targetReachDist) return true;

  const moved = Math.hypot(p.x - w.lastX, p.y - w.lastY);
  if (moved < stuckDistThreshold) {
    w.stuckFrames += 1;
    if (w.stuckFrames >= stuckFramesLimit) return true;
  } else {
    w.stuckFrames = 0;
    w.lastX = p.x;
    w.lastY = p.y;
  }

  /** Target outside arena after resize */
  const r = p.collisionRadius();
  const margin = arena.pad + r;
  if (
    w.targetX < arena.x + margin ||
    w.targetX > arena.x + arena.w - margin ||
    w.targetY < arena.y + margin ||
    w.targetY > arena.y + arena.h - margin
  ) {
    return true;
  }

  return false;
}

/** Natural wander — no chasing, smooth turns, momentum preserved. */
export function updateMovement(
  players: Iterable<PlayerEntity>,
  arena: ArenaBounds,
  dt: number,
  now: number
): void {
  const {
    baseSpeed,
    maxSpeed,
    heavyMassThreshold,
    heavySpeedPenalty,
    friction,
    turnRate,
    wanderNoise,
  } = GAMEPLAY.movement;

  for (const p of players) {
    if (needsNewTarget(p, arena, now)) {
      pickWanderTarget(p, arena, now);
    }

    const dx = p.wander.targetX - p.x;
    const dy = p.wander.targetY - p.y;
    const dist = Math.hypot(dx, dy) || 1;
    let dirX = dx / dist;
    let dirY = dy / dist;

    /** Perpendicular wander noise — breaks orbit patterns */
    const noiseAngle = Math.sin(now * 0.0011 + p.id.length * 0.7) * wanderNoise;
    const cosN = Math.cos(noiseAngle);
    const sinN = Math.sin(noiseAngle);
    const nx = dirX * cosN - dirY * sinN;
    const ny = dirX * sinN + dirY * cosN;
    dirX = nx;
    dirY = ny;

    let speed = baseSpeed * p.speedMultiplier(now);
    if (p.mass > heavyMassThreshold) speed -= heavySpeedPenalty;

    const desiredVx = dirX * speed;
    const desiredVy = dirY * speed;
    const blend = Math.min(1, turnRate * dt);
    p.vx += (desiredVx - p.vx) * blend;
    p.vy += (desiredVy - p.vy) * blend;

    const cap = maxSpeed + (p.mass > heavyMassThreshold ? -30 : 0);
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > cap) {
      p.vx = (p.vx / sp) * cap;
      p.vy = (p.vy / sp) * cap;
    }

    p.vx *= friction;
    p.vy *= friction;
  }
}

/** Aim for projectile weapons only — not general movement. */
export function updateWeaponAim(players: Map<string, PlayerEntity>): void {
  const list = [...players.values()];
  for (const p of list) {
    if (p.weapon !== "sniper" && p.weapon !== "minigun" && p.weapon !== "bomber") continue;
    if (!p.isWeaponActive(performance.now())) continue;
    let nearest: PlayerEntity | null = null;
    let nearestD = 280;
    for (const o of list) {
      if (o === p) continue;
      const d = Math.hypot(o.x - p.x, o.y - p.y);
      if (d < nearestD) {
        nearestD = d;
        nearest = o;
      }
    }
    if (nearest) {
      p.aimAngle = Math.atan2(nearest.y - p.y, nearest.x - p.x);
    }
  }
}
