const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const app = express();
const pagesRouter = require('./routes/pages.router');

const PORT = process.env.PORT || 3001;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

const HTML_PAGES = new Set([
  '/',
  '/login',
  '/signup',
  '/dashboard',
  '/projects',
  '/new-project',
  '/liked',
  '/notifications',
  '/templates',
  '/leaderboard',
  '/profile',
  '/billing',
  '/documentation',
  '/logout'
]);

function shouldProxy(pathname, req) {
  if (req.method === 'GET') {
    const clean = pathname.replace(/\/$/, '') || '/';
    if (HTML_PAGES.has(clean)) return false;
    if (/^\/project\/[^/]+$/.test(clean)) return false;
    if (/^\/template\/[^/]+$/.test(clean)) return false;
    if (/^\/my-template\/[^/]+$/.test(clean)) return false;
  }

  return /^(?:\/auth|\/project|\/template|\/view|\/new|\/api|\/profile|\/dashboard|\/payment|\/statistics|\/export)(?:\/|$)/.test(pathname);
}

app.get('/js/config.js', (req, res) => {
  res.type('application/javascript');
  res.send('window.BACKEND_URL = window.location.origin;');
});

app.use(express.static(path.join(__dirname, 'public/resources')));

app.use(createProxyMiddleware({
  target: BACKEND_URL,
  changeOrigin: true,
  cookieDomainRewrite: '',
  pathFilter: shouldProxy
}));

app.use('/', pagesRouter);

app.listen(PORT, () => {
    console.log(`Front end on http://localhost:${PORT}`);
});
