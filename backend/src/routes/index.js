/**
 * NEXUS AI - Route Definitions
 * All routes in one organized file for clarity
 */

'use strict';

const express = require('express');
const multer = require('multer');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { authLimiter, aiLimiter, uploadLimiter } = require('../middleware/rateLimit.middleware');
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validate.middleware');

// Controllers
const authController = require('../controllers/auth.controller');
const chatController = require('../controllers/chat.controller');
const documentController = require('../controllers/document.controller');
const agentController = require('../controllers/agent.controller');

// ─── Auth Routes ──────────────────────────────────────────────────────────────
const authRouter = express.Router();

authRouter.post('/register', authLimiter,
  body('name').trim().isLength({ min: 2, max: 50 }),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).matches(/^(?=.*[A-Z])(?=.*[0-9])/),
  validate,
  authController.register
);

authRouter.post('/login', authLimiter,
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  validate,
  authController.login
);

authRouter.post('/refresh', authController.refresh);
authRouter.post('/logout', authenticate, authController.logout);
authRouter.get('/me', authenticate, authController.getMe);
authRouter.patch('/profile', authenticate, authController.updateProfile);

// ─── Chat Routes ──────────────────────────────────────────────────────────────
const chatRouter = express.Router();
chatRouter.use(authenticate);

chatRouter.get('/sessions', chatController.getSessions);
chatRouter.post('/sessions', chatController.createSession);
chatRouter.get('/sessions/:sessionId', chatController.getSession);
chatRouter.patch('/sessions/:sessionId', chatController.updateSession);
chatRouter.delete('/sessions/:sessionId', chatController.deleteSession);
chatRouter.get('/sessions/:sessionId/messages', chatController.getSessionMessages);

chatRouter.post('/message', aiLimiter,
  body('sessionId').isMongoId(),
  body('message').trim().isLength({ min: 1, max: 10000 }),
  validate,
  chatController.chat
);

// ─── Document Routes ──────────────────────────────────────────────────────────
const documentRouter = express.Router();
documentRouter.use(authenticate);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowed = /pdf|docx|doc|pptx|ppt|txt|md/;
    const ext = file.originalname.split('.').pop().toLowerCase();
    cb(null, allowed.test(ext));
  },
});

documentRouter.post('/upload', uploadLimiter, upload.single('document'), documentController.uploadDocument);
documentRouter.get('/', documentController.getDocuments);
documentRouter.get('/:documentId', documentController.getDocument);
documentRouter.delete('/:documentId', documentController.deleteDocument);
documentRouter.get('/:documentId/status', documentController.getDocumentStatus);
documentRouter.post('/:documentId/query', aiLimiter,
  body('query').trim().isLength({ min: 1, max: 2000 }),
  validate,
  documentController.queryDocument
);

// ─── Agent Routes ─────────────────────────────────────────────────────────────
const agentRouter = express.Router();
agentRouter.use(authenticate);

agentRouter.get('/tools', agentController.getTools);
agentRouter.post('/execute', aiLimiter,
  body('task').trim().isLength({ min: 1, max: 2000 }),
  validate,
  agentController.executeTask
);

// ─── User Routes ──────────────────────────────────────────────────────────────
const userRouter = express.Router();
userRouter.use(authenticate);

userRouter.get('/stats', async (req, res) => {
  const { ChatSession, Document } = require('../models/index');
  const [sessions, documents] = await Promise.all([
    ChatSession.countDocuments({ userId: req.user._id }),
    Document.countDocuments({ userId: req.user._id }),
  ]);

  res.json({
    success: true,
    data: {
      sessions,
      documents,
      tokensUsed: req.user.plan?.tokensUsed || 0,
      tokenLimit: req.user.plan?.tokenLimit || 100000,
      plan: req.user.plan?.type || 'free',
    },
  });
});

// ─── Analytics Routes ─────────────────────────────────────────────────────────
const analyticsRouter = express.Router();
analyticsRouter.use(authenticate);

