import type { LevelSpec, NormRect, NormSeg } from "./levelSpec";
import { PIG_PEN_NORM } from "./levelSpec";

export type GroundSeg = { x1: number; y1: number; x2: number; y2: number };
export type Crate = {
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  alive: boolean;
  vx: number;
  vy: number;
  /** Başlangıç ızgarası (yeniden doğunca konum sıfırlanır) */
  spawnX: number;
  spawnY: number;
  /** Kırılınca saniye; 0 olunca tekrar `alive` */
  respawnIn?: number;
};
export type Projectile = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  teamId: number;
  sprite: HTMLImageElement;
  airborne: boolean;
  settled: number;
  /** Kutu kırılınca işaretlenir; kare sonunda listeden silinir */
  dead?: boolean;
  /** Yaşam süresi (s); sonsuz takılmayı önler */
  age?: number;
  /** Hediye güdümü: birim ışın vektörü; yalnızca havadayken itme + enlemesine sönüm */
  guideDir?: { x: number; y: number };
  /** Bu atıştaki jeton adedi (puan = öldürülen domuz × tokenCount) */
  tokenCount?: number;
};

const GRAVITY_BASE = 3200;

export function gravityForWorld(H: number): number {
  return GRAVITY_BASE * (1080 / H);
}

/**
 * Yerçekimi y aşağı pozitif. (x0,y0) → (xt,yt) için uygun uçuş süresi T aranır.
 */
export function tryBallisticVelocity(
  x0: number,
  y0: number,
  xt: number,
  yt: number,
  g: number,
  c: {
    minT: number;
    maxT: number;
    minVx: number;
    minSpeed: number;
    maxSpeed: number;
    idealSpeed: number;
  },
): { vx: number; vy: number } | null {
  let best: { vx: number; vy: number; score: number } | null = null;
  for (let T = c.minT; T <= c.maxT; T += 0.018) {
    const vx = (xt - x0) / T;
    const vy = (yt - y0 - 0.5 * g * T * T) / T;
    if (vx < c.minVx) continue;
    const sp = Math.hypot(vx, vy);
    if (sp < c.minSpeed || sp > c.maxSpeed) continue;
    const score = -Math.abs(sp - c.idealSpeed);
    if (!best || score > best.score) best = { vx, vy, score };
  }
  return best ? { vx: best.vx, vy: best.vy } : null;
}

export function normToWorld(spec: LevelSpec, W: number, H: number): {
  ground: GroundSeg[];
  crates: Crate[];
  sling: { x: number; y: number };
  slingRest: { x: number; y: number };
  posts: { left: { x: number; y: number }; right: { x: number; y: number } };
} {
  const mapSeg = (s: NormSeg): GroundSeg => ({
    x1: s.a.nx * W,
    y1: s.a.ny * H,
    x2: s.b.nx * W,
    y2: s.b.ny * H,
  });
  const mapCrate = (c: NormRect): Crate => {
    const x = c.nx * W;
    const y = c.ny * H;
    return {
      x,
      y,
      w: c.nw * W,
      h: c.nh * H,
      hp: 1,
      alive: true,
      vx: 0,
      vy: 0,
      spawnX: x,
      spawnY: y,
    };
  };
  return {
    ground: spec.ground.map(mapSeg),
    crates: spec.crates.map(mapCrate),
    sling: { x: spec.sling.nx * W, y: spec.sling.ny * H },
    slingRest: {
      x: (spec.sling.nx + spec.slingRestOffset.nx) * W,
      y: (spec.sling.ny + spec.slingRestOffset.ny) * H,
    },
    posts: {
      left: { x: spec.posts.left.nx * W, y: spec.posts.left.ny * H },
      right: { x: spec.posts.right.nx * W, y: spec.posts.right.ny * H },
    },
  };
}

/** Domuz kutu sınırları (dünya pikseli). Sol kenar duvar yok — domuzlar sola kayabilir. */
export type PigPenWorld = { left: number; top: number; right: number; bottom: number };

export function pigPenWorldBounds(W: number, H: number): PigPenWorld {
  const p = PIG_PEN_NORM;
  return {
    left: p.nx * W,
    top: p.ny * H,
    right: (p.nx + p.nw) * W,
    bottom: (p.ny + p.nh) * H,
  };
}

