/**
 * NEXUS AI - MongoDB Models
 * Production-grade schemas with indexes, virtuals, and hooks
 */

'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ─── User Model ───────────────────────────────────────────────────────────────

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  name: { type: String, required: true, trim: true },
  avatar: { type: String, default: null },
  passwordHash: { type: String, select: false },
  
  googleId: { type: String, sparse: true, index: true },
  authProvider: { type: String, enum: ['local', 'google'], default: 'local' },

  role: { type: String, enum: ['user', 'admin', 'enterprise'], default: 'user' },
  
  plan: {
    type: { type: String, enum: ['free', 'pro', 'enterprise'], default: 'free' },
    tokensUsed: { type: Number, default: 0 },
    tokenLimit: { type: Number, default: 100000 },
    documentsUsed: { type: Number, default: 0 },
    documentLimit: { type: Number, default: 5 },
    resetDate: { type: Date, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
  },

  stripeCustomerId: { type: String, sparse: true },
  
  settings: {
    theme: { type: String, default: 'dark' },
    language: { type: String, default: 'en' },
    streamingEnabled: { type: Boolean, default: true },
    notifications: { type: Boolean, default: true },
  },

  lastActive: { type: Date, default: Date.now },
  isVerified: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  
  refreshTokens: [{ type: String, select: false }],
}, {
  timestamps: true,
  toJSON: { virtuals: true },
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('passwordHash')) return next();
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  next();
});

userSchema.methods.comparePassword = async function(password) {
  return bcrypt.compare(password, this.passwordHash);
};

userSchema.methods.hasTokenBudget = function(tokensNeeded) {
  return (this.plan.tokensUsed + tokensNeeded) <= this.plan.tokenLimit;
};

userSchema.methods.incrementTokens = async function(tokens) {
  this.plan.tokensUsed += tokens;
  return this.save();
};

userSchema.virtual('planDisplayName').get(function() {
  const plans = { free: 'Free', pro: 'Pro', enterprise: 'Enterprise' };
  return plans[this.plan.type] || 'Free';
});

// ─── Chat Session Model ───────────────────────────────────────────────────────

const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
  content: { type: String, required: true },
  
  metadata: {
    model: String,
    tokensUsed: Number,
    latency: Number,
    sources: [{
      documentId: mongoose.Types.ObjectId,
      filename: String,
      page: Number,
      excerpt: String,
      score: Number,
    }],
    agentSteps: { type: mongoose.Schema.Types.Mixed },
    isStreamed: Boolean,
  },
  
  timestamp: { type: Date, default: Date.now },
}, { _id: true });

const chatSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, default: 'New Chat' },
  
  mode: {
    type: String,
    enum: ['chat', 'rag', 'agent'],
    default: 'chat',
  },
  
  attachedDocuments: [{
    type: mongoose.Types.ObjectId,
    ref: 'Document',
  }],
  
  messages: [messageSchema],
  
  stats: {
    messageCount: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
    avgLatency: { type: Number, default: 0 },
  },
  
  isArchived: { type: Boolean, default: false },
  isPinned: { type: Boolean, default: false },
  
  sharedWith: [{ type: mongoose.Types.ObjectId, ref: 'User' }],
  isPublic: { type: Boolean, default: false },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
});

chatSessionSchema.index({ userId: 1, createdAt: -1 });
chatSessionSchema.index({ userId: 1, updatedAt: -1 });

chatSessionSchema.pre('save', function(next) {
  if (this.isModified('messages')) {
    this.stats.messageCount = this.messages.length;
    this.stats.totalTokens = this.messages.reduce((sum, m) => 
      sum + (m.metadata?.tokensUsed || 0), 0
    );
  }
  next();
});

// ─── Document Model ───────────────────────────────────────────────────────────

const documentSchema = new mongoose.Schema({
  userId: { type: mongoose.Types.ObjectId, ref: 'User', required: true, index: true },
  
  filename: { type: String, required: true },
  originalName: { type: String, required: true },
  
  fileType: { type: String, enum: ['pdf', 'docx', 'pptx', 'txt', 'md'], required: true },
  fileSize: { type: Number, required: true },
  
  storage: {
    provider: { type: String, enum: ['s3', 'cloudinary', 'local'], default: 's3' },
    url: String,
    key: String,
    bucket: String,
  },
  
  processing: {
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    startedAt: Date,
    completedAt: Date,
    error: String,
    progress: { type: Number, default: 0, min: 0, max: 100 },
  },
  
  content: {
    pageCount: Number,
    wordCount: Number,
    chunkCount: Number,
    preview: String,
    language: String,
  },
  
  metadata: {
    title: String,
    author: String,
    createdDate: Date,
    tags: [String],
  },
  
  vectorized: { type: Boolean, default: false },
  vectorCount: { type: Number, default: 0 },
  
  stats: {
    queryCount: { type: Number, default: 0 },
    lastQueried: Date,
  },
  
  sharedWith: [{ type: mongoose.Types.ObjectId, ref: 'User' }],
  isPublic: { type: Boolean, default: false },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
});

documentSchema.index({ userId: 1, createdAt: -1 });
documentSchema.index({ 'processing.status': 1 });

documentSchema.virtual('isReady').get(function() {
  return this.processing.status === 'completed' && this.vectorized;
});

documentSchema.virtual('sizeMB').get(function() {
  return (this.fileSize / (1024 * 1024)).toFixed(2);
});

const User = mongoose.model('User', userSchema);
const ChatSession = mongoose.model('ChatSession', chatSessionSchema);
const Document = mongoose.model('Document', documentSchema);

module.exports = { User, ChatSession, Document };
