/**
 * NEXUS AI - Chat Controller
 * Handles chat, RAG, and streaming responses
 * SSE streaming for real-time token delivery
 */

'use strict';

const groqService = require('../services/ai/groq.service');
const vectorStore = require('../services/ai/vectorStore.service');
const memoryService = require('../services/memory/memory.service');
const { ChatSession, Document } = require('../models/index');
const { AppError, asyncHandler } = require('../utils/errors');
const logger = require('../utils/logger');

// ─── Session Management ───────────────────────────────────────────────────────

exports.createSession = asyncHandler(async (req, res) => {
  const { title, mode = 'chat', documentIds = [] } = req.body;
  const userId = req.user._id;

  const session = await memoryService.createSession(userId, title);

  if (mode !== 'chat') session.mode = mode;
  if (documentIds.length) session.attachedDocuments = documentIds;

  await session.save();

  res.status(201).json({
    success: true,
    data: session,
  });
});

exports.getSessions = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, archived = false } = req.query;
  const userId = req.user._id;

  const sessions = await ChatSession.find({
    userId,
    isArchived: archived === 'true',
  })
    .sort({ updatedAt: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit))
    .select('title mode stats createdAt updatedAt isPinned attachedDocuments')
    .lean();

  const total = await ChatSession.countDocuments({ userId, isArchived: archived === 'true' });

  res.json({
    success: true,
    data: sessions,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

exports.getSession = asyncHandler(async (req, res) => {
  const session = await ChatSession.findOne({
    _id: req.params.sessionId,
    $or: [{ userId: req.user._id }, { sharedWith: req.user._id }],
  }).populate('attachedDocuments', 'originalName fileType content.pageCount processing.status');

  if (!session) throw new AppError('Session not found', 404);

  res.json({ success: true, data: session });
});

exports.deleteSession = asyncHandler(async (req, res) => {
  await ChatSession.findOneAndDelete({
    _id: req.params.sessionId,
    userId: req.user._id,
  });

  res.json({ success: true, message: 'Session deleted' });
});

// ─── Main Chat Endpoint ───────────────────────────────────────────────────────

exports.chat = asyncHandler(async (req, res) => {
  const { sessionId, message, stream = true } = req.body;
  const userId = req.user._id;

  if (!message?.trim()) throw new AppError('Message is required', 400);
  if (!req.user.hasTokenBudget(500)) throw new AppError('Token limit exceeded. Please upgrade your plan.', 429);

  const session = await ChatSession.findOne({
    _id: sessionId,
    $or: [{ userId }, { sharedWith: userId }],
  });

  if (!session) throw new AppError('Session not found', 404);

  // Save user message
  const userMessage = {
    role: 'user',
    content: message,
    timestamp: new Date(),
  };

  session.messages.push(userMessage);

  // Get conversation history for context
  const conversationHistory = session.messages
    .slice(-10)
    .map(m => ({ role: m.role, content: m.content }));

  const startTime = Date.now();

  // ─── Streaming Response ─────────────────────────────────────────────────────
  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const sendEvent = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      let fullContent = '';
      let sources = [];

      // RAG mode: fetch relevant document context
      if (session.mode === 'rag' && session.attachedDocuments?.length) {
        sendEvent({ type: 'status', message: 'Searching documents...' });

        const docIds = session.attachedDocuments.map(d => d.toString());
        const contextChunks = await vectorStore.search(message, userId.toString(), {
          topK: 5,
          documentIds: docIds,
        });

        sources = contextChunks.map(c => ({
          documentId: c.metadata.documentId,
          filename: c.metadata.filename,
          page: c.metadata.page,
          excerpt: c.text.slice(0, 200),
          score: c.score,
        }));

        sendEvent({ type: 'sources', data: sources });

        // Stream RAG response
        for await (const chunk of groqService.streamRagComplete(
          message,
          contextChunks,
          conversationHistory.slice(0, -1) // Exclude the message we just added
        )) {
          if (chunk.type === 'delta') {
            fullContent += chunk.content;
            sendEvent({ type: 'delta', content: chunk.content });
          }
        }

      } else {
        // Standard streaming chat
        for await (const chunk of groqService.streamComplete(conversationHistory)) {
          if (chunk.type === 'delta') {
            fullContent += chunk.content;
            sendEvent({ type: 'delta', content: chunk.content });
          }
        }
      }

      const latency = Date.now() - startTime;
      const estimatedTokens = Math.ceil(fullContent.split(/\s+/).length * 1.3);

      // Save assistant response
      const assistantMessage = {
        role: 'assistant',
        content: fullContent,
        metadata: {
          model: process.env.GROQ_MODEL,
          tokensUsed: estimatedTokens,
          latency,
          sources,
          isStreamed: true,
        },
        timestamp: new Date(),
      };

      session.messages.push(assistantMessage);
      session.updatedAt = new Date();

      // Auto-generate title for new sessions
      if (session.messages.length === 2) {
        session.title = await memoryService.generateSessionTitle(
          session.messages.slice(0, 2)
        );
      }

      await session.save();
      await req.user.incrementTokens(estimatedTokens);

      sendEvent({
        type: 'complete',
        messageId: assistantMessage._id,
        sessionId,
        title: session.title,
        usage: { tokens: estimatedTokens, latency },
      });

      res.end();

    } catch (error) {
      logger.error('Stream error:', error);
      sendEvent({ type: 'error', message: error.message });
      res.end();
    }

  } else {
    // ─── Non-streaming fallback ───────────────────────────────────────────────
    let result;
    let sources = [];

    if (session.mode === 'rag' && session.attachedDocuments?.length) {
      const contextChunks = await vectorStore.search(message, userId.toString(), { topK: 5 });
      sources = contextChunks.map(c => ({
        documentId: c.metadata.documentId,
        filename: c.metadata.filename,
        page: c.metadata.page,
        excerpt: c.text.slice(0, 200),
        score: c.score,
      }));
      result = await groqService.ragComplete(message, contextChunks, conversationHistory);
    } else {
      result = await groqService.complete(conversationHistory);
    }

    const assistantMessage = {
      role: 'assistant',
      content: result.content,
      metadata: {
        model: result.model,
        tokensUsed: result.usage?.total_tokens || 0,
        latency: result.latency,
        sources,
      },
      timestamp: new Date(),
    };

    session.messages.push(assistantMessage);
    await session.save();

    res.json({
      success: true,
      data: {
        message: assistantMessage,
        sessionId,
        sources,
      },
    });
  }
});

