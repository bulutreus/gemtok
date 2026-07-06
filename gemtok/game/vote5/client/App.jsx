import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadHideGifts, saveHideGifts } from './columnIconStorage.js';
import { loadColumnGifts, saveColumnGifts, normalizeColumnGifts } from './columnGiftStorage.js';
import { isStandaloneFileMode } from './standaloneMode.js';
import bundledGameConfig from './bundledGameConfig.js';
import {
  applyGiftOverridesToColumns,
  buildFileModeColumnsVisual,
  buildStandaloneSimulatePayload,
} from './fileModeColumns.js';
import { attachTikfinityBridge, catalogMapFromClientList } from './tikfinityLive.js';
import {
  fetchVote5GiftHubCatalog,
  mergeHubIntoCatalogState,
  mergeSocketGiftsIntoCatalogState,
} from './giftHubCatalog.js';
import { giftImageUrlForId, giftImageUrlCandidatesForId, giftImageUrlsForGift, clientGiftsFromGemTokList } from './localGiftImages.js';
import { createAvatarEngine } from './avatarEngine.js';
import giftsSeed from '../config/gifts-seed.json';

const MAX_AVATARS_PER_COLUMN = 24;
const MAX_SPAWN_PER_FRAME = 3;

/** Tam katalog: gift-list.loader.js; yedek gifts-seed.json */
function baseCatalogGifts() {
  const fromList = clientGiftsFromGemTokList();
  if (fromList.length > 0) return fromList;
  return normalizeSeedToClientGifts(giftsSeed);
}

/** `config/gifts-seed.json` — gift-list yüklenmezse yedek palet */
function normalizeSeedToClientGifts(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((g) => {
      const id = String(g?.id ?? '').trim();
      if (!id) return null;
      const diamond = Math.max(
        0,
        Number(g?.diamond_count ?? g?.diamondCount ?? g?.diamond ?? 0) || 0
      );
      const name = String(g?.name ?? '').trim() || id;
      const image =
        typeof g?.image === 'string' && g.image.startsWith('http') ? g.image : null;
      return { id, name, diamond, image: image || giftImageUrlForId(id) || null };
    })
    .filter(Boolean);
}

/** Repo kökü `assets/1.webp` … `10.webp` — Vite ile paketlenir */
const HEADER_WEBP_FROM_REPO = import.meta.glob('../assets/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});

function repoHeaderWebpUrl(n) {
  return HEADER_WEBP_FROM_REPO[`../assets/${n}.webp`];
}

/** `client/public/assets/` — Vite kökü (BASE_URL) ile birleştirilir */
function columnHeaderAssetPath(n, ext = 'webp') {
  let base = import.meta.env.BASE_URL;
  if (base == null || base === '') base = '/';
  if (!base.endsWith('/')) base = `${base}/`;
  return `${base}assets/${n}.${ext}`;
}

/** Yerleşik numaralı SVG (public’te özel dosya yoksa gösterilir) */
const COLUMN_DEFAULT_SVGS = import.meta.glob('./column-defaults/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});
/** Önce webp; public yedeği */
const HEADER_FILE_EXTS = ['webp', 'WEBP', 'png', 'PNG', 'jpg', 'jpeg', 'JPG', 'JPEG'];

/** Hediye görseli — 404 olursa hub / yerel yedek URL dener */
function GiftImg({ urls, className, alt = '', fallback = null }) {
  const list = useMemo(() => {
    const raw = Array.isArray(urls) ? urls : urls ? [urls] : [];
    const seen = new Set();
    return raw.filter((u) => {
      if (!u || !String(u).startsWith('http') || seen.has(u)) return false;
      seen.add(u);
      return true;
    });
  }, [urls]);
  const [idx, setIdx] = useState(0);
  const [exhausted, setExhausted] = useState(false);

  useEffect(() => {
    setIdx(0);
    setExhausted(false);
  }, [list.join('|')]);

  const src = list[idx];
  if (!src || exhausted) return fallback;

  return (
    <img
      className={className}
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        if (idx + 1 < list.length) setIdx((i) => i + 1);
        else setExhausted(true);
      }}
    />
  );
}

