// src/routes/auth.routes.js
const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/auth.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

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

module.exports = router;
