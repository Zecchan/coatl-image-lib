'use strict';

const express = require('express');
const { getDb, uid } = require('./schema');
const router = express.Router();

// Columns exposed to client — never include internal `id` or `mediatype_id`
function row(r) {
  if (!r) return null;
  return {
    uid: r.uid,
    name: r.name,
    description: r.description,
    path: r.path,
    mediatypeUid: r.mediatype_uid,
    mediatypeName: r.mediatype_name,
    mediatypeColor: r.mediatype_color,
    mediatypeType: r.mediatype_type,
  };
}

const SELECT = `
  SELECT
    ms.uid, ms.name, ms.description, ms.path,
    mt.uid   AS mediatype_uid,
    mt.name  AS mediatype_name,
    mt.color AS mediatype_color,
    mt.type  AS mediatype_type
  FROM mediasources ms
  JOIN mediatypes mt ON mt.id = ms.mediatype_id
`;

// GET /db/mediasources
router.get('/', (req, res) => {
  const rows = getDb().prepare(`${SELECT} ORDER BY ms.name`).all();
  res.json(rows.map(row));
});

// POST /db/mediasources  { name, path, mediatypeUid, description? }
router.post('/', (req, res) => {
  const { name, path: srcPath, mediatypeUid, description = '' } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  if (!srcPath?.trim()) return res.status(400).json({ error: 'path is required' });
  if (!mediatypeUid?.trim()) return res.status(400).json({ error: 'mediatypeUid is required' });

  const mt = getDb().prepare('SELECT id FROM mediatypes WHERE uid = ?').get(mediatypeUid);
  if (!mt) return res.status(400).json({ error: 'mediatypeUid not found' });

  const newUid = uid();
  try {
    getDb().prepare(
      'INSERT INTO mediasources (uid, name, description, path, mediatype_id) VALUES (?, ?, ?, ?, ?)'
    ).run(newUid, name.trim(), description.trim(), srcPath.trim(), mt.id);
    const created = getDb().prepare(`${SELECT} WHERE ms.uid = ?`).get(newUid);
    res.status(201).json(row(created));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /db/mediasources/:uid  { name?, path?, mediatypeUid?, description? }
router.put('/:uid', (req, res) => {
  const existing = getDb().prepare(`
    SELECT ms.*, mt.uid AS mt_uid
    FROM mediasources ms JOIN mediatypes mt ON mt.id = ms.mediatype_id
    WHERE ms.uid = ?
  `).get(req.params.uid);
  if (!existing) return res.status(404).json({ error: 'not found' });

  const { name = existing.name, path: srcPath = existing.path, mediatypeUid = existing.mt_uid, description = existing.description } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  if (!srcPath?.trim()) return res.status(400).json({ error: 'path is required' });

  const mt = getDb().prepare('SELECT id FROM mediatypes WHERE uid = ?').get(mediatypeUid);
  if (!mt) return res.status(400).json({ error: 'mediatypeUid not found' });

  getDb().prepare(
    'UPDATE mediasources SET name = ?, description = ?, path = ?, mediatype_id = ? WHERE uid = ?'
  ).run(name.trim(), description.trim(), srcPath.trim(), mt.id, req.params.uid);

  const updated = getDb().prepare(`${SELECT} WHERE ms.uid = ?`).get(req.params.uid);
  res.json(row(updated));
});

// DELETE /db/mediasources/:uid
router.delete('/:uid', (req, res) => {
  const existing = getDb().prepare('SELECT id FROM mediasources WHERE uid = ?').get(req.params.uid);
  if (!existing) return res.status(404).json({ error: 'not found' });
  getDb().prepare('DELETE FROM mediasources WHERE uid = ?').run(req.params.uid);
  res.json({ ok: true });
});

module.exports = router;
