/**
 * NEXUS AI - Document Controller
 * Upload, process, vectorize, and manage documents
 */

'use strict';

const { Document } = require('../models/index');
const documentProcessor = require('../services/document/processor.service');
const vectorStore = require('../services/ai/vectorStore.service');
const { AppError, asyncHandler } = require('../utils/errors');
const { getDocumentQueue } = require('../workers/queue.manager');
const logger = require('../utils/logger');

exports.uploadDocument = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError('No file uploaded', 400);

  const userId = req.user?._id || req.user?.id;
  if (!userId) throw new AppError('Unauthorized user', 401);

  const { file } = req;

  // Safely check document quota with fallbacks
  const userPlan = req.user?.plan || { documentsUsed: 0, documentLimit: 100, type: 'free' };
  if ((userPlan.documentsUsed || 0) >= (userPlan.documentLimit || 100)) {
    throw new AppError('Document limit reached. Please upgrade your plan.', 429);
  }

  const ext = file.originalname.split('.').pop().toLowerCase();
  const allowedTypes = ['pdf', 'docx', 'doc', 'pptx', 'ppt', 'txt', 'md'];

  if (!allowedTypes.includes(ext)) {
    throw new AppError(`File type .${ext} not supported`, 400);
  }

  // Create document record
  const document = await Document.create({
    userId,
    filename: file.filename || file.key || file.originalname,
    originalName: file.originalname,
    fileType: ext === 'doc' ? 'docx' : ext === 'ppt' ? 'pptx' : ext,
    fileSize: file.size,
    storage: {
      provider: process.env.AWS_ACCESS_KEY_ID ? 's3' : 'local',
      url: file.location || `/uploads/${file.filename || file.originalname}`,
      key: file.key || file.filename || file.originalname,
      bucket: process.env.S3_BUCKET_NAME || 'local',
    },
    processing: { status: 'pending', progress: 0 },
  });

  // Queue document processing job
  const queue = getDocumentQueue();
  if (queue) {
    await queue.add(
      'process-document',
      {
        documentId: document._id.toString(),
        userId: userId.toString(),
        fileBuffer: file.buffer?.toString('base64'),
        filename: file.originalname,
        storageKey: file.key || file.filename,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        priority: userPlan.type === 'free' ? 2 : 1,
      }
    );
  } else {
    // Process synchronously in development fallback
    _processDocumentSync(document, file.buffer, file.originalname, userId).catch((err) => {
      logger.error(`Sync background processing error for doc ${document._id}:`, err);
    });
  }

  logger.info(`Document uploaded: ${file.originalname} by ${userId}`);

  res.status(201).json({
    success: true,
    data: {
      id: document._id,
      originalName: document.originalName,
      fileType: document.fileType,
      fileSize: document.fileSize,
      status: document.processing.status,
      message: 'Document uploaded and queued for processing',
    },
  });
});

exports.getDocuments = asyncHandler(async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  if (!userId) throw new AppError('Unauthorized: User missing', 401);

  // Safely parse integers for pagination
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.max(1, parseInt(req.query.limit, 10) || 20);
  const skip = (page - 1) * limit;

  const { status, fileType, search } = req.query;

  // Query matching both 'userId' and 'user' fields to prevent schema mismatches
  const filter = {
    $or: [{ userId: userId }, { user: userId }],
  };

  if (status) filter['processing.status'] = status;
  if (fileType) filter.fileType = fileType;
  if (search) filter.originalName = { $regex: search, $options: 'i' };

  const [documents, total] = await Promise.all([
    Document.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-content.chunks')
      .lean(),
    Document.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: documents,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});

exports.getDocument = asyncHandler(async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const document = await Document.findOne({
    _id: req.params.documentId,
    $or: [{ userId }, { user: userId }, { sharedWith: userId }],
  });

  if (!document) throw new AppError('Document not found', 404);

  res.json({ success: true, data: document });
});

exports.deleteDocument = asyncHandler(async (req, res) => {
  const userId = req.user?._id || req.user?.id;

  const document = await Document.findOneAndDelete({
    _id: req.params.documentId,
    $or: [{ userId }, { user: userId }],
  });

  if (!document) throw new AppError('Document not found', 404);

  // Safely attempt vector store cleanup without crashing the request if vectors are missing
  try {
    await vectorStore.deleteDocument(document._id.toString(), userId.toString());
  } catch (error) {
    logger.warn(`Pinecone vector deletion skipped or failed for ${document._id}: ${error.message}`);
  }

  logger.info(`Document deleted: ${document.originalName}`);

  res.json({ success: true, message: 'Document deleted successfully' });
});

exports.queryDocument = asyncHandler(async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const { query, topK = 5 } = req.body;
  const { documentId } = req.params;

  const document = await Document.findOne({
    _id: documentId,
    $or: [{ userId }, { user: userId }, { sharedWith: userId }],
  });

  if (!document) throw new AppError('Document not found', 404);
  if (!document.vectorized) throw new AppError('Document is still being processed', 202);

  const chunks = await vectorStore.search(query, userId.toString(), {
    topK,
    documentIds: [documentId],
  });

  const groqService = require('../services/ai/groq.service');
  const answer = await groqService.ragComplete(query, chunks, []);

  document.stats = document.stats || { queryCount: 0 };
  document.stats.queryCount += 1;
  document.stats.lastQueried = new Date();
  await document.save();

  res.json({
    success: true,
    data: {
      answer: answer?.content || answer,
      sources: (chunks || []).map((c) => ({
        page: c.metadata?.page || 1,
        excerpt: (c.text || c.pageContent || '').slice(0, 300),
        score: c.score || 0,
      })),
    },
  });
});

exports.getDocumentStatus = asyncHandler(async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const document = await Document.findOne({
    _id: req.params.documentId,
    $or: [{ userId }, { user: userId }],
  }).select('processing originalName vectorized');

  if (!document) throw new AppError('Document not found', 404);

  res.json({
    success: true,
    data: {
      status: document.processing?.status || 'pending',
      progress: document.processing?.progress || 0,
      vectorized: !!document.vectorized,
      error: document.processing?.error || null,
    },
  });
});

// ─── Internal Sync Processing ──────────────────────────────────────────────────

async function _processDocumentSync(document, buffer, filename, userId) {
  try {
    document.processing.status = 'processing';
    document.processing.startedAt = new Date();
    document.processing.progress = 10;
    await document.save();

    const { pages, metadata } = await documentProcessor.extractText(buffer, filename);
    document.processing.progress = 50;

    const chunks = documentProcessor.createChunks(pages, {
      documentId: document._id.toString(),
      filename: document.originalName,
      userId: userId.toString(),
    });

    document.processing.progress = 70;

    await vectorStore.upsertDocument(document._id.toString(), userId.toString(), chunks);

    document.processing.status = 'completed';
    document.processing.completedAt = new Date();
    document.processing.progress = 100;
    document.content = {
      pageCount: metadata?.pageCount || 1,
      wordCount: metadata?.wordCount || 0,
      chunkCount: chunks.length,
      preview: documentProcessor.generatePreview(pages),
    };
    document.vectorized = true;
    document.vectorCount = chunks.length;

    await document.save();
  } catch (error) {
    document.processing.status = 'failed';
    document.processing.error = error.message;
    await document.save();
    logger.error(`Document processing failed for ${document._id}:`, error);
  }
}

exports._processDocumentSync = _processDocumentSync;