/** Ayarlanmış hediye varsa katalog görseli önce; yoksa numaralı webp yedeği */
function ColumnHeaderIcon({ slot, n, giftLookup }) {
  const configuredId = slot?.giftId ? String(slot.giftId) : '';
  const fromSlot = slot?.type === 'img' && slot.url ? slot.url : null;
  const fromCatalog =
    configuredId && giftLookup?.[configuredId]?.image ? giftLookup[configuredId].image : null;
  const hasConfiguredGift = !!configuredId;

  const attempts = useMemo(() => {
    const svgUrl = COLUMN_DEFAULT_SVGS[`./column-defaults/${n}.svg`];
    const a = [];
    const seen = new Set();
    const push = (src) => {
      if (src && !seen.has(src)) {
        seen.add(src);
        a.push({ kind: 'url', src });
      }
    };

    if (hasConfiguredGift) {
      push(fromSlot);
      push(fromCatalog);
      if (configuredId) {
        for (const u of giftImageUrlCandidatesForId(configuredId)) push(u);
      }
    } else {
      const bundled = repoHeaderWebpUrl(n);
      if (bundled) push(bundled);
      for (const ext of HEADER_FILE_EXTS) {
        push(columnHeaderAssetPath(n, ext));
      }
    }
    if (svgUrl) push(svgUrl);
    return a;
  }, [fromSlot, fromCatalog, configuredId, hasConfiguredGift, n]);

  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
  }, [attempts.length, configuredId, n]);

  const cur = attempts[idx] ?? attempts[attempts.length - 1];
  if (hasConfiguredGift && !cur) {
    return <span className="column-icon-placeholder" title={slot?.name || configuredId}>?</span>;
  }
  if (!cur || cur.kind !== 'url') return null;

  return (
    <img
      className="column-icon-img"
      src={cur.src}
      alt={slot?.name || ''}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setIdx((i) => Math.min(i + 1, attempts.length - 1))}
    />
  );
}

