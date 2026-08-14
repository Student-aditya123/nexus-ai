/**
 * NEXUS AI - Memory Service
 * Short-term (session) + Long-term (vector) memory for personalized AI
 * Implements sliding window + semantic memory retrieval
 */

'use strict';

const { cache } = require('../../config/redis');
const groqService = require('../ai/groq.service');
const vectorStore = require('../ai/vectorStore.service');
const ChatSession = require('../../models/chatSession.model');
const logger = require('../../utils/logger');

class MemoryService {
  constructor() {
    this.shortTermWindow = 10;   // Last N messages in context
    this.longTermTopK = 3;       // Top relevant past memories
    this.sessionTTL = 3600;      // 1 hour session TTL in Redis
  }

  /**
   * Get full conversation context for AI (short-term + long-term)
   */
  async getContextForQuery(userId, sessionId, query) {
    const [shortTerm, longTerm] = await Promise.all([
      this._getShortTermMemory(sessionId),
      this._getLongTermMemory(userId, query),
    ]);

    return {
      recentMessages: shortTerm,
      relevantHistory: longTerm,
      contextString: this._buildContextString(shortTerm, longTerm),
    };
  }

  /**
   * Save a message to both short and long-term memory
   */
  async saveMessage(userId, sessionId, message) {
    // Short-term: Redis with sliding window
    await this._appendToShortTerm(sessionId, message);

    // Long-term: Store significant messages in vector DB
    if (message.role === 'assistant' && message.content.length > 100) {
      await this._storeInLongTerm(userId, sessionId, message);
    }
  }

  /**
   * Get user's conversation history with pagination
   */
  async getHistory(userId, sessionId, options = {}) {
    const { page = 1, limit = 20 } = options;

    // First check Redis cache
    const cached = await this._getShortTermMemory(sessionId);
    if (cached.length > 0) {
      const start = (page - 1) * limit;
      return cached.slice(start, start + limit);
    }

    // Fallback to MongoDB
    const session = await ChatSession.findOne({ _id: sessionId, userId })
      .select('messages')
      .lean();

    if (!session) return [];

    const messages = session.messages || [];
    const start = Math.max(0, messages.length - page * limit);
    return messages.slice(start, start + limit);
  }

  /**
   * Create a new chat session
   */
  async createSession(userId, title = 'New Chat') {
    const session = await ChatSession.create({
      userId,
      title,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return session;
  }

  /**
   * Generate a smart title for a conversation from its content
   */
  async generateSessionTitle(messages) {
    if (!messages.length) return 'New Chat';

    const preview = messages.slice(0, 3)
      .map(m => `${m.role}: ${m.content.slice(0, 100)}`)
      .join('\n');

    const result = await groqService.complete([{
      role: 'user',
      content: `Generate a short, descriptive title (max 6 words) for this conversation:\n${preview}\n\nReturn ONLY the title, no quotes or punctuation.`,
    }], { maxTokens: 20, temperature: 0.3 });

    return result.content.trim().slice(0, 60) || 'New Chat';
  }

  /**
   * Summarize old messages to compress context window
   */
  async compressHistory(messages) {
    if (messages.length <= this.shortTermWindow) return messages;

    const toCompress = messages.slice(0, -this.shortTermWindow);
    const toKeep = messages.slice(-this.shortTermWindow);

    const summaryText = toCompress
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');

    const summary = await groqService.summarize(summaryText, {
      style: 'bullet',
      maxLength: 200,
    });

    const summaryMessage = {
      role: 'system',
      content: `[Conversation Summary - Earlier Context]\n${summary.content}`,
      isCompressed: true,
      timestamp: new Date().toISOString(),
    };

    return [summaryMessage, ...toKeep];
  }

  // ─── Private Methods ─────────────────────────────────────────────────────────

  async _getShortTermMemory(sessionId) {
    const cacheKey = `memory:session:${sessionId}`;
    const cached = await cache.get(cacheKey);
    return cached || [];
  }

  async _appendToShortTerm(sessionId, message) {
    const cacheKey = `memory:session:${sessionId}`;
    let messages = await cache.get(cacheKey) || [];

    messages.push({
      ...message,
      timestamp: message.timestamp || new Date().toISOString(),
    });

    // Sliding window - keep last N messages
    if (messages.length > this.shortTermWindow * 2) {
      messages = messages.slice(-this.shortTermWindow * 2);
    }

    await cache.set(cacheKey, messages, this.sessionTTL);
  }

  async _getLongTermMemory(userId, query) {
    try {
      const results = await vectorStore.search(query, `memory_${userId}`, {
        topK: this.longTermTopK,
        threshold: 0.75,
      });

      return results.map(r => ({
        content: r.text,
        timestamp: r.metadata.timestamp,
        relevance: r.score,
      }));
    } catch (error) {
      logger.debug('Long-term memory retrieval failed:', error.message);
      return [];
    }
  }

  async _storeInLongTerm(userId, sessionId, message) {
    try {
      const namespace = `memory_${userId}`;
      await vectorStore.upsertDocument(
        `memory_${sessionId}_${Date.now()}`,
        namespace,
        [{
          text: message.content,
          metadata: {
            type: 'memory',
            sessionId,
            timestamp: message.timestamp || new Date().toISOString(),
            role: message.role,
          },
        }]
      );
    } catch (error) {
      logger.debug('Long-term memory storage failed:', error.message);
    }
  }

  _buildContextString(shortTerm, longTerm) {
    let context = '';

    if (longTerm.length > 0) {
      context += `RELEVANT PAST INTERACTIONS:\n`;
      longTerm.forEach(m => {
        context += `- [${new Date(m.timestamp).toLocaleDateString()}] ${m.content.slice(0, 200)}\n`;
      });
      context += '\n';
    }

    return context;
  }
}

module.exports = new MemoryService();
