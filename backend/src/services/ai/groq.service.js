/**
 * NEXUS AI - Groq LPU Inference Service
 * Ultra-fast LLM inference with streaming support
 * Production-grade with error handling, retry logic, and monitoring
 */

'use strict';

const Groq = require('groq-sdk');
const logger = require('../../utils/logger');
const { cache } = require('../../config/redis');
const { AppError } = require('../../utils/errors');

class GroqService {
  constructor() {
    this.client = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });

    this.defaultModel = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
    this.maxRetries = 3;
    this.retryDelay = 1000;

    // System prompts
    this.systemPrompts = {
      assistant: `You are Nexus AI, an ultra-intelligent knowledge assistant powered by Groq's LPU inference engine.
You excel at analyzing documents, answering complex questions, and providing detailed, accurate responses.
Always be precise, cite sources when available, and structure your responses clearly.
If you're uncertain about something, say so. Never fabricate information.`,

      rag: `You are Nexus AI, a document intelligence specialist.
You have been provided with relevant document excerpts to answer the user's question.
CRITICAL RULES:
1. Base your answer ONLY on the provided context
2. Always cite your sources using [Source: document_name, Page: X] format
3. If the context doesn't contain enough information, say "Based on the provided documents, I cannot fully answer this question"
4. Highlight key insights and be concise but comprehensive`,

      agent: `You are Nexus AI Agent, an autonomous AI system with access to powerful tools.
You break down complex tasks into steps and execute them systematically.
Available tools: web_search, summarize, calculate, extract_data, analyze_document
Always explain your reasoning and show your work step-by-step.
Format your response with clear THOUGHT → ACTION → OBSERVATION → RESULT structure.`,

      memory: `You are Nexus AI with persistent memory of this user's history.
Use their past interactions to provide personalized, contextually relevant responses.
Reference previous conversations when relevant but don't overwhelm them with history.`,
    };
  }

  /**
   * Generate a standard chat completion
   */
  async complete(messages, options = {}) {
    const {
      model = this.defaultModel,
      maxTokens = 2048,
      temperature = 0.7,
      systemPrompt = 'assistant',
      stream = false,
    } = options;

    const formattedMessages = [
      {
        role: 'system',
        content: this.systemPrompts[systemPrompt] || systemPrompt,
      },
      ...messages,
    ];

    let attempt = 0;

    while (attempt < this.maxRetries) {
      try {
        const startTime = Date.now();

        const completion = await this.client.chat.completions.create({
          model,
          messages: formattedMessages,
          max_tokens: maxTokens,
          temperature,
          stream,
        });

        const latency = Date.now() - startTime;
        logger.debug(`Groq completion latency: ${latency}ms`);

        if (stream) return completion;

        return {
          content: completion.choices[0]?.message?.content || '',
          usage: completion.usage,
          model: completion.model,
          latency,
        };

      } catch (error) {
        attempt++;
        logger.warn(`Groq attempt ${attempt} failed:`, error.message);

        if (attempt === this.maxRetries) {
          throw new AppError(`AI service unavailable: ${error.message}`, 503);
        }

        await this._sleep(this.retryDelay * attempt);
      }
    }
  }

  /**
   * Streaming completion - returns async generator
   */
  async *streamComplete(messages, options = {}) {
    const stream = await this.complete(messages, { ...options, stream: true });

    let fullContent = '';

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (delta) {
        fullContent += delta;
        yield {
          type: 'delta',
          content: delta,
          done: false,
        };
      }
    }

    yield {
      type: 'complete',
      content: fullContent,
      done: true,
    };
  }

  /**
   * RAG-enhanced completion with document context
   */
  async ragComplete(query, contextChunks, conversationHistory = [], options = {}) {
    const contextText = contextChunks
      .map((chunk, i) =>
        `[Source ${i + 1}: ${chunk.metadata?.filename || 'Document'}, Page ${chunk.metadata?.page || 'N/A'}]\n${chunk.text}`
      )
      .join('\n\n---\n\n');

    const ragMessage = {
      role: 'user',
      content: `DOCUMENT CONTEXT:\n${contextText}\n\n---\n\nUSER QUESTION: ${query}`,
    };

    const messages = [
      ...conversationHistory.slice(-6), // Keep last 3 turns
      ragMessage,
    ];

    return this.complete(messages, {
      ...options,
      systemPrompt: 'rag',
      temperature: 0.3, // Lower temp for factual accuracy
    });
  }

  /**
   * Streaming RAG completion
   */
  async *streamRagComplete(query, contextChunks, conversationHistory = [], options = {}) {
    const contextText = contextChunks
      .map((chunk, i) =>
        `[Source ${i + 1}: ${chunk.metadata?.filename || 'Document'}, Page ${chunk.metadata?.page || 'N/A'}]\n${chunk.text}`
      )
      .join('\n\n---\n\n');

    const ragMessage = {
      role: 'user',
      content: `DOCUMENT CONTEXT:\n${contextText}\n\n---\n\nUSER QUESTION: ${query}`,
    };

    const messages = [
      ...conversationHistory.slice(-6),
      ragMessage,
    ];

    yield* this.streamComplete(messages, {
      ...options,
      systemPrompt: 'rag',
      temperature: 0.3,
    });
  }

  /**
   * Generate embeddings (using OpenAI if Groq doesn't support)
   * Falls back to a simple TF-IDF representation
   */
  async generateEmbedding(text) {
    // Cache embeddings to reduce API calls
    const cacheKey = `embedding:${Buffer.from(text.slice(0, 100)).toString('base64')}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    try {
      // Use OpenAI for embeddings (Groq doesn't have embedding endpoint yet)
      const { OpenAI } = require('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text.slice(0, 8191), // Token limit
      });

      const embedding = response.data[0].embedding;
      await cache.set(cacheKey, embedding, 86400); // Cache 24h
      return embedding;

    } catch (error) {
      logger.warn('OpenAI embedding failed, using fallback:', error.message);
      return this._fallbackEmbedding(text);
    }
  }

  /**
   * Simple hash-based fallback embedding (not for production RAG)
   */
  _fallbackEmbedding(text) {
    const dim = 384;
    const embedding = new Array(dim).fill(0);
    const words = text.toLowerCase().split(/\s+/);

    words.forEach((word, i) => {
      let hash = 0;
      for (let j = 0; j < word.length; j++) {
        hash = ((hash << 5) - hash) + word.charCodeAt(j);
        hash |= 0;
      }
      const idx = Math.abs(hash) % dim;
      embedding[idx] += 1 / Math.sqrt(words.length);
    });

    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
    return embedding.map(v => magnitude > 0 ? v / magnitude : 0);
  }

  /**
   * Agent reasoning with tool use
   */
  async agentReason(task, tools, previousSteps = []) {
    const toolDescriptions = tools
      .map(t => `- ${t.name}: ${t.description}. Args: ${JSON.stringify(t.parameters)}`)
      .join('\n');

    const stepsContext = previousSteps.length
      ? `\nPREVIOUS STEPS:\n${previousSteps.map(s =>
          `THOUGHT: ${s.thought}\nACTION: ${s.action} with args ${JSON.stringify(s.args)}\nOBSERVATION: ${s.observation}`
        ).join('\n\n')}`
      : '';

    const messages = [{
      role: 'user',
      content: `TASK: ${task}\n\nAVAILABLE TOOLS:\n${toolDescriptions}${stepsContext}
      
Respond in this EXACT JSON format:
{
  "thought": "Your reasoning about what to do next",
  "action": "tool_name or FINISH",
  "args": {"key": "value"},
  "final_answer": "Only include if action is FINISH"
}`,
    }];

    const result = await this.complete(messages, {
      systemPrompt: 'agent',
      temperature: 0.1,
      maxTokens: 1024,
    });

    try {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      logger.warn('Agent JSON parse failed, using raw content');
    }

    return { thought: result.content, action: 'FINISH', final_answer: result.content };
  }

  /**
   * Summarize a long document or text
   */
  async summarize(text, options = {}) {
    const { style = 'comprehensive', maxLength = 500 } = options;

    const stylePrompts = {
      comprehensive: `Provide a comprehensive summary covering all key points, findings, and conclusions.`,
      bullet: `Summarize in bullet points. Group by topic.`,
      executive: `Write an executive summary focusing on business impact, key decisions, and action items.`,
      simple: `Explain this in simple terms that a non-expert can understand.`,
    };

    const messages = [{
      role: 'user',
      content: `${stylePrompts[style] || stylePrompts.comprehensive}\n\nMax length: ${maxLength} words.\n\nTEXT TO SUMMARIZE:\n${text}`,
    }];

    return this.complete(messages, { temperature: 0.3, maxTokens: maxLength * 2 });
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new GroqService();
