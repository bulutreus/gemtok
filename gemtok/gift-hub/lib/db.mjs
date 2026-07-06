/**
 * SQLite şema + tohum (tek kaynak: sıra/gift-images/gift-list.json).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import {
  buildAllowIdSetFromGiftList,
  filterCatalogGifts,
  hasForeignLocaleName,
  loadTrAllowIdsFromJson,
  invalidateTrAllowIdsCache,
} from "./giftCatalogFilter.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const HUB_ROOT = path.resolve(__dirname, "..");
export const REPO_ROOT = path.resolve(HUB_ROOT, "..");
export const DATA_DIR = path.join(HUB_ROOT, "data");
export const DB_PATH = path.join(DATA_DIR, "gifts.sqlite");
export const GIFT_LIST_JSON = path.join(REPO_ROOT, "sıra", "gift-images", "gift-list.json");

const GAME_SEED = [
  { game_id: "warFront", display_name: "WarFront Arena" },
  { game_id: "arenaBattle", display_name: "Arena Battle" },
  { game_id: "countryBirds", display_name: "Country Birds" },
  { game_id: "vote5", display_name: "Pillar War" },
  { game_id: "arena3", display_name: "Arena 3-10" },
  { game_id: "arena5gen", display_name: "Arena 5 Gen" },
  { game_id: "generic", display_name: "Genel / gelecek oyunlar" },
];

const ACTION_SEED = [
  ["warFront", "default", "Varsayılan hediye", "TikTok hediye olayı — oyun içi varsayılan işleyici", 0],
  ["warFront", "team_boost", "Takım güçlendirme", "Takım can / güç buff", 10],
  ["warFront", "ability_trigger", "Yetenek tetikle", "Özel yetenek / ulti", 20],
  ["arenaBattle", "default", "Varsayılan arena", "Arena Battle varsayılan", 0],
  ["arenaBattle", "score_big", "Büyük skor", "Yüksek jetonlu hediye", 10],
  ["countryBirds", "default", "Varsayılan kuş", "Sapan / takım hediyesi", 0],
  ["countryBirds", "team_red", "Kırmızı takım", "Takım eşlemesi", 10],
  ["countryBirds", "team_blue", "Mavi takım", "Takım eşlemesi", 20],
  ["vote5", "default", "Varsayılan sütun", "İlk eşleşen sütun", 0],
  ["vote5", "column_1", "Sütun 1", "", 10],
  ["vote5", "column_2", "Sütun 2", "", 20],
  ["vote5", "column_3", "Sütun 3", "", 30],
  ["vote5", "column_4", "Sütun 4", "", 40],
  ["vote5", "column_5", "Sütun 5", "", 50],
  ["arena3", "default", "Skor varsayılan", "Oyuncu slotu / skor", 0],
  ["arena5gen", "default", "Skor varsayılan", "Eşlenmeyen hediye: ilk aktif oyuncu (gift hub)", 0],
  ["arena5gen", "fb", "Oyuncu 1 (fb)", "Gift hub → takım", 10],
  ["arena5gen", "amed", "Oyuncu 2 (amed)", "Gift hub → takım", 20],
  ["arena5gen", "bjk", "Oyuncu 3 (bjk)", "Gift hub → takım", 30],
  ["arena5gen", "gs", "Oyuncu 4 (gs)", "Gift hub → takım", 40],
  ["arena5gen", "ts", "Oyuncu 5 (ts)", "Gift hub → takım", 50],
  ["arena5gen", "p6", "Oyuncu 6 (p6)", "Gift hub → takım", 60],
  ["arena5gen", "p7", "Oyuncu 7 (p7)", "Gift hub → takım", 70],
  ["arena5gen", "p8", "Oyuncu 8 (p8)", "Gift hub → takım", 80],
  ["arena5gen", "p9", "Oyuncu 9 (p9)", "Gift hub → takım", 90],
  ["arena5gen", "p10", "Oyuncu 10 (p10)", "Gift hub → takım", 100],
  ["generic", "forward_event", "Ham olayı ilet", "Gelecek TikTok Live olayları için köprü", 0],
];

function giftColumnNames(db) {
  return db.prepare(`PRAGMA table_info(gifts)`).all().map((c) => c.name);
}

/** Şema genişletme: canlı keşif + admin sıralama alanları */
export function migrateGiftsSchema(db) {
  const have = new Set(giftColumnNames(db));
  const alters = [
    ["first_seen", `ALTER TABLE gifts ADD COLUMN first_seen TEXT`],
    ["last_seen", `ALTER TABLE gifts ADD COLUMN last_seen TEXT`],
    ["category", `ALTER TABLE gifts ADD COLUMN category TEXT NOT NULL DEFAULT ''`],
    ["active", `ALTER TABLE gifts ADD COLUMN active INTEGER NOT NULL DEFAULT 1`],
  ];
  for (const [col, sql] of alters) {
    if (!have.has(col)) {
      db.exec(sql);
      have.add(col);
    }
  }
  db.exec(`
    UPDATE gifts SET first_seen = COALESCE(first_seen, created_at, datetime('now')) WHERE first_seen IS NULL OR first_seen = '';
    UPDATE gifts SET last_seen = COALESCE(last_seen, updated_at, datetime('now')) WHERE last_seen IS NULL OR last_seen = '';
    UPDATE gifts SET active = 1 WHERE active IS NULL;
  `);
}

