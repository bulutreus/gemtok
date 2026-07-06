/**
 * STREAMXT — TikTok canlı yayın savaş köprüsü
 * Statik dosyalar + WebSocket: tüm bağlı tarayıcılara aynı oyun durumu yayını
 * TikTok LIVE WebCast sunucu köprüsü kaldırıldı; etkileşimler TikFinity masaüstü uygulamasına
 * tarayıcıdan doğrudan WebSocket ile bağlanır (varsayılan ws://127.0.0.1:21213 — TikFinity).
 */
import "./load-env.mjs";
import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync, existsSync, writeFileSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = Number(process.env.PORT) || 3847;
/**
 * Boş bırakılırsa önce IPv6 `::` + `ipv6Only: false` (çoğu ortamda IPv4+IPv6 birlikte; localhost/::1 WebSocket sorununu giderir).
 * Sabitlemek için: `HOST=0.0.0.0` veya `LISTEN_HOST=127.0.0.1` vb.
 */
const EXPLICIT_LISTEN_HOST = String(process.env.HOST || process.env.LISTEN_HOST || "").trim() || null;
const app = express();
/** Sıra / Live Preview vb. farklı kökten gömülü sayfa: tarayıcı CORS ile API+WS */
app.use((req, res, next) => {
  const og = req.get("Origin");
  /** `file://` vb. bazen Origin `null` dizgesi; yansıtmak CORS’u kırabilir — `*` kullan. */
  if (og && String(og).toLowerCase() !== "null") {
    res.setHeader("Access-Control-Allow-Origin", og);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.append("Vary", "Origin");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
const httpServer = createServer(app);

const publicDir = join(__dirname, "public");
const assetsDir = join(publicDir, "assets");

/** POST /api/settings: base64 görseller; iki büyük dosya tek JSON’da ~1 GB’ı aşabilir (sayısal limit, belirsiz string parse yok). */
const SETTINGS_MAX_BODY_BYTES = 8 * 1024 * 1024 * 1024;

const DEFAULT_CFG = {
  teamAlphaName: "TEAM TURKEY 1",
  teamBravoName: "TEAM KURDISTAN 2",
  teamAlphaSubtitle: "Team TURKEY CMT 1",
  teamBravoSubtitle: "Team KURDISTAN CMT 2",
  bgLeftPath: "/assets/sol.png",
  bgRightPath: "/assets/sag.png",
  /** Raunt süresi (dakika); istemci geri sayım için */
  roundDurationMinutes: 5,
};

function sanitizeBgPath(p, fallback) {
  const s = String(p || "").trim();
  if (!s.startsWith("/assets/")) return fallback;
  if (s.includes("..") || s.includes("\\")) return fallback;
  const name = s.slice("/assets/".length);
  if (!name || name.includes("/")) return fallback;
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) return fallback;
  if (!/\.(png|jpe?g|webp|avif)$/i.test(name)) return fallback;
  return `/assets/${name}`;
}

function sniffImageExt(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  )
    return "webp";
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return "avif";
  return null;
}

function parseOptionalImagePayload(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  let buf;
  if (typeof obj.dataUrl === "string") {
    const m = obj.dataUrl.match(/^data:([^;]+);base64,(.*)$/s);
    if (!m) return null;
    try {
      buf = Buffer.from(String(m[2]).replace(/\s/g, ""), "base64");
    } catch {
      return null;
    }
  } else if (typeof obj.base64 === "string") {
    try {
      buf = Buffer.from(String(obj.base64).replace(/\s/g, ""), "base64");
    } catch {
      return null;
    }
  } else return null;
  if (!buf || buf.length < 32) return null;
  const ext = sniffImageExt(buf);
  if (!ext) return null;
  return { buf, ext };
}

function readRawConfigFile() {
  const p = join(__dirname, "config.json");
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

function buildConfig() {
  const cfg = { ...DEFAULT_CFG, ...readRawConfigFile() };
  const teamAlphaName = String(cfg.teamAlphaName ?? "").trim() || DEFAULT_CFG.teamAlphaName;
  const teamBravoName = String(cfg.teamBravoName ?? "").trim() || DEFAULT_CFG.teamBravoName;
  const teamAlphaSubtitle = String(cfg.teamAlphaSubtitle ?? "").trim() || DEFAULT_CFG.teamAlphaSubtitle;
  const teamBravoSubtitle = String(cfg.teamBravoSubtitle ?? "").trim() || DEFAULT_CFG.teamBravoSubtitle;
  const rdm = Number(cfg.roundDurationMinutes);
  const roundDurationMinutes = Number.isFinite(rdm)
    ? Math.min(120, Math.max(1, Math.round(rdm)))
    : DEFAULT_CFG.roundDurationMinutes;
  return {
    teamAlphaName: teamAlphaName.slice(0, 72),
    teamBravoName: teamBravoName.slice(0, 72),
    teamAlphaSubtitle: teamAlphaSubtitle.slice(0, 72),
    teamBravoSubtitle: teamBravoSubtitle.slice(0, 72),
    roundDurationMinutes,
    bgLeftPath: sanitizeBgPath(cfg.bgLeftPath, DEFAULT_CFG.bgLeftPath),
    bgRightPath: sanitizeBgPath(cfg.bgRightPath, DEFAULT_CFG.bgRightPath),
    /**
     * TikFinity varsayılan WebSocket URL’si için sunucu tarafı öneri (istemci: localStorage → bu alan → ws://127.0.0.1:21213).
     * Ortam: TIKFINITY_WS_URL
     */
    tikfinityWsUrl: String(process.env.TIKFINITY_WS_URL ?? cfg.tikfinityWsUrl ?? "")
      .trim()
      .slice(0, 512),
  };
}

function mergeConfigJson(patch) {
  const p = join(__dirname, "config.json");
  try {
    const cur = readRawConfigFile();
    Object.assign(cur, patch);
    writeFileSync(p, JSON.stringify(cur, null, 2), "utf8");
  } catch (e) {
    console.error("[config] config.json yazılamadı:", e?.message || e);
  }
}

/** Harici `POST /api/event` gövdeleri: jeton / kullanıcı adı / avatar alanlarını yumuşat */
function normalizeStreamxtEventPayload(body) {
  if (body == null || typeof body !== "object" || Array.isArray(body)) return body;
  const o = { ...body };
  const pic = o.profilePicturUrl ?? o.profilePictureUrl;
  if (!o.avatarUrl && typeof pic === "string" && pic.trim()) o.avatarUrl = pic.trim();
  if (o.diamondCount == null && o.coins != null) {
    const n = Number(o.coins);
    if (Number.isFinite(n)) o.diamondCount = Math.max(0, Math.round(n));
  }
  if (!o.giftId && o.giftName != null) o.giftId = String(o.giftName).trim();
  if (!o.userId && o.username != null) o.userId = String(o.username).trim().replace(/^@/, "");
  return o;
}

const wss = new WebSocketServer({ server: httpServer, perMessageDeflate: false });

function broadcast(obj) {
  let data;
  try {
    data = JSON.stringify(obj);
  } catch (e) {
    console.error("[WS] JSON.stringify başarısız:", e?.message || e);
    return;
  }
  for (const client of wss.clients) {
    if (client.readyState !== 1) continue;
    try {
      client.send(data);
    } catch (e) {
      console.error("[WS] client.send başarısız:", e?.message || e);
    }
  }
}

/** Büyük gövde (base64 arka plan); global json’dan önce — aynı istekte tek kez parse */
app.post(
  "/api/settings",
  express.raw({
    limit: SETTINGS_MAX_BODY_BYTES,
    type: () => true,
  }),
  (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!Buffer.isBuffer(req.body)) return res.status(400).json({ ok: false, error: "body" });
    let body;
    try {
      body = JSON.parse(req.body.toString("utf8"));
    } catch {
      return res.status(400).json({ ok: false, error: "json" });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return res.status(400).json({ ok: false, error: "shape" });
    const patch = {};
    const maxText = 72;
    for (const k of ["teamAlphaName", "teamBravoName", "teamAlphaSubtitle", "teamBravoSubtitle"]) {
      if (Object.prototype.hasOwnProperty.call(body, k)) patch[k] = String(body[k] ?? "").trim().slice(0, maxText);
    }
    if (Object.prototype.hasOwnProperty.call(body, "roundDurationMinutes")) {
      const n = Number(body.roundDurationMinutes);
      if (Number.isFinite(n)) patch.roundDurationMinutes = Math.min(120, Math.max(1, Math.round(n)));
    }
    if (body.resetBackgrounds === true) {
      patch.bgLeftPath = DEFAULT_CFG.bgLeftPath;
      patch.bgRightPath = DEFAULT_CFG.bgRightPath;
    } else {
      if (Object.prototype.hasOwnProperty.call(body, "bgLeftPath")) {
        patch.bgLeftPath = sanitizeBgPath(String(body.bgLeftPath), DEFAULT_CFG.bgLeftPath);
      }
      if (Object.prototype.hasOwnProperty.call(body, "bgRightPath")) {
        patch.bgRightPath = sanitizeBgPath(String(body.bgRightPath), DEFAULT_CFG.bgRightPath);
      }
    }
    if (body.leftImage != null && body.resetBackgrounds !== true) {
      const img = parseOptionalImagePayload(body.leftImage);
      if (img) {
        const fname = `streamxt-bg-left.${img.ext}`;
        writeFileSync(join(assetsDir, fname), img.buf);
        patch.bgLeftPath = `/assets/${fname}`;
      }
    }
    if (body.rightImage != null && body.resetBackgrounds !== true) {
      const img = parseOptionalImagePayload(body.rightImage);
      if (img) {
        const fname = `streamxt-bg-right.${img.ext}`;
        writeFileSync(join(assetsDir, fname), img.buf);
        patch.bgRightPath = `/assets/${fname}`;
      }
    }
    if (Object.keys(patch).length === 0) return res.status(400).json({ ok: false, error: "empty" });
    mergeConfigJson(patch);
    broadcast({ channel: "streamxtSettings", payload: { ok: true } });
    res.json({ ok: true, config: buildConfig() });
  },
);

app.use(express.json({ limit: "256kb" }));

/** API rotaları express.static’ten önce — aksi halde ileride public/ altında çakışan dosya API’yi gölgeler */
app.get("/api/paths", (_req, res) => {
  res.set("Cache-Control", "no-store");
  const root = __dirname;
  const bat = join(root, "BASLAT.bat");
  res.json({
    root,
    baslatBat: bat,
    assetsDir,
  });
});

app.get("/api/config", (_req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.json(buildConfig());
});

/** Sağlık: tarayıcı / statik sunucu ayırımı için */
app.get("/api/ping", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ ok: true, streamxt: true, tiktokLivePost: false, apiRevision: 15, carRaceCarsApi: false });
});

