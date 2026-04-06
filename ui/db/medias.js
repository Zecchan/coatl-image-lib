'use strict';

const path = require('path');
const fs = require('fs');
const Router = require('express').Router;
const { getDb, uid } = require('./schema');

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.avif']);

function walkImages(dir) {
  const results = [];
  function walk(current) {
    let entries;
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    for (const e of entries) {
      const full = path.join(current, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && IMAGE_EXTS.has(path.extname(e.name).toLowerCase())) results.push(full);
    }
  }
  walk(dir);
  return results;
}

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

const CONTENT_RATINGS = new Set(['general', 'sensitive', 'questionable', 'explicit']);

// Upsert tags by name, return their ids.
function upsertTags(db, names) {
  const insert = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
  const select = db.prepare('SELECT id FROM tags WHERE name = ?');
  return names.map(name => {
    insert.run(name);
    return select.get(name).id;
  });
}

// Fields exposed to the client for a media row (joined with mediasource + mediatype).
const SELECT_MEDIA = `
  SELECT
    m.uid, m.title, m.original_title, m.path, m.cover,
    m.content_rating, m.rating, m.summary,
    m.artist, m.source_url, m.series, m.page_count,
    m.developer, m.publisher, m.release_date, m.platform,
    m.duration, m.track_count,
    m.language, m.notes,
    m.created_at, m.updated_at, m.qdrant_indexed_at,
    ms.uid  AS mediasourceUid,  ms.name AS mediasourceName,
    mt.uid  AS mediatypeUid,    mt.name AS mediatypeName, mt.color AS mediatypeColor, mt.type AS mediatypeType
  FROM medias m
  JOIN mediasources ms ON ms.id = m.mediasource_id
  JOIN mediatypes  mt ON mt.id = ms.mediatype_id
`;

function attachTags(db, mediaRows) {
  const getTagsStmt = db.prepare(`
    SELECT t.name, mt.score
    FROM media_tags mt
    JOIN tags t ON t.id = mt.tag_id
    WHERE mt.media_id = (SELECT id FROM medias WHERE uid = ?)
    ORDER BY mt.score DESC
  `);
  return mediaRows.map(row => ({
    ...row,
    tags: getTagsStmt.all(row.uid),
  }));
}

// ── GET /db/medias ────────────────────────────────────────────────────────────
// Short fields that plain-text terms are matched against.
const PLAIN_FIELDS = [
  'm.title', 'm.original_title', 'm.artist', 'm.series',
  'm.developer', 'm.publisher', 'm.platform', 'm.language',
];

// Field aliases accepted in <field>:<value> tokens.
const FIELD_MAP = {
  title: 'm.title',
  original_title: 'm.original_title',
  artist: 'm.artist',
  series: 'm.series',
  developer: 'm.developer',
  publisher: 'm.publisher',
  platform: 'm.platform',
  language: 'm.language',
  rating: 'm.rating',
  content_rating: 'm.content_rating',
  source: 'ms.name',
  notes: 'm.notes',
};

const RATING_ORDER = ['general', 'sensitive', 'questionable', 'explicit'];

