/**
 * Tüm koordinatlar arka plan görseline göre normalize (0–1).
 * Arka plan değişince `perBackground` ile ince ayar yapılabilir.
 */
export type NormPoint = { nx: number; ny: number };
export type NormRect = { nx: number; ny: number; nw: number; nh: number };
export type NormSeg = { a: NormPoint; b: NormPoint };

export type LevelSpec = {
  /** Sapan merkezi / kuş tutamaç noktası */
  sling: NormPoint;
  /** Dinlenme halinde kuşun sapana göre ofseti */
  slingRestOffset: NormPoint;
  /** Ahşap kolların uçları (görsel) */
  posts: { left: NormPoint; right: NormPoint };
  /** Zemin / yamaç çarpışma segmentleri */
  ground: NormSeg[];
  /** Hedef kutular */
  crates: NormRect[];
};

/** Sağdaki domuz alanı (çerçeve + ızgara doldurma ile aynı) */
export const PIG_PEN_NORM = { nx: 0.528, ny: 0.348, nw: 0.466, nh: 0.468 } as const;

/**
 * Domuz alanı: `PIG_PEN_NORM` kutusunu ızgara ile doldurur.
 */
function buildDefaultCrates(): NormRect[] {
  const margin = 0.006;
  const pen = PIG_PEN_NORM;
  const pad = 0.016;
  const ix = pen.nx + pad;
  const iy = pen.ny + pad;
  const innerW = pen.nw - pad * 2;
  const innerH = pen.nh - pad * 2;
  const gap = 0.0065;
  const targetN = 0.068;
  const cols = Math.max(1, Math.floor((innerW + gap) / (targetN + gap)));
  const rows = Math.max(1, Math.floor((innerH + gap) / (targetN + gap)));
  const nw = (innerW - (cols - 1) * gap) / cols;
  const nh = (innerH - (rows - 1) * gap) / rows;
  const totalW = cols * nw + (cols - 1) * gap;
  const totalH = rows * nh + (rows - 1) * gap;
  const offX = ix + (innerW - totalW) * 0.5;
  const offY = iy + (innerH - totalH) * 0.5;
  const out: NormRect[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push({
        nx: offX + c * (nw + gap),
        ny: offY + r * (nh + gap),
        nw,
        nh,
      });
    }
  }
  return out.map((rect) => ({
    ...rect,
    ny: Math.min(1 - rect.nh - margin, rect.ny),
  }));
}

const DEFAULT_LEVEL: LevelSpec = {
  /** Sapan: sol yamacın toprağının üstünde (zemin ~ny 0.73), biraz sağda */
  sling: { nx: 0.265, ny: 0.732 },
  slingRestOffset: { nx: 0, ny: -0.026 },
  posts: {
    left: { nx: 0.228, ny: 0.678 },
    right: { nx: 0.302, ny: 0.678 },
  },
  ground: [
    { a: { nx: 0, ny: 0.78 }, b: { nx: 0.4, ny: 0.71 } },
    { a: { nx: 0.4, ny: 0.71 }, b: { nx: 0.56, ny: 0.805 } },
    { a: { nx: 0.56, ny: 0.805 }, b: { nx: 1, ny: 0.735 } },
  ],
  crates: buildDefaultCrates(),
};

/** 1–8 arka plan indeksine göre kısmi üzerine yazma (boş = varsayılan) */
const perBackground: Partial<Record<number, Partial<LevelSpec>>> = {
  /** backg6: sapanı biraz yukarı */
  6: {
    sling: { nx: 0.265, ny: 0.696 },
    slingRestOffset: { nx: 0, ny: -0.026 },
    posts: {
      left: { nx: 0.228, ny: 0.642 },
      right: { nx: 0.302, ny: 0.642 },
    },
  },
};

export function getLevelSpec(backgroundIndex1Based: number): LevelSpec {
  const idx = Math.max(1, Math.min(8, Math.floor(backgroundIndex1Based)));
  const patch = perBackground[idx];
  if (!patch) return { ...DEFAULT_LEVEL, posts: { ...DEFAULT_LEVEL.posts }, ground: [...DEFAULT_LEVEL.ground], crates: [...DEFAULT_LEVEL.crates] };
  return {
    ...DEFAULT_LEVEL,
    ...patch,
    posts: { ...DEFAULT_LEVEL.posts, ...patch.posts },
    ground: patch.ground ?? [...DEFAULT_LEVEL.ground],
    crates: patch.crates ?? [...DEFAULT_LEVEL.crates],
  };
}