const defaultColumnsFallback = [
  { stripeColors: ['#c8102e', '#fdb913'], icons: ['', ''] },
  { stripeColors: ['#1d3557', '#ffd60a'], icons: ['', ''] },
  { stripeColors: ['#1a1a1a', '#e8e8e8'], icons: ['', ''] },
  { stripeColors: ['#6a0f2e', '#003d82'], icons: ['', ''] },
  { stripeColors: ['#0d6b3a', '#c41e1e'], icons: ['', ''] },
];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatTime(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${pad2(m)}:${pad2(s)}`;
}

function normalizeCols(config, visual) {
  if (visual?.columns?.length === 5) {
    return visual.columns;
  }
  let raw = config?.columns?.length ? [...config.columns] : [...defaultColumnsFallback];
  while (raw.length < 5) {
    raw.push({ stripeColors: ['#2a2a2a', '#555'], icons: ['?', '?'] });
  }
  return raw.slice(0, 5).map((c) => ({
    stripeColors: c.stripeColors || ['#333', '#666'],
    giftIds: c.giftIds || [],
    headerSlots: [
      { type: 'emoji', text: '' },
      { type: 'emoji', text: '' },
    ],
  }));
}

export default function App() {
  const fileMode = isStandaloneFileMode();

  const [config, setConfig] = useState(null);
  const [visual, setVisual] = useState(null);
  const [roundLeft, setRoundLeft] = useState(600);
  const [scores, setScores] = useState(() => Array(5).fill(0));
  const [avatarCounts, setAvatarCounts] = useState(() => Array(5).fill(0));
  const [bursts, setBursts] = useState([]);
  const [showPanel, setShowPanel] = useState(false);
  const [hideGifts, setHideGifts] = useState(() => loadHideGifts());
  const [catalogGifts, setCatalogGifts] = useState([]);
  const [giftFilter, setGiftFilter] = useState('');
  const [columnGifts, setColumnGifts] = useState(() => normalizeColumnGifts(loadColumnGifts()));
  /** Ayarlarda hediye tıklamadan önce hangi sütun yuvası (0–1) doldurulacak */
  const [giftSlotFocus, setGiftSlotFocus] = useState(null);
  const columnInnerRefs = useRef([]);
  const avatarEngineRef = useRef(null);
  const lastGiftDedupeRef = useRef({ key: '', at: 0 });
  /** Son başarılı Gift Hub indirmesi (socket görseli ile birleştirmek için) */
  const hubCatalogRef = useRef([]);
  const hideGiftsRef = useRef(hideGifts);
  const showPanelRef = useRef(showPanel);

  useEffect(() => {
    showPanelRef.current = showPanel;
  }, [showPanel]);

  useEffect(() => {
    avatarEngineRef.current = createAvatarEngine({
      getColumnEl: (i) => columnInnerRefs.current[i] || null,
      maxPerColumn: MAX_AVATARS_PER_COLUMN,
      maxSpawnPerFrame: MAX_SPAWN_PER_FRAME,
      onCountsChange: setAvatarCounts,
    });
    return () => avatarEngineRef.current?.destroy();
  }, []);

  useEffect(() => {
    hideGiftsRef.current = hideGifts;
  }, [hideGifts]);

  useEffect(() => {
    if (hideGifts) {
      setBursts([]);
      avatarEngineRef.current?.clearAll();
      setAvatarCounts(Array(5).fill(0));
    }
  }, [hideGifts]);

  useEffect(() => {
    if (!showPanel) setGiftSlotFocus(null);
  }, [showPanel]);

  useEffect(() => {
    if (!showPanel) return undefined;
    let cancelled = false;
    const seedList = baseCatalogGifts();
    (async () => {
      const hub = await fetchVote5GiftHubCatalog(true);
      if (cancelled) return;
      hubCatalogRef.current = hub;
      setCatalogGifts((prev) => {
        const merged = mergeHubIntoCatalogState(hub, prev);
        return merged.length > 0 ? merged : seedList;
      });
      try {
        const r = await fetch('/api/gifts');
        const d = await r.json();
        if (!cancelled && Array.isArray(d?.gifts) && d.gifts.length > 0) {
          setCatalogGifts((prev) => mergeSocketGiftsIntoCatalogState(prev, d.gifts));
        }
      } catch {
        /* Sunucu yoksa yalnız hub / önceki durum */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showPanel, visual?.catalogCount]);

  const socketRef = useRef(null);
  const configRef = useRef(null);
  const columnGiftsRef = useRef(columnGifts);
  const catalogGiftsRef = useRef(catalogGifts);
  const ingestGameGiftRef = useRef(null);

  useEffect(() => {
    configRef.current = config;
  }, [config]);
  useEffect(() => {
    columnGiftsRef.current = columnGifts;
  }, [columnGifts]);
  useEffect(() => {
    catalogGiftsRef.current = catalogGifts;
  }, [catalogGifts]);

  /** setInterval içinde güvenilir sayım + round bitince oyunu sıfırlama */
  const roundTickRef = useRef({ duration: 600, remaining: 600 });

  useEffect(() => {
    if (fileMode) return undefined;
    fetch('/api/config')
      .then((r) => r.json())
      .then((c) => {
        setConfig(c);
        if (c.visual) setVisual(c.visual);
        if (Array.isArray(c.visual?.gifts) && c.visual.gifts.length > 0) {
          setCatalogGifts((prev) =>
            mergeSocketGiftsIntoCatalogState(mergeHubIntoCatalogState(hubCatalogRef.current, prev), c.visual.gifts)
          );
        }
      })
      .catch(() => setConfig(null));
    return undefined;
  }, [fileMode]);

  /** Gift Hub (gift-list.json / SQLite) — sunucu kapalıyken de palet + TikFinity eşlemesi */
  useEffect(() => {
    if (fileMode) return undefined;
    let cancelled = false;
    const seedList = baseCatalogGifts();
    const pull = async (force) => {
      const hub = await fetchVote5GiftHubCatalog({ force: !!force });
      if (cancelled) return;
      hubCatalogRef.current = hub;
      setCatalogGifts((prev) => {
        const merged = mergeHubIntoCatalogState(hub, prev);
        return merged.length > 0 ? merged : prev.length > 0 ? prev : seedList;
      });
    };
    void pull(true);
    const hubApi = globalThis.GemtokGiftHub;
    const unsub =
      hubApi && typeof hubApi.subscribeGiftCatalog === 'function'
        ? hubApi.subscribeGiftCatalog(() => {
            void pull(true);
          })
        : () => {};
    return () => {
      cancelled = true;
      unsub();
    };
  }, [fileMode]);

  useEffect(() => {
    if (!fileMode) return undefined;
    const b = bundledGameConfig;
    setConfig({
      columns: Array.isArray(b.columns) ? [...b.columns] : [],
      roundDurationSec: b.roundDurationSec ?? 600,
      smallGiftDiamondMin: b.smallGiftDiamondMin ?? 1,
      smallGiftDiamondMax: b.smallGiftDiamondMax ?? 99,
      largeGiftMinDiamonds: b.largeGiftMinDiamonds ?? 100,
      demoRouteUnmatchedGifts: !!b.demoRouteUnmatchedGifts,
      scaleAvatarsWithRepeat: !!b.scaleAvatarsWithRepeat,
    });
    return undefined;
  }, [fileMode]);

  useEffect(() => {
    if (!fileMode || !config) return undefined;
    let cancelled = false;
    const b = bundledGameConfig;
    const eff = applyGiftOverridesToColumns(b.columns || [], normalizeColumnGifts(columnGifts));
    const seedList = baseCatalogGifts();
    const applyVisual = (giftList) => {
      const catalogMap = catalogMapFromClientList(giftList);
      setVisual({
        columns: buildFileModeColumnsVisual({ ...b, columns: eff }, catalogMap),
        catalogCount: giftList.length,
        username: null,
        gifts: giftList,
      });
    };
    applyVisual(seedList);
    setCatalogGifts((prev) => (prev.length > 0 ? prev : seedList));
    (async () => {
      const hub = await fetchVote5GiftHubCatalog(true);
      if (cancelled) return;
      hubCatalogRef.current = hub;
      const merged = mergeHubIntoCatalogState(hub, seedList);
      const list = merged.length > 0 ? merged : seedList;
      applyVisual(list);
      setCatalogGifts((prev) => mergeHubIntoCatalogState(hub, prev.length > 0 ? prev : seedList));
    })();
    return () => {
      cancelled = true;
    };
  }, [fileMode, config, columnGifts]);

  /** Sunucu modu: ayarlardan hediye değişince sütun ikonlarını yerelde de güncelle */
  useEffect(() => {
    if (fileMode || !config) return undefined;
    const eff = applyGiftOverridesToColumns(
      config.columns || [],
      normalizeColumnGifts(columnGifts)
    );
    const catalogMap = catalogMapFromClientList(catalogGifts);
    setVisual((prev) => ({
      ...(prev || {}),
      columns: buildFileModeColumnsVisual({ ...config, columns: eff }, catalogMap),
      catalogCount: catalogGifts.length,
      gifts: catalogGifts,
    }));
    return undefined;
  }, [fileMode, config, columnGifts, catalogGifts]);

  useEffect(() => {
    if (!config?.roundDurationSec) return undefined;
    const duration = Math.max(1, Number(config.roundDurationSec) || 600);
    roundTickRef.current = { duration, remaining: duration };
    setRoundLeft(duration);
    const id = setInterval(() => {
      const { duration: dur, remaining: rem } = roundTickRef.current;
      if (rem <= 1) {
        roundTickRef.current = { duration: dur, remaining: dur };
        setRoundLeft(dur);
        avatarEngineRef.current?.clearAll();
        setScores(Array(5).fill(0));
        setAvatarCounts(Array(5).fill(0));
        setBursts([]);
        return;
      }
      const next = rem - 1;
      roundTickRef.current = { duration: dur, remaining: next };
      setRoundLeft(next);
    }, 1000);
    return () => clearInterval(id);
  }, [config?.roundDurationSec]);

  const leaderIndex = useMemo(() => {
    let max = -1;
    let idx = 0;
    scores.forEach((s, i) => {
      if (s > max) {
        max = s;
        idx = i;
      }
    });
    return max > 0 ? idx : -1;
  }, [scores]);

  const baseCols = useMemo(() => normalizeCols(config, visual), [config, visual]);
  const cols = baseCols;

  const catalogSortedByDiamond = useMemo(() => {
    return [...catalogGifts].sort((a, b) => {
      const da = Number(a.diamond) || 0;
      const db = Number(b.diamond) || 0;
      if (da !== db) return da - db;
      return String(a.name || '').localeCompare(String(b.name || ''), 'tr');
    });
  }, [catalogGifts]);

  const giftById = useMemo(() => {
    const m = Object.create(null);
    for (const g of catalogGifts) {
      if (g && g.id != null) m[String(g.id)] = g;
    }
    return m;
  }, [catalogGifts]);

  const filteredCatalogGifts = useMemo(() => {
    const q = giftFilter.trim().toLowerCase();
    if (!q) return catalogSortedByDiamond;
    return catalogSortedByDiamond.filter(
      (g) =>
        (g.name || '').toLowerCase().includes(q) || String(g.id).toLowerCase().includes(q)
    );
  }, [catalogSortedByDiamond, giftFilter]);

  const setColumnGiftSlot = useCallback((colIdx, slot, value) => {
    setColumnGifts((prev) => {
      const next = normalizeColumnGifts(prev);
      next[colIdx][slot] = value;
      saveColumnGifts(next);
      socketRef.current?.emit('admin:setColumnGifts', { gifts: next });
      return next;
    });
  }, []);

  const triggerBurst = useCallback((columnIndex, urls, name) => {
    const list = Array.isArray(urls)
      ? urls.filter((u) => u && String(u).startsWith('http'))
      : urls && String(urls).startsWith('http')
        ? [urls]
        : [];
    if (!list.length) return;
    const bid = `b-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setBursts((prev) => [...prev, { id: bid, columnIndex, urls: list, name: name || '' }]);
    window.setTimeout(() => {
      setBursts((prev) => prev.filter((x) => x.id !== bid));
    }, 950);
  }, []);

  const ingestGameGift = useCallback((p) => {
    const {
      _catalogEntry,
      columnIndex,
      size,
      avatarCount,
      profileUrl,
      pointsDelta,
      giftImageUrl,
      giftName,
      giftId,
    } = p;

    const dedupeKey = `${columnIndex}|${giftId || ''}|${pointsDelta}|${avatarCount}|${profileUrl || ''}`;
    const dedupeAt = Date.now();
    if (
      dedupeKey === lastGiftDedupeRef.current.key &&
      dedupeAt - lastGiftDedupeRef.current.at < 350
    ) {
      return;
    }
    lastGiftDedupeRef.current = { key: dedupeKey, at: dedupeAt };

    const cat =
      _catalogEntry ||
      (p.giftId
        ? {
            id: String(p.giftId),
            name: (giftName && String(giftName).trim()) || String(p.giftId),
            diamond: Math.max(1, Number(pointsDelta) || 1),
            image: giftImageUrl || null,
          }
        : null);

    if (cat && cat.id && showPanelRef.current) {
      const idStr = String(cat.id);
      setCatalogGifts((prev) => {
        const idx = prev.findIndex((g) => String(g.id) === idStr);
        const row = {
          id: idStr,
          name: cat.name || idStr,
          diamond: Math.max(1, Number(cat.diamond) || 1),
          image: cat.image || null,
        };
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = { ...copy[idx], ...row };
          return copy;
        }
        return [...prev, row];
      });
    }

    if (!hideGiftsRef.current) {
      const burstUrls = giftImageUrlsForGift({
        id: giftId,
        name: giftName,
        image: giftImageUrl || cat?.image || null,
      });
      triggerBurst(columnIndex, burstUrls, giftName);
      avatarEngineRef.current?.queue(columnIndex, profileUrl, size, avatarCount);
    }
    setScores((prev) =>
      prev.map((s, i) => (i === columnIndex ? s + (pointsDelta || 0) : s))
    );
  }, [triggerBurst]);

  useEffect(() => {
    if (fileMode) return undefined;
    let cancelled = false;
    let socket = null;
    import('socket.io-client')
      .then(({ io }) => {
        if (cancelled) return;
        socket = io({
          path: '/socket.io',
          transports: ['websocket', 'polling'],
        });
        socketRef.current = socket;

        socket.on('connect', () => {
          socket.emit('admin:setColumnGifts', { gifts: normalizeColumnGifts(loadColumnGifts()) });
        });

        socket.on('game:visual', (payload) => {
          setVisual(payload);
          if (Array.isArray(payload?.gifts)) {
            setCatalogGifts((prev) =>
              mergeSocketGiftsIntoCatalogState(mergeHubIntoCatalogState(hubCatalogRef.current, prev), payload.gifts)
            );
          }
        });

        socket.on('game:gift', (p) => {
          ingestGameGift(p);
        });
      })
      .catch((err) => {
        console.error(err);
      });

    return () => {
      cancelled = true;
      if (socket) {
        socket.disconnect();
        socketRef.current = null;
      }
    };
  }, [fileMode, ingestGameGift]);

  useEffect(() => {
    ingestGameGiftRef.current = ingestGameGift;
  }, [ingestGameGift]);

  useEffect(() => {
    if (!fileMode) return undefined;
    return attachTikfinityBridge(
      () => ({
        config: configRef.current,
        columnGiftsNorm: normalizeColumnGifts(columnGiftsRef.current),
        catalogGifts: catalogGiftsRef.current || [],
      }),
      (p) => {
        ingestGameGiftRef.current?.(p);
      }
    );
  }, [fileMode]);

  const simulate = useCallback(
    (col, size) => {
      if (fileMode) {
        const payload = buildStandaloneSimulatePayload(
          bundledGameConfig,
          normalizeColumnGifts(columnGifts),
          col,
          size
        );
        ingestGameGift(payload);
        return;
      }
      socketRef.current?.emit('admin:simulateGift', { columnIndex: col, size });
    },
    [fileMode, columnGifts, ingestGameGift]
  );

  return (
    <>
      <button
        type="button"
        className={'gemtok-game-settings-fab' + (showPanel ? ' is-open' : '')}
        onClick={() => setShowPanel((v) => !v)}
        aria-expanded={showPanel}
        aria-controls="settings-panel"
        aria-label="Ayarlar"
        title="Ayarlar"
        aria-haspopup="dialog"
      >
        <svg className="gemtok-game-settings-fab__icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden>
          <path
            fill="currentColor"
            d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32a.51.51 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54A.51.51 0 0 0 9.25 2.4H5.41a.51.51 0 0 0-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.51.51 0 0 0-.59.22L.06 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.31-.09.63-.09.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z"
          />
        </svg>
        <span className="gemtok-game-settings-fab__label">Ayarlar</span>
      </button>

      <div className="app">
        <div className="app-vignette" aria-hidden />
        <header className="header">
          <div className="round-timer">
            <div className="round-timer-label">ROUND TIMER</div>
            <div className="round-timer-digits">{formatTime(roundLeft)}</div>
          </div>
        </header>

      <div className="counts-row">
        {cols.map((_, i) => (
          <div key={i} className="count-pill">
            {avatarCounts[i] ?? 0}
          </div>
        ))}
      </div>

      <main className="columns-row">
        {cols.map((col, i) => (
            <div key={i} className={`column-wrap ${hideGifts ? 'column-wrap--no-gifts' : ''}`}>
            <div
              className="column-body"
              style={
                {
                  '--s1': col.stripeColors?.[0] ?? '#444',
                  '--s2': col.stripeColors?.[1] ?? '#888',
                  ...(i === 4
                    ? { '--column-stroke': col.stripeColors?.[1] ?? '#888' }
                    : {}),
                }
              }
            >
              {!hideGifts && (
              <div className="column-icons column-icons--inner" aria-hidden>
                {[0, 1].map((slot) => {
                  const n = i * 2 + slot + 1;
                  return (
                    <div key={slot} className="column-icon-img-wrap">
                      <ColumnHeaderIcon slot={col.headerSlots?.[slot]} n={n} giftLookup={giftById} />
                    </div>
                  );
                })}
              </div>
              )}
              <div className="column-shine" aria-hidden />
              <div
                className="column-inner"
                ref={(el) => {
                  columnInnerRefs.current[i] = el;
                }}
              >
                {!hideGifts &&
                  bursts
                    .filter((b) => b.columnIndex === i)
                    .map((b) => (
                      <div key={b.id} className="gift-burst" aria-hidden>
                        <GiftImg urls={b.urls} alt="" />
                      </div>
                    ))}
              </div>
            </div>
          </div>
        ))}
      </main>

      <footer className="scores-row">
        {cols.map((_, i) => (
          <div
            key={i}
            className={`score-box ${leaderIndex === i ? 'score-box--leader' : ''}`}
          >
            <div className="score-label">YAYIN PUANI</div>
            <div className="score-value">
              <span key={scores[i] ?? 0} className="score-value-inner">
                {scores[i] ?? 0}
              </span>
            </div>
          </div>
        ))}
      </footer>
    </div>

      {showPanel && (
        <div className="settings-overlay gemtok-settings-theme">
          <div className="settings-overlay__backdrop" onClick={() => setShowPanel(false)} />
          <div
            className="settings-panel"
            id="settings-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="panel-title"
          >
            <h2 className="settings-panel__title" id="panel-title">Ayarlar</h2>
            <div className="settings-panel__body">

            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={hideGifts}
                onChange={(e) => {
                  const v = e.target.checked;
                  setHideGifts(v);
                  saveHideGifts(v);
                }}
              />
              <span>Hediyeleri gizle</span>
            </label>

            <div className="panel-section-title">Sütun hediyeleri</div>

            <div className="panel-gift-slots-wrap" aria-label="Sütun hediye yuvaları">
              {[0, 1, 2, 3, 4].map((col) => (
                <div key={col} className="panel-gift-slots-col">
                  <span className="panel-gift-slots-col-title">Sütun {col + 1}</span>
                  <div className="panel-gift-slots-pair">
                    {[0, 1].map((slot) => {
                      const sel = columnGifts[col]?.[slot] ?? '';
                      const g = sel ? giftById[String(sel)] : null;
                      const slotImgUrls = sel ? giftImageUrlsForGift(g || { id: sel }) : [];
                      const active =
                        giftSlotFocus && giftSlotFocus.col === col && giftSlotFocus.slot === slot;
                      return (
                        <div key={slot} className="panel-gift-slot-wrap">
                          <button
                            type="button"
                            className={'panel-gift-slot-btn' + (active ? ' panel-gift-slot-btn--active' : '')}
                            onClick={() =>
                              setGiftSlotFocus((cur) =>
                                cur && cur.col === col && cur.slot === slot ? null : { col, slot }
                              )
                            }
                            aria-pressed={active}
                            aria-label={`Sütun ${col + 1} hediye ${slot + 1}`}
                          >
                            <span className="panel-gift-slot-thumb">
                              {sel && slotImgUrls.length ? (
                                <GiftImg
                                  urls={slotImgUrls}
                                  alt=""
                                  fallback={<span className="panel-gift-slot-unknown">?</span>}
                                />
                              ) : sel ? (
                                <span className="panel-gift-slot-unknown">?</span>
                              ) : (
                                <span className="panel-gift-slot-empty">+</span>
                              )}
                            </span>
                            <span className="panel-gift-slot-text">
                              <span className="panel-gift-slot-name">
                                {g?.name || (sel ? `ID ${sel}` : 'Yuva seç')}
                              </span>
                              <span className="panel-gift-slot-diamond">
                                {sel ? `${Number(g?.diamond) || 0} 💎` : '—'}
                              </span>
                            </span>
                          </button>
                          {sel ? (
                            <button
                              type="button"
                              className="panel-gift-slot-clear"
                              aria-label={`Sütun ${col + 1} hediye ${slot + 1} boşalt`}
                              title="Boşalt"
                              onClick={() => {
                                setColumnGiftSlot(col, slot, '');
                                setGiftSlotFocus(null);
                              }}
                            >
                              ×
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <label className="panel-gift-filter">
              <span>Hediye ara (isim veya ID)</span>
              <input
                type="search"
                value={giftFilter}
                onChange={(e) => setGiftFilter(e.target.value)}
                placeholder="Filtrele…"
              />
            </label>

            <div className="panel-gift-palette-scroll">
              <div className="panel-gift-palette" role="list">
                {filteredCatalogGifts.map((g) => {
                  const idStr = String(g.id);
                  const used = columnGifts.some((row) => row[0] === idStr || row[1] === idStr);
                  const canPick = !!giftSlotFocus;
                  const imgUrls = giftImageUrlsForGift(g);
                  return (
                    <button
                      key={idStr}
                      type="button"
                      role="listitem"
                      className={
                        'panel-gift-palette-item' +
                        (used ? ' panel-gift-palette-item--used' : '') +
                        (!canPick ? ' panel-gift-palette-item--idle' : '')
                      }
                      onClick={() => {
                        if (!giftSlotFocus) return;
                        setColumnGiftSlot(giftSlotFocus.col, giftSlotFocus.slot, idStr);
                      }}
                      title={(g.name || idStr) + ' · ' + (Number(g.diamond) || 0) + '💎'}
                    >
                      <span className="panel-gift-palette-img">
                        {imgUrls.length ? (
                          <GiftImg
                            urls={imgUrls}
                            alt=""
                            fallback={<span className="panel-gift-palette-noimg">—</span>}
                          />
                        ) : (
                          <span className="panel-gift-palette-noimg">—</span>
                        )}
                      </span>
                      <span className="panel-gift-palette-meta">
                        <span className="panel-gift-palette-name">{g.name || idStr}</span>
                        <span className="panel-gift-palette-diamond">{Number(g.diamond) || 0} 💎</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="panel-row panel-row--gift-actions">
              <button
                type="button"
                className="panel-btn-secondary"
                onClick={() => {
                  const empty = normalizeColumnGifts([[], [], [], [], []]);
                  setColumnGifts(empty);
                  saveColumnGifts(empty);
                  socketRef.current?.emit('admin:setColumnGifts', { gifts: empty });
                  setGiftSlotFocus(null);
                }}
                disabled={!columnGifts.some(([a, b]) => a || b)}
              >
                Seçimi temizle (config)
              </button>
            </div>

            <div className="panel-section-title">Test hediyesi</div>
            <div className="sim-grid">
              {[0, 1, 2, 3, 4].map((col) => (
                <div key={col} className="sim-col">
                  <span>Sütun {col + 1}</span>
                  <button type="button" onClick={() => simulate(col, 'small')}>
                    1 küçük
                  </button>
                  <button type="button" onClick={() => simulate(col, 'large')}>
                    100 büyük
                  </button>
                </div>
              ))}
            </div>

            </div>

            <div className="settings-panel__actions">
              <button type="button" className="settings-btn settings-btn--ghost" onClick={() => setShowPanel(false)}>
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
