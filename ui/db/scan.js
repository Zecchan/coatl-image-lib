'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const Router = require('express').Router;
const { getDb, uid } = require('./schema')

const CONFIG_PATH = path.join(__dirname, '..', 'serverconfig.json');
function getConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch { return {}; }
};

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.avif']);
const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.webm', '.avi', '.mov', '.wmv', '.flv', '.m4v', '.ts', '.m2ts']);
const AUDIO_EXTS = new Set(['.mp3', '.flac', '.ogg', '.wav', '.aac', '.m4a', '.opus', '.wma']);

// Walk directory recursively, collect absolute paths of files matching extSet, sorted by path.
function walkFiles(dir, extSet) {
  const results = [];
  function walk(current) {
    let entries;
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    for (const e of entries) {
      const full = path.join(current, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && extSet.has(path.extname(e.name).toLowerCase())) results.push(full);
    }
  }
  walk(dir);
  return results;
}

function walkImages(dir) { return walkFiles(dir, IMAGE_EXTS); }
function walkVideos(dir) { return walkFiles(dir, VIDEO_EXTS); }
function walkAudios(dir) { return walkFiles(dir, AUDIO_EXTS); }

// Returns first image (by filename sort) + one representative from each of (n-1) filesize groups.
function sampleImages(files, n) {
  if (files.length === 0) return [];
  const byName = [...files].sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
  const first = byName[0];
  const rest = files
    .filter(f => f !== first)
    .map(f => ({ f, size: (() => { try { return fs.statSync(f).size; } catch { return 0; } })() }))
    .sort((a, b) => a.size - b.size);
  if (rest.length === 0) return [first];
  const groupCount = Math.min(n - 1, rest.length);
  const picks = [];
  for (let g = 0; g < groupCount; g++) {
    const start = Math.floor((g * rest.length) / groupCount);
    const end = Math.floor(((g + 1) * rest.length) / groupCount);
    const group = rest.slice(start, end);
    const pick = group[Math.floor(Math.random() * group.length)];
    picks.push(pick.f);
  }
  return [first, ...picks];
}

// ── Video frame helpers ───────────────────────────────────────────────────────

/**
 * Returns video duration in seconds, or null on failure.
 * Throws with a clear message if ffprobe is not installed.
 */
function getVideoDuration(videoPath) {
  let result;
  try {
    result = spawnSync('ffprobe', [
      '-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', videoPath,
    ], { encoding: 'utf8', timeout: 10000 });
  } catch (e) {
    if (e.code === 'ENOENT') throw new Error('ffprobe not found — install ffmpeg and add it to PATH.');
    return null;
  }
  if (result.error) {
    if (result.error.code === 'ENOENT') throw new Error('ffprobe not found — install ffmpeg and add it to PATH.');
    return null;
  }
  try {
    const data = JSON.parse(result.stdout);
    const stream = data.streams?.find(s => s.codec_type === 'video') ?? data.streams?.[0];
    // Prefer stream-level duration; fall back to container format duration (many MKV/AVI files only have it there)
    const dur = parseFloat(stream?.duration) || parseFloat(data.format?.duration);
    return isFinite(dur) && dur > 0 ? dur : null;
  } catch {
    return null;
  }
}

/** Extract a single frame at `seconds` into outputPath (JPEG). Returns true on success. */
function extractFrame(videoPath, outputPath, seconds) {
  try {
    const result = spawnSync('ffmpeg', [
      '-y', '-ss', String(seconds), '-i', videoPath,
      '-vframes', '1', '-q:v', '2', outputPath,
    ], { timeout: 15000 });
    return result.status === 0 && !result.error && fs.existsSync(outputPath);
  } catch {
    return false;
  }
}

/**
 * Sample up to n frames from the given video files into tempDir.
 *
 * Prioritises breadth over depth: collects one frame from every video before
 * collecting a second frame from any video.
 * framesPerVideo is pre-calculated as ceil(n / videos.length) so the budget
 * is distributed evenly upfront.
 * Timestamps are evenly spaced across the 10–90% range of each video's duration.
 *
 * Returns [{name, abs}] — same shape as image samples.
 */
