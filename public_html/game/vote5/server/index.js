/**
 * TikTok canlı hediyeleri dinler, sütun oyununa Socket.IO ile yollar.
 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');
const {
  catalogFromGiftList,
  giftThumbFromLiveEvent,
  buildColumnsVisual,
  mergedGiftIdsForColumn,
  resolveColumnForGift,
  liveGiftSearchHaystack,
  columnGiftIdsForRouting,
  applyGiftOverridesToColumns,
} = require('./giftAssets');
const { extractViewerProfileUrl } = require('../shared/viewerProfileUrl.cjs');
const { computeGiftRepeatDelta, giftVisualPlan } = require('../shared/giftStreak.cjs');
const { GIFT_IMAGES_DIR, enrichCatalogMap, loadGiftListArray, giftListRowsForCatalog } = require('./localGiftImages');

const PORT = Number(process.env.PORT || 5749);
const LOG_GIFTS = process.env.LOG_GIFTS === '1' || process.env.LOG_GIFTS === 'true';

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'columns.json');
const GIFTS_SEED_PATH = path.join(__dirname, '..', 'config', 'gifts-seed.json');

function readConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  return JSON.parse(raw);
}

function getGiftId(data) {
  if (!data || typeof data !== 'object') return '';
  const candidates = [
    data.giftKey,
    data.giftId,
    data.gift_id,
    data.gift?.giftKey,
    data.gift?.giftId,
    data.gift?.gift_id,
    data.gift?.id,
    data.extendedGiftInfo?.id,
  ];
  for (const candidate of candidates) {
    if (candidate != null) {
      const value = String(candidate).trim();
      if (value) return value;
    }
  }
  return '';
}

function getGiftName(data) {
  if (!data || typeof data !== 'object') return '';
  return (
    data.giftName ||
    data.gift?.name ||
    data.extendedGiftInfo?.name ||
    data.name ||
    data.describe ||
    data.label ||
    data.text ||
    ''
  ).trim();
}

function getProfileUrl(data) {
  return extractViewerProfileUrl(data);
}

function getDiamondCost(data, catalogMap) {
  if (typeof data.diamondCount === 'number' && data.diamondCount > 0) {
    return data.diamondCount;
  }
  const ext = data.extendedGiftInfo;
  if (ext && typeof ext.diamond_count === 'number' && ext.diamond_count > 0) {
    return ext.diamond_count;
  }
  if (ext && typeof ext.diamondCount === 'number' && ext.diamondCount > 0) {
    return ext.diamondCount;
  }
  const gid = getGiftId(data);
  const fromCat =
    gid && catalogMap && catalogMap[gid] && typeof catalogMap[gid].diamond === 'number'
      ? catalogMap[gid].diamond
      : 0;
  if (fromCat > 0) return fromCat;
  /* Gül vb. bazen olayda 0 gelir; katalog da yoksa küçük hediye say */
  return 0;
}

/** Ayarlardan gelen sütun hediye seçimi (null = yalnız config/columns.json). */
let columnGiftOverrides = null;

function effectiveColumns() {
  const cfg = readConfig();
  return applyGiftOverridesToColumns(cfg.columns || [], columnGiftOverrides);
}

/** TikTok hediye kataloğu (id -> görsel) ve sütun başlıkları için önbellek */
let lastCatalog = Object.create(null);
let lastVisual = null;
let tiktokConn = null;
let tiktokReconnectTimer = null;
let tiktokReconnectAttempts = 0;
let tiktokPendingUsername = '';

function clearTiktokReconnect() {
  if (tiktokReconnectTimer) {
    clearTimeout(tiktokReconnectTimer);
    tiktokReconnectTimer = null;
  }
  tiktokReconnectAttempts = 0;
}

function scheduleTiktokReconnect(io, username) {
  if (!io || !username) return;
  if (tiktokReconnectTimer) return;
  const delaySeconds = Math.min(30, 5 * (tiktokReconnectAttempts + 1));
  tiktokReconnectAttempts += 1;
  tiktokReconnectTimer = setTimeout(() => {
    tiktokReconnectTimer = null;
    if (tiktokPendingUsername) {
      attachTiktok(io, tiktokPendingUsername);
    }
  }, delaySeconds * 1000);
  io.emit('tiktok:status', {
    ok: false,
    message: `Yeniden bağlanma denemesi ${delaySeconds}s sonra...`,
  });
}