/** Araç listesi (Car Race kaldırıldı): boş dizi — uyumluluk için rota korunur */
app.get("/api/cars", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ files: [] });
});

/** TikTok sunucu köprüsü kaldırıldı; TikFinity tarayıcıdan ws://127.0.0.1:21213 (veya ayar) ile bağlanır. */
app.get("/api/tiktok/live", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    ok: true,
    streamxt: true,
    tiktokLivePost: false,
    deprecated: true,
    message: "TikTok LIVE sunucu köprüsü kaldırıldı. TikFinity masaüstü uygulamasını açıp oyun ayarlarından WebSocket URL’sini kullanın.",
  });
});

const avatarProxyCache = new Map();
const AVATAR_PROXY_TTL_MS = 120_000;
const MAX_AVATAR_BYTES = 450_000;

function allowedAvatarHostname(hostname) {
  const h = String(hostname || "").toLowerCase();
  const ok = [
    "tiktokcdn.com",
    "tiktokcdn-eu.com",
    "tiktokcdn-us.com",
    "byteimg.com",
    "ibyteimg.com",
    "muscdn.com",
    "tiktokv.com",
    "tiktokv.eu",
    "tiktok.com",
  ];
  return ok.some((s) => h === s || h.endsWith("." + s));
}

function isAllowedAvatarSource(ref) {
  try {
    const u = new URL(ref);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    if (u.username || u.password) return false;
    return allowedAvatarHostname(u.hostname);
  } catch {
    return false;
  }
}

