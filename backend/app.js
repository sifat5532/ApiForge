require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth');
const projRoutes = require('./routes/project');
const templateRoutes = require('./routes/template');
const viewRoutes = require('./routes/view');
const { requireAuth, requireGuest } = require('./routes/auth');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(express.json());
app.use(cookieParser());

app.use('/auth', authRoutes);
app.use('/project', projRoutes);
app.use('/template', templateRoutes);
app.use('/view', viewRoutes);

app.get('/', requireAuth, (req, res) => {
  res.send('Hello World! You are logged in.' + '\n' + 'id: ' + req.loggedInUser.id + '\n' + 'name: ' + req.loggedInUser.name + '\n' + 'email: ' + req.loggedInUser.email + '\n' + 'username: ' + req.loggedInUser.username);
});

// it must be the last middleware
app.use(errorHandler);

app.listen(process.env.PORT, () => {
  console.log(`Server running at http://localhost:${process.env.PORT}`);
});


