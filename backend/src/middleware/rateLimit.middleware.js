/**
 * NEXUS AI - Rate Limiting
 * Multi-tier rate limits for different endpoints
 */

'use strict';

const rateLimit = require('express-rate-limit');

const createLimiter = (options) => rateLimit({
  windowMs: options.windowMs || 15 * 60 * 1000,
  max: options.max || 100,
  message: { success: false, message: options.message || 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip,
});

const generalLimiter = createLimiter({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: 'Too many requests from this IP',
});

const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many auth attempts, please try again in 15 minutes',
});

const aiLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: parseInt(process.env.AI_RATE_LIMIT_MAX) || 20,
  message: 'AI request limit reached, please wait a moment',
});

const uploadLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'Upload limit reached, please try again later',
});

module.exports = { generalLimiter, authLimiter, aiLimiter, uploadLimiter };
