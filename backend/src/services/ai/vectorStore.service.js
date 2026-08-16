/**
 * NEXUS AI - Vector Store Service
 * Supports Pinecone (production) with in-memory fallback
 * Implements cosine similarity search for RAG
 */

'use strict';

const logger = require('../../utils/logger');
const groqService = require('./groq.service');
const { AppError } = require('../../utils/errors');

class VectorStore {
  constructor() {
    this.pineconeClient = null;
    this.pineconeIndex = null;
    this.inMemoryStore = new Map(); // Fallback: docId -> [{id, embedding, text, metadata}]
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      if (process.env.PINECONE_API_KEY) {
        await this._initPinecone();
      } else {
        logger.warn('Pinecone not configured - using in-memory vector store');
      }
      this.initialized = true;
    } catch (error) {
      logger.error('Vector store init failed:', error.message);
      logger.warn('Falling back to in-memory store');
      this.initialized = true;
    }
  }

  async _initPinecone() {
    const { Pinecone } = require('@pinecone-database/pinecone');
    this.pineconeClient = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });

    this.pineconeIndex = this.pineconeClient.index(
      process.env.PINECONE_INDEX_NAME || 'nexus-ai-embeddings'
    );

    logger.info('✅ Pinecone Vector DB Connected');
  }

  /**
   * Upsert document chunks into vector store
   * @param {string} documentId - Unique document identifier
   * @param {string} userId - Owner's user ID
   * @param {Array} chunks - [{text, metadata: {filename, page, chunkIndex}}]
   */
  async upsertDocument(documentId, userId, chunks) {
    if (!this.initialized) await this.initialize();

    const embeddings = await this._batchEmbedChunks(chunks);

    const vectors = chunks.map((chunk, i) => ({
      id: `${documentId}_chunk_${i}`,
      embedding: embeddings[i],
      text: chunk.text,
      metadata: {
        ...chunk.metadata,
        documentId,
        userId,
        chunkIndex: i,
      },
    }));

    if (this.pineconeIndex) {
      await this._upsertToPinecone(userId, vectors);
    } else {
      this._upsertToMemory(documentId, vectors);
    }

    logger.info(`Upserted ${vectors.length} chunks for document ${documentId}`);
    return vectors.length;
  }

  /**
   * Semantic search across user's documents
   * @param {string} query - Search query
   * @param {string} userId - User's ID
   * @param {object} options - {topK, documentIds, threshold}
   */
  async search(query, userId, options = {}) {
    if (!this.initialized) await this.initialize();

    const {
      topK = 5,
      documentIds = null,
      threshold = 0.7,
    } = options;

    const queryEmbedding = await groqService.generateEmbedding(query);

    if (this.pineconeIndex) {
      return this._searchPinecone(queryEmbedding, userId, { topK, documentIds, threshold });
    }

    return this._searchMemory(queryEmbedding, userId, { topK, documentIds, threshold });
  }

  /**
   * Delete all vectors for a document
   */
  async deleteDocument(documentId, userId) {
    if (!this.initialized) await this.initialize();

    try {
      if (this.pineconeIndex) {
        const namespace = `user_${userId}`;

        // Delete vectors matching only this documentId filter
        await this.pineconeIndex.namespace(namespace).deleteMany({
          documentId: documentId.toString(),
        });

        logger.info(`Deleted Pinecone vectors for document: ${documentId} (namespace: ${namespace})`);
      } else if (this.inMemoryStore) {
        this.inMemoryStore.delete(documentId);
      }
    } catch (error) {
      // Gracefully log Pinecone 404 or missing vector errors without crashing the API
      logger.warn(`Pinecone vector deletion skipped or failed for doc ${documentId}: ${error.message}`);
    }
  }

  // ─── Private Methods ─────────────────────────────────────────────────────────

  async _batchEmbedChunks(chunks, batchSize = 10) {
    const embeddings = [];

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const batchEmbeddings = await Promise.all(
        batch.map(chunk => groqService.generateEmbedding(chunk.text))
      );
      embeddings.push(...batchEmbeddings);

      // Respect rate limits
      if (i + batchSize < chunks.length) {
        await new Promise(r => setTimeout(r, 100));
      }
    }

    return embeddings;
  }

  async _upsertToPinecone(userId, vectors) {
    const namespace = `user_${userId}`;
    const batchSize = 100;

    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize).map(v => ({
        id: v.id,
        values: v.embedding,
        metadata: { ...v.metadata, text: v.text.slice(0, 1000) }, // Pinecone metadata limit
      }));

      await this.pineconeIndex.namespace(namespace).upsert(batch);
    }
  }

  _upsertToMemory(documentId, vectors) {
    this.inMemoryStore.set(documentId, vectors);
  }

  async _searchPinecone(queryEmbedding, userId, options) {
    const { topK, documentIds, threshold } = options;
    const namespace = `user_${userId}`;

    const filter = documentIds ? { documentId: { $in: documentIds } } : {};

    const results = await this.pineconeIndex.namespace(namespace).query({
      vector: queryEmbedding,
      topK,
      filter,
      includeMetadata: true,
    });

    return results.matches
      .filter(m => m.score >= threshold)
      .map(m => ({
        id: m.id,
        score: m.score,
        text: m.metadata.text,
        metadata: m.metadata,
      }));
  }

  _searchMemory(queryEmbedding, userId, options) {
    const { topK, documentIds, threshold } = options;

    const allVectors = [];

    for (const [docId, vectors] of this.inMemoryStore) {
      if (documentIds && !documentIds.includes(docId)) continue;

      vectors.forEach(v => {
        if (v.metadata.userId === userId) {
          allVectors.push(v);
        }
      });
    }

    // Compute cosine similarities
    const results = allVectors
      .map(v => ({
        ...v,
        score: this._cosineSimilarity(queryEmbedding, v.embedding),
      }))
      .filter(v => v.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return results;
  }

  _cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }
}

module.exports = new VectorStore();
