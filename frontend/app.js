require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();
const pagesRouter = require('./routes/pages.router');

const PORT = process.env.PORT || 3001;

// Dynamic client config from environment
app.get('/js/config.js', (req, res) => {
  res.type('application/javascript');
  res.send(`window.BACKEND_URL = ${JSON.stringify(process.env.BACKEND_URL || 'http://localhost:3000')};`);
});

app.use(express.static(path.join(__dirname, 'public/resources')));

app.use('/', pagesRouter);

app.listen(PORT, () => {
    console.log(`Front end on http://localhost:${PORT}`);
});