'use strict';

const path = require('path');
const fs = require('fs');
const Router = require('express').Router;
const { getDb, uid } = require('./schema');

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.avif']);

function isImage(name) {
  return IMAGE_EXTS.has(path.extname(name).toLowerCase());
}

// Walk directory recursively, collect absolute paths of image files sorted by full path.
function walkImages(dir) {
  const results = [];
  function walk(current) {
    let entries;
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    for (const e of entries) {
      const full = path.join(current, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && isImage(e.name)) results.push(full);
    }
  }
  walk(dir);
  return results;
}

// Returns first image + up to (n-1) random samples from the rest, total <= n.
function sampleImages(files, n) {
  if (files.length === 0) return [];
  const first = files[0];
  const rest = files.slice(1);
  // Fisher-Yates shuffle on the rest
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [first, ...rest.slice(0, n - 1)];
}

const router = Router();

// Slugify a name for use as a filesystem path segment.
// Special chars (except dashes) → _, spaces → -, lowercase.
function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '_')
    .replace(/ +/g, '-');
}

// Recursively copy a directory.
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirSync(s, d);
    else fs.copyFileSync(s, d);
  }
}

// POST /preview  { dir: string }
// Returns { total, dir, samples: [{name, abs}] }
router.post('/preview', (req, res) => {
  const { dir } = req.body ?? {};
  if (!dir || typeof dir !== 'string') {
    return res.status(400).json({ error: 'dir is required' });
  }

  const absDir = path.resolve(dir);

  let stat;
  try {
    stat = fs.statSync(absDir);
  } catch {
    return res.status(404).json({ error: 'Directory not found' });
  }
  if (!stat.isDirectory()) {
    return res.status(400).json({ error: 'Path is not a directory' });
  }

  const all = walkImages(absDir);
  const samples = sampleImages(all, 12);

  res.json({
    total: all.length,
    dir: absDir,
    samples: samples.map(f => ({ name: path.relative(absDir, f), abs: f })),
  });
});

// GET /image?f=<absolute-path>
// Serves an image file. Only allowed extensions are served.
router.get('/image', (req, res) => {
  const f = req.query.f;
  if (!f || typeof f !== 'string') return res.status(400).end();
  if (!IMAGE_EXTS.has(path.extname(f).toLowerCase())) return res.status(400).end();
  if (!fs.existsSync(f)) return res.status(404).end();
  res.sendFile(path.resolve(f));
});

// GET /cover/:uid
// Resolves a media's cover to a full path and serves it.
router.get('/cover/:uid', (req, res) => {
  const db = getDb();
  const row = db.prepare(`
    SELECT m.cover, m.path AS mediaPath, ms.path AS sourcePath
    FROM medias m
    JOIN mediasources ms ON ms.id = m.mediasource_id
    WHERE m.uid = ?
  `).get(req.params.uid);

  if (!row || !row.cover) return res.status(404).end();

  const absPath = path.isAbsolute(row.cover)
    ? row.cover
    : path.join(row.sourcePath, row.mediaPath, row.cover);

  if (!IMAGE_EXTS.has(path.extname(absPath).toLowerCase())) return res.status(400).end();
  if (!fs.existsSync(absPath)) return res.status(404).end();
  res.sendFile(path.resolve(absPath));
});

// GET /images/:uid?page=1&pageSize=50
// Lists all images in a media's folder, sorted by path, paginated.
// Returns { total, page, pageSize, items: [{name, rel}] }
router.get('/images/:uid', (req, res) => {
  const db = getDb();
  const row = db.prepare(`
    SELECT m.path AS mediaPath, ms.path AS sourcePath
    FROM medias m
    JOIN mediasources ms ON ms.id = m.mediasource_id
    WHERE m.uid = ?
  `).get(req.params.uid);
  if (!row) return res.status(404).json({ error: 'Not found' });

  const absDir = path.resolve(path.join(row.sourcePath, row.mediaPath));
  const all = walkImages(absDir)
    .map(f => ({ rel: path.relative(absDir, f).replace(/\\/g, '/') }));

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize, 10) || 50));
  const offset = (page - 1) * pageSize;
  const items = all.slice(offset, offset + pageSize);

  res.json({ total: all.length, page, pageSize, items });
});

// GET /file/:uid/*  — serves any file within the media's folder by relative path
router.get('/file/:uid/*', (req, res) => {
  const db = getDb();
  const row = db.prepare(`
    SELECT m.path AS mediaPath, ms.path AS sourcePath
    FROM medias m
    JOIN mediasources ms ON ms.id = m.mediasource_id
    WHERE m.uid = ?
  `).get(req.params.uid);
  if (!row) return res.status(404).end();

  const rel = req.params[0] || '';
  const absDir = path.resolve(path.join(row.sourcePath, row.mediaPath));
  const absFile = path.resolve(path.join(absDir, rel));

  // Ensure the resolved path stays inside the media folder (path traversal guard)
  if (!absFile.startsWith(absDir + path.sep) && absFile !== absDir) return res.status(403).end();
  if (!IMAGE_EXTS.has(path.extname(absFile).toLowerCase())) return res.status(400).end();
  if (!fs.existsSync(absFile)) return res.status(404).end();
  res.sendFile(absFile);
});

