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
   *//**
   /**
   * Generate embeddings using Google Gemini (text-embedding-004)
   * Falls back to a 768-dimensional vector if Gemini API fails
   */
  /**
   * Generate embeddings using Google Gemini (text-embedding-004)
   */
  /**
   * Generate embeddings using Google Gemini (text-embedding-004)
   */
  async generateEmbedding(text) {
    // 1. Validate and clean input text
    const cleanedText = typeof text === 'string' ? text.trim() : String(text || '').trim();
    if (!cleanedText) {
      logger.warn('Skipping embedding generation: Input text is empty');
      return this._fallbackEmbedding('');
    }

    try {
      const apiKey = process.env.GEMINI_API_KEY?.trim();
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY is missing in environment variables');
      }

      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });

      // 2. Truncate text to stay within Gemini token limits
      const result = await model.embedContent(cleanedText.slice(0, 2048));

      if (!result?.embedding?.values) {
        throw new Error('Gemini API returned an invalid embedding payload');
      }

      return result.embedding.values;

    } catch (error) {
      // 3. Detailed error logging to inspect failure root cause
      logger.error('Gemini embedding failed:', error?.message || JSON.stringify(error));
      // if (error?.status) logger.error(`Status code: ${error.status}`);
      return this._fallbackEmbedding(cleanedText);
    }
  }

  /**
   * Fallback vector generator - STRICTLY produces 768 dimensions for Gemini/Pinecone compatibility
   */
  _fallbackEmbedding(text) {
    const dimensions = 768;
    const vector = new Array(dimensions).fill(0);

    if (!text) return vector;

    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      const targetIndex = (charCode * (i + 1)) % dimensions;
      vector[targetIndex] = (vector[targetIndex] + (charCode / 255)) % 1;
    }

    return vector;
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