function horizOverlapsPen(c: Crate, pen: PigPenWorld): boolean {
  return c.x + c.w > pen.left && c.x < pen.right;
}

function resolveCratePenWalls(c: Crate, pen: PigPenWorld, rest: number): void {
  // Sağ duvar
  if (c.x + c.w > pen.right) {
    c.x = pen.right - c.w;
    if (c.vx > 0) c.vx *= -rest;
    c.vx *= 0.88;
  }
  // Tavan (yalnızca kutu üstündeki sütunda)
  if (horizOverlapsPen(c, pen) && c.y < pen.top) {
    c.y = pen.top;
    if (c.vy < 0) c.vy *= -rest * 0.35;
  }
  // Kutu tabanı — sol açık; soldan çıkanlar bu zemine yapışmaz
  if (horizOverlapsPen(c, pen) && c.y + c.h > pen.bottom) {
    c.y = pen.bottom - c.h;
    if (c.vy > 0) c.vy *= -rest * 0.22;
    c.vx *= 0.94;
  }
}

function resolveCrateGround(c: Crate, segs: GroundSeg[], rest: number): void {
  const r = Math.min(c.w, c.h) * 0.38;
  const samples = [
    { x: c.x + c.w * 0.22, y: c.y + c.h },
    { x: c.x + c.w * 0.5, y: c.y + c.h },
    { x: c.x + c.w * 0.78, y: c.y + c.h },
  ];
  for (const s of segs) {
    for (const smp of samples) {
      const q = closestPointOnSeg(smp.x, smp.y, s);
      const dx = smp.x - q.x;
      const dy = smp.y - q.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < r) {
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = r - dist;
        c.x += nx * overlap;
        c.y += ny * overlap;
        const vn = c.vx * nx + c.vy * ny;
        if (vn < 0) {
          c.vx -= 2 * vn * nx;
          c.vy -= 2 * vn * ny;
          c.vx *= rest;
          c.vy *= rest;
        }
        const tx = -ny;
        const ty = nx;
        const vt = c.vx * tx + c.vy * ty;
        c.vx -= tx * vt * 0.08;
        c.vy -= ty * vt * 0.08;
      }
    }
  }
}

function resolveCratePair(a: Crate, b: Crate): void {
  const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (overlapX <= 0 || overlapY <= 0) return;
  const cxA = a.x + a.w * 0.5;
  const cxB = b.x + b.w * 0.5;
  const cyA = a.y + a.h * 0.5;
  const cyB = b.y + b.h * 0.5;
  const dx = cxB - cxA;
  const dy = cyB - cyA;
  if (overlapX < overlapY) {
    const s = Math.sign(dx || 1);
    const corr = overlapX * 0.51;
    a.x -= s * corr * 0.5;
    b.x += s * corr * 0.5;
    const rv = b.vx - a.vx;
    if (rv * s < 0) {
      const imp = rv * 0.45;
      a.vx += imp;
      b.vx -= imp;
    }
    a.vx *= 0.9;
    b.vx *= 0.9;
  } else {
    const s = Math.sign(dy || 1);
    const corr = overlapY * 0.51;
    a.y -= s * corr * 0.5;
    b.y += s * corr * 0.5;
    const rv = b.vy - a.vy;
    if (rv * s < 0) {
      const imp = rv * 0.45;
      a.vy += imp;
      b.vy -= imp;
    }
    a.vy *= 0.9;
    b.vy *= 0.9;
  }
}

/** Domuz kutusu: üst + sağ + taban duvarı; sol açık. Tüm domuzlara (canlı + ölü) yerçekimi; kuş yalnızca canlılara çarpar. */
export function stepCrates(
  dt: number,
  crates: Crate[],
  ground: GroundSeg[],
  W: number,
  H: number,
): void {
  const g = gravityForWorld(H);
  const pen = pigPenWorldBounds(W, H);
  const restGround = 0.28;
  const restPen = 0.32;
  const SUB = 3;
  const sdt = dt / SUB;
  for (let step = 0; step < SUB; step++) {
    for (const c of crates) {
      c.vy += g * sdt;
      c.x += c.vx * sdt;
      c.y += c.vy * sdt;
    }
    for (let pass = 0; pass < 6; pass++) {
      for (const c of crates) {
        resolveCratePenWalls(c, pen, restPen);
      }
      for (const c of crates) {
        resolveCrateGround(c, ground, restGround);
      }
      for (let i = 0; i < crates.length; i++) {
        const a = crates[i]!;
        for (let j = i + 1; j < crates.length; j++) {
          resolveCratePair(a, crates[j]!);
        }
      }
    }
    for (const c of crates) {
      if (c.y + c.h > H) {
        c.y = H - c.h;
        if (c.vy > 0) c.vy *= -0.18;
        c.vx *= 0.93;
      }
      c.vx *= 0.9985;
      c.vy *= 0.9995;
    }
  }
}

