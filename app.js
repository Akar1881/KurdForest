require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const bodyParser = require('body-parser');

const mainRoutes = require('./routes/main');
const apiRoutes = require('./routes/api');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const subtitleRoutes = require('./routes/subtitle');

const app = express();
const PORT = process.env.PORT || 3000;

// --- MongoDB Connection ---
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kurdforest', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// --- View Engine ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- Middleware ---
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

// --- Sessions ---
app.use(session({
  secret: process.env.SESSION_SECRET || 'replace_this_with_a_real_secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 7 // 1 week
  }
}));

// --- CORS for subtitles ---
app.use('/subtitles', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://vidlink.pro');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Range');
  res.header('Access-Control-Expose-Headers', 'Content-Range');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// --- Restrict subtitle access to vidlink.pro ---
app.use('/subtitles', (req, res, next) => {
  const origin = req.headers.origin || '';
  const referer = req.headers.referer || '';

  if (origin.includes('vidlink.pro') || referer.includes('vidlink.pro')) {
    return next(); // allowed
  }

  console.log(`❌ Blocked subtitle access from: origin=${origin}, referer=${referer}`);
  return res.status(403).send('Access denied');
});

// --- Serve static subtitles ---
app.use('/subtitles', express.static(path.join(__dirname, 'subtitles')));

// --- Global variables for EJS views ---
app.use((req, res, next) => {
  res.locals.websiteName = process.env.WEBSITE_NAME || 'KurdForest';
  res.locals.currentPath = req.path;
  res.locals.user = req.session.user;
  next();
});

// --- Routes ---
app.use('/', authRoutes);
app.use('/', userRoutes);
app.use('/', mainRoutes);
app.use('/api', apiRoutes);
app.use('/subtitle', subtitleRoutes);

// --- 404 Handler ---
app.use((req, res) => {
  res.status(404).render('404');
});

// --- Error Handler ---
app.use((err, req, res, next) => {
  console.error('🔥 Server Error:', err);
  res.status(500).send('Something went wrong!');
});

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