// POST /scan/save
// Saves a media entry to the DB and moves the scanned folder into the
// canonical location: <mediasource_path>/<artist_slug>/<title_slug>
const CONTENT_RATINGS = new Set(['general', 'sensitive', 'questionable', 'explicit']);

router.post('/save', (req, res) => {
  const { mediasourceUid, scanDir, form, moveContent = true } = req.body ?? {};

  if (!mediasourceUid) return res.status(400).json({ error: 'mediasourceUid is required' });
  if (!scanDir) return res.status(400).json({ error: 'scanDir is required' });
  if (!form?.title?.trim()) return res.status(400).json({ error: 'title is required' });

  const db = getDb();
  const source = db.prepare(`
    SELECT ms.id, ms.path, mt.type AS mediatype_type
    FROM mediasources ms
    JOIN mediatypes mt ON mt.id = ms.mediatype_id
    WHERE ms.uid = ?
  `).get(mediasourceUid);
  if (!source) return res.status(404).json({ error: 'mediasource not found' });

  // Type-specific validation
  if (source.mediatype_type === 1) {
    if (!form.artist?.trim() && !form.series?.trim())
      return res.status(400).json({ error: 'Artist or Circle/Series is required for Image Collection' });
  }

  // Compute canonical destination path
  const artistOrCircle = (form.artist?.trim() || form.series?.trim() || '');
  const artistSlug = slugify(artistOrCircle);
  const titleSlug = slugify(form.title.trim());
  const sourceRoot = path.resolve(source.path);
  const destDir = path.join(sourceRoot, artistSlug, titleSlug);
  const absSource = path.resolve(scanDir);
  const relPath = `${artistSlug}/${titleSlug}`;

  // Check DB for duplicate (same path within same source)
  const duplicate = db.prepare('SELECT uid FROM medias WHERE mediasource_id = ? AND path = ?').get(source.id, relPath);
  if (duplicate) {
    return res.status(409).json({ error: 'This folder has already been added to your library.' });
  }

  // Move folder if not already in the right place
  if (absSource.toLowerCase() !== destDir.toLowerCase()) {
    if (fs.existsSync(destDir))
      return res.status(409).json({ error: `Destination already exists: ${destDir}` });
    try {
      copyDirSync(absSource, destDir);
    } catch (e) {
      try { fs.rmSync(destDir, { recursive: true, force: true }); } catch { }
      return res.status(500).json({ error: `Copy failed: ${e.message}` });
    }
    if (moveContent) {
      try {
        fs.rmSync(absSource, { recursive: true, force: true });
      } catch (e) {
        console.warn('[scan/save] Could not delete source dir:', e.message);
      }
    }
  }

  // Upsert tags by name, return their ids
  function upsertTags(names) {
    const ins = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
    const sel = db.prepare('SELECT id FROM tags WHERE name = ?');
    return names.map(name => { ins.run(name); return sel.get(name).id; });
  }

  const newUid = uid();
  const content_rating = CONTENT_RATINGS.has(form.content_rating) ? form.content_rating : 'general';
  const rating = (form.rating >= 1 && form.rating <= 5) ? form.rating : null;
  const tags = form.tags ?? [];

  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO medias
        (uid, mediasource_id, title, original_title, path, cover,
         content_rating, rating, summary,
         artist, source_url, series, page_count,
         developer, publisher, release_date, platform,
         duration, track_count, language, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newUid, source.id,
      form.title.trim(), form.original_title || '', relPath, form.cover || '',
      content_rating, rating, form.summary || '',
      form.artist || '', form.source_url || '', form.series || '', form.page_count || null,
      form.developer || '', form.publisher || '', form.release_date || '', form.platform || '',
      form.duration || null, form.track_count || null, form.language || '', form.notes || ''
    );
    const mediaId = db.prepare('SELECT id FROM medias WHERE uid = ?').get(newUid).id;
    if (tags.length) {
      const tagNames = tags.map(t => (typeof t === 'string' ? t : t.tag));
      const tagScores = tags.map(t => (typeof t === 'object' && t.score != null ? t.score : 0));
      const tagIds = upsertTags(tagNames);
      const insMT = db.prepare('INSERT OR REPLACE INTO media_tags (media_id, tag_id, score) VALUES (?, ?, ?)');
      tagIds.forEach((tagId, i) => insMT.run(mediaId, tagId, tagScores[i]));
    }
  });

  try {
    transaction();
  } catch (e) {
    return res.status(500).json({ error: `DB save failed: ${e.message}` });
  }

  res.status(201).json({ ok: true, uid: newUid, path: relPath, destDir });

  // Fire-and-forget: index images into Qdrant after responding
  const imagePaths = walkImages(destDir);
  if (imagePaths.length) {
    const apiPort = parseInt(process.env.API_PORT) || 8000;
    fetch(`http://127.0.0.1:${apiPort}/index_media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ media_uid: newUid, image_paths: imagePaths }),
    }).then(r => {
      if (r.ok) {
        const db2 = getDb();
        db2.prepare("UPDATE medias SET qdrant_indexed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE uid = ?")
          .run(newUid);
      }
    }).catch(e => {
      console.warn('[qdrant] index_media failed after save:', e.message);
    });
  }
});

module.exports = router;

