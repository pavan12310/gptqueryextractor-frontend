// ============================================
// server.js — GPT Query Extractor Backend
// ============================================

const express   = require('express');
const dotenv    = require('dotenv');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');

dotenv.config();

const connectDB = require('./config/db');
connectDB();

const app = express();

// Trust proxy — REQUIRED for Render.com (fixes rate limit error)
app.set('trust proxy', 1);

// ─── CORS ───
app.use(cors({
  origin: [
    'https://gptqueryextractor.netlify.app',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

// ─── BODY PARSER ───
app.use((req, res, next) => {
  if (req.originalUrl === '/api/payments/webhook') {
    next();
  } else {
    express.json()(req, res, next);
  }
});
app.use(express.urlencoded({ extended: true }));

// ─── RATE LIMITING ───
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Try again in 15 minutes.' }
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Try again in 15 minutes.' }
});

app.use('/api/', limiter);
app.use('/api/auth/login',  authLimiter);
app.use('/api/auth/signup', authLimiter);

// ─── ROUTES ───
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/sessions',  require('./routes/sessions'));
app.use('/api/contact',   require('./routes/contact'));
app.use('/api/payments',  require('./routes/payments'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: '🟢 GPT Query Extractor API is running!',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Root — API only, frontend is on Netlify
app.get('/', (req, res) => {
  res.json({ success: true, message: '🟢 GPT Query Extractor API is running!', version: '1.0.0' });
});

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found.` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error.'
  });
});

// ─── START ───
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log('');
  console.log('╔════════════════════════════════════════╗');
  console.log('║   GPT Query Extractor Backend v1.0.0   ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`🚀 Server running on  : http://localhost:${PORT}`);
  console.log(`🌍 Environment        : ${process.env.NODE_ENV}`);
  console.log(`🔗 Health check       : http://localhost:${PORT}/api/health`);
  console.log('');
});

module.exports = app;
