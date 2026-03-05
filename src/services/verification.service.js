// src/services/verification.service.js
const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');
const { sendOtpSms } = require('./sms.service');

const OTP_SALT_ROUNDS = 10;
const OTP_LENGTH = 6;
const OTP_TTL_MINUTES = 5;
const MAX_ATTEMPTS = 5;

// Reuse normalization from sms.service or define here
function normalizeIndianPhone(phone) {
    if (!phone) return phone;
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2); // return 10 digit for DB consistency if that's what we want, OR keep it standard. 
    // Actually, let's just use the helper in sms.service for sending, but for DB matching we need to be consistent.
    // The User table seems to store mixed formats.
    return phone;
}

function generateOtp() {
    const min = 10 ** (OTP_LENGTH - 1);
    const max = 10 ** OTP_LENGTH - 1;
    return String(Math.floor(Math.random() * (max - min + 1)) + min);
}

/**
 * Send a verification OTP to the user's phone
 */
async function sendVerificationOtp(userId) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, phone: true, is_verified: true },
    });

    if (!user) throw { status: 404, message: 'User not found' };
    if (user.is_verified) throw { status: 400, message: 'User already verified' };
    if (!user.phone) throw { status: 400, message: 'User has no phone number' };

    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, OTP_SALT_ROUNDS);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    // We reuse 'PasswordResetOtp' table for storing verification OTPs for now
    // Ideally we should have a separate table or a 'type' field
    const record = await prisma.passwordResetOtp.create({
        data: {
            user_id: user.id,
            otp_hash: otpHash,
            expires_at: expiresAt,
        },
    });

    console.log('📱 Sending Verification OTP via 2Factor:', { phone: user.phone, otp: '******' });

    // Use the SMS service (2Factor or Fast2SMS based on env)
    const sendResult = await sendOtpSms({
        toPhone: user.phone,
        otp, // The numeric OTP
        expiryMinutes: OTP_TTL_MINUTES,
    });

    if (!sendResult.success) {
        throw { status: 500, message: 'Failed to send SMS: ' + (sendResult.error || 'Unknown error') };
    }

    return {
        verificationId: record.id,
        expiresAt: record.expires_at,
        message: 'OTP sent to mobile number',
    };
}

/**
 * Verify the OTP and mark user as verified
 */
async function verifyPhone({ userId, otp, verificationId }) {
    if (!userId || !otp) {
        throw { status: 400, message: 'User ID and OTP are required' };
    }

    // Find the OTP record
    // If verificationId is provided, look it up directly. If not, find the latest valid one for user.
    let record;
    if (verificationId) {
        record = await prisma.passwordResetOtp.findUnique({ where: { id: verificationId } });
    } else {
        record = await prisma.passwordResetOtp.findFirst({
            where: { user_id: userId, verified: false },
            orderBy: { created_at: 'desc' },
        });
    }

    if (!record) throw { status: 400, message: 'Invalid or expired verification request' };
    if (record.verified) throw { status: 400, message: 'OTP already used' };
    if (new Date() > record.expires_at) throw { status: 400, message: 'OTP expired' };
    if (record.attempts >= MAX_ATTEMPTS) throw { status: 400, message: 'Too many attempts' };

    // Check OTP
    const match = await bcrypt.compare(otp, record.otp_hash);
    if (!match) {
        await prisma.passwordResetOtp.update({
            where: { id: record.id },
            data: { attempts: { increment: 1 } },
        });
        throw { status: 400, message: 'Invalid OTP' };
    }

    // Success: Mark OTP as verified AND User as verified
    await prisma.$transaction([
        prisma.passwordResetOtp.update({
            where: { id: record.id },
            data: { verified: true, attempts: { increment: 1 } },
        }),
        prisma.user.update({
            where: { id: userId },
            data: { is_verified: true },
        }),
    ]);

    return { success: true, message: 'Phone verified successfully' };
}

module.exports = {
    sendVerificationOtp,
    verifyPhone,
};
