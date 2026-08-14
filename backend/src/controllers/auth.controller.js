/**
 * NEXUS AI - Authentication Controller
 * JWT + Google OAuth with refresh token rotation
 */

'use strict';

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { User } = require('../models/index');
const { AppError, asyncHandler } = require('../utils/errors');
const { cache } = require('../config/redis');
const logger = require('../utils/logger');

// ─── Token Utilities ──────────────────────────────────────────────────────────

function generateTokens(userId) {
  const accessToken = jwt.sign(
    { sub: userId, type: 'access' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '15m' }
  );

  const refreshToken = jwt.sign(
    { sub: userId, type: 'refresh', jti: crypto.randomUUID() },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d' }
  );

  return { accessToken, refreshToken };
}

function setCookies(res, { accessToken, refreshToken }) {
  const isProd = process.env.NODE_ENV === 'production';

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/api/v1/auth/refresh',
  });
}

// ─── Controllers ──────────────────────────────────────────────────────────────

exports.register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  const existingUser = await User.findOne({ email });
  if (existingUser) throw new AppError('Email already registered', 409);

  const user = await User.create({
    name,
    email,
    passwordHash: password,
    authProvider: 'local',
  });

  const tokens = generateTokens(user._id);
  setCookies(res, tokens);

  // Cache user data
  await cache.set(`user:${user._id}`, {
    id: user._id,
    email: user.email,
    role: user.role,
    plan: user.plan.type,
  }, 3600);

  logger.info(`New user registered: ${email}`);

  res.status(201).json({
    success: true,
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        plan: user.plan,
        avatar: user.avatar,
      },
      accessToken: tokens.accessToken,
    },
  });
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email, authProvider: 'local' })
    .select('+passwordHash +refreshTokens');

  if (!user || !(await user.comparePassword(password))) {
    throw new AppError('Invalid email or password', 401);
  }

  if (!user.isActive) throw new AppError('Account suspended', 403);

  const tokens = generateTokens(user._id);

  // Rotate: keep only last 5 refresh tokens
  user.refreshTokens = [...(user.refreshTokens || []), tokens.refreshToken].slice(-5);
  user.lastActive = new Date();
  await user.save();

  setCookies(res, tokens);

  logger.info(`User logged in: ${email}`);

  res.json({
    success: true,
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        plan: user.plan,
        avatar: user.avatar,
        settings: user.settings,
      },
      accessToken: tokens.accessToken,
    },
  });
});

exports.refresh = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.refreshToken;

  if (!refreshToken) throw new AppError('Refresh token required', 401);

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch {
    throw new AppError('Invalid or expired refresh token', 401);
  }

  const user = await User.findById(decoded.sub).select('+refreshTokens');
  if (!user || !user.refreshTokens.includes(refreshToken)) {
    throw new AppError('Token reuse detected - please login again', 401);
  }

  // Rotate refresh token
  const tokens = generateTokens(user._id);
  user.refreshTokens = user.refreshTokens
    .filter(t => t !== refreshToken)
    .concat(tokens.refreshToken)
    .slice(-5);

  await user.save();
  setCookies(res, tokens);

  res.json({
    success: true,
    data: { accessToken: tokens.accessToken },
  });
});

exports.logout = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.refreshToken;

  if (refreshToken) {
    const user = await User.findById(req.user._id).select('+refreshTokens');
    if (user) {
      user.refreshTokens = user.refreshTokens.filter(t => t !== refreshToken);
      await user.save();
    }
  }

  res.clearCookie('refreshToken', { path: '/api/v1/auth/refresh' });

  // Blacklist access token
  if (req.headers.authorization) {
    const token = req.headers.authorization.split(' ')[1];
    await cache.set(`blacklist:${token}`, true, 900); // 15 min TTL
  }

  logger.info(`User logged out: ${req.user.email}`);

  res.json({ success: true, message: 'Logged out successfully' });
});

exports.googleCallback = asyncHandler(async (req, res) => {
  const user = req.user;
  const tokens = generateTokens(user._id);
  setCookies(res, tokens);

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  res.redirect(`${frontendUrl}/auth/callback?token=${tokens.accessToken}`);
});

exports.getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) throw new AppError('User not found', 404);

  res.json({
    success: true,
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      role: user.role,
      plan: user.plan,
      settings: user.settings,
      lastActive: user.lastActive,
      createdAt: user.createdAt,
    },
  });
});

exports.updateProfile = asyncHandler(async (req, res) => {
  const { name, settings } = req.body;
  const update = {};

  if (name) update.name = name;
  if (settings) update.settings = { ...req.user.settings, ...settings };

  const user = await User.findByIdAndUpdate(req.user._id, update, { new: true });

  await cache.del(`user:${req.user._id}`);

  res.json({ success: true, data: user });
});