export function openDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS gifts (
      tiktok_id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      diamond_count INTEGER NOT NULL DEFAULT 0,
      image_file TEXT,
      metadata_json TEXT,
      event_schema_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS game_definitions (
      game_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS game_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id TEXT NOT NULL,
      action_key TEXT NOT NULL,
      label TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      UNIQUE (game_id, action_key),
      FOREIGN KEY (game_id) REFERENCES game_definitions(game_id)
    );
    CREATE TABLE IF NOT EXISTS gift_action_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gift_tiktok_id INTEGER NOT NULL,
      game_id TEXT NOT NULL,
      action_key TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (gift_tiktok_id, game_id),
      FOREIGN KEY (gift_tiktok_id) REFERENCES gifts(tiktok_id),
      FOREIGN KEY (game_id) REFERENCES game_definitions(game_id)
    );
    CREATE INDEX IF NOT EXISTS idx_mappings_game ON gift_action_mappings(game_id);
    CREATE INDEX IF NOT EXISTS idx_gifts_name ON gifts(name);
  `);
  migrateGiftsSchema(db);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_gifts_last_seen ON gifts(last_seen);
    CREATE INDEX IF NOT EXISTS idx_gifts_diamond ON gifts(diamond_count);
  `);
  return db;
}

export function seedGamesAndActions(db) {
  const insG = db.prepare(
    `INSERT OR IGNORE INTO game_definitions (game_id, display_name) VALUES (?, ?)`
  );
  const insA = db.prepare(
    `INSERT OR IGNORE INTO game_actions (game_id, action_key, label, description, sort_order) VALUES (?,?,?,?,?)`
  );
  for (const g of GAME_SEED) insG.run(g.game_id, g.display_name);
  for (const [game_id, action_key, label, description, sort_order] of ACTION_SEED) {
    insA.run(game_id, action_key, label, description, sort_order);
  }
}

export function syncGiftsFromJson(db) {
  if (!fs.existsSync(GIFT_LIST_JSON)) {
    console.warn("[gift-hub] gift-list.json bulunamadı:", GIFT_LIST_JSON);
    return { inserted: 0, skipped: 0, warning: "gift_list_missing" };
  }
  const raw = fs.readFileSync(GIFT_LIST_JSON, "utf8");
  const arr = JSON.parse(raw);
  if (!Array.isArray(arr)) return { inserted: 0, skipped: 0 };
  const filtered = filterCatalogGifts(arr);
  const allowIds = buildAllowIdSetFromGiftList(filtered);
  invalidateTrAllowIdsCache();
  loadTrAllowIdsFromJson(GIFT_LIST_JSON);
  const upsert = db.prepare(`
    INSERT INTO gifts (tiktok_id, name, diamond_count, image_file, metadata_json, event_schema_version, first_seen, last_seen, category, active, updated_at)
    VALUES (@tiktok_id, @name, @diamond_count, @image_file, @metadata_json, 1, datetime('now'), datetime('now'), '', 1, datetime('now'))
    ON CONFLICT(tiktok_id) DO UPDATE SET
      name = excluded.name,
      diamond_count = excluded.diamond_count,
      image_file = excluded.image_file,
      metadata_json = excluded.metadata_json,
      first_seen = COALESCE(gifts.first_seen, excluded.first_seen),
      last_seen = datetime('now'),
      updated_at = datetime('now')
  `);
  let n = 0;
  const tx = db.transaction((rows) => {
    for (const row of rows) {
      const tiktok_id = Number(row.code);
      if (!Number.isFinite(tiktok_id)) continue;
      upsert.run({
        tiktok_id,
        name: String(row.name || "").trim() || `Gift ${tiktok_id}`,
        diamond_count: Math.max(0, Math.floor(Number(row.coins) || 0)),
        image_file: String(row.file || "").trim(),
        metadata_json: JSON.stringify({
          source: "sıra/gift-images/gift-list.json",
          original: row,
        }),
      });
      n++;
    }
  });
  tx(filtered);
  const deactivate = db.prepare(`UPDATE gifts SET active = 0, updated_at = datetime('now') WHERE tiktok_id = ?`);
  const activate = db.prepare(`UPDATE gifts SET active = 1, updated_at = datetime('now') WHERE tiktok_id = ?`);
  const allIds = db.prepare(`SELECT tiktok_id FROM gifts`).all();
  for (const row of allIds) {
    if (allowIds.has(row.tiktok_id)) activate.run(row.tiktok_id);
    else deactivate.run(row.tiktok_id);
  }
  return { inserted: n, total: filtered.length, deactivated: allIds.length - allowIds.size };
}