// ─── Utility Endpoints ────────────────────────────────────────────────────────

exports.updateSession = asyncHandler(async (req, res) => {
  const { title, isPinned, isArchived, attachedDocuments } = req.body;

  const update = {};
  if (title !== undefined) update.title = title;
  if (isPinned !== undefined) update.isPinned = isPinned;
  if (isArchived !== undefined) update.isArchived = isArchived;
  if (attachedDocuments !== undefined) update.attachedDocuments = attachedDocuments;

  const session = await ChatSession.findOneAndUpdate(
    { _id: req.params.sessionId, userId: req.user._id },
    update,
    { new: true }
  );

  if (!session) throw new AppError('Session not found', 404);

  res.json({ success: true, data: session });
});

exports.getSessionMessages = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50 } = req.query;

  const session = await ChatSession.findOne({
    _id: req.params.sessionId,
    $or: [{ userId: req.user._id }, { sharedWith: req.user._id }],
  }).select('messages');

  if (!session) throw new AppError('Session not found', 404);

  const total = session.messages.length;
  const start = Math.max(0, total - page * limit);
  const messages = session.messages.slice(start, start + parseInt(limit));

  res.json({
    success: true,
    data: messages,
    pagination: { page: parseInt(page), limit: parseInt(limit), total },
  });
});