/** Ayarlar paneli / API — önce gift-list.json (tüm katalog), sonra gifts-seed.json üzerine yazar. */
function tryLoadSeedCatalog() {
  try {
    const listRows = loadGiftListArray();
    if (listRows.length) {
      const listMap = catalogFromGiftList(giftListRowsForCatalog(listRows));
      for (const id of Object.keys(listMap)) {
        if (!lastCatalog[id]) lastCatalog[id] = listMap[id];
      }
      enrichLastCatalogImages();
      console.info(`Hediye listesi: ${Object.keys(listMap).length} kayit (gift-list.json)`);
    }
  } catch (e) {
    console.warn('gift-list.json:', e?.message || e);
  }

  try {
    if (!fs.existsSync(GIFTS_SEED_PATH)) return;
    const raw = fs.readFileSync(GIFTS_SEED_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const seedMap = catalogFromGiftList(parsed);
    const keys = Object.keys(seedMap);
    if (!keys.length) return;
    for (const id of keys) {
      const prev = lastCatalog[id];
      lastCatalog[id] = prev ? { ...prev, ...seedMap[id], image: prev.image || seedMap[id].image } : seedMap[id];
    }
    enrichLastCatalogImages();
    console.info(`Hediye tohum güncellemesi: ${keys.length} kayit (${path.basename(GIFTS_SEED_PATH)})`);
  } catch (e) {
    console.warn('gifts-seed.json:', e?.message || e);
  }
}

function enrichLastCatalogImages() {
  const origin = process.env.VOTE5_PUBLIC_ORIGIN || `http://127.0.0.1:${PORT}`;
  enrichCatalogMap(lastCatalog, origin);
}

/** TikTok veya tohum katalogundan sütun gorselleri + istemci hediye listesi */
function syncVisualFromCatalog(username) {
  enrichLastCatalogImages();
  const cfg = readConfig();
  const uname = username !== undefined ? username : lastVisual?.username ?? null;
  lastVisual = {
    columns: buildColumnsVisual({ ...cfg, columns: effectiveColumns() }, lastCatalog),
    catalogCount: Object.keys(lastCatalog).length,
    username: uname,
    gifts: giftsListForClient(lastCatalog),
  };
}

function giftsListForClient(catalog) {
  return Object.values(catalog || {})
    .filter((g) => g && g.id != null)
    .map((g) => ({
      id: g.id,
      name: g.name || '',
      image: g.image || null,
      diamond: g.diamond || 0,
    }))
    .sort((a, b) => {
      const da = Number(a.diamond) || 0;
      const db = Number(b.diamond) || 0;
      if (da !== db) return da - db;
      return String(a.name || '').localeCompare(String(b.name || ''), 'tr');
    });
}

function createApp(staticDir) {
  const app = express();
  app.use(cors({ origin: true }));
  app.use(express.json());
  if (fs.existsSync(GIFT_IMAGES_DIR)) {
    app.use('/gift-images', express.static(GIFT_IMAGES_DIR));
  }
  app.get('/api/config', (req, res) => {
    try {
      const c = readConfig();
      res.json({
        columns: effectiveColumns().map((col, i) => ({
          index: i,
          stripeColors: col.stripeColors || ['#333', '#666'],
          icons: col.icons || ['?', '?'],
          giftIds: mergedGiftIdsForColumn(col, lastCatalog),
          routingGiftIds: columnGiftIdsForRouting(col, lastCatalog),
          giftKeywords: col.giftKeywords || [],
        })),
        roundDurationSec: c.roundDurationSec ?? 60,
        smallGiftDiamondMin: c.smallGiftDiamondMin ?? 1,
        smallGiftDiamondMax: c.smallGiftDiamondMax ?? 99,
        largeGiftMinDiamonds: c.largeGiftMinDiamonds ?? 100,
        demoRouteUnmatchedGifts: !!c.demoRouteUnmatchedGifts,
        scaleAvatarsWithRepeat: !!c.scaleAvatarsWithRepeat,
        visual: lastVisual,
      });
    } catch (e) {
      res.status(500).json({ error: String(e.message) });
    }
  });
  app.get('/api/gifts', (req, res) => {
    try {
      const list = giftsListForClient(lastCatalog);
      res.json({ gifts: list, count: list.length });
    } catch (e) {
      res.status(500).json({ error: String(e.message) });
    }
  });
  if (staticDir && fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
  }
  return app;
}

function disconnectTiktok(clearPending = true) {
  if (tiktokConn) {
    try {
      tiktokConn.disconnect();
    } catch (_) {}
    tiktokConn = null;
  }
  clearTiktokReconnect();
  if (clearPending) {
    tiktokPendingUsername = '';
  }
}

function attachTiktok(io, username) {
  disconnectTiktok(false);
  if (!username || !String(username).trim()) {
    io.emit('tiktok:status', { ok: false, message: 'Kullanıcı adı yok' });
    return;
  }

  const raw = String(username).trim();
  const atMatch = raw.match(/@([A-Za-z0-9._]+)/);
  const looksLikeUrl = /^https?:\/\//i.test(raw) || raw.includes('tiktok.com/');
  if (looksLikeUrl && !atMatch) {
    io.emit('tiktok:status', { ok: false, message: 'Linkten kullanıcı adı bulunamadı (örn: https://tiktok.com/@kullanici)' });
    return;
  }
  const uniqueId = (atMatch ? atMatch[1] : raw.replace(/^@/, '').trim()).split(/[/?#]/)[0].trim();
  if (!uniqueId) {
    io.emit('tiktok:status', { ok: false, message: 'Geçersiz TikTok kullanıcı adı/linki' });
    return;
  }

  tiktokConn = new WebcastPushConnection(uniqueId, {
    enableExtendedGiftInfo: true,
    processInitialData: false,
  });

  tiktokConn.on('connected', () => {
    clearTiktokReconnect();
    io.emit('tiktok:status', { ok: true, message: 'TikTok yayınına bağlandı', username: uniqueId });
  });

  tiktokConn.on('disconnected', () => {
    io.emit('tiktok:status', { ok: false, message: 'Bağlantı koptu' });
    scheduleTiktokReconnect(io, uniqueId);
  });

  tiktokConn.on('error', (err) => {
    const msg = err?.exception?.message || err?.info || String(err);
    io.emit('tiktok:status', { ok: false, message: msg });
    scheduleTiktokReconnect(io, uniqueId);
  });

  tiktokConn.on('streamEnd', () => {
    io.emit('tiktok:status', { ok: false, message: 'Yayın sona erdi' });
    scheduleTiktokReconnect(io, uniqueId);
  });

  tiktokConn.on('gift', (data) => {
    const giftType = Number(data.giftType ?? data.gift_type ?? data.gift?.gift_type);
    /* Yalnızca streak devamı (repeatEnd açıkça false): tek olayda repeatEnd undefined iken
       eski !repeatEnd tüm hediyeyi yutuyordu. */
    if (giftType === 1 && data.repeatEnd === false) {
      return;
    }

    const cfg = readConfig();
    const columns = effectiveColumns();
    const giftId = getGiftId(data);
    const giftName = getGiftName(data);
    const col = resolveColumnForGift(data, columns, !!cfg.demoRouteUnmatchedGifts, lastCatalog);
    if (col < 0) {
      if (LOG_GIFTS) {
        console.log('[gift ignored] no column match', {
          giftId,
          giftName,
          haystack: liveGiftSearchHaystack(data),
        });
      }
      return;
    }

    const diamondRaw = getDiamondCost(data, lastCatalog);
    const diamondPerUnit = diamondRaw > 0 ? diamondRaw : 1;
    const delta = computeGiftRepeatDelta(data, giftId);
    const plan = giftVisualPlan(diamondPerUnit, delta, cfg);
    if (!plan) {
      if (LOG_GIFTS) {
        console.log(
          '[gift skip]',
          'giftId:',
          data.giftId,
          'diamondPerUnit:',
          diamondPerUnit,
          'delta:',
          delta,
          'user:',
          data.uniqueId
        );
      }
      return;
    }

    if (LOG_GIFTS) {
      console.log('[gift]', {
        giftId: data.giftId,
        name: data.giftName || data.extendedGiftInfo?.name,
        haystack: liveGiftSearchHaystack(data),
        repeatEnd: data.repeatEnd,
        giftType,
        diamondPerUnit,
        delta,
        column: col,
        plan,
        user: data.uniqueId,
      });
    }

    const profileUrl = getProfileUrl(data);
    if (!profileUrl && LOG_GIFTS) {
      console.log('[gift] profil URL yok', data.uniqueId || data.user?.uniqueId);
    }

    const giftImageUrl = giftThumbFromLiveEvent(data) || null;
    const giftNameFinal =
      giftName ||
      liveGiftSearchHaystack(data).replace(/\s+/g, ' ').trim() ||
      '';
    const gid = getGiftId(data);

    io.emit('game:gift', {
      columnIndex: col,
      size: plan.size,
      avatarCount: plan.count,
      profileUrl,
      nickname: data.nickname || data.uniqueId || 'Oyuncu',
      pointsDelta: plan.points,
      giftId: gid,
      giftName: giftNameFinal,
      giftImageUrl,
    });
  });

  tiktokConn
    .connect()
    .then(async (state) => {
      clearTiktokReconnect();
      io.emit('tiktok:status', {
        ok: true,
        message: 'Oda açıldı',
        roomId: state.roomId,
        username: uniqueId,
      });

      const conn = tiktokConn;
      if (!conn) return;
      try {
        const gifts = await conn.getAvailableGifts();
        lastCatalog = catalogFromGiftList(gifts);
        syncVisualFromCatalog(uniqueId);
        io.emit('game:visual', lastVisual);
        console.info(`TikTok hediye kataloğu: ${lastVisual.catalogCount} hediye görseli yüklendi.`);
      } catch (e) {
        console.warn('getAvailableGifts:', e?.message || e);
      }
    })
    .catch((err) => {
      const message = err?.message || String(err);
      io.emit('tiktok:status', { ok: false, message });
      scheduleTiktokReconnect(io, uniqueId);
    });
}

function main() {
  tryLoadSeedCatalog();
  if (Object.keys(lastCatalog).length) {
    syncVisualFromCatalog();
  }

  const staticDir = path.join(__dirname, '..', 'play');
  const app = createApp(staticDir);
  const server = http.createServer(app);

  const io = new Server(server, {
    cors: { origin: '*' },
  });

  io.on('connection', (socket) => {
    socket.emit('server:hello', { port: PORT });
    if (lastVisual) {
      socket.emit('game:visual', lastVisual);
    }

    socket.on('admin:connectTiktok', (payload) => {
      const name = payload?.username || readConfig().tiktokUsername || process.env.TIKTOK_USERNAME;
      attachTiktok(io, name);
    });

    socket.on('admin:setColumnGifts', (payload) => {
      const arr = payload?.gifts;
      if (!Array.isArray(arr)) return;
      const norm = arr.slice(0, 5).map((row) => {
        if (!Array.isArray(row)) return [];
        return row.map(String).filter(Boolean).slice(0, 2);
      });
      while (norm.length < 5) norm.push([]);
      const allEmpty = norm.every((r) => !r.length);
      columnGiftOverrides = allEmpty ? null : norm;
      syncVisualFromCatalog();
      io.emit('game:visual', lastVisual);
    });

    socket.on('admin:simulateGift', (payload) => {
      const cfg = readConfig();
      const col = Math.min(4, Math.max(0, Number(payload?.columnIndex) || 0));
      const size = payload?.size === 'large' ? 'large' : 'small';
      const diamondPerUnit =
        size === 'large' ? cfg.largeGiftMinDiamonds ?? 100 : cfg.smallGiftDiamondMin ?? 1;
      const plan = giftVisualPlan(diamondPerUnit, 1, cfg);
      if (!plan) return;
      const colCfg = effectiveColumns()[col];
      const ids = colCfg ? columnGiftIdsForRouting(colCfg, lastCatalog) : [];
      const pickId =
        size === 'large'
          ? ids.find((id) => lastCatalog[String(id)]?.diamond >= diamondPerUnit) || ids[1] || ids[0]
          : ids[0];
      const rec = pickId ? lastCatalog[String(pickId)] : null;
      const alt = ids.map((id) => lastCatalog[String(id)]).find(Boolean);
      const giftImageUrl = rec?.image || alt?.image || null;
      const giftName = rec?.name || alt?.name || (size === 'large' ? '100 💎' : '1 💎');
      io.emit('game:gift', {
        columnIndex: col,
        size: plan.size,
        avatarCount: plan.count,
        profileUrl:
          payload?.profileUrl ||
          'https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(payload?.nickname || 'test'),
        nickname: payload?.nickname || 'Test',
        pointsDelta: plan.points,
        giftId: pickId != null ? String(pickId) : '',
        giftName,
        giftImageUrl,
      });
    });
  });

  const cfg = readConfig();
  const envUser = process.env.TIKTOK_USERNAME;
  if (envUser || cfg.tiktokUsername) {
    attachTiktok(io, envUser || cfg.tiktokUsername);
  }

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error(`[HATA] PORT ${PORT} kullaniliyor. Baska bir uygulamayi kapatin veya PORT ortam degiskeniyle farkli port secin.`);
      process.exit(1);
    }
    console.error(err);
    process.exit(1);
  });

  server.listen(PORT, () => {
    console.log(`Sunucu http://127.0.0.1:${PORT}  (Socket.IO + API)`);
    console.log('İstemci geliştirme: npm run dev:client → Vite proxy ile bağlanır');
    if (!envUser && !cfg.tiktokUsername) {
      console.log('Uyarı: config/columns.json içinde tiktokUsername boş. Arayüzden bağlan veya TIKTOK_USERNAME ayarla.');
    }
  });
}

main();