/**
 * TikTok Live akışından gelen hediye keşfi (admin gerektirmez; localhost hız sınırı server.js'de).
 * Oluşturur veya günceller; first_seen / last_seen ve meta.discoveredImageUrl tutar.
 */
export function upsertLiveDiscoveredGift(db, payload) {
  const id = Math.floor(Number(payload.tiktok_id));
  if (!Number.isFinite(id) || id <= 0) return { ok: false, reason: "bad_id" };
  const nameIn = String(payload.name || "").trim().slice(0, 200);
  const incD = Math.floor(Number(payload.diamond_count));
  const imageUrl = String(payload.imageUrl || "").trim().slice(0, 2000);
  const categoryIn = String(payload.category || "").trim().slice(0, 120);
  const now = new Date().toISOString();

  const row = db
    .prepare(
      `SELECT tiktok_id, name, diamond_count, image_file, metadata_json, first_seen, last_seen, category, active FROM gifts WHERE tiktok_id = ?`,
    )
    .get(id);

  const allowIds = loadTrAllowIdsFromJson(GIFT_LIST_JSON);
  if (!row && !allowIds.has(id)) {
    return { ok: false, reason: "not_in_tr_catalog" };
  }
  if (!row && hasForeignLocaleName(nameIn)) {
    return { ok: false, reason: "foreign_name" };
  }

  let meta = {};
  if (row?.metadata_json) {
    try {
      meta = JSON.parse(row.metadata_json);
      if (!meta || typeof meta !== "object") meta = {};
    } catch {
      meta = {};
    }
  }
  meta.lastSeen = now;
  meta.liveDiscovery = true;
  if (imageUrl) meta.discoveredImageUrl = imageUrl;

  const nameFinal = nameIn || String(row?.name || `Gift ${id}`).trim().slice(0, 200);
  const dc =
    Number.isFinite(incD) && incD > 0
      ? Math.max(0, incD)
      : Math.max(0, Math.floor(Number(row?.diamond_count) || 0));
  const imageKeep = String(row?.image_file || "").trim();

  let prevDiscovered = "";
  try {
    const pm = JSON.parse(row?.metadata_json || "{}");
    if (pm && typeof pm.discoveredImageUrl === "string") prevDiscovered = pm.discoveredImageUrl;
  } catch {
    prevDiscovered = "";
  }
  const nameChanged = !!row && nameFinal !== String(row.name || "").trim();
  const diamondChanged = !!row && Number(row.diamond_count) !== dc;
  const imageChanged = !!imageUrl && imageUrl !== prevDiscovered;

  if (!row) {
    db.prepare(
      `INSERT INTO gifts (tiktok_id, name, diamond_count, image_file, metadata_json, event_schema_version, first_seen, last_seen, category, active, updated_at)
       VALUES (?,?,?,?,?,1,?,?,?,?,datetime('now'))`,
    ).run(
      id,
      nameFinal,
      dc,
      "",
      JSON.stringify(meta),
      now,
      now,
      categoryIn || "",
      1,
    );
    return { ok: true, tiktok_id: id, created: true, updated: false, changed: true };
  }

  const catKeep = categoryIn || String(row.category || "").trim() || "";

  db.prepare(
    `UPDATE gifts SET
      name = ?,
      diamond_count = ?,
      image_file = ?,
      metadata_json = ?,
      last_seen = ?,
      category = CASE WHEN ? != '' THEN ? ELSE category END,
      updated_at = datetime('now')
     WHERE tiktok_id = ?`,
  ).run(nameFinal, dc, imageKeep, JSON.stringify(meta), now, categoryIn, categoryIn, id);

  const changed = !!(nameChanged || diamondChanged || imageChanged);
  return {
    ok: true,
    tiktok_id: id,
    created: false,
    updated: true,
    changed,
    nameChanged,
    diamondChanged,
    imageChanged,
  };
}

export function initDatabase(db) {
  seedGamesAndActions(db);
  return syncGiftsFromJson(db);
}
