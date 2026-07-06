import type { PlayerEntity } from "../playerEntity";
import type { ArenaBounds } from "../playerEntity";
import { GAMEPLAY } from "../gameConfig";

/** Find open arena spot away from existing players. */
export function findSpawnPosition(
  arena: ArenaBounds,
  players: Iterable<PlayerEntity>,
  radius: number
): { x: number; y: number } | null {
  const { maxAttempts, minGap, edgePadding } = GAMEPLAY.spawn;
  const margin = arena.pad + radius + edgePadding;
  const minX = arena.x + margin;
  const maxX = arena.x + arena.w - margin;
  const minY = arena.y + margin;
  const maxY = arena.y + arena.h - margin;
  if (minX >= maxX || minY >= maxY) return null;

  const list = [...players];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const x = minX + Math.random() * (maxX - minX);
    const y = minY + Math.random() * (maxY - minY);
    let ok = true;
    for (const p of list) {
      const need = radius + p.collisionRadius() + minGap;
      if (Math.hypot(p.x - x, p.y - y) < need) {
        ok = false;
        break;
      }
    }
    if (ok) return { x, y };
  }

  /** Fallback: center-biased random with reduced gap */
  for (let attempt = 0; attempt < 16; attempt++) {
    const t = 0.35 + Math.random() * 0.3;
    const x = minX + (maxX - minX) * t + (Math.random() - 0.5) * 40;
    const y = minY + (maxY - minY) * t + (Math.random() - 0.5) * 40;
    let ok = true;
    for (const p of list) {
      const need = radius + p.collisionRadius() + 4;
      if (Math.hypot(p.x - x, p.y - y) < need) {
        ok = false;
        break;
      }
    }
    if (ok) return { x, y };
  }

  return { x: (minX + maxX) * 0.5, y: (minY + maxY) * 0.5 };
}
