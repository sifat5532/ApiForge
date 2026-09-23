const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const app = express();
const pagesRouter = require('./routes/pages.router');

const PORT = process.env.PORT || 3001;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

app.get('/js/config.js', (req, res) => {
  res.type('application/javascript');
  res.send(`window.BACKEND_URL = ${JSON.stringify(BACKEND_URL)};`);
});

app.use(express.static(path.join(__dirname, 'public/resources')));

app.use('/', pagesRouter);

app.listen(PORT, () => {
    console.log(`Front end on http://localhost:${PORT}`);
});