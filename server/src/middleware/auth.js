const jwt = require('jsonwebtoken');
const { Project } = require('../models');

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
function sign(user) { return jwt.sign({ id: user._id.toString(), role: user.role }, SECRET, { expiresIn: '7d' }); }
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!tok) return res.status(401).json({ success: false, error: { code: 'unauthorized', message: 'unauthorized' } });
  try { req.user = jwt.verify(tok, SECRET); next(); }
  catch { return res.status(401).json({ success: false, error: { code: 'invalid_token', message: 'invalid token' } }); }
}
function admin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ success: false, error: { code: 'admin_only', message: 'admin only' } });
  next();
}
// Enforce project ownership (data isolation). Attaches req.project.
async function projectScope(req, res, next) {
  const id = req.params.projectId || req.body.projectId || req.query.projectId;
  if (!id) return res.status(400).json({ error: 'projectId required' });
  const p = await Project.findById(id);
  if (!p) return res.status(404).json({ error: 'project not found' });
  if (p.ownerId.toString() !== req.user.id) return res.status(403).json({ error: 'cross-project access denied' });
  req.project = p;
  next();
}
module.exports = { sign, auth, admin, projectScope };