function sniffImageContentType(buf) {
  if (!buf || buf.length < 4) return "image/jpeg";
  const b0 = buf[0];
  const b1 = buf[1];
  if (b0 === 0xff && b1 === 0xd8) return "image/jpeg";
  if (b0 === 0x89 && b1 === 0x50) return "image/png";
  if (b0 === 0x47 && b1 === 0x49) return "image/gif";
  if (b0 === 0x52 && b1 === 0x49 && buf.length >= 12 && buf[8] === 0x57 && buf[9] === 0x45) return "image/webp";
  return "image/jpeg";
}

/** TikTok profil görsellerini aynı origin’den verir — canvas CORS / tarayıcı engeli için */
app.get("/api/avatar-image", async (req, res) => {
  const ref = String(req.query.u || "").trim();
  if (!ref || !isAllowedAvatarSource(ref)) {
    return res.status(400).type("text/plain").send("invalid url");
  }
  const now = Date.now();
  for (const [k, v] of avatarProxyCache) {
    if (now - v.t > AVATAR_PROXY_TTL_MS) avatarProxyCache.delete(k);
  }
  const cached = avatarProxyCache.get(ref);
  if (cached) {
    res.set("Cache-Control", "public, max-age=90");
    res.type(cached.ct);
    return res.send(cached.buf);
  }
  try {
    const hr = await fetch(ref, {
      redirect: "follow",
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        Referer: "https://www.tiktok.com/",
        Origin: "https://www.tiktok.com",
        "Sec-Fetch-Dest": "image",
        "Sec-Fetch-Mode": "no-cors",
        "Sec-Fetch-Site": "cross-site",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
    });
    if (!hr.ok) return res.status(502).type("text/plain").send("upstream");
    const buf = Buffer.from(await hr.arrayBuffer());
    if (buf.length > MAX_AVATAR_BYTES) return res.status(413).type("text/plain").send("too large");
    if (buf[0] === 0x3c) return res.status(502).type("text/plain").send("upstream html");
    let ct = String(hr.headers.get("content-type") || "").split(";")[0].trim();
    if (!/^image\//i.test(ct)) ct = sniffImageContentType(buf);
    avatarProxyCache.set(ref, { buf, ct, t: now });
    res.set("Cache-Control", "public, max-age=90");
    res.type(ct);
    return res.send(buf);
  } catch (e) {
    console.error("[avatar-image]", e?.message || e);
    return res.status(500).type("text/plain").send("error");
  }
});

/**
 * Harici köprü (Streamer.bot, özel script vb.): POST /api/event  body: { type, userId, nickname, giftId?, … }
 */
app.post("/api/event", (req, res) => {
  try {
    const raw = req.body;
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
      return res.status(400).json({ ok: false, error: "JSON nesnesi gerekli (type, userId, …)" });
    }
    const payload = normalizeStreamxtEventPayload(raw);
    broadcast({ channel: "tiktok", payload });
    return res.json({ ok: true });
  } catch (e) {
    console.error("[api/event]", e?.message || e);
    return res.status(500).json({ ok: false, error: "internal" });
  }
});

