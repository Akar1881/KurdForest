require('dotenv').config();
const express = require('express');
const path = require('path');
const mainRoutes = require('./routes/main');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.locals.websiteName = process.env.WEBSITE_NAME || 'KurdForest';
  res.locals.currentPath = req.path;
  next();
});

app.use('/', mainRoutes);
app.use('/api', apiRoutes);

app.use((req, res) => {
  res.status(404).send('Page not found');
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});