'use strict';

const Router = require('express').Router;
const { getDb } = require('./schema');

const router = Router();

const RATING_ORDER = ['general', 'sensitive', 'questionable', 'explicit'];

// Mirrors SELECT_MEDIA in medias.js — must stay in sync.
const SELECT_MEDIA = `
  SELECT
    m.uid, m.title, m.original_title, m.path, m.cover,
    m.content_rating, m.rating, m.summary,
    m.artist, m.source_url, m.series, m.page_count,
    m.developer, m.publisher, m.release_date, m.platform,
    m.duration, m.track_count,
    m.language, m.notes,
    m.is_favorite,
    m.created_at, m.updated_at, m.qdrant_indexed_at,
    ms.uid  AS mediasourceUid,  ms.name AS mediasourceName, ms.path AS mediasourcePath,
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

/**
 * Reciprocal Rank Fusion (RRF) merge of two ranked hit lists.
 * Each list is [{media_uid, ...}] sorted by score descending (rank 0 = best).
 * Returns a Map<media_uid, { rrfScore, imageHit?, textHit? }> sorted by rrfScore desc.
 * k=60 is the standard RRF constant.
 */
function rrfMerge(imageHits, textHits, k = 60) {
  const scores = new Map(); // media_uid → { rrfScore, imageHit, textHit }

  function addList(hits, field) {
    hits.forEach((hit, rank) => {
      const uid = hit.media_uid;
      if (!scores.has(uid)) scores.set(uid, { rrfScore: 0, imageHit: null, textHit: null });
      const entry = scores.get(uid);
      entry.rrfScore += 1 / (k + rank);
      entry[field] = hit;
    });
  }

  addList(imageHits, 'imageHit');
  addList(textHits, 'textHit');

  return [...scores.entries()]
    .sort((a, b) => b[1].rrfScore - a[1].rrfScore)
    .map(([media_uid, entry]) => ({ media_uid, ...entry }));
}

/**
 * Pre-filter: query SQLite for all media_uids that satisfy the active filters.
 * Returns null  → no filters active, Qdrant should run unfiltered.
 * Returns []    → filters active but nothing matches; caller should short-circuit.
 * Returns [...] → the set of allowed media_uids to pass to Qdrant.
 */
function getAllowedUids(db, { mediatypeUids = [], maxRating = 'explicit', favoritesOnly = false, minQuality = 0 } = {}) {
  const hasFilters = mediatypeUids.length > 0 ||
    maxRating !== 'explicit' ||
    favoritesOnly ||
    minQuality > 0;
  if (!hasFilters) return null;

  const whereClauses = [];
  const params = [];

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

  if (favoritesOnly) {
    whereClauses.push('m.is_favorite = 1');
  }

  if (minQuality > 0) {
    whereClauses.push('COALESCE(m.rating, 0) >= ?');
    params.push(minQuality);
  }

  const where = whereClauses.length ? ' WHERE ' + whereClauses.join(' AND ') : '';
  const rows = db.prepare(`
    SELECT DISTINCT m.uid
    FROM medias m
    JOIN mediasources ms ON ms.id = m.mediasource_id
    JOIN mediatypes  mt ON mt.id = ms.mediatype_id
    ${where}
  `).all(...params);
  return rows.map(r => r.uid);
}

// POST /db/search
// Body: { text, limit?, mediatypeUids?, maxRating?, favoritesOnly?, minQuality? }
// Pre-filters in SQLite → passes allowed_uids to Python → Qdrant scores within that set.
// Returns { results: [...media, semanticScore, matchedTrack?] }.
router.post('/', async (req, res) => {
  const { text, limit = 20, mediatypeUids = [], maxRating = 'explicit', favoritesOnly = false, minQuality = 0 } = req.body ?? {};
  if (!text?.trim()) return res.status(400).json({ error: 'text is required' });

  const db = getDb();
  const allowedUids = getAllowedUids(db, { mediatypeUids, maxRating, favoritesOnly, minQuality });
  if (allowedUids !== null && allowedUids.length === 0) return res.json({ results: [] });

  const apiPort = parseInt(process.env.API_PORT) || 8000;

  // Run both searches in parallel; text search failure is non-fatal
  const [imageResult, textResult] = await Promise.allSettled([
    fetch(`http://127.0.0.1:${apiPort}/search_images`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.trim(), limit, allowed_uids: allowedUids }),
    }).then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))),
    fetch(`http://127.0.0.1:${apiPort}/search_text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.trim(), limit, allowed_uids: allowedUids }),
    }).then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))),
  ]);

  if (imageResult.status === 'rejected') {
    return res.status(502).json({ error: `Could not reach Python API: ${imageResult.reason?.message}` });
  }

  const imageHits = imageResult.value?.results ?? [];   // [{media_uid, score, image_path}]
  const textHits = textResult.status === 'fulfilled'
    ? (textResult.value?.results ?? [])                 // [{audiofile_uid, media_uid, score}]
    : [];

  if (!imageHits.length && !textHits.length) return res.json({ results: [] });

  // RRF merge
  const merged = rrfMerge(imageHits, textHits);

  // Build lookup for audiofile titles and document paths from textHits
  const audiofileUidByMedia = {};  // media_uid → audiofile_uid (best match)
  const documentPathByMedia = {};  // media_uid → document_path (best match)
  for (const h of textHits) {
    if (h.media_uid && h.audiofile_uid && !audiofileUidByMedia[h.media_uid]) {
      audiofileUidByMedia[h.media_uid] = h.audiofile_uid;
    }
    if (h.media_uid && h.document_path && !documentPathByMedia[h.media_uid]) {
      documentPathByMedia[h.media_uid] = h.document_path;
    }
  }

  const mergedUids = merged.map(m => m.media_uid);

  // Hydrate from SQLite — Qdrant already applied the filters, just join by uid
  const rows = db.prepare(SELECT_MEDIA + ` WHERE m.uid IN (${mergedUids.map(() => '?').join(',')})`)
    .all(...mergedUids);
  const withTags = attachTags(db, rows);

  // Build score maps — RRF used for dedup/merge, raw score used for final display order
  const rrfScoreMap = Object.fromEntries(merged.map(m => [m.media_uid, m.rrfScore]));
  const rawScoreMap = Object.fromEntries(merged.map(m => [
    m.media_uid,
    Math.max(m.imageHit?.score ?? 0, m.textHit?.score ?? 0),
  ]));
  withTags.sort((a, b) => (rawScoreMap[b.uid] ?? 0) - (rawScoreMap[a.uid] ?? 0));

  // Attach audiofile title or document filename for text matches
  const afStmt = db.prepare('SELECT title, filename FROM audiofiles WHERE uid = ?');
  const results = withTags.map(r => {
    const afUid = audiofileUidByMedia[r.uid];
    let matchedTrack = null;
    if (afUid) {
      const af = afStmt.get(afUid);
      if (af) matchedTrack = af.title || af.filename;
    } else if (documentPathByMedia[r.uid]) {
      const { basename } = require('path');
      matchedTrack = basename(documentPathByMedia[r.uid]);
    }
    return { ...r, semanticScore: rawScoreMap[r.uid] ?? 0, matchedTrack };
  });

  res.json({ results });
});

// POST /db/search/by-image
// Body: { image_base64, limit?, mediatypeUids?, maxRating?, favoritesOnly?, minQuality? }
// Pre-filters in SQLite → passes allowed_uids to Python → Qdrant scores within that set.
router.post('/by-image', async (req, res) => {
  const { image_base64, limit = 20, mediatypeUids = [], maxRating = 'explicit', favoritesOnly = false, minQuality = 0 } = req.body ?? {};
  if (!image_base64?.trim()) return res.status(400).json({ error: 'image_base64 is required' });

  const db = getDb();
  const allowedUids = getAllowedUids(db, { mediatypeUids, maxRating, favoritesOnly, minQuality });
  if (allowedUids !== null && allowedUids.length === 0) return res.json({ results: [] });

  const apiPort = parseInt(process.env.API_PORT) || 8000;
  let hits;
  try {
    const r = await fetch(`http://127.0.0.1:${apiPort}/search_by_image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64, limit, allowed_uids: allowedUids }),
    });
    if (!r.ok) return res.status(502).json({ error: 'Python API error' });
    const data = await r.json();
    hits = data.results;
  } catch (e) {
    return res.status(502).json({ error: `Could not reach Python API: ${e.message}` });
  }

  if (!hits.length) return res.json({ results: [] });

  const scoreMap = {};
  const uids = hits.map(h => { scoreMap[h.media_uid] = h.score; return h.media_uid; });

  // Hydrate from SQLite — Qdrant already applied the filters, just join by uid
  const rows = db.prepare(SELECT_MEDIA + ` WHERE m.uid IN (${uids.map(() => '?').join(',')})`)
    .all(...uids);
  const withTags = attachTags(db, rows);

  const scoreOrder = Object.fromEntries(uids.map((u, i) => [u, i]));
  withTags.sort((a, b) => (scoreOrder[a.uid] ?? 999) - (scoreOrder[b.uid] ?? 999));
  const results = withTags.map(r => ({ ...r, semanticScore: scoreMap[r.uid] ?? 0 }));

  res.json({ results });
});

module.exports = router;
