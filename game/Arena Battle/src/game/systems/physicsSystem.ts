import type { PlayerEntity } from "../playerEntity";
import type { ArenaBounds } from "../playerEntity";
import { GAMEPLAY } from "../gameConfig";

export interface CollisionPair {
  a: PlayerEntity;
  b: PlayerEntity;
}

/** Uniform grid broad-phase for O(n) average collision checks. */
export class SpatialHash {
  private readonly cellSize: number;
  private readonly cells = new Map<string, PlayerEntity[]>();

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  clear(): void {
    this.cells.clear();
  }

  private key(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  insert(p: PlayerEntity): void {
    const cs = this.cellSize;
    const cx = Math.floor(p.x / cs);
    const cy = Math.floor(p.y / cs);
    const k = this.key(cx, cy);
    let bucket = this.cells.get(k);
    if (!bucket) {
      bucket = [];
      this.cells.set(k, bucket);
    }
    bucket.push(p);
  }

  /** Unique overlapping pairs (a.id < b.id). */
  collectPairs(): CollisionPair[] {
    const pairs: CollisionPair[] = [];
    const seen = new Set<string>();

    for (const [k, bucket] of this.cells) {
      const [cxStr, cyStr] = k.split(",");
      const cx = Number(cxStr);
      const cy = Number(cyStr);

      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const other = this.cells.get(this.key(cx + ox, cy + oy));
          if (!other) continue;
          for (const a of bucket) {
            for (const b of other) {
              if (a === b) continue;
              const idA = a.id;
              const idB = b.id;
              const pairKey = idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
              if (seen.has(pairKey)) continue;
              seen.add(pairKey);
              const pA = idA < idB ? a : b;
              const pB = idA < idB ? b : a;
              pairs.push({ a: pA, b: pB });
            }
          }
        }
      }
    }
    return pairs;
  }
}

export function buildCollisionPairs(players: Map<string, PlayerEntity>): CollisionPair[] {
  const list = [...players.values()];
  const threshold = GAMEPLAY.physics.spatialHashMinPlayers;

  if (list.length < threshold) {
    const pairs: CollisionPair[] = [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        pairs.push({ a: list[i]!, b: list[j]! });
      }
    }
    return pairs;
  }

  const hash = new SpatialHash(GAMEPLAY.physics.spatialHashCellSize);
  for (const p of list) hash.insert(p);
  return hash.collectPairs();
}

export function integratePositions(
  players: Iterable<PlayerEntity>,
  arena: ArenaBounds,
  dt: number,
  onWallHit?: (px: number, py: number, nx: number, ny: number) => void
): void {
  const { wallSlideFriction, wallBounce } = GAMEPLAY.movement;

  for (const p of players) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const r = p.collisionRadius();
    const left = arena.x + r;
    const right = arena.x + arena.w - r;
    const top = arena.y + r;
    const bottom = arena.y + arena.h - r;

    if (p.x < left) {
      p.x = left;
      p.vx = Math.abs(p.vx) * wallBounce;
      p.vy *= wallSlideFriction;
      onWallHit?.(p.x, p.y, 1, 0);
    } else if (p.x > right) {
      p.x = right;
      p.vx = -Math.abs(p.vx) * wallBounce;
      p.vy *= wallSlideFriction;
      onWallHit?.(p.x, p.y, -1, 0);
    }

    if (p.y < top) {
      p.y = top;
      p.vy = Math.abs(p.vy) * wallBounce;
      p.vx *= wallSlideFriction;
      onWallHit?.(p.x, p.y, 0, 1);
    } else if (p.y > bottom) {
      p.y = bottom;
      p.vy = -Math.abs(p.vy) * wallBounce;
      p.vx *= wallSlideFriction;
      onWallHit?.(p.x, p.y, 0, -1);
    }
  }
}

export function resolvePairCollision(a: PlayerEntity, b: PlayerEntity): { nx: number; ny: number; touching: boolean } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 0.001;
  const minDist = a.collisionRadius() + b.collisionRadius();
  const { separationSlop, positionCorrection, velocityRestitution } = GAMEPLAY.physics;

  if (dist >= minDist * separationSlop) {
    return { nx: dx / dist, ny: dy / dist, touching: false };
  }

  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = minDist - dist;
  const totalM = a.mass + b.mass;
  const push = overlap * positionCorrection;

  a.x -= nx * push * (b.mass / totalM);
  a.y -= ny * push * (b.mass / totalM);
  b.x += nx * push * (a.mass / totalM);
  b.y += ny * push * (a.mass / totalM);

  const relVx = a.vx - b.vx;
  const relVy = a.vy - b.vy;
  const closing = relVx * nx + relVy * ny;
  if (closing < 0) {
    const impulse = (-(1 + velocityRestitution) * closing) / (1 / a.mass + 1 / b.mass);
    a.vx -= (impulse / a.mass) * nx;
    a.vy -= (impulse / a.mass) * ny;
    b.vx += (impulse / b.mass) * nx;
    b.vy += (impulse / b.mass) * ny;
  }

  return { nx, ny, touching: true };
}