function sampleVideoFrames(videos, n, tempDir) {
  if (!videos.length) return [];
  fs.mkdirSync(tempDir, { recursive: true });

  const framesPerVideo = Math.max(1, Math.ceil(n / videos.length));

  // Shuffle for variety
  const shuffled = [...videos];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // Pre-fetch all durations up front (one ffprobe call per video).
  // Re-throw on the first call so callers get a real error (e.g. ffprobe not found)
  // instead of silently returning 0 frames.
  let firstProbe = true;
  const durations = shuffled.map(v => {
    try {
      const d = getVideoDuration(v);
      firstProbe = false;
      return d;
    } catch (e) {
      if (firstProbe) throw e; // surface the error (e.g. "ffprobe not found")
      firstProbe = false;
      return null;
    }
  });

  const samples = [];
  let frameIdx = 0;

  // Round-robin passes: pass 0 = 1st frame from each video, pass 1 = 2nd, …
  for (let passIdx = 0; passIdx < framesPerVideo && samples.length < n; passIdx++) {
    for (let vi = 0; vi < shuffled.length && samples.length < n; vi++) {
      const duration = durations[vi];
      if (!duration) continue;

      // Timestamp evenly distributed for this pass within 10–90% of duration
      const rangeStart = duration * 0.1;
      const rangeEnd = duration * 0.9;
      const t = rangeStart + (rangeEnd - rangeStart) * ((passIdx + 0.5) / framesPerVideo);

      const stem = path.basename(shuffled[vi], path.extname(shuffled[vi])).slice(0, 40);
      const outPath = path.join(tempDir, `frame_${frameIdx++}_${stem}.jpg`);
      if (extractFrame(shuffled[vi], outPath, t)) {
        samples.push({ name: path.basename(outPath), abs: outPath });
      }
    }
  }

  return samples;
}

/** Remove stale coatl-preview-* temp dirs (older than 1 hour). */
function cleanStalePreviewDirs() {
  const tmpBase = os.tmpdir();
  const ONE_HOUR = 60 * 60 * 1000;
  try {
    for (const e of fs.readdirSync(tmpBase, { withFileTypes: true })) {
      if (!e.isDirectory() || !e.name.startsWith('coatl-preview-')) continue;
      const full = path.join(tmpBase, e.name);
      try {
        if (Date.now() - fs.statSync(full).mtimeMs > ONE_HOUR) {
          fs.rmSync(full, { recursive: true, force: true });
        }
      } catch { }
    }
  } catch { }
}

// ── Post-save Qdrant indexing ─────────────────────────────────────────────────

function indexImageCollection(newUid, destDir) {
  const imagePaths = walkImages(destDir);
  if (!imagePaths.length) return;
  const apiPort = parseInt(process.env.API_PORT) || 8000;
  const maxImages = getConfig().embedding?.maxImagesPerMedia || 200;
  fetch(`http://127.0.0.1:${apiPort}/index_media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_uid: newUid, image_paths: imagePaths, max_images: maxImages }),
  }).then(r => {
    if (r.ok) {
      getDb().prepare("UPDATE medias SET qdrant_indexed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE uid = ?")
        .run(newUid);
    }
  }).catch(e => console.warn('[qdrant] index_media failed:', e.message));
}

function indexVideoCollection(newUid, destDir) {
  const videoPaths = walkVideos(destDir);
  if (!videoPaths.length) return;
  const apiPort = parseInt(process.env.API_PORT) || 8000;
  const maxImages = getConfig().embedding?.maxImagesPerMedia || 200;
  fetch(`http://127.0.0.1:${apiPort}/index_video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_uid: newUid, video_paths: videoPaths, max_images: maxImages }),
  }).then(async r => {
    if (r.ok) {
      const data = await r.json();
      const indexed = data.indexed ?? 0;
      console.log(`[qdrant] index_video uid=${newUid}: ${indexed} points from ${videoPaths.length} video(s)`);
      if (indexed > 0) {
        getDb().prepare("UPDATE medias SET qdrant_indexed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE uid = ?")
          .run(newUid);
      } else {
        console.warn(`[qdrant] index_video uid=${newUid}: 0 points indexed — check Python logs`);
      }
    } else {
      console.warn(`[qdrant] index_video uid=${newUid}: HTTP ${r.status}`);
    }
  }).catch(e => console.warn('[qdrant] index_video failed:', e.message));
}

