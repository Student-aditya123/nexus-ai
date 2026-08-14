/**
 * NEXUS AI - Auth Routes
 */

'use strict';

const express = require('express');
const passport = require('passport');
const authController = require('../controllers/auth.controller');

const router = express.Router();
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// ─── Local Auth Routes ────────────────────────────────────────────────────────
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', authController.getMe);
router.patch('/profile', authController.updateProfile);

// ─── Google OAuth Routes ──────────────────────────────────────────────────────
router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get(
  '/google/callback',
  passport.authenticate('google', { 
    session: false, 
    failureRedirect: `${FRONTEND_URL}/login?error=google_auth_failed` 
  }),
  authController.googleCallback
);

module.exports = router;


// const { authRoutes } = require('./index');
// module.exports = authRoutes;
