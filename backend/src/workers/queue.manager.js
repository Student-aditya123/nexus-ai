/**
 * NEXUS AI - Queue Manager (BullMQ)
 * Async job processing for documents and AI tasks
 */

'use strict';

const logger = require('../utils/logger');

let documentQueue = null;
let documentWorker = null;

async function initializeQueues() {
  try {
    const { Queue, Worker } = require('bullmq');
    const { getRedisClient } = require('../config/redis');
    const redis = getRedisClient();

    if (!redis) {
      logger.warn('Redis not available - queues disabled, using sync processing');
      return;
    }

    const connection = { host: 'localhost', port: 6379 };

    // Document processing queue
    documentQueue = new Queue('document-processing', { connection });

    // Worker
    documentWorker = new Worker('document-processing', async (job) => {
      const { documentId, userId, filename, fileBuffer } = job.data;
      logger.info(`Processing document job: ${documentId}`);

      const { Document } = require('../models/index');
      const documentProcessor = require('../services/document/processor.service');
      const vectorStore = require('../services/ai/vectorStore.service');

      const doc = await Document.findById(documentId);
      if (!doc) throw new Error(`Document ${documentId} not found`);

      await job.updateProgress(10);

      const buffer = fileBuffer
        ? Buffer.from(fileBuffer, 'base64')
        : await _fetchFromStorage(doc.storage);

      const { pages, metadata } = await documentProcessor.extractText(buffer, filename);
      await job.updateProgress(40);

      const chunks = documentProcessor.createChunks(pages, {
        documentId, filename: doc.originalName, userId,
      });
      await job.updateProgress(60);

      await vectorStore.upsertDocument(documentId, userId, chunks);
      await job.updateProgress(90);

      await Document.findByIdAndUpdate(documentId, {
        'processing.status': 'completed',
        'processing.completedAt': new Date(),
        'processing.progress': 100,
        'content.pageCount': metadata.pageCount,
        'content.wordCount': metadata.wordCount,
        'content.chunkCount': chunks.length,
        vectorized: true,
        vectorCount: chunks.length,
      });

      await job.updateProgress(100);
      logger.info(`Document ${documentId} processed: ${chunks.length} chunks`);

      return { documentId, chunkCount: chunks.length };

    }, {
      connection,
      concurrency: parseInt(process.env.QUEUE_CONCURRENCY) || 3,
    });

    documentWorker.on('completed', (job) => {
      logger.info(`Job ${job.id} completed`);
    });

     documentWorker.on('failed', async (job, err) => {
         logger.error(`❌ Job ${job?.id} failed`);
         logger.error(`Error name: ${err?.name || 'Unknown'}`);
         logger.error(`Error message: ${err?.message || 'No error message'}`);
         logger.error(`Error stack: ${err?.stack || 'No stack trace'}`);

         const { Document } = require('../models/index');

        try {
            await Document.findByIdAndUpdate(job.data.documentId, {
              'processing.status': 'failed',
              'processing.error': err?.message || 'Document processing failed',
           });
         } catch (updateError) {
                   logger.error(
                        `Failed to update document status: ${
                           updateError?.message || updateError
                         }`
                     );
            }
       });

    logger.info('✅ BullMQ Queues initialized');

  } catch (error) {
    logger.warn('BullMQ initialization failed:', error.message);
    logger.warn('Running without job queue');
  }
}

async function _fetchFromStorage(storage) {
  if (storage.provider === 's3') {
    const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
    const s3 = new S3Client({ region: process.env.AWS_REGION });
    const cmd = new GetObjectCommand({ Bucket: storage.bucket, Key: storage.key });
    const resp = await s3.send(cmd);
    const chunks = [];
    for await (const chunk of resp.Body) chunks.push(chunk);
    return Buffer.concat(chunks);
  }
  throw new Error(`Unsupported storage provider: ${storage.provider}`);
}

function getDocumentQueue() { return documentQueue; }

module.exports = { initializeQueues, getDocumentQueue };
