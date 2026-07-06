/**
 * Sütun profilleri — React dışında DOM + fizik (takılma önleme).
 */

function randomInColumn(size) {
  const margin = size === 'large' ? 18 : 10;
  return {
    x: margin + Math.random() * (100 - 2 * margin),
    y: margin + Math.random() * (100 - 2 * margin),
  };
}

function randomVelocity(size) {
  const base = size === 'large' ? 31 : 23;
  const spread = size === 'large' ? 25 : 20;
  const speed = base + Math.random() * spread;
  const angle = Math.random() * Math.PI * 2;
  return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
}

/**
 * @param {{
 *   getColumnEl: (index: number) => HTMLElement | null | undefined,
 *   maxPerColumn?: number,
 *   maxSpawnPerFrame?: number,
 *   onCountsChange?: (counts: number[]) => void,
 * }} opts
 */
export function createAvatarEngine(opts) {
  const maxPerColumn = opts.maxPerColumn ?? 24;
  const maxSpawnPerFrame = opts.maxSpawnPerFrame ?? 3;
  const onCountsChange = opts.onCountsChange;
  const getColumnEl = opts.getColumnEl;

  /** @type {{ id: string, size: string, x: number, y: number, vx: number, vy: number, wrap: HTMLElement }[][]} */
  const columns = Array.from({ length: 5 }, () => []);
  const spawnQueue = [];
  let idSeq = 0;
  let raf = 0;
  let lastTick = 0;
  let countsDirty = false;
  let lastCountsEmit = 0;
  let reducedMotion = false;

  try {
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    /* ignore */
  }

  function columnCounts() {
    return columns.map((c) => c.length);
  }

  function markCountsDirty() {
    countsDirty = true;
  }

  function emitCounts(now) {
    if (!countsDirty || !onCountsChange) return;
    if (now - lastCountsEmit < 200) return;
    lastCountsEmit = now;
    countsDirty = false;
    onCountsChange(columnCounts());
  }

  function createAvatarNode(url, size) {
    const wrap = document.createElement('div');
    wrap.className = `avatar-wrap${size === 'large' ? ' avatar-wrap--large' : ''}`;

    const entry = document.createElement('div');
    entry.className = 'avatar-entry';
    if (reducedMotion) entry.style.animation = 'none';

    const disk = document.createElement('div');
    disk.className = `avatar-disk avatar-${size === 'large' ? 'large' : 'small'}`;

    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.loading = 'lazy';

    disk.appendChild(img);
    entry.appendChild(disk);
    wrap.appendChild(entry);
    return wrap;
  }

  function trimColumn(colIdx) {
    const col = columns[colIdx];
    while (col.length > maxPerColumn) {
      const removed = col.shift();
      removed?.wrap?.remove();
    }
  }

  function spawnOne(colIdx, url, size) {
    const host = getColumnEl(colIdx);
    if (!host || !url) return false;

    idSeq += 1;
    const pos = randomInColumn(size);
    const vel = randomVelocity(size);
    const wrap = createAvatarNode(url, size);
    wrap.style.left = `${pos.x}%`;
    wrap.style.top = `${pos.y}%`;

    const rec = {
      id: `a-${idSeq}`,
      size,
      x: pos.x,
      y: pos.y,
      vx: vel.vx,
      vy: vel.vy,
      wrap,
    };

    columns[colIdx].push(rec);
    host.appendChild(wrap);
    trimColumn(colIdx);
    markCountsDirty();
    return true;
  }

  function processSpawnQueue(budget) {
    let left = budget;
    while (left > 0 && spawnQueue.length > 0) {
      const job = spawnQueue[0];
      if (spawnOne(job.columnIndex, job.profileUrl, job.size)) {
        left -= 1;
        job.remaining -= 1;
      } else {
        job.remaining = 0;
      }
      if (job.remaining <= 0) spawnQueue.shift();
    }
  }

  function tickPhysics(dt) {
    const DAMP = 0.988;
    for (let ci = 0; ci < columns.length; ci++) {
      for (const a of columns[ci]) {
        const margin = a.size === 'large' ? 18 : 10;
        let { vx, vy } = a;
        let x = a.x + vx * dt;
        let y = a.y + vy * dt;
        if (x <= margin) {
          x = margin;
          vx = Math.abs(vx) * DAMP;
        } else if (x >= 100 - margin) {
          x = 100 - margin;
          vx = -Math.abs(vx) * DAMP;
        }
        if (y <= margin) {
          y = margin;
          vy = Math.abs(vy) * DAMP;
        } else if (y >= 100 - margin) {
          y = 100 - margin;
          vy = -Math.abs(vy) * DAMP;
        }
        a.x = x;
        a.y = y;
        a.vx = vx;
        a.vy = vy;
        a.wrap.style.left = `${x}%`;
        a.wrap.style.top = `${y}%`;
      }
    }
  }

  function totalAvatars() {
    let n = 0;
    for (const c of columns) n += c.length;
    return n;
  }

  function loop(now) {
    raf = 0;
    if (document.hidden) {
      lastTick = now;
      schedule();
      return;
    }

    const dt = Math.min(1 / 45, Math.max(0.001, (now - lastTick) / 1000));
    lastTick = now;

    if (spawnQueue.length > 0) {
      processSpawnQueue(maxSpawnPerFrame);
    }

    if (totalAvatars() > 0) {
      tickPhysics(dt);
    }

    emitCounts(now);

    if (spawnQueue.length > 0 || totalAvatars() > 0) {
      schedule();
    }
  }

  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(loop);
  }

  return {
    /** @param {number} columnIndex @param {string} profileUrl @param {'small'|'large'|string} size @param {number} count */
    queue(columnIndex, profileUrl, size, count) {
      if (!profileUrl || columnIndex < 0 || columnIndex > 4 || !count || count <= 0) return;
      spawnQueue.push({
        columnIndex,
        profileUrl,
        size: size === 'large' ? 'large' : 'small',
        remaining: Math.min(40, Math.floor(count)),
      });
      schedule();
    },

    clearAll() {
      spawnQueue.length = 0;
      for (let ci = 0; ci < columns.length; ci++) {
        for (const a of columns[ci]) a.wrap.remove();
        columns[ci].length = 0;
      }
      markCountsDirty();
      emitCounts(performance.now());
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },

    destroy() {
      this.clearAll();
    },

    getCounts: columnCounts,
  };
}
