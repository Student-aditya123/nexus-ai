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

function createRedisInstance() {
  // If REDIS_URL contains authentication (e.g. redis://:password@host:port), use it directly
  if (process.env.REDIS_URL) {
    logger.info('Redis: REDIS_URL detected, using hosted Redis');
    return new Redis(process.env.REDIS_URL, REDIS_OPTIONS);
  }
 logger.warn('Redis: REDIS_URL NOT detected, using localhost fallback');
  // Otherwise, explicitly pass host, port, and password options
  return new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    ...REDIS_OPTIONS,
  });
}

async function connectRedis() {
  try {
    redisClient = createRedisInstance();
    redisSubscriber = createRedisInstance();

    // Attach error handlers BEFORE connecting to avoid unhandled error crashes
    redisClient.on('error', (err) => logger.error('Redis Client Error:', err.message));
    redisClient.on('reconnecting', () => logger.warn('Redis Client reconnecting...'));

    redisSubscriber.on('error', (err) => logger.error('Redis Subscriber Error:', err.message));
    redisSubscriber.on('reconnecting', () => logger.warn('Redis Subscriber reconnecting...'));

    // Connect both client and subscriber
    await Promise.all([
      redisClient.connect(),
      redisSubscriber.connect(),
    ]);

    logger.info('✅ Redis Connected');
  } catch (error) {
    logger.error('Redis connection failed:', error.message);
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
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length) await redisClient.del(...keys);
    } catch (err) {
      logger.error('Cache invalidatePattern error:', err);
    }
  },
};

module.exports = { connectRedis, getRedisClient, getRedisSubscriber, cache };