router.get('/', (req, res) => {
  const db = getDb();
  const q = (req.query.q || '').trim();
  const maxRating = RATING_ORDER.includes(req.query.maxRating) ? req.query.maxRating : 'explicit';
  const mtuids = req.query.mediatypeUids
    ? req.query.mediatypeUids.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 25));

  const whereClauses = [];
  const params = [];

  // ── Full-text / tag / field tokens ──────────────────────────────────────
  if (q) {
    const tokens = q.split(/\s+/).filter(Boolean);
    for (const token of tokens) {
      if (token.startsWith('-$')) {
        const tag = token.slice(2);
        whereClauses.push(
          `NOT EXISTS (SELECT 1 FROM media_tags _mt JOIN tags _t ON _t.id=_mt.tag_id WHERE _mt.media_id=m.id AND LOWER(_t.name)=LOWER(?))`
        );
        params.push(tag);
      } else if (token.startsWith('$')) {
        const tag = token.slice(1);
        whereClauses.push(
          `EXISTS (SELECT 1 FROM media_tags _mt JOIN tags _t ON _t.id=_mt.tag_id WHERE _mt.media_id=m.id AND LOWER(_t.name)=LOWER(?))`
        );
        params.push(tag);
      } else {
        const colonIdx = token.indexOf(':');
        if (colonIdx > 0) {
          const field = token.slice(0, colonIdx).toLowerCase();
          const value = token.slice(colonIdx + 1);
          const col = FIELD_MAP[field];
          if (col) {
            whereClauses.push(`LOWER(${col}) LIKE ?`);
            params.push(`%${value.toLowerCase()}%`);
          }
        } else {
          const conds = PLAIN_FIELDS.map(f => `LOWER(${f}) LIKE ?`).join(' OR ');
          whereClauses.push(`(${conds})`);
          PLAIN_FIELDS.forEach(() => params.push(`%${token.toLowerCase()}%`));
        }
      }
    }
  }

  // ── Advanced filters ─────────────────────────────────────────────────────
  if (mtuids.length) {
    whereClauses.push(`mt.uid IN (${mtuids.map(() => '?').join(',')})`);
    params.push(...mtuids);
  }

  const maxRatingIdx = RATING_ORDER.indexOf(maxRating);
  if (maxRatingIdx < RATING_ORDER.length - 1) {
    const allowed = RATING_ORDER.slice(0, maxRatingIdx + 1);
    whereClauses.push(`m.content_rating IN (${allowed.map(() => '?').join(',')})`);
    params.push(...allowed);
  }

  // ── Build query ──────────────────────────────────────────────────────────
  const FROM_JOIN = `
    FROM medias m
    JOIN mediasources ms ON ms.id = m.mediasource_id
    JOIN mediatypes  mt ON mt.id = ms.mediatype_id
  `;
  const where = whereClauses.length ? ' WHERE ' + whereClauses.join(' AND ') : '';
  const offset = (page - 1) * pageSize;

  const { total } = db.prepare(`SELECT COUNT(*) AS total ${FROM_JOIN}${where}`).get(...params);
  const rows = db.prepare(SELECT_MEDIA + where + ' ORDER BY m.created_at DESC LIMIT ? OFFSET ?')
    .all(...params, pageSize, offset);

  res.json({ total, page, pageSize, items: attachTags(db, rows) });
});

// ── GET /db/medias/:uid ───────────────────────────────────────────────────────
router.get('/:uid', (req, res) => {
  const db = getDb();
  const row = db.prepare(SELECT_MEDIA + ' WHERE m.uid = ?').get(req.params.uid);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(attachTags(db, [row])[0]);
});

// ── POST /db/medias ───────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const {
    mediasourceUid, title, original_title = '', path = '', cover = '',
    content_rating = 'general',
    rating = null, summary = '',
    artist = '', source_url = '', series = '', page_count = null,
    developer = '', publisher = '', release_date = '', platform = '',
    duration = null, track_count = null,
    language = '', notes = '',
    tags: tagList = [],
  } = req.body ?? {};

  if (!mediasourceUid) return res.status(400).json({ error: 'mediasourceUid is required' });
  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
  if (!CONTENT_RATINGS.has(content_rating))
    return res.status(400).json({ error: 'content_rating must be general|sensitive|questionable|explicit' });
  if (rating !== null && (rating < 1 || rating > 5))
    return res.status(400).json({ error: 'rating must be 1–5 or null' });

  const db = getDb();
  const source = db.prepare('SELECT id FROM mediasources WHERE uid = ?').get(mediasourceUid);
  if (!source) return res.status(404).json({ error: 'mediasource not found' });

  const newUid = uid();

  const insertMedia = db.prepare(`
    INSERT INTO medias
      (uid, mediasource_id, title, original_title, path, cover,
       content_rating, rating, summary,
       artist, source_url, series, page_count,
       developer, publisher, release_date, platform,
       duration, track_count, language, notes)
    VALUES
      (?, ?, ?, ?, ?, ?,
       ?, ?, ?,
       ?, ?, ?, ?,
       ?, ?, ?, ?,
       ?, ?, ?, ?)
  `);

  const insertMediaTag = db.prepare(
    'INSERT OR REPLACE INTO media_tags (media_id, tag_id, score) VALUES (?, ?, ?)'
  );

  const transaction = db.transaction(() => {
    insertMedia.run(
      newUid, source.id, title.trim(), original_title, path, cover,
      content_rating, rating, summary,
      artist, source_url, series, page_count,
      developer, publisher, release_date, platform,
      duration, track_count, language, notes
    );
    const mediaId = db.prepare('SELECT id FROM medias WHERE uid = ?').get(newUid).id;

    if (tagList.length) {
      const tagNames = tagList.map(t => (typeof t === 'string' ? t : t.tag));
      const tagScores = tagList.map(t => (typeof t === 'object' && t.score != null ? t.score : 0));
      const tagIds = upsertTags(db, tagNames);
      tagIds.forEach((tagId, i) => insertMediaTag.run(mediaId, tagId, tagScores[i]));
    }
  });

  try {
    transaction();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  const created = db.prepare(SELECT_MEDIA + ' WHERE m.uid = ?').get(newUid);
  res.status(201).json(attachTags(db, [created])[0]);
});

