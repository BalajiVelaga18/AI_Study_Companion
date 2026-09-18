const express = require('express');
const mongoose = require('mongoose');
const { Event, Quiz, Concept, Rec, Message, Project, Space, User, AIUsage, Job, Material } = require('../models');
const { auth, projectScope, admin } = require('../middleware/auth');
const { growth } = require('../services/learning');

const r = express.Router();
r.use(auth);

// --- existing project/global routes keep as-is ---
r.get('/project/:projectId', projectScope, async (req, res) => {
  const pid = req.project._id;
  const [events, quizzes, recs, msgs] = await Promise.all([
    Event.find({ projectId: pid }).sort({ at: -1 }).limit(50),
    Quiz.find({ projectId: pid }).sort({ createdAt: -1 }).limit(10),
    Rec.find({ projectId: pid }).sort({ createdAt: -1 }).limit(5),
    Message.countDocuments({ projectId: pid }),
  ]);
  const byDay = {};
  for (const e of await Event.find({ projectId: pid }).sort({ at: 1 }).limit(500)) {
    const d = e.at.toISOString().slice(0,10); byDay[d]=(byDay[d]||0)+1;
  }
  res.json({ growth: await growth(pid), quizzes: quizzes.map(q=>({id:q._id,score:q.score,completed:q.completed,at:q.createdAt})), recs, activity: events, tutorMessages: msgs, activityByDay: byDay });
});

r.get('/global', async (req, res) => {
  const projects = await Project.find({ ownerId: req.user.id });
  const spaces = await Space.find({ ownerId: req.user.id });
  const events = await Event.find({ ownerId: req.user.id }).sort({ at: -1 }).limit(100);
  const recs = await Rec.find({ ownerId: req.user.id }).sort({ createdAt: -1 }).limit(5);
  const weak = await Concept.find({ ownerId: req.user.id }).sort({ mastery: 1 }).limit(5);
  res.json({ projects: projects.length, spaces: spaces.length, recentActivity: events, nextActions: recs, needsAttention: weak });
});

// --- ADMIN (PRD §16) ---
r.get('/admin/overview', admin, async (req, res) => {
  const since24 = new Date(Date.now()-24*3600*1000), since7 = new Date(Date.now()-7*24*3600*1000);
  const [users, spaces, projects, events, events24, events7, active24, quizzes, tutorMsgs, ai, mats] = await Promise.all([
    User.countDocuments(), Space.countDocuments(), Project.countDocuments(),
    Event.countDocuments(), Event.countDocuments({at:{$gte:since24}}), Event.countDocuments({at:{$gte:since7}}),
    Event.distinct('ownerId',{at:{$gte:since24}}).then(a=>a.length),
    Quiz.find().limit(200), Message.countDocuments({role:'assistant'}),
    AIUsage.find().sort({at:-1}).limit(50), Material.find().sort({createdAt:-1}).limit(20),
  ]);
  const aiByFeature = await AIUsage.aggregate([{$group:{_id:'$feature',n:{$sum:1},avgMs:{$avg:'$latencyMs'},fail:{$sum:{$cond:['$ok',0,1]}},tokens:{$sum:'$tokens'}}}]);
  const jobsByStatus = await Job.aggregate([{$group:{_id:'$status',n:{$sum:1}}}]);
  const jobs = await Job.find().sort({updatedAt:-1}).limit(30);
  const completed = quizzes.filter(q=>q.completed);
  const avgScore = completed.length ? Math.round(completed.reduce((s,q)=>s+(q.score||0),0)/completed.length) : 0;
  const tutorEvents = await Event.find({type:'tutor.ask'}).sort({at:-1}).limit(200);
  const grounded = tutorEvents.filter(e=>e.data?.grounded).length;
  res.json({
    counts:{users,spaces,projects,events,tutorMsgs,materials:mats.length},
    engagement:{events24,events7,activeUsers24:active24,quizCompletion:`${completed.length}/${quizzes.length}`,avgQuizScore:avgScore},
    learning:{avgScore,quizzes:quizzes.slice(0,10).map(q=>({score:q.score,completed:q.completed,at:q.createdAt}))},
    ai:{recent:ai,byFeature:aiByFeature,failRate:ai.length?ai.filter(a=>!a.ok).length/ai.length:0},
    evaluation:{tutorGroundedPct:tutorEvents.length?Math.round(grounded/tutorEvents.length*100):null,tutorSamples:tutorEvents.length,note:'Full harness: npm --workspace server run eval'},
    jobs:{byStatus:jobsByStatus,recent:jobs}, materials:mats,
    health:{ok:true,at:new Date(),uptimeSec:Math.round(process.uptime()),mem:process.memoryUsage(),mongo:mongoose.connection.readyState===1?'connected':'down'}
  });
});

r.get('/admin/users', admin, async (req, res) => {
  const users = await User.find().limit(100);
  const out = [];
  for (const u of users) {
    const [projects,events,quizzes] = await Promise.all([
      Project.countDocuments({ownerId:u._id}), Event.countDocuments({ownerId:u._id}),
      Quiz.find({ownerId:u._id}).sort({createdAt:-1}).limit(5),
    ]);
    out.push({id:u._id,email:u.email,role:u.role,createdAt:u.createdAt,projects,events,lastScore:quizzes[0]?.score??null});
  }
  res.json(out);
});

r.get('/admin/users/:id', admin, async (req, res) => {
  const u = await User.findById(req.params.id); if(!u) return res.status(404).json({error:'not found'});
  const [spaces,projects,events,quizzes,concepts,ai,recs] = await Promise.all([
    Space.find({ownerId:u._id}), Project.find({ownerId:u._id}),
    Event.find({ownerId:u._id}).sort({at:-1}).limit(100),
    Quiz.find({ownerId:u._id}).sort({createdAt:-1}).limit(10),
    Concept.find({ownerId:u._id}).sort({mastery:1}).limit(20),
    AIUsage.find({ownerId:u._id}).sort({at:-1}).limit(30),
    Rec.find({ownerId:u._id}).sort({createdAt:-1}).limit(10),
  ]);
  res.json({user:{id:u._id,email:u.email,role:u.role},spaces,projects,activity:events,assessments:quizzes,progress:concepts,aiUsage:ai,recommendations:recs});
});

r.get('/admin/activity', admin, async (req, res) => {
  const f = {};
  if(req.query.type) f.type=req.query.type;
  if(req.query.userId) f.ownerId=req.query.userId;
  if(req.query.projectId) f.projectId=req.query.projectId;
  if(req.query.spaceId) f.spaceId=req.query.spaceId;
  if(req.query.from||req.query.to){ f.at={}; if(req.query.from) f.at.$gte=new Date(req.query.from); if(req.query.to) f.at.$lte=new Date(req.query.to); }
  res.json(await Event.find(f).sort({at:-1}).limit(Number(req.query.limit||200)));
});

r.get('/admin/jobs', admin, async (req, res) => {
  const f = req.query.status?{status:req.query.status}:{};
  res.json(await Job.find(f).sort({updatedAt:-1}).limit(100));
});

module.exports = r;