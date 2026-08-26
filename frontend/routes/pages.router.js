const express = require('express');
const path = require('path');
const router = express.Router();

const pages = path.join(__dirname, '..', 'public', 'pages');

router.get('/',              (req, res) => res.sendFile(path.join(pages, 'index.html')));
router.get('/login',         (req, res) => res.sendFile(path.join(pages, 'login.html')));
router.get('/signup',        (req, res) => res.sendFile(path.join(pages, 'signup.html')));
router.get('/dashboard',     (req, res) => res.sendFile(path.join(pages, 'dashboard.html')));
router.get('/projects',      (req, res) => res.sendFile(path.join(pages, 'projects.html')));
router.get('/new-project',   (req, res) => res.sendFile(path.join(pages, 'new-project.html')));
router.get('/liked',         (req, res) => res.sendFile(path.join(pages, 'liked.html')));
router.get('/notifications', (req, res) => res.sendFile(path.join(pages, 'notifications.html')));
router.get('/templates',     (req, res) => res.sendFile(path.join(pages, 'templates.html')));
router.get('/leaderboard',   (req, res) => res.sendFile(path.join(pages, 'leaderboard.html')));
router.get('/logout',        async (req, res) => {
  try {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
    const backendRes = await fetch(`${backendUrl}/auth/logout`, {
      method: 'POST',
      headers: { cookie: req.headers.cookie || '' }
    });
    if (backendRes.ok) {
      const setCookie = backendRes.headers.get('set-cookie');
      if (setCookie) res.setHeader('Set-Cookie', setCookie);
    }
  } catch (err) {
    console.error('Logout error:', err.message);
  }
  res.redirect('/login');
});

module.exports = router;
