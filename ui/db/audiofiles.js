'use strict';

const path = require('path');
const { spawnSync } = require('child_process');
const Router = require('express').Router;
const { getDb } = require('./schema');

const router = Router();

const API_PORT = () => parseInt(process.env.API_PORT) || 8000;

// Run ffprobe and return duration in seconds, or null on failure.
function getAudioDuration(absPath) {
  try {
    const r = spawnSync('ffprobe', [
      '-v', 'quiet', '-print_format', 'json', '-show_format', absPath,
    ], { encoding: 'utf8', timeout: 10000 });
    if (r.error || r.status !== 0) return null;
    const data = JSON.parse(r.stdout);
    const dur = parseFloat(data.format?.duration);
    return isFinite(dur) && dur > 0 ? Math.round(dur) : null;
  } catch {
    return null;
  }
}

// GET /db/audiofiles/:mediaUid
// List all audiofiles for a music collection, ordered by disc then track then filename.
router.get('/:mediaUid', (req, res) => {
  const db = getDb();
  const media = db.prepare('SELECT id FROM medias WHERE uid = ?').get(req.params.mediaUid);
  if (!media) return res.status(404).json({ error: 'Media not found' });

  const rows = db.prepare(`
    SELECT uid, filename, title, artist, album, track_number, disc_number, duration, lyrics, qdrant_indexed_at, created_at, updated_at
    FROM audiofiles
    WHERE media_id = ?
    ORDER BY disc_number NULLS LAST, track_number NULLS LAST, filename
  `).all(media.id);

  res.json(rows);
});

// PUT /db/audiofiles/:uid
// Update an audiofile's metadata. If lyrics changed, re-index into text Qdrant.
router.put('/:uid', async (req, res) => {
  const db = getDb();
  const existing = db.prepare(`
    SELECT af.id, af.uid, af.filename, af.lyrics, af.duration, af.media_id,
           m.uid AS media_uid, m.path AS media_path,
           ms.path AS source_path
    FROM audiofiles af
    JOIN medias m ON m.id = af.media_id
    JOIN mediasources ms ON ms.id = m.mediasource_id
    WHERE af.uid = ?
  `).get(req.params.uid);
  if (!existing) return res.status(404).json({ error: 'Audiofile not found' });

  const { title, artist, album, track_number, disc_number, duration, lyrics } = req.body ?? {};

  // Auto-detect duration via ffprobe if not provided and not yet stored
  let resolvedDuration = duration !== undefined ? duration : existing.duration;
  if (resolvedDuration == null) {
    const absDir = path.resolve(path.join(existing.source_path, existing.media_path));
    const absFile = path.resolve(path.join(absDir, existing.filename));
    resolvedDuration = getAudioDuration(absFile);
    if (resolvedDuration != null) {
      console.log(`[audiofiles] ffprobe duration for ${existing.filename}: ${resolvedDuration}s`);
    } else {
      console.warn(`[audiofiles] ffprobe could not get duration for ${existing.filename}`);
    }
  }

  db.prepare(`
    UPDATE audiofiles
    SET title = COALESCE(?, title),
        artist = COALESCE(?, artist),
        album = COALESCE(?, album),
        track_number = ?,
        disc_number = ?,
        duration = ?,
        lyrics = COALESCE(?, lyrics),
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE uid = ?
  `).run(
    title ?? null, artist ?? null, album ?? null,
    track_number !== undefined ? track_number : existing.track_number,
    disc_number !== undefined ? disc_number : existing.disc_number,
    resolvedDuration,
    lyrics ?? null,
    req.params.uid,
  );

  const updated = db.prepare(`
    SELECT uid, filename, title, artist, album, track_number, disc_number, duration, lyrics, qdrant_indexed_at, updated_at
    FROM audiofiles WHERE uid = ?
  `).get(req.params.uid);

  res.json(updated);

  // If lyrics were supplied and non-empty, re-index into text Qdrant (fire-and-forget)
  const newLyrics = updated.lyrics?.trim();
  if (lyrics !== undefined && newLyrics) {
    fetch(`http://127.0.0.1:${API_PORT()}/index_lyrics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audiofile_uid: req.params.uid,
        media_uid: existing.media_uid,
        text: newLyrics,
      }),
    }).then(r => {
      if (r.ok) {
        const db2 = getDb();
        db2.prepare("UPDATE audiofiles SET qdrant_indexed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE uid = ?")
          .run(req.params.uid);
        db2.prepare("UPDATE medias SET qdrant_indexed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE uid = ?")
          .run(existing.media_uid);
        console.log(`[audiofiles] lyrics indexed + stamped audiofile=${req.params.uid} media=${existing.media_uid}`);
      } else {
        console.warn(`[audiofiles] index_lyrics HTTP ${r.status} for media ${existing.media_uid}`);
      }
    }).catch(e => console.warn('[audiofiles] index_lyrics failed:', e.message));
  } else if (lyrics !== undefined && !newLyrics) {
    // Lyrics cleared — remove from text Qdrant and clear indexed timestamp
    getDb().prepare('UPDATE audiofiles SET qdrant_indexed_at = NULL WHERE uid = ?').run(req.params.uid);
    fetch(`http://127.0.0.1:${API_PORT()}/index_text/${req.params.uid}`, {
      method: 'DELETE',
    }).catch(e => console.warn('[audiofiles] delete text index failed:', e.message));
  }
});

// DELETE /db/audiofiles/:uid
// Remove an audiofile record and its text Qdrant point.
router.delete('/:uid', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM audiofiles WHERE uid = ?').get(req.params.uid);
  if (!existing) return res.status(404).json({ error: 'Audiofile not found' });

  db.prepare('DELETE FROM audiofiles WHERE uid = ?').run(req.params.uid);
  res.json({ ok: true });

  // Remove text index point (fire-and-forget)
  fetch(`http://127.0.0.1:${API_PORT()}/index_text/${req.params.uid}`, {
    method: 'DELETE',
  }).catch(e => console.warn('[audiofiles] delete text index failed:', e.message));
});

module.exports = router;
