/**
 * GemTok Gift Hub — merkezi hediye API + admin UI (statik).
 * PORT: 8787 (GEMTOK_GIFT_HUB_PORT)
 */
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { openDb, initDatabase, syncGiftsFromJson, upsertLiveDiscoveredGift, REPO_ROOT, HUB_ROOT, GIFT_LIST_JSON } from "./lib/db.mjs";
import { isCatalogGiftAllowed, loadTrAllowIdsFromJson, dedupeCatalogGifts } from "./lib/giftCatalogFilter.mjs";
import { recordHeartbeat, getLastHeartbeat, allowDiscover } from "./lib/liveState.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.GEMTOK_GIFT_HUB_PORT || 8787);
const ADMIN_SECRET = String(process.env.GEMTOK_GIFT_HUB_ADMIN_SECRET || "gemtok-gift-local-change-me").trim();
const GIFT_IMAGES_DIR = path.join(REPO_ROOT, "sıra", "gift-images");
const ADMIN_DIST = path.join(HUB_ROOT, "public", "admin");

const db = openDb();
db.pragma("foreign_keys = ON");
const syncResult = initDatabase(db);
console.log("[gift-hub] DB hazır, hediye senkron:", syncResult);

/** Bellek içi sürüm: keşif / JSON senkron sonrası istemciler önbelleği yenilesin */
let giftsCatalogVersion = 1;
function bumpGiftsCatalog() {
  giftsCatalogVersion = (giftsCatalogVersion % 99999999) + 1;
}

function isAdminRequest(req) {
  return String(req.headers["x-gemtok-gift-admin"] || "").trim() === ADMIN_SECRET;
}

function mapGiftApiRow(g) {
  let discoveredImageUrl = null;
  try {
    const m = JSON.parse(g.metadata_json || "{}");
    if (m && typeof m.discoveredImageUrl === "string") discoveredImageUrl = m.discoveredImageUrl;
  } catch {
    discoveredImageUrl = null;
  }
  return {
    tiktok_id: g.tiktok_id,
    name: g.name,
    diamond_count: g.diamond_count,
    imageUrl: g.image_file ? `/gift-images/${encodeURIComponent(g.image_file)}` : null,
    discoveredImageUrl,
    first_seen: g.first_seen || null,
    last_seen: g.last_seen || null,
    category: g.category != null ? String(g.category) : "",
    active: g.active == null ? true : !!g.active,
    updated_at: g.updated_at,
  };
}

function filterCatalogRowsForGames(rows) {
  const allowIds = loadTrAllowIdsFromJson(GIFT_LIST_JSON);
  return rows.filter((g) => {
    if (g.active === 0) return false;
    return isCatalogGiftAllowed({ ...mapGiftApiRow(g), metadata_json: g.metadata_json }, allowIds);
  });
}

function requireAdmin(req, res, next) {
  const h = String(req.headers["x-gemtok-gift-admin"] || "").trim();
  if (h !== ADMIN_SECRET) {
    return res.status(401).json({ ok: false, message: "admin_token_required" });
  }
  next();
}

const app = express();
app.use(express.json({ limit: "512kb" }));
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "gemtok-gift-hub" });
});

app.get("/api/v1/meta", (req, res) => {
  res.json({
    ok: true,
    version: 1,
    giftsCatalogVersion,
    supportedEventTypes: ["gift", "like", "follow", "share", "subscribe", "member", "chat"],
    giftImageBase: "/gift-images/",
    adminSecretConfigured: ADMIN_SECRET.length > 8,
  });
});

/** Tarayıcıdaki GemTok TikTok Live köprüsünden durum (localhost). */
app.get("/api/v1/live/status", (req, res) => {
  const h = getLastHeartbeat();
  res.json({ ok: true, heartbeat: h });
});

app.post("/api/v1/live/heartbeat", (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  recordHeartbeat({
    client_id: String(body.client_id || "").slice(0, 64),
    state: String(body.state || "unknown").slice(0, 32),
    url: String(body.url || "").slice(0, 512),
    last_event_type: String(body.last_event_type || "").slice(0, 64),
    last_event_at: String(body.last_event_at || "").slice(0, 64),
  });
  res.json({ ok: true });
});

/** TikTok Live hediye keşfi (admin yok; yalnızca localhost + hız sınırı). */
app.post("/api/v1/live/discover-gift", (req, res) => {
  const ip = String(req.ip || req.socket?.remoteAddress || "unknown");
  if (!allowDiscover(ip)) {
    return res.status(429).json({ ok: false, message: "rate_limited" });
  }
  const b = req.body && typeof req.body === "object" ? req.body : {};
  const tiktok_id = Number(b.tiktok_id);
  if (!Number.isFinite(tiktok_id) || tiktok_id <= 0) {
    return res.status(400).json({ ok: false, message: "tiktok_id_required" });
  }
  try {
    const r = upsertLiveDiscoveredGift(db, {
      tiktok_id,
      name: b.name,
      diamond_count: b.diamond_count,
      imageUrl: b.imageUrl,
      category: b.category,
    });
    if (!r.ok) return res.status(400).json({ ok: false, message: r.reason || "upsert_failed" });
    bumpGiftsCatalog();
    res.json({ ok: true, giftsCatalogVersion, ...r });
  } catch (e) {
    res.status(400).json({ ok: false, message: e.message || "discover_failed" });
  }
});

