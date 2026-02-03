// src/services/password-reset.service.js
const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');
const { sendOtpSms } = require('./sms.service');

const PASSWORD_SALT_ROUNDS = 10;
const OTP_SALT_ROUNDS = 10;
const OTP_LENGTH = 6;
const OTP_TTL_MINUTES = 5;
const MAX_ATTEMPTS = 5;

function normalizeIndianPhone(phone) {
  if (!phone) return phone;
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return phone;

  // 10-digit Indian mobile -> +91XXXXXXXXXX
  if (digits.length === 10) {
    return `+91${digits}`;
  }

  // 91XXXXXXXXXX -> +91XXXXXXXXXX
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }

  if (String(phone).trim().startsWith('+')) {
    return phone.trim();
  }

  return phone;
}

function generateOtp() {
  const min = 10 ** (OTP_LENGTH - 1);
  const max = 10 ** OTP_LENGTH - 1;
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
}

function maskPhone(phone = '') {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '****';
  const visible = digits.slice(-2);
  return `*******${visible}`;
}

async function requestPasswordReset({ email, phone }) {
  if (!email && !phone) {
    throw { status: 400, message: 'Email or phone is required' };
  }

  let user = null;

  if (email) {
    user = await prisma.user.findFirst({
      where: { email: email.toLowerCase() },
      select: { id: true, phone: true, email: true },
    });
  } else if (phone) {
    const raw = String(phone).trim();
    const digits = raw.replace(/\D/g, '');
    const normalized = normalizeIndianPhone(raw);

    user = await prisma.user.findFirst({
      where: {
        OR: [
          { phone: raw },          // exactly what user typed
          { phone: normalized },   // normalized Indian format
          { phone: `+${digits}` }, // bare digits with +
        ],
      },
      select: { id: true, phone: true, email: true },
    });
  }

  if (!user) {
    throw { status: 404, message: 'User not found' };
  }

  if (!user.phone) {
    throw { status: 400, message: 'No phone number on file for this user' };
  }

  console.log('🔔 Found user for password reset:', { id: user.id, phone: user.phone, email: user.email });
  const normalizedPhone = normalizeIndianPhone(user.phone);
  console.log('🔔 Normalized phone for SMS OTP:', normalizedPhone);

  const otp = generateOtp();
  const otpHash = await bcrypt.hash(otp, OTP_SALT_ROUNDS);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  const resetRecord = await prisma.passwordResetOtp.create({
    data: {
      user_id: user.id,
      otp_hash: otpHash,
      expires_at: expiresAt,
    },
    select: { id: true, expires_at: true },
  });

  console.log('🔔 Created PasswordResetOtp record:', {
    resetId: resetRecord.id,
    expiresAt: resetRecord.expires_at,
    toPhone: normalizedPhone,
  });

  await sendOtpSms({
    toPhone: normalizedPhone,
    otp,
    expiryMinutes: OTP_TTL_MINUTES,
  });

  return {
    resetId: resetRecord.id,
    expiresAt: resetRecord.expires_at,
    expiresIn: OTP_TTL_MINUTES * 60,
    destination: maskPhone(user.phone),
  };
}

async function completePasswordReset({ resetId, otp, newPassword }) {
  if (!resetId || !otp || !newPassword) {
    throw { status: 400, message: 'Reset id, OTP, and new password are required' };
  }

  const resetRecord = await prisma.passwordResetOtp.findUnique({
    where: { id: resetId },
    include: {
      user: {
        select: { id: true },
      },
    },
  });

  if (!resetRecord) {
    throw { status: 400, message: 'Invalid reset request' };
  }

  if (!resetRecord.user) {
    throw { status: 404, message: 'User not found for this reset request' };
  }

  if (resetRecord.verified) {
    throw { status: 400, message: 'OTP already used' };
  }

  if (resetRecord.attempts >= MAX_ATTEMPTS) {
    throw { status: 429, message: 'Too many invalid attempts. Request a new OTP.' };
  }

  if (new Date(resetRecord.expires_at) < new Date()) {
    throw { status: 400, message: 'OTP expired. Request a new one.' };
  }

  const otpMatches = await bcrypt.compare(otp, resetRecord.otp_hash);
  if (!otpMatches) {
    await prisma.passwordResetOtp.update({
      where: { id: resetRecord.id },
      data: { attempts: { increment: 1 } },
    });
    throw { status: 400, message: 'Invalid OTP' };
  }

  const passwordHash = await bcrypt.hash(newPassword, PASSWORD_SALT_ROUNDS);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetRecord.user_id },
      data: { password_hash: passwordHash },
    }),
    prisma.passwordResetOtp.update({
      where: { id: resetRecord.id },
      data: {
        verified: true,
        attempts: { increment: 1 },
      },
    }),
  ]);

  return { success: true };
}

module.exports = {
  requestPasswordReset,
  completePasswordReset,
};

