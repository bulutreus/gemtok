/**
 * TikTok LIVE → WebSocket (ws://localhost:21213)
 * Aynı portta HTTP: index.html + /api/cars (assets/cars; .heic/.heif → PNG önbellek)
 * Eski StreamDPS widget ile uyumlu mesaj formatı: { event, data }
 */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const http = require('http');
const { WebSocketServer } = require('ws');
const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');

let sharp = null;
try {
  sharp = require('sharp');
} catch (e) {
  console.warn('sharp yüklenemedi; HEIC dönüşümü devre dışı:', e && e.message);
}

const CONFIG_PATH = path.join(__dirname, 'config.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
};

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  return JSON.parse(raw);
}

function broadcast(clients, obj) {
  const s = JSON.stringify(obj);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(s);
  }
}

function normalizeGiftName(name) {
  return (name || '').toLowerCase().trim();
}

function resolveLaneFromGift(cfg, giftId, giftName) {
  const idKey = String(giftId);
  if (cfg.giftIdToLane && cfg.giftIdToLane[idKey]) {
    return cfg.giftIdToLane[idKey].lane;
  }
  const n = normalizeGiftName(giftName);
  if (cfg.giftNameToLane && Array.isArray(cfg.giftNameToLane)) {
    for (const row of cfg.giftNameToLane) {
      if (n.includes(String(row.match).toLowerCase())) return row.lane;
    }
  }
  return null;
}

/** Sohbette yalnızca 1–5 (ASCII veya tam genişlik rakam) → şerit indeksi 0–4 */
function parseChatDigitLane(comment) {
  let t = String(comment || '').trim();
  if (!t) return null;
  const fw = { '\uFF11': '1', '\uFF12': '2', '\uFF13': '3', '\uFF14': '4', '\uFF15': '5' };
  for (const [k, v] of Object.entries(fw)) {
    if (t.indexOf(k) !== -1) t = t.split(k).join(v);
  }
  if (/^[1-5]$/.test(t)) return parseInt(t, 10) - 1;
  return null;
}

/** TikTok hediye jetonu (elmas); bilinmiyorsa 1 */
function giftDiamondCount(data) {
  const gd = data.giftDetails || data.gift_detail || {};
  const candidates = [gd.diamondCount, data.diamondCount, gd.diamond_count];
  for (const c of candidates) {
    const n = Math.round(Number(c));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 1;
}

const carsDir = path.join(__dirname, 'assets', 'cars');
/** HEIC/HEIF → PNG önbelleği (tarayıcıda HEIC gösterilmez; liste PNG URL döner) */
const carsHeicCacheDir = path.join(carsDir, '.heic-png-cache');

const RASTER_EXT = /\.(png|jpg|jpeg|webp|gif)$/i;
const HEIC_EXT = /\.(heic|heif)$/i;

/**
 * Kaynak HEIC/HEIF, hedef PNG’den yeniyse veya PNG yoksa dönüştürür.
 */
async function ensureHeicToPng(heicPath, pngOutPath) {
  if (!sharp) throw new Error('sharp yok');
  const srcStat = await fsp.stat(heicPath);
  try {
    const dstStat = await fsp.stat(pngOutPath);
    if (dstStat.mtimeMs >= srcStat.mtimeMs) return;
  } catch (_) {
    /* hedef yok veya okunamadı — yeniden üret */
  }
  await fsp.mkdir(path.dirname(pngOutPath), { recursive: true });
  await sharp(heicPath).rotate().png({ compressionLevel: 7 }).toFile(pngOutPath);
}

async function sendCarsJson(res) {
  const jsonHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  };
  try {
    await fsp.mkdir(carsDir, { recursive: true });
    const files = await fsp.readdir(carsDir);
    const rasterStems = new Set();
    const images = [];

    for (const f of files) {
      if (!RASTER_EXT.test(f)) continue;
      if (f.startsWith('.')) continue;
      const abs = path.join(carsDir, f);
      let st;
      try {
        st = await fsp.stat(abs);
      } catch {
        continue;
      }
      if (!st.isFile()) continue;
      images.push('assets/cars/' + f);
      rasterStems.add(path.parse(f).name.toLowerCase());
    }

    for (const f of files) {
      if (!HEIC_EXT.test(f)) continue;
      if (f.startsWith('.')) continue;
      const stem = path.parse(f).name;
      if (rasterStems.has(stem.toLowerCase())) continue;

      const heicFull = path.join(carsDir, f);
      let stHeic;
      try {
        stHeic = await fsp.stat(heicFull);
      } catch {
        continue;
      }
      if (!stHeic.isFile()) continue;
      const pngName = stem + '.png';
      const pngFull = path.join(carsHeicCacheDir, pngName);
      const url = 'assets/cars/.heic-png-cache/' + pngName;

      if (!sharp) {
        console.warn('[cars] HEIC atlandı (sharp yok):', f);
        continue;
      }
      try {
        await ensureHeicToPng(heicFull, pngFull);
        images.push(url);
      } catch (e) {
        console.warn('[cars] HEIC → PNG başarısız:', f, (e && e.message) || e);
      }
    }

    images.sort((a, b) => a.localeCompare(b, 'tr'));
    res.writeHead(200, jsonHeaders);
    res.end(JSON.stringify({ files: images }));
  } catch (err) {
    console.warn('[cars] sendCarsJson:', err && err.message);
    res.writeHead(500, jsonHeaders);
    res.end(JSON.stringify({ error: 'cars_dir', files: [] }));
  }
}

