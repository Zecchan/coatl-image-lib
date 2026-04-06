'use strict';

const express = require('express');
const { getDb, uid } = require('./schema');
const router = express.Router();

// Columns we expose — never include internal `id`
function row(r) {
  if (!r) return null;
  return { uid: r.uid, name: r.name, description: r.description, color: r.color, type: r.type };
}

// GET /db/mediatypes
router.get('/', (req, res) => {
  const rows = getDb().prepare('SELECT * FROM mediatypes ORDER BY name').all();
  res.json(rows.map(row));
});

// POST /db/mediatypes  { name, description?, color?, type? }
router.post('/', (req, res) => {
  const { name, description = '', color = '#7c5cbf', type = 1 } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  const newUid = uid();
  try {
    getDb().prepare(
      'INSERT INTO mediatypes (uid, name, description, color, type) VALUES (?, ?, ?, ?, ?)'
    ).run(newUid, name.trim(), description.trim(), color.trim(), Number(type));
    const created = getDb().prepare('SELECT * FROM mediatypes WHERE uid = ?').get(newUid);
    res.status(201).json(row(created));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /db/mediatypes/:uid  { name?, description?, color?, type? }
router.put('/:uid', (req, res) => {
  const existing = getDb().prepare('SELECT * FROM mediatypes WHERE uid = ?').get(req.params.uid);
  if (!existing) return res.status(404).json({ error: 'not found' });

  const { name = existing.name, description = existing.description, color = existing.color, type = existing.type } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

  getDb().prepare(
    'UPDATE mediatypes SET name = ?, description = ?, color = ?, type = ? WHERE uid = ?'
  ).run(name.trim(), description.trim(), color.trim(), Number(type), req.params.uid);

  res.json(row(getDb().prepare('SELECT * FROM mediatypes WHERE uid = ?').get(req.params.uid)));
});

// DELETE /db/mediatypes/:uid
router.delete('/:uid', (req, res) => {
  const existing = getDb().prepare('SELECT id FROM mediatypes WHERE uid = ?').get(req.params.uid);
  if (!existing) return res.status(404).json({ error: 'not found' });
  // Check for dependent mediasources
  const used = getDb().prepare('SELECT COUNT(*) as n FROM mediasources WHERE mediatype_id = ?').get(existing.id);
  if (used.n > 0) return res.status(409).json({ error: 'This media type is used by one or more media sources.' });
  getDb().prepare('DELETE FROM mediatypes WHERE uid = ?').run(req.params.uid);
  res.json({ ok: true });
});

module.exports = router;
