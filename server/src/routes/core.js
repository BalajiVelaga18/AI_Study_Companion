const express = require('express');
const { Space, Project, Event } = require('../models');
const { auth } = require('../middleware/auth');
const r = express.Router();
r.use(auth);

r.get('/spaces', async (req, res) => res.json(await Space.find({ ownerId: req.user.id })));
r.post('/spaces', async (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'name required' });
  const s = await Space.create({ ownerId: req.user.id, name: req.body.name, description: req.body.description || '' });
  await Event.create({ ownerId: req.user.id, spaceId: s._id, type: 'space.create', data: { name: s.name } });
  res.json(s);
});
r.get('/spaces/:id/projects', async (req, res) => {
  const s = await Space.findOne({ _id: req.params.id, ownerId: req.user.id });
  if (!s) return res.status(404).json({ error: 'not found' });
  res.json(await Project.find({ spaceId: s._id, ownerId: req.user.id }));
});
r.get('/spaces/:id', async (req, res) => {
  const s = await Space.findOne({ _id: req.params.id, ownerId: req.user.id });
  if (!s) return res.status(404).json({ success: false, error: { code: 'not_found', message: 'space not found' } });
  const projects = await Project.find({ spaceId: s._id, ownerId: req.user.id });
  res.json({ ...s.toObject(), projects });
});
r.patch('/spaces/:id', async (req, res) => {
  const s = await Space.findOneAndUpdate({ _id: req.params.id, ownerId: req.user.id }, { $set: { ...req.body, updatedAt: new Date() } }, { new: true });
  if (!s) return res.status(404).json({ error: 'not found' });
  res.json(s);
});
r.delete('/spaces/:id', async (req, res) => {
  const s = await Space.findOneAndDelete({ _id: req.params.id, ownerId: req.user.id });
  if (!s) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});
r.post('/projects', async (req, res) => {
  const { spaceId, name, goal, learningGoal, description } = req.body;
  if (!spaceId || !name) return res.status(400).json({ error: 'spaceId+name required' });
  const s = await Space.findOne({ _id: spaceId, ownerId: req.user.id });
  if (!s) return res.status(403).json({ error: 'invalid space' });
  const g = goal || learningGoal || '';
  const p = await Project.create({ ownerId: req.user.id, spaceId, name, goal: g, learningGoal: g, description: description || '' });
  await Event.create({ ownerId: req.user.id, spaceId, projectId: p._id, type: 'project.create', data: { name } });
  res.json(p);
});
r.get('/projects', async (req, res) => {
  const f = { ownerId: req.user.id };
  if (req.query.spaceId) f.spaceId = req.query.spaceId;
  res.json(await Project.find(f).sort({ createdAt: -1 }));
});
r.get('/projects/:id', async (req, res) => {
  const p = await Project.findOne({ _id: req.params.id, ownerId: req.user.id });
  if (!p) return res.status(404).json({ error: 'not found' });
  res.json(p);
});
r.patch('/projects/:id', async (req, res) => {
  const allowed = {};
  for (const k of ['name', 'description', 'goal', 'learningGoal', 'progress']) if (req.body[k] !== undefined) allowed[k] = req.body[k];
  if (allowed.learningGoal && !allowed.goal) allowed.goal = allowed.learningGoal;
  if (allowed.goal && !allowed.learningGoal) allowed.learningGoal = allowed.goal;
  allowed.updatedAt = new Date();
  const p = await Project.findOneAndUpdate({ _id: req.params.id, ownerId: req.user.id }, { $set: allowed }, { new: true });
  if (!p) return res.status(404).json({ error: 'not found' });
  res.json(p);
});
r.delete('/projects/:id', async (req, res) => {
  const p = await Project.findOneAndDelete({ _id: req.params.id, ownerId: req.user.id });
  if (!p) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});
module.exports = r;