/** Sapan çevresinde zemin çarpışması yok sayılır (kuş lastiğin “içinden” geçer) */
export type SlingGroundClear = { cx: number; cy: number; r: number };

function closestPointOnSeg(px: number, py: number, s: GroundSeg): { x: number; y: number } {
  const abx = s.x2 - s.x1;
  const aby = s.y2 - s.y1;
  const apx = px - s.x1;
  const apy = py - s.y1;
  const ab2 = abx * abx + aby * aby || 1;
  let t = (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));
  return { x: s.x1 + abx * t, y: s.y1 + aby * t };
}

function pushCircleOutOfSegment(p: Projectile, s: GroundSeg, restitution: number): boolean {
  const q = closestPointOnSeg(p.x, p.y, s);
  const dx = p.x - q.x;
  const dy = p.y - q.y;
  const dist = Math.hypot(dx, dy) || 1;
  if (dist >= p.r) return false;
  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = p.r - dist;
  p.x += nx * overlap;
  p.y += ny * overlap;
  const vn = p.vx * nx + p.vy * ny;
  if (vn < 0) {
    p.vx -= 2 * vn * nx;
    p.vy -= 2 * vn * ny;
    p.vx *= restitution;
    p.vy *= restitution;
  }
  p.airborne = false;
  return true;
}

function collideCircleGround(
  p: Projectile,
  segs: GroundSeg[],
  restitution: number,
  slingClear?: SlingGroundClear,
): void {
  if (slingClear) {
    const ag = p.age ?? 0;
    const d0 = Math.hypot(p.x - slingClear.cx, p.y - slingClear.cy);
    if (d0 < slingClear.r + p.r * 1.05 && (ag < 1.05 || p.vx > 75)) {
      return;
    }
  }
  for (const s of segs) {
    pushCircleOutOfSegment(p, s, restitution);
  }
}

/** Sarı kutu (U): üst + sağ + alt; sol açık — kuşlar duvarların içinden geçmez. */
function pigPenWallSegments(W: number, H: number): GroundSeg[] {
  const b = pigPenWorldBounds(W, H);
  const L = b.left;
  const T = b.top;
  const R = b.right;
  const B = b.bottom;
  return [
    { x1: L, y1: T, x2: R, y2: T },
    { x1: R, y1: T, x2: R, y2: B },
    { x1: R, y1: B, x2: L, y2: B },
  ];
}

function collideCirclePigPenWalls(p: Projectile, W: number, H: number, restitution: number): boolean {
  const segs = pigPenWallSegments(W, H);
  let any = false;
  for (const s of segs) {
    if (pushCircleOutOfSegment(p, s, restitution)) any = true;
  }
  return any;
}

/**
 * Tarama lazeri: ışın kapalı AABB ile ilk giriş (sarı kutu dış kabuğu).
 * `dx,dy` birim vektör; dönüş: ışın boyu (px).
 */
export function clipRayToPigPenAabb(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  maxLen: number,
  W: number,
  H: number,
): number {
  const pen = pigPenWorldBounds(W, H);
  const minX = pen.left;
  const minY = pen.top;
  const maxX = pen.right;
  const maxY = pen.bottom;
  const EPS = 1e-9;
  let t0 = 0;
  let t1 = maxLen * 2;

  const clipSlab = (o: number, d: number, lo: number, hi: number): boolean => {
    if (Math.abs(d) < EPS) {
      if (o < lo || o > hi) return false;
      return true;
    }
    const inv = 1 / d;
    let u0 = (lo - o) * inv;
    let u1 = (hi - o) * inv;
    if (u0 > u1) {
      const t = u0;
      u0 = u1;
      u1 = t;
    }
    t0 = Math.max(t0, u0);
    t1 = Math.min(t1, u1);
    return t0 <= t1;
  };

  if (!clipSlab(ox, dx, minX, maxX)) return maxLen;
  if (!clipSlab(oy, dy, minY, maxY)) return maxLen;
  if (t1 < 0) return maxLen;
  if (t0 >= 0 && t0 <= maxLen) return Math.max(0, t0 - Math.min(6, maxLen * 0.008));
  return maxLen;
}

