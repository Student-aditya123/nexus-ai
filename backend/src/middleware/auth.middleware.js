/**
 * NEXUS AI - Authentication Middleware
 * JWT verification with cookie fallback, token blacklist checking, and Redis caching
 */

'use strict';

const jwt = require('jsonwebtoken');
const { User } = require('../models/index');
const { cache } = require('../config/redis');
const { AppError } = require('../utils/errors');

const authenticate = async (req, res, next) => {
  try {
    let token;

    // 1. Extract token from Header or Cookie
    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.accessToken || req.cookies?.token) {
      token = req.cookies.accessToken || req.cookies.token;
    }

    if (!token) {
      throw new AppError('Authentication required. Please log in.', 401);
    }

    // 2. Check token blacklist in Redis
    const isBlacklisted = await cache.get(`blacklist:${token}`);
    if (isBlacklisted) {
      throw new AppError('Token has been invalidated', 401);
    }

    // 3. Verify JWT
    let decoded;
    try {
      decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'your-fallback-jwt-secret'
      );
    } catch (err) {
      throw new AppError(
        err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token',
        401
      );
    }

    const userId = decoded.sub || decoded.id || decoded._id;
    if (!userId) {
      throw new AppError('Invalid token payload', 401);
    }

    // 4. Try loading from Redis cache
    let cachedData = await cache.get(`user:${userId}`);
    let user;

    if (cachedData) {
      try {
        const plainUser = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
        // Rehydrate plain object into a full Mongoose Document with instance methods
        user = User.hydrate(plainUser);
      } catch {
        user = null;
      }
    }

    // 5. Query MongoDB if not cached
    if (!user) {
      const dbUser = await User.findById(userId);

      if (!dbUser || !dbUser.isActive) {
        throw new AppError('User not found or account disabled', 401);
      }

      user = dbUser;
      // Cache plain object representation in Redis for 15 minutes
      await cache.set(`user:${userId}`, JSON.stringify(dbUser.toObject()), 900);
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(new AppError(`Role '${req.user?.role}' is not authorized`, 403));
  }
  next();
};

const optionalAuth = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.accessToken || req.cookies?.token) {
      token = req.cookies.accessToken || req.cookies.token;
    }

    if (token) {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'your-fallback-jwt-secret'
      );
      const userId = decoded.sub || decoded.id || decoded._id;

      let cachedData = await cache.get(`user:${userId}`);
      let user;

      if (cachedData) {
        try {
          const plainUser = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
          user = User.hydrate(plainUser);
        } catch {
          user = null;
        }
      }

      if (!user && userId) {
        const dbUser = await User.findById(userId);
        if (dbUser?.isActive) user = dbUser;
      }

      if (user) req.user = user;
    }
  } catch {
    // Ignore errors for optional auth
  }
  next();
};

module.exports = { authenticate, authorize, optionalAuth };

