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

module.exports = router;