function resolveCrateCollisionOnce(
  p: Projectile,
  crates: Crate[],
  onHit: (crate: Crate, speed: number) => void,
): boolean {
  if (p.dead) return false;
  for (const c of crates) {
    if (!c.alive) continue;
    const cx = c.x + c.w * 0.5;
    const cy = c.y + c.h * 0.5;
    const rx = c.w * 0.5 + p.r;
    const ry = c.h * 0.5 + p.r;
    const dx = p.x - cx;
    const dy = p.y - cy;
    if (Math.abs(dx) >= rx || Math.abs(dy) >= ry) continue;
    const speed = Math.hypot(p.vx, p.vy);
    const rest = 0.52;
    const minEsc = 130;
    if (Math.abs(dx / rx) > Math.abs(dy / ry)) {
      p.x = cx + Math.sign(dx || 1) * rx;
      p.vx *= -rest;
      if (Math.abs(p.vx) < minEsc) p.vx = Math.sign(dx || 1) * minEsc;
    } else {
      p.y = cy + Math.sign(dy || 1) * ry;
      p.vy *= -rest;
      if (Math.abs(p.vy) < minEsc) p.vy = Math.sign(dy || 1) * minEsc;
    }
    onHit(c, speed);
    return true;
  }
  return false;
}

export function stepProjectiles(
  dt: number,
  projectiles: Projectile[],
  ground: GroundSeg[],
  crates: Crate[],
  W: number,
  H: number,
  onCrateHit: (proj: Projectile, crate: Crate, speed: number) => void,
  slingClear?: SlingGroundClear,
): void {
  const g = gravityForWorld(H);
  const SUB = 5;
  for (const p of projectiles) {
    if (p.dead) continue;
    const sdt = dt / SUB;
    for (let s = 0; s < SUB; s++) {
      if (p.dead) break;
      p.vy += g * sdt;
      if (p.guideDir && p.airborne) {
        const gx = p.guideDir.x;
        const gy = p.guideDir.y;
        const thrust = g * 0.58;
        p.vx += gx * thrust * sdt;
        p.vy += gy * thrust * sdt;
        const dot = p.vx * gx + p.vy * gy;
        const px = p.vx - gx * dot;
        const py = p.vy - gy * dot;
        const damp = 3.8;
        p.vx -= px * damp * sdt;
        p.vy -= py * damp * sdt;
      }
      p.x += p.vx * sdt;
      p.y += p.vy * sdt;
      if (p.dead) break;
      collideCircleGround(p, ground, 0.32, slingClear);
      if (p.dead) break;
      let hitPenWall = false;
      for (let kk = 0; kk < 6; kk++) {
        if (collideCirclePigPenWalls(p, W, H, 0.4)) hitPenWall = true;
      }
      if (hitPenWall) p.guideDir = undefined;
      if (p.dead) break;
      for (let k = 0; k < 14; k++) {
        if (p.dead) break;
        const hit = resolveCrateCollisionOnce(p, crates, (crate, speed) => onCrateHit(p, crate, speed));
        if (!hit) break;
      }
    }
    if (p.dead) continue;
    const spd = Math.hypot(p.vx, p.vy);
    // Eskiden yalnızca zemindeyken dolduğu için havada neredeyse duran "zombi" kuşlar
    // sapan üstünde birikiyordu; yavaş hızda her durumda biriktir + üst süre.
    if (spd < 105) {
      p.settled += dt;
    } else if (spd > 135) {
      p.settled = 0;
    }
    p.age = (p.age ?? 0) + dt;
    if (p.age > 14) p.settled = 999;
    if (p.x < -200 || p.x > W + 200 || p.y > H + 200) {
      p.settled = 999;
    }
  }
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i]!;
    if (p.dead || p.settled > 0.55) projectiles.splice(i, 1);
  }
}
