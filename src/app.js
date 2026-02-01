const express = require('express');
const authRoutes = require('./routes/auth.routes');
const bookingRoutes = require('./routes/booking.routes');
const paymentRoutes = require('./routes/payment.routes');
const adminRoutes = require('./routes/admin.routes');
const b2bRoutes = require('./routes/b2b.routes');
const fleetRoutes = require('./routes/fleet.routes');


const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

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

// Simple request logger to debug API traffic
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// API versioning prefix
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/bookings', bookingRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/b2b', b2bRoutes);
app.use('/api/v1/fleet', fleetRoutes);

app.get('/health', (req, res) => res.send({ ok: true }));

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

module.exports = app;
