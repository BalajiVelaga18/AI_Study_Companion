const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuid } = require('uuid');
const { Material, Chunk } = require('../models');
const { auth, projectScope } = require('../middleware/auth');
const { enqueue, processMaterial } = require('../services/jobs');

const dir = process.env.UPLOAD_DIR || './uploads';
fs.mkdirSync(dir, { recursive: true });
const upload = multer({ dest: dir, limits: { fileSize: 25 * 1024 * 1024 }, fileFilter: (req, f, cb) => cb(null, f.originalname.toLowerCase().endsWith('.pdf')) });

const r = express.Router();
r.use(auth);

r.get('/:projectId/materials', projectScope, async (req, res) => {
  res.json(await Material.find({ projectId: req.project._id }).sort({ createdAt: -1 }));
});
// Single material (spec: GET /api/materials/:id) with ownership check
// NOTE: '/:projectId/materials' (2 segments) is matched first; this handles 1-segment ids.
r.get('/:id', async (req, res) => {
  if (req.params.id === 'single') return res.status(404).json({ error: 'not found' });
  const m = await Material.findById(req.params.id).catch(() => null);
  if (!m || m.ownerId.toString() !== req.user.id) return res.status(404).json({ success: false, error: { code: 'not_found', message: 'material not found' } });
  res.json(m);
});
r.get('/single/:id', async (req, res) => {
  const m = await Material.findById(req.params.id);
  if (!m || m.ownerId.toString() !== req.user.id) return res.status(404).json({ success: false, error: { code: 'not_found', message: 'material not found' } });
  res.json(m);
});
r.post('/:projectId/materials', projectScope, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'PDF file required' });
  const key = req.body.idempotencyKey || uuid();
  const dup = await Material.findOne({ projectId: req.project._id, idempotencyKey: key });
  if (dup) { fs.unlink(req.file.path, () => {}); return res.json(dup); }
  const dest = path.join(dir, `${Date.now()}-${req.file.originalname.replace(/[^a-z0-9.\-_]/gi, '_')}`);
  fs.renameSync(req.file.path, dest);
  const m = await Material.create({ ownerId: req.user.id, projectId: req.project._id, filename: req.file.originalname, path: dest, status: 'queued', idempotencyKey: key });
  await enqueue('material.process', m._id, req.user.id, `mat-${m._id}`, () => processMaterial(m._id));
  res.status(202).json(m);
});
r.get('/:projectId/chunks', projectScope, async (req, res) => {
  const chunks = await Chunk.find({ projectId: req.project._id }).limit(50);
  res.json(chunks.map((c) => ({ id: c._id, page: c.page, filename: c.filename, preview: c.text.slice(0, 200) })));
});
module.exports = r;
