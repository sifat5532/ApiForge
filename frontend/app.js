const express = require('express');
const path = require('path');
const app = express();
const pagesRouter = require('./routes/pages.router');

app.use(express.static(path.join(__dirname, 'public/resources')));

app.use('/', pagesRouter);

app.listen(3001, () => {
    console.log('Front end on http://localhost:3001')
});