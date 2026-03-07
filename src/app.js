const express = require('express');
const path = require('path');
const zlib = require('zlib');
const { Transform } = require('stream');

const authRoutes = require('./routes/auth.routes');
const bookingRoutes = require('./routes/booking.routes');
const paymentRoutes = require('./routes/payment.routes');
const adminRoutes = require('./routes/admin.routes');
const b2bRoutes = require('./routes/b2b.routes');
const fleetRoutes = require('./routes/fleet.routes');
const cors = require('cors');

const app = express();

// Trust proxy — required for correct IP behind Render/nginx reverse proxy
app.set('trust proxy', 1);

// ─── CORS ────────────────────────────────────────────────────────────────────
// In production FRONTEND_URL must be set (e.g. https://urbancabz.com)
// Locally it falls back to localhost:5174 for dev convenience
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://urbancabz.com',
  'https://www.urbancabz.com',
  ...(process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map((o) => o.trim())
    : []),
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server calls (no origin) and listed origins
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── BODY PARSER ─────────────────────────────────────────────────────────────
// 1 MB is plenty for JSON API payloads. 10 MB was dangerously large.
app.use(express.json({ limit: '1mb' }));

// ─── STATIC FILES ─────────────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
  maxAge: '7d',
  etag: true,
  lastModified: true,
}));

// ─── SECURITY HEADERS ────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  // Allow images from Cloudinary + self; scripts/styles only from self
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https://res.cloudinary.com; " +
    "connect-src 'self';"
  );
  next();
});

// ─── GZIP COMPRESSION ────────────────────────────────────────────────────────
// Compress JSON/text API responses. Skips already-compressed (images, etc.)
const COMPRESSIBLE_RE = /json|text|javascript|xml|svg/i;
app.use((req, res, next) => {
  const acceptsGzip = (req.headers['accept-encoding'] || '').includes('gzip');
  if (!acceptsGzip) return next();

  const originalJson = res.json.bind(res);
  res.json = (data) => {
    const body = JSON.stringify(data);
    const contentType = res.getHeader('Content-Type') || 'application/json';

    if (!COMPRESSIBLE_RE.test(contentType)) return originalJson(data);

    const buf = Buffer.from(body, 'utf8');
    // Only compress if > 1 KB — tiny payloads cost more to compress than save
    if (buf.length < 1024) return originalJson(data);

    zlib.gzip(buf, (err, compressed) => {
      if (err) return originalJson(data);
      if (!res.headersSent) {
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Vary', 'Accept-Encoding');
        res.setHeader('Content-Length', compressed.length);
        res.end(compressed);
      }
    });
  };
  next();
});

// ─── RATE LIMITER ─────────────────────────────────────────────────────────────
// 200 requests per minute per IP (generous for legit users, blocks bots)
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 200;

const rateLimit = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const record = rateLimitStore.get(ip);

  if (!record || now > record.resetTime) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return next();
  }

  if (record.count >= RATE_LIMIT_MAX) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ success: false, message: 'Too many requests. Please try again in a minute.' });
  }

  record.count++;
  next();
};

app.use('/api', rateLimit);

// ─── REQUEST LOGGER ───────────────────────────────────────────────────────────
// Only log in development — production logs burn CPU and fill Render log quota
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    next();
  });
}

// ─── CONCURRENCY + DEDUPE ─────────────────────────────────────────────────────
const concurrencyLimiter = require('./middlewares/concurrency.middleware');
const dedupe = require('./middlewares/dedupe.middleware');
app.use('/api', dedupe);
app.use('/api', concurrencyLimiter);

// ─── ROUTES ───────────────────────────────────────────────────────────────────
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/bookings', bookingRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/b2b', b2bRoutes);
app.use('/api/v1/fleet', fleetRoutes);
app.use('/api/v1/pricing', require('./routes/pricing.routes'));

// ─── HEALTH CHECK (Stateless) ─────────────────────────────────────────────────
// A lightweight route that DOES NOT query the database.
// Used by cron-job.org to keep the Render server awake without exhausting Supabase connections.
app.get('/health', (req, res) => {
  return res.status(200).send("OK");
});

// ─── DATABASE HEALTH CHECK ──────────────────────────────────────────────────
// Render pings this if you want to verify DB up-status.
const prisma = require('./config/prisma');
app.get('/health/db', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.status(200).json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    return res.status(503).json({ status: 'error', db: 'unreachable', timestamp: new Date().toISOString() });
  }
});

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// ─── GLOBAL ERROR HANDLER ─────────────────────────────────────────────────────
// Never leak stack traces or internal error details in production
app.use((err, req, res, next) => {
  console.error('[Error]', err.status || 500, req.method, req.originalUrl, err.message);
  const status = err.status || 500;
  const message =
    process.env.NODE_ENV === 'production' && status >= 500
      ? 'An unexpected error occurred'
      : err.message || 'An unexpected error occurred';
  res.status(status).json({ success: false, message });
});

// ─── RATE LIMIT STORE CLEANUP ─────────────────────────────────────────────────
// Prevent unbounded memory growth from unique IPs accumulating in store
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitStore) {
    if (now > record.resetTime + RATE_LIMIT_WINDOW) rateLimitStore.delete(ip);
  }
}, 5 * 60 * 1000);

module.exports = app;
