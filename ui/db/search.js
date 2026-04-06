'use strict';

const Router = require('express').Router;
const { getDb } = require('./schema');

const router = Router();

const RATING_ORDER = ['general', 'sensitive', 'questionable', 'explicit'];

// Mirrors SELECT_MEDIA in medias.js — must include qdrant_indexed_at.
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
  const stmt = db.prepare(`
    SELECT t.name, mt.score
    FROM media_tags mt
    JOIN tags t ON t.id = mt.tag_id
    WHERE mt.media_id = (SELECT id FROM medias WHERE uid = ?)
    ORDER BY mt.score DESC
  `);
  return mediaRows.map(row => ({ ...row, tags: stmt.all(row.uid) }));
}

// POST /db/search
// Body: { text, limit?, mediatypeUids?, maxRating? }
// Calls Python /search_images, then hydrates full media rows from SQLite
// (preserving Qdrant score order) and returns { results: [...media, semanticScore] }.
router.post('/', async (req, res) => {
  const { text, limit = 20, mediatypeUids = [], maxRating = 'explicit' } = req.body ?? {};
  if (!text?.trim()) return res.status(400).json({ error: 'text is required' });

  const apiPort = parseInt(process.env.API_PORT) || 8000;
  let hits;
  try {
    const r = await fetch(`http://127.0.0.1:${apiPort}/search_images`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.trim(), limit }),
    });
    if (!r.ok) return res.status(502).json({ error: 'Python API error' });
    const data = await r.json();
    hits = data.results; // [{media_uid, score, image_path}]
  } catch (e) {
    return res.status(502).json({ error: `Could not reach Python API: ${e.message}` });
  }

  if (!hits.length) return res.json({ results: [] });

  const db = getDb();
  const scoreMap = {};
  const uids = hits.map(h => { scoreMap[h.media_uid] = h.score; return h.media_uid; });

  // Fetch full rows, optionally filtered by mediatype / content rating
  const whereClauses = [`m.uid IN (${uids.map(() => '?').join(',')})`];
  const params = [...uids];

  if (mediatypeUids.length) {
    whereClauses.push(`mt.uid IN (${mediatypeUids.map(() => '?').join(',')})`);
    params.push(...mediatypeUids);
  }

  const maxRatingIdx = RATING_ORDER.indexOf(maxRating);
  if (maxRatingIdx >= 0 && maxRatingIdx < RATING_ORDER.length - 1) {
    const allowed = RATING_ORDER.slice(0, maxRatingIdx + 1);
    whereClauses.push(`m.content_rating IN (${allowed.map(() => '?').join(',')})`);
    params.push(...allowed);
  }

  const rows = db.prepare(SELECT_MEDIA + ' WHERE ' + whereClauses.join(' AND ')).all(...params);
  const withTags = attachTags(db, rows);

  // Re-sort by original Qdrant score order and attach semanticScore
  const scoreOrder = Object.fromEntries(uids.map((u, i) => [u, i]));
  withTags.sort((a, b) => (scoreOrder[a.uid] ?? 999) - (scoreOrder[b.uid] ?? 999));
  const results = withTags.map(r => ({ ...r, semanticScore: scoreMap[r.uid] ?? 0 }));

  res.json({ results });
});

// POST /db/search/by-image
// Body: { image_base64, limit?, mediatypeUids?, maxRating? }
// The browser must pre-resize to ≤512px before encoding — keeps payload tiny regardless of source size.
router.post('/by-image', async (req, res) => {
  const { image_base64, limit = 20, mediatypeUids = [], maxRating = 'explicit' } = req.body ?? {};
  if (!image_base64?.trim()) return res.status(400).json({ error: 'image_base64 is required' });

  const apiPort = parseInt(process.env.API_PORT) || 8000;
  let hits;
  try {
    const r = await fetch(`http://127.0.0.1:${apiPort}/search_by_image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64, limit }),
    });
    if (!r.ok) return res.status(502).json({ error: 'Python API error' });
    const data = await r.json();
    hits = data.results;
  } catch (e) {
    return res.status(502).json({ error: `Could not reach Python API: ${e.message}` });
  }

  if (!hits.length) return res.json({ results: [] });

  const db = getDb();
  const scoreMap = {};
  const uids = hits.map(h => { scoreMap[h.media_uid] = h.score; return h.media_uid; });

  const whereClauses = [`m.uid IN (${uids.map(() => '?').join(',')})`];
  const params = [...uids];

  if (mediatypeUids.length) {
    whereClauses.push(`mt.uid IN (${mediatypeUids.map(() => '?').join(',')})`);
    params.push(...mediatypeUids);
  }

  const maxRatingIdx = RATING_ORDER.indexOf(maxRating);
  if (maxRatingIdx >= 0 && maxRatingIdx < RATING_ORDER.length - 1) {
    const allowed = RATING_ORDER.slice(0, maxRatingIdx + 1);
    whereClauses.push(`m.content_rating IN (${allowed.map(() => '?').join(',')})`);
    params.push(...allowed);
  }

  const rows = db.prepare(SELECT_MEDIA + ' WHERE ' + whereClauses.join(' AND ')).all(...params);
  const withTags = attachTags(db, rows);

  const scoreOrder = Object.fromEntries(uids.map((u, i) => [u, i]));
  withTags.sort((a, b) => (scoreOrder[a.uid] ?? 999) - (scoreOrder[b.uid] ?? 999));
  const results = withTags.map(r => ({ ...r, semanticScore: scoreMap[r.uid] ?? 0 }));

  res.json({ results });
});

module.exports = router;