/**
 * Scan audio files in destDir, insert rows into audiofiles table for each track.
 * Filename stem is used as the default title.
 */
function populateAudiofiles(mediaUid, destDir) {
  const db = getDb();
  const media = db.prepare('SELECT id, title, artist FROM medias WHERE uid = ?').get(mediaUid);
  if (!media) return;

  // Detect disc subfolders: "Disc 1", "Disk 2", "CD1", "01", "1", etc.
  const DISC_RE = /^(?:disc|disk|cd)\s*(\d+)$|^(\d+)$/i;
  const discDirs = [];
  try {
    for (const e of fs.readdirSync(destDir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const m = DISC_RE.exec(e.name);
      if (m) discDirs.push({ num: parseInt(m[1] || m[2], 10), absPath: path.join(destDir, e.name) });
    }
  } catch { /* ignore */ }

  // Build track entries with per-disc track numbering when disc folders found.
  const trackEntries = []; // [{ absPath, trackNum, discNum }]
  if (discDirs.length > 0) {
    discDirs.sort((a, b) => a.num - b.num);
    for (const disc of discDirs) {
      walkAudios(disc.absPath).forEach((f, i) =>
        trackEntries.push({ absPath: f, trackNum: i + 1, discNum: disc.num }));
    }
  } else {
    walkAudios(destDir).forEach((f, i) =>
      trackEntries.push({ absPath: f, trackNum: i + 1, discNum: 1 }));
  }

  if (!trackEntries.length) {
    console.log(`[audiofiles] No audio files found in ${destDir}`);
    return;
  }

  const ins = db.prepare(`
    INSERT OR IGNORE INTO audiofiles (uid, media_id, filename, title, track_number, disc_number, album, artist, duration)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Gather durations outside the transaction (ffprobe calls can be slow)
  const withDurations = trackEntries.map(e => ({
    ...e,
    duration: (() => { try { return getVideoDuration(e.absPath); } catch { return null; } })()
  }));
  withDurations.forEach(e => {
    const name = path.basename(e.absPath);
    if (e.duration != null) console.log(`[audiofiles] duration ${name}: ${e.duration}s`);
    else console.warn(`[audiofiles] duration unknown for ${name} (ffprobe failed?)`);
  });

  let count = 0;
  const insertMany = db.transaction(() => {
    for (const { absPath, trackNum, discNum, duration } of withDurations) {
      const filename = path.relative(destDir, absPath).replace(/\\/g, '/');
      const stem = path.basename(absPath, path.extname(absPath));
      ins.run(uid(), media.id, filename, stem, trackNum, discNum, media.title || '', media.artist || '', duration || null);
      count++;
    }
  });

  try {
    insertMany();
    // Update track_count
    db.prepare('UPDATE medias SET track_count = ? WHERE uid = ?').run(count, mediaUid);
    console.log(`[audiofiles] Inserted ${count} track(s) for media uid=${mediaUid}`);
  } catch (e) {
    console.error('[audiofiles] populate failed:', e.message);
  }
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

// POST /preview  { dir, mediatypeType }
// Dispatches to type-specific handler. Returns { total, dir, samples: [{name, abs}], ... }
function previewImageCollection(req, res) {
  const { dir } = req.body;
  const absDir = path.resolve(dir);
  let stat;
  try { stat = fs.statSync(absDir); } catch { return res.status(404).json({ error: 'Directory not found' }); }
  if (!stat.isDirectory()) return res.status(400).json({ error: 'Path is not a directory' });

  const all = walkImages(absDir);
  const samples = sampleImages(all, 12);
  const includeAll = all.length > 12 && all.length <= 100;
  res.json({
    total: all.length,
    dir: absDir,
    samples: samples.map(f => ({ name: path.relative(absDir, f), abs: f })),
    allFiles: includeAll ? all.map(f => ({ name: path.relative(absDir, f), abs: f })) : [],
  });
}

function previewVideoCollection(req, res) {
  const { dir } = req.body;
  const absDir = path.resolve(dir);
  let stat;
  try { stat = fs.statSync(absDir); } catch { return res.status(404).json({ error: 'Directory not found' }); }
  if (!stat.isDirectory()) return res.status(400).json({ error: 'Path is not a directory' });

  cleanStalePreviewDirs();
  const all = walkVideos(absDir);
  console.log(`[preview-video] found ${all.length} video(s) in ${absDir}`);
  if (!all.length) {
    return res.json({ total: 0, dir: absDir, samples: [], tempDir: null, isVideo: true });
  }

  const tempDir = path.join(os.tmpdir(), `coatl-preview-${crypto.randomBytes(8).toString('hex')}`);
  let samples;
  try {
    samples = sampleVideoFrames(all, 12, tempDir);
    console.log(`[preview-video] extracted ${samples.length} frame(s) into ${tempDir}`);
  } catch (e) {
    console.error('[preview-video] error:', e.message);
    return res.status(500).json({ error: e.message });
  }
  res.json({ total: all.length, dir: absDir, samples, tempDir, isVideo: true });
}

function previewAudioCollection(req, res) {
  const { dir } = req.body;
  const absDir = path.resolve(dir);
  let stat;
  try { stat = fs.statSync(absDir); } catch { return res.status(404).json({ error: 'Directory not found' }); }
  if (!stat.isDirectory()) return res.status(400).json({ error: 'Path is not a directory' });

  const all = walkAudios(absDir);
  // Return first 50 filenames as samples (no images to preview)
  const samples = all.slice(0, 50).map(f => ({
    name: path.relative(absDir, f).replace(/\\/g, '/'),
    abs: f,
  }));
  res.json({ total: all.length, dir: absDir, samples, isAudio: true });
}

router.post('/preview', (req, res) => {
  const { dir, mediatypeType } = req.body ?? {};
  if (!dir || typeof dir !== 'string') return res.status(400).json({ error: 'dir is required' });
  switch (mediatypeType) {
    case 2: return previewVideoCollection(req, res);
    case 3: return previewAudioCollection(req, res);
    case 1:
    default: return previewImageCollection(req, res);
  }
});

// DELETE /preview-temp  { tempDir }
// Cleans up a coatl-preview-* temp directory created during video preview.
router.delete('/preview-temp', (req, res) => {
  const { tempDir } = req.body ?? {};
  if (!tempDir || typeof tempDir !== 'string') return res.status(400).json({ error: 'tempDir required' });
  const resolved = path.resolve(tempDir);
  if (!resolved.startsWith(os.tmpdir()) || !path.basename(resolved).startsWith('coatl-preview-')) {
    return res.status(403).json({ error: 'Invalid temp path' });
  }
  try {
    fs.rmSync(resolved, { recursive: true, force: true });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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

/**
 * Generate thumbnails for all videos in destDir.
 * Thumbnails are saved to <destDir>/thumbnails/<videobasename>.jpg
 * Existing thumbnails are skipped unless force=true.
 * Returns { generated, skipped, failed }.
 */
function generateVideoThumbnails(destDir, { force = false } = {}) {
  const thumbDir = path.join(destDir, 'thumbnails');
  fs.mkdirSync(thumbDir, { recursive: true });
  const videos = walkVideos(destDir);
  let generated = 0, skipped = 0, failed = 0;
  for (const vid of videos) {
    const base = path.basename(vid, path.extname(vid));
    const thumbPath = path.join(thumbDir, `${base}.jpg`);
    if (!force && fs.existsSync(thumbPath)) { skipped++; continue; }
    try {
      const dur = getVideoDuration(vid);
      if (!dur) { failed++; continue; }
      if (extractFrame(vid, thumbPath, dur * 0.25)) generated++;
      else failed++;
    } catch { failed++; }
  }
  console.log(`[thumbnails] ${destDir}: generated=${generated} skipped=${skipped} failed=${failed}`);
  return { generated, skipped, failed };
}

// GET /videos/:uid?page=1&pageSize=50
// Lists all videos in a media's folder, sorted by path, paginated.
// Returns { total, page, pageSize, items: [{name, rel, thumb}] }
router.get('/videos/:uid', (req, res) => {
  const db = getDb();
  const row = db.prepare(`
    SELECT m.path AS mediaPath, ms.path AS sourcePath
    FROM medias m
    JOIN mediasources ms ON ms.id = m.mediasource_id
    WHERE m.uid = ?
  `).get(req.params.uid);
  if (!row) return res.status(404).json({ error: 'Not found' });

  const absDir = path.resolve(path.join(row.sourcePath, row.mediaPath));
  const all = walkVideos(absDir)
    .map(f => {
      const rel = path.relative(absDir, f).replace(/\\/g, '/');
      const base = path.basename(f, path.extname(f));
      const thumbAbs = path.join(absDir, 'thumbnails', `${base}.jpg`);
      return { rel, thumb: fs.existsSync(thumbAbs) };
    });

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize, 10) || 50));
  const offset = (page - 1) * pageSize;
  const items = all.slice(offset, offset + pageSize);

  res.json({ total: all.length, page, pageSize, items });
});

// GET /video-thumb/:uid/* — serves a thumbnail from <media>/thumbnails/<name>.jpg
router.get('/video-thumb/:uid/*', (req, res) => {
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
  const thumbsDir = path.join(absDir, 'thumbnails');
  const absFile = path.resolve(path.join(thumbsDir, rel));

  // Path traversal guard — must stay inside thumbnails dir
  if (!absFile.startsWith(thumbsDir + path.sep) && absFile !== thumbsDir) return res.status(403).end();
  if (path.extname(absFile).toLowerCase() !== '.jpg') return res.status(400).end();
  if (!fs.existsSync(absFile)) return res.status(404).end();
  res.sendFile(absFile);
});

// POST /scan/thumbnails/:uid — (re)generates thumbnails for a video media
// Body: { force: bool }  — force=true overwrites existing thumbnails
router.post('/thumbnails/:uid', (req, res) => {
  const db = getDb();
  const row = db.prepare(`
    SELECT m.path AS mediaPath, ms.path AS sourcePath, mt.type AS mediatypeType
    FROM medias m
    JOIN mediasources ms ON ms.id = m.mediasource_id
    JOIN mediatypes  mt ON mt.id = ms.mediatype_id
    WHERE m.uid = ?
  `).get(req.params.uid);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.mediatypeType !== 2) return res.status(400).json({ error: 'Only video collections support thumbnails' });

  const absDir = path.resolve(path.join(row.sourcePath, row.mediaPath));
  const force = req.body?.force === true;
  const result = generateVideoThumbnails(absDir, { force });
  res.json(result);
});

// GET /video/:uid/* — streams a video file with Range support for seek
router.get('/video/:uid/*', (req, res) => {
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

  // Path traversal guard
  if (!absFile.startsWith(absDir + path.sep) && absFile !== absDir) return res.status(403).end();
  if (!VIDEO_EXTS.has(path.extname(absFile).toLowerCase())) return res.status(400).end();

  let stat;
  try { stat = fs.statSync(absFile); } catch { return res.status(404).end(); }

  const fileSize = stat.size;
  const rangeHeader = req.headers['range'];
  const ext = path.extname(absFile).toLowerCase();
  const MIME = {
    '.mp4': 'video/mp4', '.mkv': 'video/x-matroska', '.webm': 'video/webm',
    '.avi': 'video/x-msvideo', '.mov': 'video/quicktime', '.wmv': 'video/x-ms-wmv',
    '.flv': 'video/x-flv', '.m4v': 'video/mp4', '.ts': 'video/mp2t',
    '.m2ts': 'video/mp2t',
  };
  const contentType = MIME[ext] || 'application/octet-stream';

  if (rangeHeader) {
    const [startStr, endStr] = rangeHeader.replace('bytes=', '').split('-');
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
    if (start >= fileSize || end >= fileSize) {
      return res.status(416).header('Content-Range', `bytes */${fileSize}`).end();
    }
    const chunkSize = end - start + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
    });
    fs.createReadStream(absFile, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(absFile).pipe(res);
  }
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

// GET /audio/:uid/* — streams an audio file with Range support
router.get('/audio/:uid/*', (req, res) => {
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

  // Path traversal guard
  if (!absFile.startsWith(absDir + path.sep) && absFile !== absDir) return res.status(403).end();
  if (!AUDIO_EXTS.has(path.extname(absFile).toLowerCase())) return res.status(400).end();

  let stat;
  try { stat = fs.statSync(absFile); } catch { return res.status(404).end(); }

  const fileSize = stat.size;
  const ext = path.extname(absFile).toLowerCase();
  const AUDIO_MIME = {
    '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.ogg': 'audio/ogg',
    '.wav': 'audio/wav', '.aac': 'audio/aac', '.m4a': 'audio/mp4',
    '.opus': 'audio/ogg', '.wma': 'audio/x-ms-wma',
  };
  const contentType = AUDIO_MIME[ext] || 'application/octet-stream';
  const rangeHeader = req.headers['range'];

  if (rangeHeader) {
    const [startStr, endStr] = rangeHeader.replace('bytes=', '').split('-');
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
    if (start >= fileSize || end >= fileSize) {
      return res.status(416).header('Content-Range', `bytes */${fileSize}`).end();
    }
    const chunkSize = end - start + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
    });
    fs.createReadStream(absFile, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(absFile).pipe(res);
  }
});

// POST /scan/save
// Saves a media entry to the DB and moves the scanned folder into the
// canonical location: <mediasource_path>/<artist_slug>/<title_slug>
const CONTENT_RATINGS = new Set(['general', 'sensitive', 'questionable', 'explicit']);

// POST /scan/open-explorer  { path }
// Spawn Windows Explorer at the given absolute path (fire-and-forget).
router.post('/open-explorer', (req, res) => {
  const { path: reqPath } = req.body ?? {};
  if (!reqPath) return res.status(400).json({ error: 'path is required' });
  const absPath = path.resolve(reqPath);
  try {
    require('child_process').spawn('explorer.exe', [absPath], { detached: true, stdio: 'ignore' }).unref();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

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
  if (source.mediatype_type === 1 || source.mediatype_type === 2) {
    if (!form.artist?.trim() && !form.series?.trim())
      return res.status(400).json({
        error: `Artist or Circle/Series is required for ${source.mediatype_type === 1 ? 'Image' : 'Video'} Collection`,
      });
  }

  // Music collections: compute path from artist+title (artist optional)
  // Image/Video: artist or series required (validated above)

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

  // For Video Collections: extract a frame from the first video as cover.jpg in destDir.
  // This runs after the folder is in place so destDir always contains the final content.
  let coverValue = form.cover || '';
  if (source.mediatype_type === 2) {
    try {
      const vids = walkVideos(destDir);
      if (vids.length) {
        const dur = getVideoDuration(vids[0]);
        if (dur) {
          const coverPath = path.join(destDir, 'cover.jpg');
          if (extractFrame(vids[0], coverPath, dur * 0.25)) {
            coverValue = 'cover.jpg';
          }
        }
      }
    } catch (e) {
      console.warn('[scan/save] cover extraction failed:', e.message);
      // best-effort — proceed without cover
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
      form.title.trim(), form.original_title || '', relPath, coverValue,
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

  // Fire-and-forget: generate thumbnails + index into Qdrant after responding (per media type)
  switch (source.mediatype_type) {
    case 1: indexImageCollection(newUid, destDir); break;
    case 2:
      // Generate thumbnails first (synchronous, but happens after response)
      try { generateVideoThumbnails(destDir, { force: true }); } catch (e) { console.warn('[thumbnails] failed:', e.message); }
      indexVideoCollection(newUid, destDir);
      break;
    case 3:
      populateAudiofiles(newUid, destDir);
      break;
  }
});

module.exports = router;

