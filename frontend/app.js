const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');
const app = express();
const pagesRouter = require('./routes/pages.router');

// Proxy API calls to the backend (port 3000)
// This keeps the session cookie working — from the browser's perspective,
// all requests go to the same origin (localhost:3001).
const apiProxy = createProxyMiddleware({
    target: 'http://localhost:3000',
    changeOrigin: true,
});
app.use('/auth', apiProxy);
app.use('/view', apiProxy);
app.use('/project', apiProxy);

app.use(express.static(path.join(__dirname, 'public/resources')));

app.use('/', pagesRouter);

app.listen(3001, () => {
    console.log('Front end on http://localhost:3001')
});