analyticsRouter.get('/usage', async (req, res) => {
  const { ChatSession } = require('../models/index');
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const sessions = await ChatSession.find({
    userId: req.user._id,
    createdAt: { $gte: thirtyDaysAgo },
  }).select('stats createdAt mode').lean();

  const dailyStats = {};
  sessions.forEach(s => {
    const date = s.createdAt.toISOString().split('T')[0];
    if (!dailyStats[date]) dailyStats[date] = { messages: 0, tokens: 0, sessions: 0 };
    dailyStats[date].sessions += 1;
    dailyStats[date].messages += s.stats.messageCount;
    dailyStats[date].tokens += s.stats.totalTokens;
  });

  res.json({
    success: true,
    data: {
      summary: {
        totalSessions: sessions.length,
        totalMessages: sessions.reduce((s, c) => s + c.stats.messageCount, 0),
        totalTokens: sessions.reduce((s, c) => s + c.stats.totalTokens, 0),
        avgLatency: sessions.reduce((s, c) => s + (c.stats.avgLatency || 0), 0) / (sessions.length || 1),
      },
      daily: Object.entries(dailyStats).map(([date, stats]) => ({ date, ...stats })),
      byMode: {
        chat: sessions.filter(s => s.mode === 'chat').length,
        rag: sessions.filter(s => s.mode === 'rag').length,
        agent: sessions.filter(s => s.mode === 'agent').length,
      },
    },
  });
});

// ─── Billing Routes ───────────────────────────────────────────────────────────
const billingRouter = express.Router();
billingRouter.use(authenticate);

billingRouter.get('/plans', (req, res) => {
  res.json({
    success: true,
    data: [
      { id: 'free', name: 'Free', price: 0, tokens: 100000, documents: 5, features: ['Basic chat', '5 documents', '100K tokens/mo'] },
      { id: 'pro', name: 'Pro', price: 19, tokens: 2000000, documents: 100, features: ['Unlimited chat', '100 documents', '2M tokens/mo', 'Priority support', 'Agent mode'] },
      { id: 'enterprise', name: 'Enterprise', price: 99, tokens: -1, documents: -1, features: ['Everything in Pro', 'Unlimited tokens', 'Custom models', 'SSO', 'SLA'] },
    ],
  });
});

billingRouter.post('/checkout', async (req, res) => {
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const { planId } = req.body;

  const prices = { pro: 'price_pro_monthly', enterprise: 'price_enterprise_monthly' };
  if (!prices[planId]) return res.status(400).json({ success: false, message: 'Invalid plan' });

  const session = await stripe.checkout.sessions.create({
    customer_email: req.user.email,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: prices[planId], quantity: 1 }],
    success_url: `${process.env.FRONTEND_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.FRONTEND_URL}/billing/cancel`,
    metadata: { userId: req.user._id.toString(), planId },
  });

  res.json({ success: true, data: { url: session.url } });
});

// ─── Health Route ─────────────────────────────────────────────────────────────
const healthRouter = express.Router();

healthRouter.get('/', async (req, res) => {
  const { getConnectionStatus } = require('../config/database');
  const { getRedisClient } = require('../config/redis');

  let redisStatus = 'disconnected';
  try {
    const redis = getRedisClient();
    if (redis) { await redis.ping(); redisStatus = 'connected'; }
  } catch {}

  const dbStatus = getConnectionStatus();

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: require('../../package.json').version,
    services: {
      database: dbStatus.isConnected ? 'connected' : 'disconnected',
      redis: redisStatus,
      ai: process.env.GROQ_API_KEY ? 'configured' : 'not configured',
    },
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

module.exports = {
  authRoutes: authRouter,
  chatRoutes: chatRouter,
  documentRoutes: documentRouter,
  agentRoutes: agentRouter,
  userRoutes: userRouter,
  analyticsRoutes: analyticsRouter,
  billingRoutes: billingRouter,
  healthRoutes: healthRouter,
};