app.use(
  express.static(publicDir, {
    setHeaders(res, path) {
      const base = path.replace(/\\/g, "/").split("/").pop() || "";
      if (base === "game.js" || base === "index.html" || base === "gemtok-tikfinity-client.js") {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      }
    },
  }),
);

wss.on("connection", (ws) => {
  try {
    ws.send(JSON.stringify({ channel: "hello", message: "streamxt" }));
  } catch (e) {
    console.error("[WS] hello gönderilemedi:", e?.message || e);
  }
  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (msg?.channel === "clientSim" && msg.payload != null && typeof msg.payload === "object") {
      broadcast({ channel: "tiktok", payload: msg.payload });
    }
  });
});

process.on("unhandledRejection", (reason) => {
  let msg = "";
  if (reason instanceof Error) msg = reason.message || String(reason);
  else if (reason && typeof reason === "object") {
    try {
      msg = JSON.stringify(reason);
    } catch {
      msg = "[object]";
    }
  } else msg = String(reason);
  if (msg === "[object Object]") msg = "unhandledRejection (nesne)";
  console.error("[unhandledRejection]", msg);
});

let httpListenReady = false;
let didIpv4ListenFallback = false;

function isIpv6DualStackBindFailure(err) {
  const c = err && typeof err === "object" ? err.code : "";
  return c === "EADDRNOTAVAIL" || c === "EAFNOSUPPORT" || c === "EINVAL" || c === "EPROTONOSUPPORT";
}

function onHttpServerListening() {
  httpListenReady = true;
  const bindNote = EXPLICIT_LISTEN_HOST
    ? `adres=${EXPLICIT_LISTEN_HOST}`
    : didIpv4ListenFallback
      ? "IPv4 0.0.0.0 (tüm arayüzler)"
      : "IPv6 :: + IPv4 (ipv6Only=false, çift yığın)";
  console.log(`WarFront Arena (${bindNote}): http://127.0.0.1:${PORT}  (veya http://localhost:${PORT})`);
  console.log(`Harici olay: POST http://127.0.0.1:${PORT}/api/event`);
  console.log("TikFinity: tarayıcı oyunu TikFinity masaüstü WebSocket’ine bağlanır (varsayılan ws://127.0.0.1:21213).");
  console.log(`Araç listesi: GET http://127.0.0.1:${PORT}/api/cars (Car Race kaldırıldı — boş liste)`);
}

httpServer.on("error", (err) => {
  const code = err && typeof err === "object" ? err.code : "";
  if (code === "EADDRINUSE") {
    console.error(
      `[HTTP] Port ${PORT} zaten kullanımda. Diğer Node / WarFront Arena sunucu penceresini kapatın veya PORT=3850 gibi farklı bir port verin.`,
    );
    process.exit(1);
  }
  if (!httpListenReady && !EXPLICIT_LISTEN_HOST && !didIpv4ListenFallback && isIpv6DualStackBindFailure(err)) {
    didIpv4ListenFallback = true;
    console.warn("[HTTP] Varsayılan çift yığın (::) dinlenemedi; 0.0.0.0 ile yeniden deneniyor:", err?.message || code);
    httpServer.listen(PORT, "0.0.0.0", onHttpServerListening);
    return;
  }
  if (httpListenReady) {
    console.error("[HTTP] (çalışırken)", err?.message || err);
    return;
  }
  console.error("[HTTP]", err?.message || err);
  process.exit(1);
});

if (EXPLICIT_LISTEN_HOST) {
  httpServer.listen(PORT, EXPLICIT_LISTEN_HOST, onHttpServerListening);
} else {
  httpServer.listen({ port: PORT, host: "::", ipv6Only: false }, onHttpServerListening);
}
