const mongoose = require('mongoose');

const { Schema } = mongoose;

const UserSchema = new Schema({ name: String, email: { type: String, unique: true }, passwordHash: String, role: { type: String, default: 'user' }, createdAt: { type: Date, default: Date.now }, updatedAt: { type: Date, default: Date.now } });
const SpaceSchema = new Schema({ ownerId: Schema.Types.ObjectId, name: String, description: String, icon: String, color: String, createdAt: { type: Date, default: Date.now }, updatedAt: { type: Date, default: Date.now } });
const ProjectSchema = new Schema({ ownerId: Schema.Types.ObjectId, spaceId: Schema.Types.ObjectId, name: String, description: String, goal: String, learningGoal: String, progress: { type: Number, default: 0 }, createdAt: { type: Date, default: Date.now }, updatedAt: { type: Date, default: Date.now } });
const MaterialSchema = new Schema({
  ownerId: Schema.Types.ObjectId, projectId: Schema.Types.ObjectId, filename: String, path: String, storageUrl: String,
  status: { type: String, default: 'queued' }, // queued|processing|ready|failed
  error: String, errorMessage: String, pageCount: Number, idempotencyKey: String, attempts: { type: Number, default: 0 }, createdAt: { type: Date, default: Date.now }, updatedAt: { type: Date, default: Date.now }
});
const ChunkSchema = new Schema({ ownerId: Schema.Types.ObjectId, projectId: Schema.Types.ObjectId, materialId: Schema.Types.ObjectId, filename: String, page: Number, pageNumber: Number, text: String, chunkIndex: Number, tokens: [String], embedding: [Number], metadata: Schema.Types.Mixed });
const ConceptSchema = new Schema({ ownerId: Schema.Types.ObjectId, projectId: Schema.Types.ObjectId, name: String, mastery: { type: Number, default: 0.3 }, history: [{ v: Number, at: Date }], updatedAt: { type: Date, default: Date.now } });
const MessageSchema = new Schema({ ownerId: Schema.Types.ObjectId, projectId: Schema.Types.ObjectId, conversationId: Schema.Types.ObjectId, role: String, text: String, citations: Array, provider: String, fallbackUsed: Boolean, basis: String, retrievalMethod: String, retrievalFallbackUsed: Boolean, retrievalFallbackReason: String, createdAt: { type: Date, default: Date.now } });
MessageSchema.index({ conversationId: 1, createdAt: 1 });
const ConversationSchema = new Schema({
  ownerId: Schema.Types.ObjectId, projectId: Schema.Types.ObjectId,
  title: { type: String, default: 'New conversation' },
  summary: { type: String, default: '' }, // rolling summary of older messages (never the full transcript)
  summaryCount: { type: Number, default: 0 }, // messageCount at last summarization
  messageCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }, updatedAt: { type: Date, default: Date.now },
});
ConversationSchema.index({ ownerId: 1, projectId: 1, updatedAt: -1 });
const QuizSchema = new Schema({
  ownerId: Schema.Types.ObjectId, projectId: Schema.Types.ObjectId, items: Array, answers: Array,
  score: Number, completed: { type: Boolean, default: false }, createdAt: { type: Date, default: Date.now }
});
const EventSchema = new Schema({ ownerId: Schema.Types.ObjectId, projectId: Schema.Types.ObjectId, spaceId: Schema.Types.ObjectId, type: String, data: Schema.Types.Mixed, at: { type: Date, default: Date.now } });
const AIUsageSchema = new Schema({ ownerId: Schema.Types.ObjectId, projectId: Schema.Types.ObjectId, feature: String, model: String, provider: String, fallbackUsed: Boolean, fallbackProvider: String, errorCategory: String, latencyMs: Number, tokens: Number, inputTokens: Number, outputTokens: Number, costUsd: Number, ok: Boolean, error: String, retrievalMethod: String, retrievalFallbackUsed: Boolean, at: { type: Date, default: Date.now } });
const JobSchema = new Schema({ ownerId: Schema.Types.ObjectId, kind: String, refId: Schema.Types.ObjectId, status: { type: String, default: 'queued' }, attempts: { type: Number, default: 0 }, lastError: String, idempotencyKey: String, updatedAt: { type: Date, default: Date.now } });
const RecSchema = new Schema({ ownerId: Schema.Types.ObjectId, projectId: Schema.Types.ObjectId, text: String, reason: String, createdAt: { type: Date, default: Date.now } });
const LearnCtxSchema = new Schema({ ownerId: Schema.Types.ObjectId, projectId: Schema.Types.ObjectId, strengths: [String], weaknesses: [String], mistakes: [String], prefs: Schema.Types.Mixed, updatedAt: { type: Date, default: Date.now } });

module.exports = {
  User: mongoose.model('User', UserSchema),
  Space: mongoose.model('Space', SpaceSchema),
  Project: mongoose.model('Project', ProjectSchema),
  Material: mongoose.model('Material', MaterialSchema),
  Chunk: mongoose.model('Chunk', ChunkSchema),
  Concept: mongoose.model('Concept', ConceptSchema),
  Message: mongoose.model('Message', MessageSchema),
  Quiz: mongoose.model('Quiz', QuizSchema),
  Conversation: mongoose.model('Conversation', ConversationSchema),
  Event: mongoose.model('Event', EventSchema),
  AIUsage: mongoose.model('AIUsage', AIUsageSchema),
  Job: mongoose.model('Job', JobSchema),
  Rec: mongoose.model('Rec', RecSchema),
  LearnCtx: mongoose.model('LearnCtx', LearnCtxSchema),
};
