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
  
app.get("/cleanplayer/:type/:id/:season?/:episode?", async (req, res) => {
  try {
    const { type, id, season = 1, episode = 1 } = req.params;

    // Build the vidlink URL
    const target =
      type === "movie"
        ? `https://vidlink.pro/movie/${id}`
        : `https://vidlink.pro/tv/${id}/${season}/${episode}`;

    // Fetch the remote HTML
    const response = await fetch(target);
    let html = await response.text();

    // Remove popup & ad scripts (basic cleaning)
    html = html
      .replace(/window\.open\s*\([^)]*\)/gi, "")
      .replace(/<script[^>]*(ads|pop)[^>]*>.*?<\/script>/gis, "")
      .replace(/onbeforeunload\s*=\s*[^;]+;/gi, "");

    res.setHeader("Content-Type", "text/html");
    res.send(html);
  } catch (err) {
    console.error("CleanPlayer error:", err);
    res.status(500).send("<h3>Player temporarily unavailable.</h3>");
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
