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

  const userId = req.user._id;
  const { file } = req;

  // Check document quota
  if (req.user.plan.documentsUsed >= req.user.plan.documentLimit) {
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
      url: file.location || `/uploads/${file.filename}`,
      key: file.key || file.filename,
      bucket: process.env.S3_BUCKET_NAME,
    },
    processing: { status: 'pending' },
  });

  // Queue document processing job
  const queue = getDocumentQueue();
  if (queue) {
    await queue.add('process-document', {
      documentId: document._id.toString(),
      userId: userId.toString(),
      fileBuffer: file.buffer?.toString('base64'),
      filename: file.originalname,
      storageKey: file.key || file.filename,
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      priority: req.user.plan.type === 'free' ? 2 : 1,
    });
  } else {
    // Process synchronously in development
    await _processDocumentSync(document, file.buffer, file.originalname, userId);
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
  const { page = 1, limit = 20, status, fileType, search } = req.query;
  const userId = req.user._id;

  const filter = { userId };
  if (status) filter['processing.status'] = status;
  if (fileType) filter.fileType = fileType;
  if (search) filter.originalName = { $regex: search, $options: 'i' };

  const [documents, total] = await Promise.all([
    Document.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .select('-content.chunks')
      .lean(),
    Document.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: documents,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

exports.getDocument = asyncHandler(async (req, res) => {
  const document = await Document.findOne({
    _id: req.params.documentId,
    $or: [{ userId: req.user._id }, { sharedWith: req.user._id }],
  });

  if (!document) throw new AppError('Document not found', 404);

  res.json({ success: true, data: document });
});

exports.deleteDocument = asyncHandler(async (req, res) => {
  const document = await Document.findOneAndDelete({
    _id: req.params.documentId,
    userId: req.user._id,
  });

  if (!document) throw new AppError('Document not found', 404);

  // Delete from vector store
  await vectorStore.deleteDocument(document._id.toString(), req.user._id.toString());

  // TODO: Delete from S3

  logger.info(`Document deleted: ${document.originalName}`);

  res.json({ success: true, message: 'Document deleted successfully' });
});

exports.queryDocument = asyncHandler(async (req, res) => {
  const { query, topK = 5 } = req.body;
  const { documentId } = req.params;

  const document = await Document.findOne({
    _id: documentId,
    $or: [{ userId: req.user._id }, { sharedWith: req.user._id }],
  });

  if (!document) throw new AppError('Document not found', 404);
  if (!document.vectorized) throw new AppError('Document is still being processed', 202);

  const chunks = await vectorStore.search(query, req.user._id.toString(), {
    topK,
    documentIds: [documentId],
  });

  const answer = await require('../services/ai/groq.service').ragComplete(
    query,
    chunks,
    []
  );

  document.stats.queryCount += 1;
  document.stats.lastQueried = new Date();
  await document.save();

  res.json({
    success: true,
    data: {
      answer: answer.content,
      sources: chunks.map(c => ({
        page: c.metadata.page,
        excerpt: c.text.slice(0, 300),
        score: c.score,
      })),
    },
  });
});

exports.getDocumentStatus = asyncHandler(async (req, res) => {
  const document = await Document.findOne({
    _id: req.params.documentId,
    userId: req.user._id,
  }).select('processing originalName vectorized');

  if (!document) throw new AppError('Document not found', 404);

  res.json({
    success: true,
    data: {
      status: document.processing.status,
      progress: document.processing.progress,
      vectorized: document.vectorized,
      error: document.processing.error,
    },
  });
});

// ─── Internal Processing ──────────────────────────────────────────────────────

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

    await vectorStore.upsertDocument(
      document._id.toString(),
      userId.toString(),
      chunks
    );

    document.processing.status = 'completed';
    document.processing.completedAt = new Date();
    document.processing.progress = 100;
    document.content = {
      pageCount: metadata.pageCount,
      wordCount: metadata.wordCount,
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