app.get("/api/v1/games", (req, res) => {
  const rows = db.prepare(`SELECT game_id, display_name FROM game_definitions ORDER BY display_name`).all();
  res.json({ ok: true, games: rows });
});

app.get("/api/v1/games/:gameId/actions", (req, res) => {
  const gameId = String(req.params.gameId || "");
  const rows = db
    .prepare(
      `SELECT id, game_id, action_key, label, description, sort_order FROM game_actions WHERE game_id = ? ORDER BY sort_order, label`
    )
    .all(gameId);
  res.json({ ok: true, actions: rows });
});

app.post("/api/v1/games/:gameId/actions", requireAdmin, (req, res) => {
  const gameId = String(req.params.gameId || "");
  const { action_key, label, description = "", sort_order = 99 } = req.body || {};
  if (!action_key || !label) return res.status(400).json({ ok: false, message: "action_key_and_label_required" });
  try {
    db.prepare(
      `INSERT INTO game_actions (game_id, action_key, label, description, sort_order) VALUES (?,?,?,?,?)`
    ).run(gameId, String(action_key), String(label), String(description), Number(sort_order) || 0);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, message: e.message || "insert_failed" });
  }
});

app.get("/api/v1/gifts/catalog-version", (req, res) => {
  res.json({ ok: true, giftsCatalogVersion });
});

