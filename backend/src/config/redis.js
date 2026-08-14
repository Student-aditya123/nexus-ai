/**
 * Redis Configuration - Production Grade
 * Uses ioredis with cluster support and retry strategy
 */

'use strict';

const Redis = require('ioredis');
const logger = require('../utils/logger');

let redisClient = null;
let redisSubscriber = null;

const REDIS_OPTIONS = {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    logger.warn(`Redis retry attempt ${times}, delay: ${delay}ms`);
    return delay;
  },
  reconnectOnError: (err) => {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) return true;
    return false;
  },
};

async function connectRedis() {
  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    redisClient = new Redis(redisUrl, {
      ...REDIS_OPTIONS,
      password: process.env.REDIS_PASSWORD || undefined,
    });

    redisSubscriber = new Redis(redisUrl, {
      ...REDIS_OPTIONS,
      password: process.env.REDIS_PASSWORD || undefined,
    });

    await redisClient.connect();
    logger.info('✅ Redis Connected');

    redisClient.on('error', (err) => logger.error('Redis Client Error:', err));
    redisClient.on('reconnecting', () => logger.warn('Redis reconnecting...'));

  } catch (error) {
    logger.error('Redis connection failed:', error.message);
    // Non-fatal: app can work without cache
    logger.warn('Application will run without caching');
  }
}

function getRedisClient() {
  return redisClient;
}

function getRedisSubscriber() {
  return redisSubscriber;
}

// Cache helper utilities
const cache = {
  async get(key) {
    if (!redisClient) return null;
    try {
      const value = await redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } catch (err) {
      logger.error('Cache get error:', err);
      return null;
    }
  },

  async set(key, value, ttlSeconds = 3600) {
    if (!redisClient) return false;
    try {
      await redisClient.setex(key, ttlSeconds, JSON.stringify(value));
      return true;
    } catch (err) {
      logger.error('Cache set error:', err);
      return false;
    }
  },

  async del(key) {
    if (!redisClient) return false;
    try {
      await redisClient.del(key);
      return true;
    } catch (err) {
      logger.error('Cache del error:', err);
      return false;
    }
  },

  async invalidatePattern(pattern) {
    if (!redisClient) return;
    const keys = await redisClient.keys(pattern);
    if (keys.length) await redisClient.del(...keys);
  },
};

module.exports = { connectRedis, getRedisClient, getRedisSubscriber, cache };
