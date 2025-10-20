const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

const TMDB_KEY = process.env.TMDB_KEY;
const TMDB_BASE = 'https://api.themoviedb.org/3';

async function fetchTMDB(endpoint) {
  const url = `${TMDB_BASE}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${TMDB_KEY}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('TMDB API error');
  return await response.json();
}

router.get('/episodes/:id/:season', async (req, res) => {
  try {
    const { id, season } = req.params;
    const data = await fetchTMDB(`/tv/${id}/season/${season}`);

    const episodes = data.episodes.map(ep => ({
      episode_number: ep.episode_number,
      name: ep.name,
      overview: ep.overview
    }));

    res.json({ episodes });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching episodes' });
  }
});

module.exports = router;