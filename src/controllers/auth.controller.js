// src/controllers/auth.controller.js
const { validationResult } = require('express-validator');
const authService = require('../services/auth.services');
const passwordResetService = require('../services/password-reset.service');
const bcrypt = require('bcryptjs');

async function register(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password, name, phone } = req.body;
    const result = await authService.register({ email, password, name, phone, roleName: 'customer' });
    return res.status(201).json(result);
  } catch (err) {
    console.error(err);
    const status = err.status || 500;
    const message = err.message || 'Internal server error';
    return res.status(status).json({ message });
  }
}

async function login(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;
    const result = await authService.login({ email, password });
    return res.json(result);
  } catch (err) {
    console.error(err);
    const status = err.status || 500;
    const message = err.message || 'Internal server error';
    return res.status(status).json({ message });
  }
}

async function getProfile(req, res) {
  try {
    const result = await authService.getProfile(req.user.id);
    return res.json(result);
  } catch (err) {
    console.error(err);
    const status = err.status || 500;
    const message = err.message || 'Internal server error';
    return res.status(status).json({ message });
  }
}

async function updateProfile(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, phone, email } = req.body;
    const result = await authService.updateProfile(req.user.id, { name, phone, email });
    return res.json(result);
  } catch (err) {
    console.error(err);
    const status = err.status || 500;
    const message = err.message || 'Internal server error';
    return res.status(status).json({ message });
  }
}

async function requestPasswordReset(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, phone } = req.body;
    console.log('🔔 requestPasswordReset called with:', { email, phone });
    const result = await passwordResetService.requestPasswordReset({ email, phone });
    return res.json({
      message: 'OTP sent to your WhatsApp number',
      ...result,
    });
  } catch (err) {
    console.error(err);
    const status = err.status || 500;
    const message = err.message || 'Internal server error';
    return res.status(status).json({ message });
  }
}

async function resetPasswordWithOtp(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { resetId, otp, newPassword } = req.body;
    await passwordResetService.completePasswordReset({ resetId, otp, newPassword });
    return res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error(err);
    const status = err.status || 500;
    const message = err.message || 'Internal server error';
    return res.status(status).json({ message });
  }
}

// ============ B2B Authentication ============

async function b2bLogin(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;

    // Get user and check if they exist
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        role: true,
        b2bUsers: {
          include: {
            company: true
          }
        }
      }
    });

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check if user is B2B user
    if (user.role?.name !== 'b2b_user') {
      return res.status(403).json({ message: 'This login is for B2B users only' });
    }

    // Regular login flow (validate password first)
    if (!password) {
      return res.status(400).json({ message: 'Password is required' });
    }

    const result = await authService.login({ email, password });

    // If login successful, check if it's still marked as first login
    if (user.is_first_login) {
      return res.json({
        isFirstLogin: true,
        userId: user.id,
        email: user.email,
        message: 'Credentials valid. Please set your permanent password.'
      });
    }

    // Add company info to response for normal login
    return res.json({
      ...result,
      company: user.b2bUsers[0]?.company || null
    });

  } catch (err) {
    console.error(err);
    const status = err.status || 500;
    const message = err.message || 'Internal server error';
    return res.status(status).json({ message });
  }
}

async function b2bSetPassword(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;

    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        role: true,
        b2bUsers: {
          include: {
            company: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.role?.name !== 'b2b_user') {
      return res.status(403).json({ message: 'Not a B2B user' });
    }

    if (!user.is_first_login) {
      return res.status(400).json({ message: 'Password already set' });
    }

    // Hash password and update user
    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password_hash: hashedPassword,
        is_first_login: false
      }
    });

    // Auto-login after setting password
    const loginResult = await authService.login({ email, password });

    return res.json({
      message: 'Password set successfully',
      ...loginResult,
      company: user.b2bUsers[0]?.company || null
    });

  } catch (err) {
    console.error(err);
    const status = err.status || 500;
    const message = err.message || 'Internal server error';
    return res.status(status).json({ message });
  }
}

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  requestPasswordReset,
  resetPasswordWithOtp,
  b2bLogin,
  b2bSetPassword,
};