app.get("/api/v1/gifts", (req, res) => {
  const search = String(req.query.search || "").trim().toLowerCase();
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || "50"), 10) || 50));
  const offset = Math.max(0, parseInt(String(req.query.offset || "0"), 10) || 0);
  const unmappedForGame = String(req.query.unmappedForGame || "").trim();
  const sort = String(req.query.sort || "name").toLowerCase();
  const order = String(req.query.order || "asc").toLowerCase() === "desc" ? "DESC" : "ASC";
  const activeFilter = String(req.query.active || "all").toLowerCase();

  let sql = `SELECT tiktok_id, name, diamond_count, image_file, metadata_json, event_schema_version, updated_at, first_seen, last_seen, category, active FROM gifts WHERE 1=1`;
  const params = [];
  if (search) {
    sql += ` AND (LOWER(name) LIKE ? OR CAST(tiktok_id AS TEXT) LIKE ?)`;
    const like = `%${search}%`;
    params.push(like, like);
  }
  if (activeFilter === "1" || activeFilter === "true") sql += ` AND active = 1`;
  else if (activeFilter === "0" || activeFilter === "false") sql += ` AND active = 0`;
  if (unmappedForGame) {
    sql += ` AND tiktok_id NOT IN (SELECT gift_tiktok_id FROM gift_action_mappings WHERE game_id = ?)`;
    params.push(unmappedForGame);
  }
  let orderSql = ` ORDER BY name COLLATE NOCASE ASC`;
  if (sort === "diamond") orderSql = ` ORDER BY diamond_count ${order}, name COLLATE NOCASE ASC`;
  else if (sort === "last_seen") orderSql = ` ORDER BY datetime(COALESCE(last_seen, updated_at)) ${order}, tiktok_id ASC`;
  else if (sort === "first_seen") orderSql = ` ORDER BY datetime(COALESCE(first_seen, created_at)) ${order}, tiktok_id ASC`;
  else if (sort === "name" && order === "DESC") orderSql = ` ORDER BY name COLLATE NOCASE DESC`;
  sql += orderSql;
  sql += ` LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const rows = db.prepare(sql).all(...params);
  const scoped = isAdminRequest(req) ? rows : filterCatalogRowsForGames(rows);
  const deduped = dedupeCatalogGifts(scoped);
  const countRow = db.prepare(`SELECT COUNT(*) AS c FROM gifts`).get();
  res.json({
    ok: true,
    gifts: deduped.map((g) => mapGiftApiRow(g)),
    totalApprox: countRow.c,
    giftsCatalogVersion,
    limit,
    offset,
  });
});

app.get("/api/v1/gifts/:tiktokId", (req, res) => {
  const id = parseInt(String(req.params.tiktokId || ""), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false });
  const g = db
    .prepare(
      `SELECT tiktok_id, name, diamond_count, image_file, event_schema_version, metadata_json, updated_at, first_seen, last_seen, category, active FROM gifts WHERE tiktok_id = ?`,
    )
    .get(id);
  if (!g) return res.status(404).json({ ok: false, message: "not_found" });
  res.json({
    ok: true,
    gift: mapGiftApiRow(g),
  });
});

app.get("/api/v1/games/:gameId/mappings", (req, res) => {
  const gameId = String(req.params.gameId || "");
  const rows = db
    .prepare(
      `
    SELECT m.gift_tiktok_id, m.action_key, m.priority, g.name AS gift_name, g.image_file
    FROM gift_action_mappings m
    JOIN gifts g ON g.tiktok_id = m.gift_tiktok_id
    WHERE m.game_id = ?
    ORDER BY g.name COLLATE NOCASE
  `
    )
    .all(gameId);
  res.json({
    ok: true,
    mappings: rows.map((r) => ({
      ...r,
      imageUrl: r.image_file ? `/gift-images/${encodeURIComponent(r.image_file)}` : null,
    })),
  });
});

/** Tüm eşlemeler (küçük payload); hediye meta için /api/v1/gifts/:id veya sayfalı liste kullanın. */
app.get("/api/v1/games/:gameId/mappings-only", (req, res) => {
  const gameId = String(req.params.gameId || "");
  const rows = db
    .prepare(`SELECT gift_tiktok_id, action_key, priority FROM gift_action_mappings WHERE game_id = ?`)
    .all(gameId);
  res.json({ ok: true, gameId, mappings: rows });
});

app.put("/api/v1/games/:gameId/mappings/:giftTiktokId", requireAdmin, (req, res) => {
  const gameId = String(req.params.gameId || "");
  const giftTiktokId = parseInt(String(req.params.giftTiktokId || ""), 10);
  const { action_key, priority = 0 } = req.body || {};
  if (!Number.isFinite(giftTiktokId) || !action_key) {
    return res.status(400).json({ ok: false, message: "invalid_params" });
  }
  try {
    db.prepare(
      `
      INSERT INTO gift_action_mappings (gift_tiktok_id, game_id, action_key, priority)
      VALUES (?,?,?,?)
      ON CONFLICT(gift_tiktok_id, game_id) DO UPDATE SET
        action_key = excluded.action_key,
        priority = excluded.priority
    `
    ).run(giftTiktokId, gameId, String(action_key), Number(priority) || 0);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, message: e.message || "mapping_failed" });
  }
});

app.delete("/api/v1/games/:gameId/mappings/:giftTiktokId", requireAdmin, (req, res) => {
  const gameId = String(req.params.gameId || "");
  const giftTiktokId = parseInt(String(req.params.giftTiktokId || ""), 10);
  db.prepare(`DELETE FROM gift_action_mappings WHERE game_id = ? AND gift_tiktok_id = ?`).run(gameId, giftTiktokId);
  res.json({ ok: true });
});

app.post("/api/v1/gifts", requireAdmin, (req, res) => {
  const { tiktok_id, name, diamond_count = 0, image_file = "", metadata = {} } = req.body || {};
  const id = parseInt(String(tiktok_id), 10);
  if (!Number.isFinite(id) || !name) return res.status(400).json({ ok: false, message: "tiktok_id_and_name_required" });
  try {
    db.prepare(
      `
      INSERT INTO gifts (tiktok_id, name, diamond_count, image_file, metadata_json, event_schema_version, updated_at)
      VALUES (?,?,?,?,?,1,datetime('now'))
      ON CONFLICT(tiktok_id) DO UPDATE SET
        name = excluded.name,
        diamond_count = excluded.diamond_count,
        image_file = excluded.image_file,
        metadata_json = excluded.metadata_json,
        updated_at = datetime('now')
    `
    ).run(id, String(name), Math.max(0, Number(diamond_count) || 0), String(image_file), JSON.stringify(metadata));
    bumpGiftsCatalog();
    res.json({ ok: true, tiktok_id: id, giftsCatalogVersion });
  } catch (e) {
    res.status(400).json({ ok: false, message: e.message || "gift_upsert_failed" });
  }
});

app.post("/api/v1/sync/gift-list-json", requireAdmin, (req, res) => {
  const r = syncGiftsFromJson(db);
  bumpGiftsCatalog();
  res.json({ ok: true, giftsCatalogVersion, ...r });
});

app.use("/gift-images", express.static(GIFT_IMAGES_DIR, { maxAge: "1d", index: false }));

if (fs.existsSync(path.join(ADMIN_DIST, "index.html"))) {
  app.use("/admin", express.static(ADMIN_DIST, { index: "index.html" }));
  app.get(/^\/admin\/.*/, (req, res, next) => {
    if (req.path.match(/\.[a-z0-9]+$/i)) return next();
    res.sendFile(path.join(ADMIN_DIST, "index.html"));
  });
}

app.listen(PORT, "127.0.0.1", () => {
  console.log(`[gift-hub] http://127.0.0.1:${PORT}/  API + /admin`);
  if (!fs.existsSync(path.join(ADMIN_DIST, "index.html"))) {
    console.log("[gift-hub] Admin UI yok: gift-hub içinde `npm run build:admin` çalıştırın.");
  }
});
