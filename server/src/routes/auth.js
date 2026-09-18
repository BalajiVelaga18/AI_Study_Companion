const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { User, Event } = require('../models');
const { sign } = require('../middleware/auth');

const r = express.Router();
r.post('/register', async (req, res) => {
  const p = z.object({ name: z.string().optional(), email: z.string().email(), password: z.string().min(6) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ success: false, error: { code: 'invalid_input', message: 'valid email + password≥6 required' } });
  if (await User.findOne({ email: p.data.email })) return res.status(409).json({ success: false, error: { code: 'email_taken', message: 'email taken' } });
  const u = await User.create({ name: p.data.name || p.data.email.split('@')[0], email: p.data.email, passwordHash: bcrypt.hashSync(p.data.password, 10), role: 'user' });
  await Event.create({ ownerId: u._id, type: 'user.register', data: { email: u.email } });
  res.json({ token: sign(u), user: { id: u._id, name: u.name, email: u.email, role: u.role } });
});
r.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const u = await User.findOne({ email });
  if (!u || !bcrypt.compareSync(password || '', u.passwordHash)) return res.status(401).json({ success: false, error: { code: 'bad_credentials', message: 'bad credentials' } });
  res.json({ token: sign(u), user: { id: u._id, name: u.name, email: u.email, role: u.role } });
});
r.post('/logout', (req, res) => res.json({ success: true, data: { ok: true } })); // stateless JWT: client discards token
r.get('/me', require('../middleware/auth').auth, async (req, res) => {
  const u = await User.findById(req.user.id).select('name email role createdAt');
  if (!u) return res.status(404).json({ success: false, error: { code: 'not_found', message: 'user not found' } });
  res.json({ id: u._id, name: u.name, email: u.email, role: u.role });
});
module.exports = r;
