// src/routes/auth.routes.js
const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/auth.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const rateLimit = require('../middlewares/rate-limit.middleware');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Too many login attempts, please try again after 15 minutes'
});

const otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: 'Too many OTP requests, please try again later'
});

const router = express.Router();

router.post(
  '/register',
  [
    body('email').isEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 6 }).withMessage('Password min 6 chars'),
    body('name').optional().isString(),
    body('phone').optional().isString()
  ],
  authController.register
);

router.post(
  '/login',
  loginLimiter,
  [
    body('email').isEmail().withMessage('Valid email required'),
    body('password').exists().withMessage('Password is required')
  ],
  authController.login
);

router.get('/me', requireAuth, authController.getProfile);

router.put(
  '/me',
  requireAuth,
  [
    body('name').optional().isString(),
    body('phone').optional().isString(),
    body('email').optional().isEmail().withMessage('Valid email required')
  ],
  authController.updateProfile
);

router.post(
  '/password/forgot',
  otpLimiter,
  [
    body('email').optional().isEmail().withMessage('Valid email required'),
    body('phone').optional().isString().trim(),
    body().custom((_, { req }) => {
      if (!req.body.email && !req.body.phone) {
        throw new Error('Provide email or phone to reset password');
      }
      return true;
    }),
  ],
  authController.requestPasswordReset
);

router.post(
  '/password/reset',
  [
    body('resetId').isInt().withMessage('resetId must be a number').toInt(),
    body('otp').isLength({ min: 4 }).withMessage('OTP is required'),
    body('newPassword').isLength({ min: 6 }).withMessage('Password min 6 chars'),
  ],
  authController.resetPasswordWithOtp
);

// ============ B2B Authentication Routes ============

router.post(
  '/b2b/login',
  loginLimiter,
  [
    body('email').isEmail().withMessage('Valid email required'),
    body('password').optional().isString()
  ],
  authController.b2bLogin
);

router.post(
  '/b2b/set-password',
  [
    body('email').isEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 6 }).withMessage('Password min 6 chars')
  ],
  authController.b2bSetPassword
);

// Verification routes
router.post(
  '/verify-phone',
  [
    body('userId').isInt().withMessage('User ID required'),
    body('otp').notEmpty().withMessage('OTP is required')
  ],
  authController.verifyPhone
);

router.post(
  '/resend-verification-otp',
  [
    body('userId').isInt().withMessage('User ID required')
  ],
  authController.resendVerificationOtp
);

module.exports = router;
