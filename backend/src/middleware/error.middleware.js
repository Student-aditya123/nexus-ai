'use strict';

/**
 * NEXUS AI — Error Middleware
 */

const logger = require('../utils/logger');
const { AppError } = require('../utils/errors');

// ─── asyncHandler ─────────────────────────────────────────────────────────────
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ─── 404 catcher ─────────────────────────────────────────────────────────────
const notFound = (req, _res, next) => {
  next(new AppError(`Cannot ${req.method} ${req.originalUrl}`, 404, 'ROUTE_NOT_FOUND'));
};

// ─── Global error handler ─────────────────────────────────────────────────────
const errorHandler = (err, req, res, _next) => {
  // Read statusCode from AppError or Express error properties
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Internal server error';
  let status = err.status || (statusCode >= 400 && statusCode < 500 ? 'fail' : 'error');
  let code = err.code || null;

  // ── Express body-parser: Invalid JSON syntax in request body ─────────────────
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    statusCode = 400;
    message = 'Invalid JSON payload format in request body';
    status = 'fail';
    code = 'BAD_JSON_PAYLOAD';
  }

  // ── Mongoose: invalid ObjectId ──────────────────────────────────────────────
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid value for field '${err.path}': ${err.value}`;
    status = 'fail';
    code = 'INVALID_ID';
  }

  // ── Mongoose: duplicate unique key ─────────────────────────────────────────
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    statusCode = 409;
    message = `'${field}' already exists`;
    status = 'fail';
    code = 'DUPLICATE_KEY';
  }

  // ── Mongoose: schema validation failed ─────────────────────────────────────
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join('. ');
    status = 'fail';
    code = 'VALIDATION_ERROR';
  }

  // ── JWT: malformed token ────────────────────────────────────────────────────
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token. Please log in again.';
    status = 'fail';
    code = 'INVALID_TOKEN';
  }

  // ── JWT: token has expired ──────────────────────────────────────────────────
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Your session has expired. Please log in again.';
    status = 'fail';
    code = 'TOKEN_EXPIRED';
  }

  // ── Multer: file too large ──────────────────────────────────────────────────
  if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 413;
    message = 'File too large. Maximum upload size is 50MB.';
    status = 'fail';
    code = 'FILE_TOO_LARGE';
  }

  // ── CORS rejection ──────────────────────────────────────────────────────────
  if (message && message.startsWith('CORS blocked')) {
    statusCode = 403;
    status = 'fail';
    code = 'CORS_BLOCKED';
  }

  // Request ID extraction (fallback to header)
  const requestId = req.id || req.headers['x-request-id'] || null;

  // ── Log server-side errors (5xx) ────────────────────────────────────────────
  if (statusCode >= 500) {
    logger.error('Unhandled server error', {
      message: err.message,
      stack: err.stack,
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      requestId,
      userId: req.user?._id,
    });
  }

  // ── Send JSON response ──────────────────────────────────────────────────────
  res.status(statusCode).json({
    success: false,
    status,
    message,
    code,
    requestId,
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      originalError: err.name,
    }),
  });
};

module.exports = { AppError, asyncHandler, notFound, errorHandler };

// 'use strict';

// /**
//  * NEXUS AI — Error Middleware
//  *
//  * Two Express middlewares consumed by app.js:
//  *   app.use(notFound);       ← must be AFTER all routes
//  *   app.use(errorHandler);   ← must be LAST, always 4-arg signature
//  */

// const logger = require('../utils/logger');

// // ─── Custom error class ───────────────────────────────────────────────────────
// // Extends native Error so instanceof checks work correctly throughout the app.
// class AppError extends Error {
//   constructor(message, statusCode = 500, code = null) {
//     super(message);
//     this.name = 'AppError';
//     this.statusCode = statusCode;
//     this.status = statusCode >= 400 && statusCode < 500 ? 'fail' : 'error';
//     this.code = code;
//     this.isOperational = true; // distinguishes expected errors from bugs
//     Error.captureStackTrace(this, this.constructor);
//   }
// }

// // ─── asyncHandler ─────────────────────────────────────────────────────────────
// // Wraps async route handlers so thrown errors reach errorHandler automatically.
// // Usage:  router.get('/path', asyncHandler(async (req, res) => { ... }))
// const asyncHandler = (fn) => (req, res, next) =>
//   Promise.resolve(fn(req, res, next)).catch(next);

// // ─── 404 catcher ─────────────────────────────────────────────────────────────
// // Placed after all routes. Any request that falls through unmatched hits this.
// // It creates a 404 AppError and passes it to errorHandler via next().
// const notFound = (req, _res, next) => {
//   next(new AppError(`Cannot ${req.method} ${req.originalUrl}`, 404, 'ROUTE_NOT_FOUND'));
// };

// // ─── Global error handler ─────────────────────────────────────────────────────
// // Express identifies this as an error handler because it has exactly 4 params.
// // MUST be the last app.use() call in app.js — order is critical.
// const errorHandler = (err, req, res, _next) => {
//   // Start with a mutable copy so we don't mutate the original error object
//   let statusCode = err.statusCode || 500;
//   let message = err.message || 'Internal server error';
//   let status = err.status || 'error';
//   let code = err.code || null;

//   // ── Mongoose: invalid ObjectId ──────────────────────────────────────────────
//   if (err.name === 'CastError') {
//     statusCode = 400;
//     message = `Invalid value for field '${err.path}': ${err.value}`;
//     status = 'fail';
//     code = 'INVALID_ID';
//   }

//   // ── Mongoose: duplicate unique key ─────────────────────────────────────────
//   if (err.code === 11000) {
//     const field = Object.keys(err.keyValue || {})[0] || 'field';
//     statusCode = 409;
//     message = `'${field}' already exists`;
//     status = 'fail';
//     code = 'DUPLICATE_KEY';
//   }

//   // ── Mongoose: schema validation failed ─────────────────────────────────────
//   if (err.name === 'ValidationError') {
//     statusCode = 400;
//     message = Object.values(err.errors)
//       .map((e) => e.message)
//       .join('. ');
//     status = 'fail';
//     code = 'VALIDATION_ERROR';
//   }

//   // ── JWT: malformed token ────────────────────────────────────────────────────
//   if (err.name === 'JsonWebTokenError') {
//     statusCode = 401;
//     message = 'Invalid token. Please log in again.';
//     status = 'fail';
//     code = 'INVALID_TOKEN';
//   }

//   // ── JWT: token has expired ──────────────────────────────────────────────────
//   if (err.name === 'TokenExpiredError') {
//     statusCode = 401;
//     message = 'Your session has expired. Please log in again.';
//     status = 'fail';
//     code = 'TOKEN_EXPIRED';
//   }

//   // ── Multer: file too large ──────────────────────────────────────────────────
//   if (err.code === 'LIMIT_FILE_SIZE') {
//     statusCode = 413;
//     message = 'File too large. Maximum upload size is 50MB.';
//     status = 'fail';
//     code = 'FILE_TOO_LARGE';
//   }

//   // ── CORS rejection (passed through Express error path) ─────────────────────
//   if (message && message.startsWith('CORS blocked')) {
//     statusCode = 403;
//     status = 'fail';
//     code = 'CORS_BLOCKED';
//   }

//   // ── Log server-side errors (5xx) — don't log expected client errors ─────────
//   if (statusCode >= 500) {
//     logger.error('Unhandled server error', {
//       message: err.message,
//       stack: err.stack,
//       method: req.method,
//       url: req.originalUrl,
//       ip: req.ip,
//       requestId: req.id,
//       userId: req.user?._id,
//     });
//   }

//   // ── Send JSON response ──────────────────────────────────────────────────────
//   res.status(statusCode).json({
//     success: false,
//     status,
//     message,
//     code,
//     requestId: req.id,
//     // Only expose stack trace in development — never in production
//     ...(process.env.NODE_ENV === 'development' && {
//       stack: err.stack,
//       originalError: err.name,
//     }),
//   });
// };

// module.exports = { AppError, asyncHandler, notFound, errorHandler };