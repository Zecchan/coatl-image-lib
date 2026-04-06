'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

// ── Database file location ──────────────────────────────────────────────────
// Prefer path from serverconfig.json; fall back to ./data/coatl.db
function getDbPath() {
  const cfgPath = path.join(__dirname, '..', 'serverconfig.json');
  if (fs.existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      if (cfg.sqlite?.path) return path.resolve(__dirname, '..', cfg.sqlite.path);
    } catch { /* fall through */ }
  }
  return path.join(__dirname, '..', 'data', 'coatl.db');
}

// ── Open (or create) the database ──────────────────────────────────────────
function openDb() {
  const dbPath = getDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  return db;
}

// ── Schema ──────────────────────────────────────────────────────────────────
function applySchema(db) {
  db.exec(`
    -- ── mediatypes ──────────────────────────────────────────────────────────

    -- Defines categories of media collections.
    -- The 'type' column is an internal integer enum (see docs/MEDIATYPES_ENUM.md).
    CREATE TABLE IF NOT EXISTS mediatypes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      uid         TEXT    NOT NULL UNIQUE,       -- 16-char random hex, exposed to client
      name        TEXT    NOT NULL,
      description TEXT    NOT NULL DEFAULT '',
      color       TEXT    NOT NULL DEFAULT '#7c5cbf',
      type        INTEGER NOT NULL DEFAULT 1     -- see MEDIATYPES_ENUM.md
    );

    -- ── mediasources ────────────────────────────────────────────────────────
    -- A root folder containing media files of a given type.
    -- path is the filesystem root; all media under this source is relative to it.
    CREATE TABLE IF NOT EXISTS mediasources (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      uid             TEXT    NOT NULL UNIQUE,   -- 16-char random hex, exposed to client
      name            TEXT    NOT NULL,
      description     TEXT    NOT NULL DEFAULT '',
      path            TEXT    NOT NULL,
      mediatype_id    INTEGER NOT NULL REFERENCES mediatypes(id) ON DELETE RESTRICT
    );

    -- ── medias ──────────────────────────────────────────────────────────────
    -- A single catalogued media entry (e.g. an image collection, game, album).
    -- media type is resolved through the joined mediasource → mediatype.
    CREATE TABLE IF NOT EXISTS medias (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      uid             TEXT    NOT NULL UNIQUE,
      mediasource_id  INTEGER NOT NULL REFERENCES mediasources(id) ON DELETE RESTRICT,

      -- Core
      title           TEXT    NOT NULL,
      original_title  TEXT    NOT NULL DEFAULT '',
      path            TEXT    NOT NULL DEFAULT '',  -- relative folder path under mediasource root
      cover           TEXT    NOT NULL DEFAULT '',  -- cover image: relative to path, or abs, or http
      content_rating  TEXT    NOT NULL DEFAULT 'general', -- general|sensitive|questionable|explicit
      rating          INTEGER          DEFAULT NULL,       -- 1-5 quality stars
      summary         TEXT    NOT NULL DEFAULT '',

      -- Image collection / illustration / manga
      artist          TEXT    NOT NULL DEFAULT '',
      source_url      TEXT    NOT NULL DEFAULT '',
      series          TEXT    NOT NULL DEFAULT '',
      page_count      INTEGER          DEFAULT NULL,

      -- Game
      developer       TEXT    NOT NULL DEFAULT '',
      publisher       TEXT    NOT NULL DEFAULT '',
      release_date    TEXT    NOT NULL DEFAULT '',  -- ISO date string
      platform        TEXT    NOT NULL DEFAULT '',

      -- Video / Music
      duration        INTEGER          DEFAULT NULL,  -- seconds
      track_count     INTEGER          DEFAULT NULL,

      -- Common
      language        TEXT    NOT NULL DEFAULT '',
      notes           TEXT    NOT NULL DEFAULT '',

      created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    -- ── tags ────────────────────────────────────────────────────────────────
    -- Tag vocabulary shared across all medias.
    CREATE TABLE IF NOT EXISTS tags (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT    NOT NULL UNIQUE
    );

    -- ── media_tags ───────────────────────────────────────────────────────────
    -- Connects a media entry to its tags, with a confidence score (0.0–1.0).
    CREATE TABLE IF NOT EXISTS media_tags (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      media_id INTEGER NOT NULL REFERENCES medias(id) ON DELETE CASCADE,
      tag_id   INTEGER NOT NULL REFERENCES tags(id)   ON DELETE CASCADE,
      score    REAL    NOT NULL DEFAULT 0.0,
      UNIQUE(media_id, tag_id)
    );
  `);

  // ── Migrations ──────────────────────────────────────────────────────────────
  // ALTER TABLE does not support IF NOT EXISTS; ignore error if column exists.
  try { db.exec('ALTER TABLE medias ADD COLUMN qdrant_indexed_at TEXT DEFAULT NULL'); } catch { }
  try { db.exec('ALTER TABLE audiofiles ADD COLUMN qdrant_indexed_at TEXT DEFAULT NULL'); } catch { }

  // audiofiles: individual audio tracks within a music collection (type 3)
  db.exec(`
    CREATE TABLE IF NOT EXISTS audiofiles (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      uid             TEXT    NOT NULL UNIQUE,       -- 16-char random hex
      media_id        INTEGER NOT NULL REFERENCES medias(id) ON DELETE CASCADE,

      filename        TEXT    NOT NULL,              -- on-disk filename (relative to media folder)
      title           TEXT    NOT NULL DEFAULT '',   -- display title (user-editable)
      artist          TEXT    NOT NULL DEFAULT '',   -- track-level artist override
      album           TEXT    NOT NULL DEFAULT '',
      track_number    INTEGER          DEFAULT NULL,
      disc_number     INTEGER          DEFAULT NULL,
      duration        INTEGER          DEFAULT NULL, -- seconds
      lyrics          TEXT    NOT NULL DEFAULT '',   -- full lyrics text

      created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);
}

// ── UID helper ───────────────────────────────────────────────────────────────
function uid() {
  return crypto.randomBytes(8).toString('hex'); // 8 bytes → 16 hex chars
}

// ── Singleton ────────────────────────────────────────────────────────────────
let _db = null;
function getDb() {
  if (!_db) _db = openDb();
  return _db;
}

module.exports = { getDb, uid };
