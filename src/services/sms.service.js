// src/services/sms.service.js
// Fast2SMS service for sending OTP via SMS

const { FAST2SMS_API_KEY } = process.env;

/**
 * Normalize phone number to 10-digit Indian format (without country code)
 * Fast2SMS requires 10-digit numbers without +91
 */
function normalizePhoneFor10Digit(phone) {
    if (!phone) return null;

    const digits = String(phone).replace(/\D/g, '');

    // If starts with 91 and has 12 digits, remove the 91 prefix
    if (digits.length === 12 && digits.startsWith('91')) {
        return digits.slice(2);
    }

    // If already 10 digits, return as-is
    if (digits.length === 10) {
        return digits;
    }

    // If starts with 0 and has 11 digits, remove leading 0
    if (digits.length === 11 && digits.startsWith('0')) {
        return digits.slice(1);
    }

    console.warn('Unable to normalize phone number to 10 digits:', phone);
    return null;
}

/**
 * Send OTP via SMS using Fast2SMS API
 * 
 * @param {Object} params
 * @param {string} params.toPhone - Phone number (any format, will be normalized)
 * @param {string} params.otp - The OTP code to send
 * @param {number} params.expiryMinutes - OTP validity in minutes
 */
async function sendOtpSms({ toPhone, otp, expiryMinutes = 5 }) {
    if (!FAST2SMS_API_KEY) {
        console.warn('FAST2SMS_API_KEY not configured; SMS sending disabled.');
        return { success: false, error: 'SMS service not configured' };
    }

    const normalizedPhone = normalizePhoneFor10Digit(toPhone);
    if (!normalizedPhone) {
        console.warn('Invalid phone number for SMS:', toPhone);
        return { success: false, error: 'Invalid phone number' };
    }

    // Use Quick Route (Network "q" or "otp")
    // User reported "otp" route was costing 5 rupees or failing? 
    // Let's stick to the "OTP" route but ensure variables (otp) are sent correctly.

    try {
        console.log('📱 Sending OTP SMS via Fast2SMS (OTP Route):', {
            to: normalizedPhone,
            otpLength: otp.length,
            otpVal: otp // Debug log
        });

        const bodyData = {
            route: 'otp',
            variables_values: String(otp), // Ensure string
            flash: 0,
            numbers: normalizedPhone,
        };

        const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
            method: 'POST',
            headers: {
                'authorization': FAST2SMS_API_KEY,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(bodyData),
        });

        const data = await response.json();

        if (data.return === true) {
            console.log('✅ SMS sent successfully:', {
                requestId: data.request_id,
                to: normalizedPhone,
            });
            return { success: true, requestId: data.request_id };
        } else {
            console.error('❌ Fast2SMS API error:', data);

            // Fallback to quick route if OTP route fails (e.g. DLT error)
            if (data.message && (data.message.includes('DLT') || data.message.includes('content'))) {
                console.log('⚠️ Retrying with Quick SMS route...');
                // Quick Route Fallback
                const msg = `Your OTP is ${otp}`;
                const fallbackRes = await fetch('https://www.fast2sms.com/dev/bulkV2', {
                    method: 'POST',
                    headers: { 'authorization': FAST2SMS_API_KEY, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        route: 'q',
                        message: msg,
                        language: 'english',
                        flash: 0,
                        numbers: normalizedPhone
                    })
                });
                const fallbackData = await fallbackRes.json();
                if (fallbackData.return === true) return { success: true, requestId: fallbackData.request_id };
            }

            return { success: false, error: data.message || 'Failed to send SMS' };
        }
    } catch (err) {
        console.error('❌ Failed to send SMS via Fast2SMS:', err);
        return { success: false, error: err.message };
    }
}

module.exports = {
    sendOtpSms,
};