// ── PUT /db/medias/:uid ───────────────────────────────────────────────────────
router.put('/:uid', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM medias WHERE uid = ?').get(req.params.uid);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const {
    title, original_title, path, cover, content_rating, rating, summary,
    artist, source_url, series, page_count,
    developer, publisher, release_date, platform,
    duration, track_count, language, notes,
    tags: tagList,
  } = req.body ?? {};

  if (title !== undefined && !title.trim())
    return res.status(400).json({ error: 'title cannot be empty' });
  if (content_rating !== undefined && !CONTENT_RATINGS.has(content_rating))
    return res.status(400).json({ error: 'content_rating must be general|sensitive|questionable|explicit' });
  if (rating !== undefined && rating !== null && (rating < 1 || rating > 5))
    return res.status(400).json({ error: 'rating must be 1–5 or null' });

  const fields = {
    title, original_title, path, cover, content_rating, rating, summary,
    artist, source_url, series, page_count,
    developer, publisher, release_date, platform,
    duration, track_count, language, notes
  };

  const sets = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k]) => `${k} = ?`);
  const vals = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([, v]) => v);

  if (!sets.length && !tagList) return res.status(400).json({ error: 'Nothing to update' });

  const insertMediaTag = db.prepare(
    'INSERT OR REPLACE INTO media_tags (media_id, tag_id, score) VALUES (?, ?, ?)'
  );

  const transaction = db.transaction(() => {
    if (sets.length) {
      db.prepare(`UPDATE medias SET ${sets.join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE uid = ?`)
        .run(...vals, req.params.uid);
    }
    if (tagList) {
      db.prepare('DELETE FROM media_tags WHERE media_id = ?').run(existing.id);
      if (tagList.length) {
        const tagNames = tagList.map(t => (typeof t === 'string' ? t : t.tag));
        const tagScores = tagList.map(t => (typeof t === 'object' && t.score != null ? t.score : 0));
        const tagIds = upsertTags(db, tagNames);
        tagIds.forEach((tagId, i) => insertMediaTag.run(existing.id, tagId, tagScores[i]));
      }
    }
  });

  try {
    transaction();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  const updated = db.prepare(SELECT_MEDIA + ' WHERE m.uid = ?').get(req.params.uid);
  res.json(attachTags(db, [updated])[0]);
});

// ── POST /db/medias/:uid/reindex ────────────────────────────────────────────
// Responds immediately (202), then indexes images into Qdrant in the background.
router.post('/:uid/reindex', async (req, res) => {
  const db = getDb();
  const row = db.prepare(`
    SELECT m.path AS mediaPath, ms.path AS sourcePath
    FROM medias m
    JOIN mediasources ms ON ms.id = m.mediasource_id
    WHERE m.uid = ?
  `).get(req.params.uid);
  if (!row) return res.status(404).json({ error: 'Not found' });

  const absDir = path.resolve(path.join(row.sourcePath, row.mediaPath));
  const imagePaths = walkImages(absDir);
  res.status(202).json({ ok: true, queued: imagePaths.length });

  if (!imagePaths.length) return;
  const apiPort = parseInt(process.env.API_PORT) || 8000;
  try {
    const r = await fetch(`http://127.0.0.1:${apiPort}/index_media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ media_uid: req.params.uid, image_paths: imagePaths }),
    });
    if (r.ok) {
      db.prepare("UPDATE medias SET qdrant_indexed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE uid = ?")
        .run(req.params.uid);
    }
  } catch (e) {
    console.warn('[qdrant] reindex failed:', e.message);
  }
});

// ── DELETE /db/medias/:uid ────────────────────────────────────────────────────
router.delete('/:uid', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT id FROM medias WHERE uid = ?').get(req.params.uid);
  if (!row) return res.status(404).json({ error: 'Not found' });
  // media_tags cascade on delete
  db.prepare('DELETE FROM medias WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

module.exports = router;