function isPathInsideRoot(requestedPath, rootDir) {
  const resolved = path.resolve(requestedPath);
  const root = path.resolve(rootDir);
  return resolved === root || resolved.startsWith(root + path.sep);
}

/** main() içinde atanır: panelden gelen yayın kullanıcı adı */
const carRaceTiktokBridge = {
  applyUsername(_raw) {
    /* no-op — sunucu main() çalışınca değiştirilir */
  },
};

/** req.url → yönlendirme için tek tip pathname (çift / ve sondaki / düzeltilir) */
function normalizeHttpPathname(reqUrl) {
  let pathname;
  try {
    pathname = new URL(reqUrl || '/', 'http://127.0.0.1').pathname || '/';
  } catch (e) {
    pathname = '/';
  }
  try {
    pathname = decodeURIComponent(pathname);
  } catch (e2) {
    /* geçersiz % dizilimi — ham kullan */
  }
  pathname = String(pathname).replace(/\/{2,}/g, '/');
  pathname = pathname.replace(/\/+$/, '') || '/';
  return pathname;
}

function handleHttp(req, res) {
  const pathnameNorm = normalizeHttpPathname(req.url);
  const method = String(req.method || 'GET').toUpperCase();

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS, POST',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  if (method === 'POST' && (pathnameNorm === '/api/tiktok-username' || pathnameNorm === '/api/tiktok/live')) {
    const jsonHeaders = {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    };
    let buf = '';
    req.on('data', (chunk) => {
      buf += chunk;
      if (buf.length > 65536) req.destroy();
    });
    req.on('end', () => {
      let body = {};
      try {
        body = buf ? JSON.parse(buf) : {};
      } catch (e) {
        res.writeHead(400, jsonHeaders);
        res.end(JSON.stringify({ ok: false, error: 'json' }));
        return;
      }
      try {
        const rawU = String(body.username ?? body.tiktokUsername ?? '')
          .replace(/^@/, '')
          .trim();
        carRaceTiktokBridge.applyUsername(rawU);
        res.writeHead(200, jsonHeaders);
        res.end(JSON.stringify({ ok: true, tiktokUsername: rawU || null }));
      } catch (e) {
        res.writeHead(500, jsonHeaders);
        res.end(JSON.stringify({ ok: false, error: (e && e.message) || String(e) }));
      }
    });
    return;
  }

  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, {
      'Access-Control-Allow-Origin': '*',
      'Allow': 'GET, HEAD, POST, OPTIONS',
      'Content-Type': 'text/plain; charset=utf-8',
    });
    res.end('Method Not Allowed');
    return;
  }

  if (pathnameNorm === '/api/tiktok/live' && method === 'GET') {
    const jsonHeaders = {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    };
    res.writeHead(200, jsonHeaders);
    res.end(
      JSON.stringify({
        ok: true,
        carRace: true,
        tiktokLivePost: true,
        useMethod: 'POST',
        bodyExample: {
          username: 'tiktok_unique_id',
          tiktokUsername: 'aynı_alan_yedeği',
        },
      }),
    );
    return;
  }

  if (pathnameNorm === '/api/config' && method === 'GET') {
    const jsonHeaders = {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    };
    let tikfinityWsUrl = '';
    try {
      tikfinityWsUrl = String(process.env.TIKFINITY_WS_URL || '').trim();
      if (!tikfinityWsUrl) {
        const cfg = loadConfig();
        tikfinityWsUrl = String(cfg.tikfinityWsUrl || '').trim();
      }
    } catch (eCfg) {
      tikfinityWsUrl = '';
    }
    res.writeHead(200, jsonHeaders);
    res.end(JSON.stringify({ ok: true, tikfinityWsUrl }));
    return;
  }

  if (pathnameNorm === '/api/cars') {
    void sendCarsJson(res);
    return;
  }

  let pathname = pathnameNorm;
  if (pathname === '/') pathname = '/index.html';

  const rel = pathname.replace(/^\/+/, '');
  if (rel.includes('..')) {
    res.writeHead(403);
    res.end();
    return;
  }

  const full = path.join(__dirname, rel);
  if (!isPathInsideRoot(full, __dirname)) {
    res.writeHead(403);
    res.end();
    return;
  }

  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404);
      res.end();
      return;
    }
    const ext = path.extname(full).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    if (method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(full).pipe(res);
  });
}

