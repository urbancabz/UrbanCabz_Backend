// src/services/password-reset.service.js
const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');
const { sendOtpSms } = require('./sms.service');
const { sendEmail } = require('./email.service');

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

async function requestPasswordReset({ email, otpTo }) {
  if (!email) {
    throw { status: 400, message: 'Registered email is required' };
  }

  const user = await prisma.user.findFirst({
    where: { email: email.toLowerCase().trim() },
    select: { id: true, phone: true, email: true },
  });

  if (!user) {
    throw { status: 404, message: 'No account found with this email' };
  }

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

  let destination = '';

  if (otpTo && String(otpTo).trim().includes('@')) {
    // Send OTP via Email
    const toEmail = String(otpTo).trim();
    console.log('📧 Sending OTP via email to:', toEmail);
    await sendEmail({
      to: toEmail,
      subject: 'Urban Cabz - Password Reset OTP',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; color: #333;">
          <h2 style="color: #EAB308;">Password Reset OTP</h2>
          <p>Your OTP for resetting your Urban Cabz password is:</p>
          <h1 style="letter-spacing: 8px; color: #111;">${otp}</h1>
          <p>This OTP is valid for <strong>${OTP_TTL_MINUTES} minutes</strong>.</p>
          <p>If you didn't request this, please ignore this email.</p>
          <br/>
          <p>Safe Travels,<br/>The Urban Cabz Team</p>
        </div>
      `,
      text: `Your Urban Cabz password reset OTP is: ${otp}. Valid for ${OTP_TTL_MINUTES} minutes.`,
    });
    destination = toEmail;
  } else {
    // Send OTP via SMS
    const rawPhone = otpTo ? String(otpTo).trim() : user.phone;
    if (!rawPhone) {
      throw { status: 400, message: 'No phone number on file. Please provide a phone number or email to receive OTP.' };
    }
    const sendToPhone = normalizeIndianPhone(rawPhone);
    console.log('📱 Sending OTP via SMS to:', sendToPhone);
    await sendOtpSms({ toPhone: sendToPhone, otp, expiryMinutes: OTP_TTL_MINUTES });
    destination = maskPhone(sendToPhone);
  }

  return {
    resetId: resetRecord.id,
    expiresAt: resetRecord.expires_at,
    expiresIn: OTP_TTL_MINUTES * 60,
    destination,
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

  // Update password and mark OTP as used
  await prisma.user.update({
    where: { id: resetRecord.user_id },
    data: { password_hash: passwordHash },
  });

  await prisma.passwordResetOtp.update({
    where: { id: resetRecord.id },
    data: {
      verified: true,
      attempts: { increment: 1 },
    },
  });

  return { success: true };
}

module.exports = {
  requestPasswordReset,
  completePasswordReset,
};

