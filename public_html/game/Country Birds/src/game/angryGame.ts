import { BACKGROUND_URLS, BIRD_URLS, PIG_URL, publicUrl, TEAM_COUNT } from "./assets";
import { getLevelSpec, PIG_PEN_NORM } from "./levelSpec";
import type { LevelSpec } from "./levelSpec";
import { normToWorld, stepCrates, stepProjectiles, clipRayToPigPenAabb, type Crate, type GroundSeg, type Projectile, type SlingGroundClear } from "./sim";
import { DEFAULT_TEAM_GIFT_IDS, teamFromGiftAssignment } from "./teamFromGift";

export type AngryGameOptions = {
  onScore?: (teamId: number, delta: number, reason: string) => void;
};

type PendingGift = { teamId: number; tokens: number; giftName?: string };

type SlingGeom = {
  L: { x: number; y: number };
  R: { x: number; y: number };
  base: { x: number; y: number };
  anchor: { x: number; y: number };
  m: number;
  postW: number;
  postH: number;
  maxPull: number;
  sag: number;
  cL: { x: number; y: number };
  cR: { x: number; y: number };
};

function pathRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

type ExplosionFx = { x: number; y: number; born: number; rot: number };

export class AngryGame {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private bgIndex = 1;
  private bgImage = new Image();
  private birdImages: HTMLImageElement[] = [];
  private pigImage = new Image();
  private loaded = false;
  private raf = 0;
  private last = 0;
  private spec: LevelSpec = getLevelSpec(1);
  private ground: GroundSeg[] = [];
  private crates: Crate[] = [];
  private sling = { x: 0, y: 0 };
  private slingRest = { x: 0, y: 0 };
  private posts = { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } };
  private projectiles: Projectile[] = [];
  private scores: number[] = Array.from({ length: TEAM_COUNT }, () => 0);
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;
  private imgW = 1920;
  private imgH = 1080;
  private pending: PendingGift[] = [];
  private giftCooldown = 0;
  /** Her takım sütununa atanmış TikTok hediye id (ayarlardan) */
  private teamGiftIds: number[] = [...DEFAULT_TEAM_GIFT_IDS];
  private drag = false;
  private dragCur = { x: 0, y: 0 };
  /** false iken sürükle-bırak sapan devre dışı (hediye / test atışı ayrı yollar) */
  private manualSlingEnabled = true;
  private slingPointerId: number | null = null;
  /** Manuel sapan / önizleme takımı (kuyruk boşken); kuyrukta sıradaki hediye takımı öncelikli */
  manualTeamId = 0;

  /** En yüksek puanlı takım (beraberlikte düşük indeks). */
  private getLeadingTeamId(): number {
    let best = 0;
    for (let i = 1; i < TEAM_COUNT; i++) {
      if (this.scores[i]! > this.scores[best]!) best = i;
    }
    return best;
  }

  /** Sapan kuşu: sıradaki hediye varsa onun takımı, yoksa lider takım. */
  private getSlingBirdTeamId(): number {
    const next = this.pending[0];
    if (next != null) return Math.max(0, Math.min(TEAM_COUNT - 1, next.teamId));
    return this.getLeadingTeamId();
  }
  private resizeObserver: ResizeObserver | null = null;
  /** Bırakınca lastiğin dinlenme noktasına geri sıçraması */
  private slingSnap: { from: { x: number; y: number }; start: number } | null = null;
  private shotSound: HTMLAudioElement | null = null;
  private bombSound: HTMLAudioElement | null = null;
  /** Kutu+kuş patlaması çizimi */
  private explosions: ExplosionFx[] = [];
  /** Hediye taraması: ışın yönü (sin) */
  private scanTime = 0;
  private readonly opts: AngryGameOptions;
  private destroyed = false;

  constructor(
    parent: HTMLElement,
    opts: AngryGameOptions = {},
  ) {
    this.opts = opts;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "angry-canvas";
    /** Canvas önce: HUD (game-mount içi) üstte kalsın */
    parent.prepend(this.canvas);
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("2d context yok");
    this.ctx = ctx;
  }

  getScores(): readonly number[] {
    return this.scores;
  }

  isReady(): boolean {
    return this.loaded;
  }

  setManualSlingEnabled(enabled: boolean): void {
    this.manualSlingEnabled = enabled;
    if (!enabled) {
      this.drag = false;
      if (this.slingPointerId != null) {
        try {
          this.canvas.releasePointerCapture(this.slingPointerId);
        } catch {
          /* ignore */
        }
        this.slingPointerId = null;
      }
    }
  }

  getBackgroundIndex(): number {
    return this.bgIndex;
  }

  getTeamGiftIds(): readonly number[] {
    return this.teamGiftIds;
  }

  /** Yalnızca katalogda bilinen hediye id’leri kabul edilir */
  setTeamGiftIds(ids: readonly number[]): void {
    this.teamGiftIds = Array.from({ length: TEAM_COUNT }, (_, i) => {
      const raw = ids[i];
      const id = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : DEFAULT_TEAM_GIFT_IDS[i]!;
      if (id > 0) return id;
      return DEFAULT_TEAM_GIFT_IDS[i]!;
    });
  }

  /** Takım kuş dokuları (URL veya data URL); yüklenemezse varsayılan PNG kullanılır */
  async setTeamBirdUrls(resolved: readonly string[]): Promise<void> {
    const fallback = [...BIRD_URLS];
    const urls = Array.from({ length: TEAM_COUNT }, (_, i) => resolved[i] ?? fallback[i]!);
    const loadOne = (url: string, fb: string) =>
      new Promise<HTMLImageElement>((res) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = () => {
          const b = new Image();
          b.onload = () => res(b);
          b.onerror = () => res(b);
          b.src = fb;
        };
        im.src = url;
      });
    const imgs = await Promise.all(urls.map((u, i) => loadOne(u, fallback[i]!)));
    if (this.destroyed) return;
    this.birdImages = imgs;
  }

  setBackgroundIndex(n: number): void {
    this.bgIndex = Math.max(1, Math.min(BACKGROUND_URLS.length, Math.floor(n)));
    this.spec = getLevelSpec(this.bgIndex);
    this.bgImage.onload = () => {
      this.imgW = this.bgImage.naturalWidth || 1920;
      this.imgH = this.bgImage.naturalHeight || 1080;
      this.rebuildWorldFromSpec();
    };
    this.bgImage.src = BACKGROUND_URLS[this.bgIndex - 1];
    if (this.bgImage.complete && this.bgImage.naturalWidth > 0) {
      this.imgW = this.bgImage.naturalWidth;
      this.imgH = this.bgImage.naturalHeight;
      this.rebuildWorldFromSpec();
    }
  }

  /** TikTok hediyesi: her jeton ayrı kuş (puan yalnızca domuz öldürünce) */
  enqueueGiftLaunch(
    giftName: string | undefined,
    diamondCount: number | undefined,
    userKey: string | undefined,
    giftId?: number,
  ): void {
    const launches = Math.max(1, Math.min(99, diamondCount ?? 1));
    const teamId = teamFromGiftAssignment(giftName, giftId, userKey, this.teamGiftIds);
    for (let i = 0; i < launches; i++) {
      this.pending.push({ teamId, tokens: 1, giftName });
    }
  }

  /** Yerel test atışı (seçili takım) */
  testLaunch(teamId: number): void {
    const t = Math.max(0, Math.min(TEAM_COUNT - 1, teamId));
    this.pending.push({ teamId: t, tokens: 1, giftName: "Test" });
  }

  private addScore(teamId: number, delta: number, reason: string): void {
    this.scores[teamId] += delta;
    this.opts.onScore?.(teamId, delta, reason);
  }

  async init(): Promise<void> {
    const loadBird = (url: string): Promise<HTMLImageElement> =>
      new Promise((res) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = () => res(im);
        im.src = url;
      });

    const results = await Promise.all([
      new Promise<void>((res, rej) => {
        this.bgImage.onload = () => res();
        this.bgImage.onerror = () => rej(new Error("Arka plan yüklenemedi"));
        this.bgImage.src = BACKGROUND_URLS[this.bgIndex - 1];
      }),
      ...BIRD_URLS.map((url) => loadBird(url)),
      new Promise<void>((res) => {
        this.pigImage.onload = () => res();
        this.pigImage.onerror = () => res();
        this.pigImage.src = PIG_URL;
      }),
    ]);
    this.birdImages = results.slice(1, 1 + BIRD_URLS.length) as HTMLImageElement[];
    if (this.destroyed) return;
    this.imgW = this.bgImage.naturalWidth || 1920;
    this.imgH = this.bgImage.naturalHeight || 1080;
    this.rebuildWorldFromSpec();
    this.loaded = true;
    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas.parentElement ?? this.canvas);
    this.last = performance.now();
    const loop = (t: number) => {
      if (this.destroyed) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.033, Math.max(0, (t - this.last) / 1000));
      this.last = t;
      this.step(dt);
      this.draw();
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    try {
      this.shotSound?.pause();
      this.bombSound?.pause();
    } catch {
      /* ignore */
    }
    this.shotSound = null;
    this.bombSound = null;
    this.canvas.remove();
  }

  private rebuildWorldFromSpec(): void {
    this.imgW = this.bgImage.naturalWidth || 1920;
    this.imgH = this.bgImage.naturalHeight || 1080;
    const w = this.layoutWorld().w;
    const h = this.layoutWorld().h;
    const world = normToWorld(this.spec, w, h);
    this.ground = world.ground;
    this.crates = world.crates;
    this.sling = world.sling;
    this.slingRest = world.slingRest;
    this.posts = world.posts;
  }

  /** Dünya boyutu = arka plan pikseli (contain ölçeği dışında) */
  private layoutWorld(): { w: number; h: number } {
    return { w: this.imgW, h: this.imgH };
  }

  private resize(): void {
    const p = this.canvas.parentElement;
    if (!p) return;
    const r = p.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(320, Math.floor(r.width * dpr));
    this.canvas.height = Math.max(240, Math.floor(r.height * dpr));
    this.canvas.style.width = `${r.width}px`;
    this.canvas.style.height = `${r.height}px`;
    this.syncOverlayLayout();
  }

  /** Letterbox içindeki gerçek oyun alanına göre HUD konumu (CSS değişkenleri). */
  private syncOverlayLayout(): void {
    const mount = this.canvas.parentElement;
    if (!mount) return;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    if (cw <= 0 || ch <= 0) return;
    const cssW = this.canvas.clientWidth || mount.clientWidth;
    const cssH = this.canvas.clientHeight || mount.clientHeight;
    const px = cssW / cw;
    const py = cssH / ch;
    if (!this.loaded) {
      mount.style.setProperty("--game-inset-left", "0px");
      mount.style.setProperty("--game-inset-top", "0px");
      mount.style.setProperty("--game-content-w", `${cssW}px`);
      mount.style.setProperty("--game-content-h", `${cssH}px`);
      return;
    }
    const gameCssW = this.imgW * this.scale * px;
    const gameCssH = this.imgH * this.scale * py;
    mount.style.setProperty("--game-inset-left", `${this.offsetX * px}px`);
    mount.style.setProperty("--game-inset-top", `${this.offsetY * py}px`);
    mount.style.setProperty("--game-content-w", `${gameCssW}px`);
    mount.style.setProperty("--game-content-h", `${gameCssH}px`);
  }

  /** Sapan bölgesinde zemin çarpışması yok (kuş geçişi) */
  private getSlingGroundClear(w: number, h: number): SlingGroundClear {
    const L = this.posts.left;
    const R = this.posts.right;
    const m = Math.min(w, h);
    return {
      cx: (L.x + R.x) * 0.5,
      cy: (L.y + R.y + this.slingRest.y + this.sling.y) * 0.28,
      r: m * 0.2,
    };
  }

  private screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const cx = ((sx - r.left) / r.width) * this.canvas.width;
    const cy = ((sy - r.top) / r.height) * this.canvas.height;
    return {
      x: (cx - this.offsetX) / this.scale,
      y: (cy - this.offsetY) / this.scale,
    };
  }

  private step(dt: number): void {
    if (!this.loaded) return;
    if (this.slingSnap && performance.now() - this.slingSnap.start >= 240) {
      this.slingSnap = null;
    }
    this.scanTime += dt * 0.88;
    const { w, h } = this.layoutWorld();
    this.giftCooldown = Math.max(0, this.giftCooldown - dt);
    if (this.projectiles.length < TEAM_COUNT && this.pending.length > 0 && this.giftCooldown <= 0) {
      const job = this.pending.shift()!;
      this.spawnProjectile(job.teamId, job.tokens);
      this.giftCooldown = 0.12;
    }
    stepCrates(dt, this.crates, this.ground, w, h);
    stepProjectiles(
      dt,
      this.projectiles,
      this.ground,
      this.crates,
      w,
      h,
      (proj, crate, _speed) => {
        proj.guideDir = undefined;
        crate.hp -= 1;
        if (crate.hp <= 0 && crate.alive) {
          this.addScore(proj.teamId, 1, "Domuz öldü");
          crate.alive = false;
          crate.hp = 1;
          crate.respawnIn = 2;
          const ccx = crate.x + crate.w * 0.5;
          const ccy = crate.y + crate.h * 0.5;
          const ex = proj.x * 0.42 + ccx * 0.58;
          const ey = proj.y * 0.42 + ccy * 0.58;
          this.pushExplosion(ex, ey);
          this.playBombSound();
          proj.dead = true;
        }
      },
      this.getSlingGroundClear(w, h),
    );
    this.cullStuckNearSling(w, h);

    for (const c of this.crates) {
      if (!c.alive && c.respawnIn != null) {
        c.respawnIn -= dt;
        if (c.respawnIn <= 0) {
          c.alive = true;
          c.hp = 1;
          c.respawnIn = undefined;
          c.x = c.spawnX;
          c.y = c.spawnY;
          c.vx = 0;
          c.vy = 0;
        }
      }
    }

    const now = performance.now();
    this.explosions = this.explosions.filter((e) => now - e.born < 520);
  }

  /** Sapan dinlenme / pivot çevresinde kilitlenen mermileri listeden çıkar */
  private cullStuckNearSling(w: number, h: number): void {
    const m = Math.min(w, h);
    const zone = m * 0.22;
    const rx = this.slingRest.x;
    const ry = this.slingRest.y;
    const sx = this.sling.x;
    const sy = this.sling.y;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]!;
      const dNear = Math.min(Math.hypot(p.x - rx, p.y - ry), Math.hypot(p.x - sx, p.y - sy));
      const spd = Math.hypot(p.vx, p.vy);
      const age = p.age ?? 0;
      if (dNear < zone && age > 0.32 && spd < 460) {
        this.projectiles.splice(i, 1);
      }
    }
  }

  private spawnProjectile(teamId: number, tokens: number): void {
    const { w, h } = this.layoutWorld();
    const m = Math.min(w, h);
    const sprite = this.birdImages[teamId % this.birdImages.length];
    const r = m * 0.048;
    const dir = this.getScanDir();
    const sp = 1780 + Math.min(560, tokens * 58);
    const nudge = Math.max(r * 2.5, m * 0.024);
    const x0 = this.slingRest.x + dir.x * nudge;
    const y0 = this.slingRest.y + dir.y * nudge;
    this.projectiles.push({
      x: x0,
      y: y0,
      vx: dir.x * sp,
      vy: dir.y * sp,
      r,
      teamId,
      sprite,
      airborne: true,
      settled: 0,
      guideDir: { x: dir.x, y: dir.y },
      tokenCount: Math.max(1, tokens),
    });
    this.playShotSound();
  }

  private draw(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.loaded) {
      ctx.fillStyle = "#111826";
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.restore();
      this.syncOverlayLayout();
      return;
    }
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const iw = this.imgW;
    const ih = this.imgH;
    this.scale = Math.min(cw / iw, ch / ih);
    this.offsetX = (cw - iw * this.scale) * 0.5;
    this.offsetY = (ch - ih * this.scale) * 0.5;
    this.syncOverlayLayout();
    ctx.setTransform(this.scale, 0, 0, this.scale, this.offsetX, this.offsetY);
    ctx.drawImage(this.bgImage, 0, 0, iw, ih);
    this.drawScanBeam(ctx);
    const slingG = this.computeSlingGeometry();
    this.drawSlingUnderBirds(ctx, slingG);
    this.drawCrates(ctx);
    this.drawPigPenFrame(ctx);
    this.drawExplosions(ctx);
    for (const p of this.projectiles) this.drawBird(ctx, p);
    this.drawSlingOverBirds(ctx, slingG);
    this.drawSlingPreviewBird(ctx, slingG);
    ctx.restore();
  }

  /** Yukarı–aşağı tarayan nişangah: sağa–sola salınım (ek 2 atım = 3× faz hızı). */
  private getScanAngle(): number {
    const lo = -0.9;
    const hi = 0.06;
    const swingMult = 3;
    const t = (Math.sin(this.scanTime * 0.95 * swingMult) + 1) * 0.5;
    return lo + (hi - lo) * t;
  }

  private getScanDir(): { x: number; y: number } {
    const a = this.getScanAngle();
    return { x: Math.cos(a), y: Math.sin(a) };
  }

  private drawScanBeam(ctx: CanvasRenderingContext2D): void {
    const w = this.imgW;
    const h = this.imgH;
    const m = Math.min(w, h);
    const x0 = this.slingRest.x;
    const y0 = this.slingRest.y;
    const d = this.getScanDir();
    const baseLen = m * 0.9;
    const len = clipRayToPigPenAabb(x0, y0, d.x, d.y, baseLen, w, h);
    const x1 = x0 + d.x * len;
    const y1 = y0 + d.y * len;
    const pulse = 0.82 + 0.18 * Math.sin(this.scanTime * 2.45);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.shadowBlur = 26 * pulse;
    ctx.shadowColor = "rgba(120, 220, 255, 0.75)";
    ctx.strokeStyle = `rgba(160, 235, 255, ${0.52 * pulse})`;
    ctx.lineWidth = Math.max(6, m * 0.014);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.shadowBlur = 12;
    ctx.strokeStyle = `rgba(100, 200, 255, ${0.38 * pulse})`;
    ctx.lineWidth = Math.max(3.5, m * 0.008);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.78 * pulse})`;
    ctx.lineWidth = Math.max(2, m * 0.0042);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.restore();
  }

  private getSlingVisualAnchor(): { x: number; y: number } {
    if (this.drag) return { x: this.dragCur.x, y: this.dragCur.y };
    if (this.slingSnap) {
      const t = Math.min(1, (performance.now() - this.slingSnap.start) / 215);
      const e = 1 - Math.pow(1 - t, 3);
      const f = this.slingSnap.from;
      return {
        x: f.x + (this.slingRest.x - f.x) * e,
        y: f.y + (this.slingRest.y - f.y) * e,
      };
    }
    const m = Math.min(this.imgW, this.imgH);
    const d = this.getScanDir();
    const pull = m * 0.09;
    return { x: this.slingRest.x - d.x * pull, y: this.slingRest.y - d.y * pull };
  }

  private ensureShotSound(): HTMLAudioElement {
    if (!this.shotSound) {
      this.shotSound = new Audio(publicUrl("shot.mp3"));
      this.shotSound.preload = "auto";
    }
    return this.shotSound;
  }

  private playShotSound(): void {
    if (this.destroyed) return;
    try {
      const a = this.ensureShotSound();
      a.currentTime = 0;
      void a.play();
    } catch {
      /* otomatik oynatma engeli vb. */
    }
  }

  private ensureBombSound(): HTMLAudioElement {
    if (!this.bombSound) {
      this.bombSound = new Audio(publicUrl("bomb.mp3"));
      this.bombSound.preload = "auto";
    }
    return this.bombSound;
  }

  /** Üst üste patlamalar için klon */
  private playBombSound(): void {
    if (this.destroyed) return;
    try {
      const base = this.ensureBombSound();
      const a = base.cloneNode(true) as HTMLAudioElement;
      a.volume = base.volume;
      void a.play();
    } catch {
      /* otomatik oynatma engeli vb. */
    }
  }

  private computeSlingGeometry(): SlingGeom {
    const L = this.posts.left;
    const R = this.posts.right;
    const base = this.sling;
    const anchor = this.getSlingVisualAnchor();
    const m = Math.min(this.imgW, this.imgH);
    const postW = m * 0.019;
    const postH = m * 0.114;
    const maxPull = m * 0.16;
    let sag = m * 0.068;
    if (this.drag) {
      const d = Math.hypot(this.dragCur.x - this.sling.x, this.dragCur.y - this.sling.y);
      const pull = Math.min(1, d / maxPull);
      sag *= 1 + pull * 0.78;
    } else if (this.slingSnap) {
      const t = Math.min(1, (performance.now() - this.slingSnap.start) / 215);
      sag *= 1 + (1 - t) * 0.66;
    } else {
      const d = Math.hypot(anchor.x - this.sling.x, anchor.y - this.sling.y);
      const pull = Math.min(1, d / maxPull);
      sag *= 1 + pull * 0.62;
    }
    const bendControl = (ax: number, ay: number, bx: number, by: number): { x: number; y: number } => {
      const mx = (ax + bx) * 0.5;
      const my = (ay + by) * 0.5;
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      const px = -dy / len;
      const py = dx / len;
      const extra = sag * 0.36;
      return { x: mx + px * sag * 0.82, y: my + py * sag * 0.82 + extra };
    };
    const cL = bendControl(L.x, L.y, anchor.x, anchor.y);
    const cR = bendControl(R.x, R.y, anchor.x, anchor.y);
    return { L, R, base, anchor, m, postW, postH, maxPull, sag, cL, cR };
  }

  /** Direkler + koyu lastik + kese: uçan kuşların altında */
  private drawSlingUnderBirds(ctx: CanvasRenderingContext2D, g: SlingGeom): void {
    const { L, R, base, anchor, m, postW, postH, cL, cR } = g;
    ctx.save();
    const grd = ctx.createRadialGradient(base.x, base.y + postH * 0.52, 0, base.x, base.y + postH * 0.52, m * 0.1);
    grd.addColorStop(0, "rgba(0,0,0,0.42)");
    grd.addColorStop(0.55, "rgba(0,0,0,0.14)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.ellipse(base.x, base.y + postH * 0.52, m * 0.095, m * 0.032, 0, 0, Math.PI * 2);
    ctx.fill();

    const strokeRubber = (width: number, color: string, alpha: number) => {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(L.x, L.y);
      ctx.quadraticCurveTo(cL.x, cL.y, anchor.x, anchor.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(R.x, R.y);
      ctx.quadraticCurveTo(cR.x, cR.y, anchor.x, anchor.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    };
    strokeRubber(m * 0.013, "#0d0603", 1);
    strokeRubber(m * 0.0085, "#24160e", 1);
    strokeRubber(m * 0.0056, "#3d2618", 1);

    const pouchRx = m * 0.024;
    const pouchRy = m * 0.013;
    ctx.fillStyle = "#2f1f14";
    ctx.beginPath();
    ctx.ellipse(anchor.x, anchor.y + pouchRy * 0.35, pouchRx * 1.35, pouchRy * 1.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#140a06";
    ctx.lineWidth = m * 0.002;
    ctx.stroke();
    ctx.fillStyle = "rgba(90,60,40,0.45)";
    ctx.beginPath();
    ctx.ellipse(anchor.x - pouchRx * 0.25, anchor.y + pouchRy * 0.1, pouchRx * 0.55, pouchRy * 0.45, -0.35, 0, Math.PI * 2);
    ctx.fill();

    const drawWoodPost = (Px: number, Py: number, ang: number) => {
      ctx.save();
      ctx.translate(Px, Py);
      ctx.rotate(ang);
      const lg = ctx.createLinearGradient(-postW, 0, postW, 0);
      lg.addColorStop(0, "#2a1810");
      lg.addColorStop(0.28, "#6e4832");
      lg.addColorStop(0.55, "#5a3a26");
      lg.addColorStop(0.78, "#4a301f");
      lg.addColorStop(1, "#24160d");
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.moveTo(-postW * 0.4, 0);
      ctx.lineTo(postW * 0.4, 0);
      ctx.lineTo(postW * 0.52, postH);
      ctx.lineTo(-postW * 0.52, postH);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = m * 0.0016;
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,230,200,0.22)";
      ctx.lineWidth = m * 0.0011;
      ctx.beginPath();
      ctx.moveTo(-postW * 0.18, postH * 0.06);
      ctx.lineTo(-postW * 0.12, postH * 0.88);
      ctx.stroke();
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath();
      ctx.moveTo(postW * 0.2, postH * 0.1);
      ctx.lineTo(postW * 0.26, postH * 0.82);
      ctx.stroke();
      ctx.restore();
    };
    drawWoodPost(L.x, L.y, -0.12);
    drawWoodPost(R.x, R.y, 0.12);

    const wrapR = m * 0.0085;
    for (const P of [L, R]) {
      ctx.beginPath();
      ctx.strokeStyle = "#1a0f08";
      ctx.lineWidth = m * 0.0065;
      ctx.arc(P.x, P.y + wrapR * 0.35, wrapR * 1.15, 0.15, Math.PI * 1.85);
      ctx.stroke();
      ctx.beginPath();
      ctx.strokeStyle = "#4a3220";
      ctx.lineWidth = m * 0.0032;
      ctx.arc(P.x, P.y + wrapR * 0.35, wrapR * 1.15, 0.15, Math.PI * 1.85);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Açık lastik + klips: uçan kuşların üstünde (içinden geçiş görünümü) */
  private drawSlingOverBirds(ctx: CanvasRenderingContext2D, g: SlingGeom): void {
    const { L, R, anchor, m, cL, cR } = g;
    ctx.save();
    const strokeRubber = (width: number, color: string, alpha: number) => {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(L.x, L.y);
      ctx.quadraticCurveTo(cL.x, cL.y, anchor.x, anchor.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(R.x, R.y);
      ctx.quadraticCurveTo(cR.x, cR.y, anchor.x, anchor.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    };
    strokeRubber(m * 0.0032, "rgba(215,175,130,0.62)", 1);

    const clipR = m * 0.0068;
    const cg = ctx.createLinearGradient(anchor.x - clipR * 2, anchor.y, anchor.x + clipR * 2, anchor.y);
    cg.addColorStop(0, "#4a4038");
    cg.addColorStop(0.5, "#8a7a6e");
    cg.addColorStop(1, "#3a322c");
    ctx.fillStyle = cg;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(anchor.x + side * clipR * 2.1, anchor.y + clipR * 0.15, clipR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#1f1814";
      ctx.lineWidth = m * 0.0014;
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawSlingPreviewBird(ctx: CanvasRenderingContext2D, g: SlingGeom): void {
    const { anchor, maxPull } = g;
    if (!this.drag && this.slingSnap) return;
    const tid = Math.max(0, Math.min(TEAM_COUNT - 1, this.getSlingBirdTeamId()));
    const preview = this.birdImages[tid % this.birdImages.length];
    if (!preview.complete) return;
    const pull = Math.min(1, Math.hypot(anchor.x - this.sling.x, anchor.y - this.sling.y) / maxPull);
    const squash = 1 + pull * 0.14;
    const stretch = 1 - pull * 0.095;
    const br = Math.min(this.imgW, this.imgH) * 0.048;
    ctx.save();
    ctx.translate(anchor.x, anchor.y);
    ctx.scale(squash, stretch);
    this.drawBirdAt(ctx, 0, 0, br, preview, this.drag ? 1 : 0.88);
    ctx.restore();
  }

  /**
   * Domuz alanı: sol kenar çizilmez (açık giriş); üst + sağ + alt çerçeve.
   * Fizik `stepCrates` ile aynı `PIG_PEN_NORM` kutusu.
   */
  private drawPigPenFrame(ctx: CanvasRenderingContext2D): void {
    const p = PIG_PEN_NORM;
    const x = p.nx * this.imgW;
    const y = p.ny * this.imgH;
    const w = p.nw * this.imgW;
    const h = p.nh * this.imgH;
    const m = Math.min(this.imgW, this.imgH);
    const lip = w * 0.04;
    ctx.save();
    ctx.fillStyle = "rgba(255, 215, 70, 0.065)";
    ctx.fillRect(x + lip, y, w - lip, h);
    const strokeU = (lineW: number, color: string, inset: number) => {
      const ix = x + inset;
      const iy = y + inset;
      const iw = w - inset * 2;
      const ih = h - inset * 2;
      ctx.strokeStyle = color;
      ctx.lineWidth = lineW;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(ix, iy + ih);
      ctx.lineTo(ix + iw, iy + ih);
      ctx.lineTo(ix + iw, iy);
      ctx.lineTo(ix, iy);
      ctx.stroke();
    };
    strokeU(m * 0.01, "rgba(235, 190, 45, 0.82)", 0);
    strokeU(m * 0.0045, "rgba(55, 40, 12, 0.42)", m * 0.005);
    ctx.restore();
  }

  private drawCrates(ctx: CanvasRenderingContext2D): void {
    const alive = this.crates.filter((c) => c.alive);
    for (const c of alive) {
      const drop = Math.min(c.w, c.h) * 0.035;
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.beginPath();
      ctx.ellipse(c.x + c.w * 0.5, c.y + c.h + drop * 0.35, c.w * 0.48, c.h * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const c of alive) {
      this.drawOnePig(ctx, c);
    }
  }

  private drawOnePig(ctx: CanvasRenderingContext2D, c: Crate): void {
    const { x, y, w, h } = c;
    const im = this.pigImage;
    const ok = im.complete && im.naturalWidth > 0;
    if (ok) {
      const iw = im.naturalWidth;
      const ih = im.naturalHeight;
      const pad = 0.04;
      const scale = Math.min((w * (1 - pad)) / iw, (h * (1 - pad)) / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      const dx = x + (w - dw) * 0.5;
      const dy = y + (h - dh) * 0.5;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = Math.min(w, h) * 0.12;
      ctx.shadowOffsetY = h * 0.04;
      ctx.drawImage(im, dx, dy, dw, dh);
      ctx.restore();
    } else {
      const rad = Math.min(w, h) * 0.12;
      ctx.fillStyle = "#7cba6a";
      pathRoundedRect(ctx, x + w * 0.06, y + h * 0.08, w * 0.88, h * 0.84, rad);
      ctx.fill();
      ctx.strokeStyle = "rgba(25,60,20,0.55)";
      ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.04);
      pathRoundedRect(ctx, x + w * 0.06, y + h * 0.08, w * 0.88, h * 0.84, rad);
      ctx.stroke();
    }
  }

  private pushExplosion(x: number, y: number): void {
    this.explosions.push({
      x,
      y,
      born: performance.now(),
      rot: Math.random() * Math.PI * 2,
    });
  }

  private drawExplosions(ctx: CanvasRenderingContext2D): void {
    const now = performance.now();
    const m = Math.min(this.imgW, this.imgH);
    for (const e of this.explosions) {
      const t = (now - e.born) / 520;
      if (t >= 1) continue;
      const alpha = 1 - t;
      ctx.save();
      ctx.globalAlpha = Math.min(1, alpha * 1.15);
      const R = m * 0.108 * (0.25 + t * 1.55);
      const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, R);
      g.addColorStop(0, `rgba(255,252,230,${0.95 * alpha})`);
      g.addColorStop(0.22, `rgba(255,200,80,${0.75 * alpha})`);
      g.addColorStop(0.45, `rgba(255,90,30,${0.55 * alpha})`);
      g.addColorStop(0.72, `rgba(160,30,8,${0.22 * alpha})`);
      g.addColorStop(1, "rgba(40,10,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(e.x, e.y, R, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = alpha * 0.9;
      ctx.strokeStyle = `rgba(255,220,140,${0.7 * alpha})`;
      ctx.lineWidth = m * 0.007 * (1 - t * 0.35);
      ctx.beginPath();
      ctx.arc(e.x, e.y, R * 0.68, e.rot + t * 1.2, e.rot + t * 1.2 + Math.PI * 1.75);
      ctx.stroke();

      const nSparks = 14;
      for (let i = 0; i < nSparks; i++) {
        const ang = e.rot + (i / nSparks) * Math.PI * 2 + t * 2.1;
        const len = m * 0.14 * t * (0.55 + (i % 4) * 0.12);
        const wob = Math.sin(i * 2.3 + t * 8) * m * 0.012 * t;
        const x1 = e.x + Math.cos(ang) * len + Math.cos(ang + 1.57) * wob;
        const y1 = e.y + Math.sin(ang) * len + Math.sin(ang + 1.57) * wob;
        ctx.strokeStyle = i % 3 === 0 ? `rgba(255,240,200,${alpha})` : `rgba(255,140,60,${alpha * 0.85})`;
        ctx.lineWidth = m * 0.0038 * (1 - t * 0.6);
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }

      ctx.globalAlpha = alpha * 0.35;
      ctx.fillStyle = `rgba(255,200,120,${alpha})`;
      for (let j = 0; j < 8; j++) {
        const a2 = e.rot * 0.5 + j * 0.78 + t * 3;
        const rr = m * 0.018 * (1 - t) * (0.6 + (j % 3) * 0.25);
        ctx.beginPath();
        ctx.arc(e.x + Math.cos(a2) * R * 0.35, e.y + Math.sin(a2) * R * 0.35, rr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawBird(ctx: CanvasRenderingContext2D, p: Projectile): void {
    const spd = Math.hypot(p.vx, p.vy);
    if (spd < 55) {
      this.drawBirdAt(ctx, p.x, p.y, p.r, p.sprite, 1);
      return;
    }
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.atan2(p.vy, p.vx) * 0.16);
    this.drawBirdAt(ctx, 0, 0, p.r, p.sprite, 1);
    ctx.restore();
  }

  private drawBirdAt(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    sprite: HTMLImageElement,
    alpha: number,
  ): void {
    if (!sprite.complete) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const s = r * 2.4;
    ctx.drawImage(sprite, x - s * 0.5, y - s * 0.5, s, s);
    ctx.restore();
  }

  /** Sapan: sürükle-bırak */
  bindSlingInput(): void {
    const down = (ev: PointerEvent) => {
      if (!this.manualSlingEnabled) return;
      const { x, y } = this.screenToWorld(ev.clientX, ev.clientY);
      const dx = x - this.slingRest.x;
      const dy = y - this.slingRest.y;
      const maxPull = Math.min(this.imgW, this.imgH) * 0.16;
      if (Math.hypot(dx, dy) < maxPull * 1.25) {
        this.drag = true;
        this.slingPointerId = ev.pointerId;
        this.canvas.setPointerCapture(ev.pointerId);
      }
    };
    const move = (ev: PointerEvent) => {
      if (!this.manualSlingEnabled || !this.drag) return;
      const { x, y } = this.screenToWorld(ev.clientX, ev.clientY);
      const maxPull = Math.min(this.imgW, this.imgH) * 0.16;
      let px = x;
      let py = y;
      const vx = px - this.sling.x;
      const vy = py - this.sling.y;
      const len = Math.hypot(vx, vy) || 1;
      if (len > maxPull) {
        px = this.sling.x + (vx / len) * maxPull;
        py = this.sling.y + (vy / len) * maxPull;
      }
      this.dragCur = { x: px, y: py };
    };
    const up = (ev: PointerEvent) => {
      if (!this.drag) return;
      this.drag = false;
      this.slingPointerId = null;
      try {
        this.canvas.releasePointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
      if (!this.manualSlingEnabled) return;
      const dx = this.sling.x - this.dragCur.x;
      const dy = this.sling.y - this.dragCur.y;
      const power = Math.min(1.4, Math.hypot(dx, dy) / (Math.min(this.imgW, this.imgH) * 0.16));
      if (power < 0.08) return;
      this.slingSnap = { from: { x: this.dragCur.x, y: this.dragCur.y }, start: performance.now() };
      this.playShotSound();
      const speed = 520 + power * 700;
      const ang = Math.atan2(dy, dx);
      const teamId = Math.max(0, Math.min(TEAM_COUNT - 1, this.getSlingBirdTeamId()));
      const sprite = this.birdImages[teamId % this.birdImages.length];
      const r = Math.min(this.imgW, this.imgH) * 0.048;
      const nudge = r * 1.65;
      this.projectiles.push({
        x: this.dragCur.x + Math.cos(ang) * nudge,
        y: this.dragCur.y + Math.sin(ang) * nudge,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        r,
        teamId,
        sprite,
        airborne: true,
        settled: 0,
      });
    };
    this.canvas.addEventListener("pointerdown", down);
    this.canvas.addEventListener("pointermove", move);
    this.canvas.addEventListener("pointerup", up);
    this.canvas.addEventListener("pointercancel", up);
  }
}