function main() {
  if (process.argv.includes('--static')) {
    const port = Number(process.env.HTTP_PORT) || 8787;
    const server = http.createServer(handleHttp);
    server.listen(port, () => {
      console.info(`Sadece HTTP (TikTok yok): http://localhost:${port}/`);
      console.info(`Araç listesi: http://localhost:${port}/api/cars`);
    });
    return;
  }

  let cfg = loadConfig();
  const port = Number(cfg.wsPort) || 21213;
  const usernameArg = process.argv[2];

  const server = http.createServer(handleHttp);
  const wss = new WebSocketServer({ server });
  const clients = new Set();

  /** @type {Map<string, number>} uniqueId → pist 0–4 (sohbette 1–5 yazınca) */
  const userPickedLane = new Map();
  /** @type {Map<string, number>} Şerit seçmiş izleyici → biriken beğeni (50 = 1 adım) */
  const userLikeAcc = new Map();
  const LIKES_PER_STEP = 50;
  let runtimeUniqueId = null;
  let tiktokConnection = null;

  function normalizeBridgeUser(s) {
    return String(s || '').replace(/^@/, '').trim();
  }

  function bridgeUserDisabled(u) {
    const x = normalizeBridgeUser(u);
    return !x || x === 'KULLANICI_ADI_BURAYA' || x.toLowerCase() === 'off' || x === '-';
  }

  function helloPayload() {
    return {
      event: 'hello',
      data: {
        message: 'TikTok yarış köprüsü hazır',
        uniqueId: runtimeUniqueId || 'kapalı',
        tiktok: runtimeUniqueId ? 'bekleniyor' : 'kapalı',
      },
    };
  }

  function broadcastHello() {
    broadcast(clients, helloPayload());
  }

  /** Biriken beğenilerden 50’lik dilimleri pist adımına çevirir (şerit seçilmiş olmalı). */
  function flushLikeStepsForUser(uid, nickname) {
    if (!uid || !userPickedLane.has(uid)) return;
    let tot = userLikeAcc.get(uid) || 0;
    const steps = Math.floor(tot / LIKES_PER_STEP);
    if (steps < 1) return;
    userLikeAcc.set(uid, tot % LIKES_PER_STEP);
    const lane = userPickedLane.get(uid);
    console.info(`[like] @${uid} → ${steps} adım (${LIKES_PER_STEP} beğeni/adım) → şerit ${lane}`);
    broadcast(clients, {
      event: 'likeBoost',
      data: {
        resolvedLane: lane,
        steps,
        uniqueId: uid,
        nickname: nickname != null ? String(nickname) : '',
      },
    });
  }

  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.on('close', () => clients.delete(ws));
    ws.send(JSON.stringify(helloPayload()));
  });

  server.listen(port, () => {
    console.info(`HTTP + WebSocket: http://127.0.0.1:${port}/  (ws://127.0.0.1:${port})`);
    console.info(`Araç listesi API: http://127.0.0.1:${port}/api/cars`);
  });

  function stopTiktokBridge() {
    if (!tiktokConnection) return;
    Promise.resolve(tiktokConnection.disconnect()).catch(() => {});
    tiktokConnection = null;
  }

  function wireTiktokConnection(connection) {
    connection.on(WebcastEvent.CHAT, (data) => {
      const comment = (data.comment || '').trim();
      if (!comment) return;
      const uid = (data.user?.uniqueId || '').trim();
      const digitLane = parseChatDigitLane(comment);
      if (uid && digitLane !== null) {
        userPickedLane.set(uid, digitLane);
        console.info(`[şerit-seçimi] @${uid} → pist ${digitLane + 1}`);
        flushLikeStepsForUser(uid, data.user?.nickname || '');
      }
      broadcast(clients, {
        event: 'chat',
        data: {
          comment,
          uniqueId: uid,
          nickname: data.user?.nickname || '',
        },
      });
    });

    connection.on(WebcastEvent.GIFT, (data) => {
      const giftType = data.giftDetails?.giftType ?? 0;
      const repeatEnd = Boolean(data.repeatEnd);
      const isStreakable = giftType === 1;
      if (isStreakable && !repeatEnd) return;

      const giftId = data.giftId;
      const giftName = data.giftDetails?.giftName || '';
      cfg = loadConfig();
      const uid = (data.user?.uniqueId || '').trim();
      let lane = null;
      if (uid && userPickedLane.has(uid)) {
        lane = userPickedLane.get(uid);
      }
      if (lane === null || lane === undefined) {
        lane = resolveLaneFromGift(cfg, giftId, giftName);
      }
      const diamondCount = giftDiamondCount(data);
      const repeatCount = Math.max(1, Number(data.repeatCount) || 1);

      if (lane === null || lane === undefined) {
        console.info(
          `[gift] ${uid || '?'} → ${giftName} (#${giftId}) jeton=${diamondCount}×${repeatCount} — şerit yok (önce sohbette 1–5 veya config eşlemesi)`,
        );
        return;
      }

      console.info(
        `[gift] ${uid || '?'} → ${giftName} (#${giftId}) jeton=${diamondCount}×${repeatCount} → şerit ${lane}`,
      );
      broadcast(clients, {
        event: 'gift',
        data: {
          giftId: String(giftId),
          giftName,
          giftType,
          repeatEnd: repeatEnd,
          repeatCount,
          uniqueId: uid,
          nickname: data.user?.nickname || '',
          resolvedLane: lane,
          diamondCount,
        },
      });
    });

    connection.on(WebcastEvent.LIKE, (data) => {
      const uid = (data.user?.uniqueId || '').trim();
      if (!uid) return;
      const lc = Math.max(0, Math.round(Number(data.likeCount) || 0));
      if (lc <= 0) return;
      userLikeAcc.set(uid, (userLikeAcc.get(uid) || 0) + lc);
      flushLikeStepsForUser(uid, data.user?.nickname || '');
    });

    connection.on(WebcastEvent.STREAM_END, () => {
      broadcast(clients, { event: 'streamEnd', data: {} });
    });

    connection.on(ControlEvent.DISCONNECTED, (info) => {
      console.warn('TikTok bağlantısı koptu:', info?.reason || info);
    });
  }

  function startTiktokBridgeForUsername(raw) {
    cfg = loadConfig();
    stopTiktokBridge();
    userPickedLane.clear();
    userLikeAcc.clear();
    const u = normalizeBridgeUser(raw);
    if (bridgeUserDisabled(u)) {
      runtimeUniqueId = null;
      broadcastHello();
      console.warn('[Car Race] TikTok köprüsü kapalı (kullanıcı adı yok veya yer tutucu).');
      return;
    }
    runtimeUniqueId = u;
    broadcastHello();
    console.info(`[Car Race] TikTok kullanıcısı: @${runtimeUniqueId}`);

    const connection = new TikTokLiveConnection(runtimeUniqueId, {
      enableExtendedGiftInfo: !!cfg.enableExtendedGiftInfo,
      processInitialData: false,
    });
    tiktokConnection = connection;
    wireTiktokConnection(connection);

    connection
      .connect()
      .then((state) => {
        console.info(`TikTok LIVE bağlandı. roomId=${state.roomId}`);
        broadcast(clients, {
          event: 'tiktokConnected',
          data: { roomId: state.roomId, uniqueId: runtimeUniqueId },
        });
      })
      .catch((err) => {
        console.error('TikTok bağlanamadı — sunucu çalışmaya devam ediyor (hediye yok):', err?.message || err);
      });
  }

  carRaceTiktokBridge.applyUsername = (raw) => {
    startTiktokBridgeForUsername(raw);
  };

  const initial = normalizeBridgeUser(usernameArg || cfg.tiktokUsername || '');
  if (bridgeUserDisabled(initial)) {
    console.warn(
      '[Car Race] Başlangıçta TikTok kullanıcı adı yok — sağ panelden veya POST /api/tiktok-username ile açın.',
    );
    startTiktokBridgeForUsername('');
  } else {
    startTiktokBridgeForUsername(initial);
  }
}

main();
