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

// POST /db/search
// Body: { text, limit?, mediatypeUids?, maxRating? }
// Calls Python /search_images AND /search_text in parallel, merges with RRF,
// then hydrates full media rows from SQLite.
// Returns { results: [...media, semanticScore, matchedTrack?] }.
router.post('/', async (req, res) => {
  const { text, limit = 20, mediatypeUids = [], maxRating = 'explicit' } = req.body ?? {};
  if (!text?.trim()) return res.status(400).json({ error: 'text is required' });

  const apiPort = parseInt(process.env.API_PORT) || 8000;

  // Run both searches in parallel; text search failure is non-fatal
  const [imageResult, textResult] = await Promise.allSettled([
    fetch(`http://127.0.0.1:${apiPort}/search_images`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.trim(), limit }),
    }).then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))),
    fetch(`http://127.0.0.1:${apiPort}/search_text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.trim(), limit }),
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

  // Build lookup for audiofile titles from textHits
  const audiofileUidByMedia = {};  // media_uid → audiofile_uid (best match)
  for (const h of textHits) {
    if (h.media_uid && h.audiofile_uid && !audiofileUidByMedia[h.media_uid]) {
      audiofileUidByMedia[h.media_uid] = h.audiofile_uid;
    }
  }

  const db = getDb();
  const mergedUids = merged.map(m => m.media_uid);

  // Fetch full rows, optionally filtered by mediatype / content rating
  const whereClauses = [`m.uid IN (${mergedUids.map(() => '?').join(',')})`];
  const params = [...mergedUids];

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

  // Build score maps — sort by RRF, display best raw cosine score
  const rrfScoreMap = Object.fromEntries(merged.map(m => [m.media_uid, m.rrfScore]));
  const rawScoreMap = Object.fromEntries(merged.map(m => [
    m.media_uid,
    Math.max(m.imageHit?.score ?? 0, m.textHit?.score ?? 0),
  ]));
  withTags.sort((a, b) => (rrfScoreMap[b.uid] ?? 0) - (rrfScoreMap[a.uid] ?? 0));

  // Attach audiofile title for music matches
  const afStmt = db.prepare('SELECT title, filename FROM audiofiles WHERE uid = ?');
  const results = withTags.map(r => {
    const afUid = audiofileUidByMedia[r.uid];
    let matchedTrack = null;
    if (afUid) {
      const af = afStmt.get(afUid);
      if (af) matchedTrack = af.title || af.filename;
    }
    return { ...r, semanticScore: rawScoreMap[r.uid] ?? 0, matchedTrack };
  });

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
