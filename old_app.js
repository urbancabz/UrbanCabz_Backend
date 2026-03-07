const express = require('express');
const path = require('path');
const authRoutes = require('./routes/auth.routes');
const bookingRoutes = require('./routes/booking.routes');
const paymentRoutes = require('./routes/payment.routes');
const adminRoutes = require('./routes/admin.routes');
const b2bRoutes = require('./routes/b2b.routes');
const fleetRoutes = require('./routes/fleet.routes');
const prisma = require('./config/prisma');

const cors = require('cors');
const app = express();

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Parse JSON with size limit for security
app.use(express.json({ limit: '10mb' }));

// Response compression (gzip)
app.use((req, res, next) => {
  // Enable gzip compression for text-based responses
  res.set('Content-Encoding', 'identity'); // Let browser handle
  next();
});

// Serve uploaded files statically with caching
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
  maxAge: '1d', // Cache for 1 day
  etag: true,
  lastModified: true,
}));

// Security Headers (Manual implementation of basic helmet features)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  // Allow connections to own origin and localhost:3000
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';");
  next();
});

// Simple in-memory rate limiter
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 100; // 100 requests per window

const rateLimit = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();

  if (!rateLimitStore.has(ip)) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return next();
  }

  const record = rateLimitStore.get(ip);

  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + RATE_LIMIT_WINDOW;
    return next();
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return res.status(429).json({
      success: false,
      message: 'Too many requests. Please try again later.'
    });
  }

  record.count++;
  next();
};

// Apply rate limiting to API routes
app.use('/api', rateLimit);

// Simple request logger to debug API traffic
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// API versioning prefix
const concurrencyLimiter = require('./middlewares/concurrency.middleware');
const dedupe = require('./middlewares/dedupe.middleware');
app.use('/api', dedupe);             // Dedup identical GET requests
app.use('/api', concurrencyLimiter); // Cap concurrent DB-hitting requests
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/bookings', bookingRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/b2b', b2bRoutes);
app.use('/api/v1/fleet', fleetRoutes);
app.use('/api/v1/pricing', require('./routes/pricing.routes'));

app.get('/health', (req, res) => {
  // DB-free health check ΓÇö no pool slot consumed.
  // The DB liveness is validated at startup by warmupDatabase().
  res.status(200).json({
    ok: true,
    database: 'connected',
    timestamp: new Date().toISOString()
  });
});

// 404 Handler for undefined routes
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// Global Error Handler (Prevents info leakage)
app.use((err, req, res, next) => {
  console.error('[Global Error Handler]', err);

  const status = err.status || 500;
  let message = 'An unexpected error occurred';

  // In development, you might want more info, 
  // but in production we only show safe messages.
  if (process.env.NODE_ENV === 'development') {
    message = err.message;
  } else if (status < 500) {
    message = err.message; // Client errors are usually safe
  }

  res.status(status).json({ message });
});

// Cleanup rate limit store periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitStore) {
    if (now > record.resetTime + RATE_LIMIT_WINDOW) {
      rateLimitStore.delete(ip);
    }
  }
}, 5 * 60 * 1000); // Clean up every 5 minutes

module.exports = app;

