const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

const TMDB_KEY = process.env.TMDB_KEY;
const TMDB_BASE = 'https://api.themoviedb.org/3';

let cache = {
  trending: { data: null, timestamp: 0 },
  popular: { data: null, timestamp: 0 }
};
const CACHE_TTL = 300000;

async function fetchTMDB(endpoint) {
  const url = `${TMDB_BASE}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${TMDB_KEY}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('TMDB API error');
  return await response.json();
}

function getCached(key, fetcher) {
  const now = Date.now();
  if (cache[key].data && now - cache[key].timestamp < CACHE_TTL) {
    return Promise.resolve(cache[key].data);
  }
  return fetcher().then(data => {
    cache[key] = { data, timestamp: now };
    return data;
  });
}

router.get('/', async (req, res) => {
  try {
    const trending = await getCached('trending', () => fetchTMDB('/trending/all/week'));
    const newReleases = await fetchTMDB('/movie/now_playing');
    const classic = await fetchTMDB('/discover/movie?primary_release_date.lte=2000-12-31&sort_by=popularity.desc');

    res.render('index', {
      trending: trending.results.slice(0, 10),
      newReleases: newReleases.results.slice(0, 10),
      classic: classic.results.slice(0, 10)
    });
  } catch (error) {
    res.status(500).send('Error loading homepage');
  }
});

router.get('/movies', async (req, res) => {
  try {
    const { genre, year, sort = 'popularity.desc', page = 1 } = req.query;
    let endpoint = `/discover/movie?sort_by=${sort}&page=${page}`;
    if (genre) endpoint += `&with_genres=${genre}`;
    if (year) endpoint += `&primary_release_year=${year}`;

    const [movies, genres] = await Promise.all([
      fetchTMDB(endpoint),
      fetchTMDB('/genre/movie/list')
    ]);

    res.render('movies', {
      movies: movies.results,
      genres: genres.genres,
      currentPage: parseInt(page),
      totalPages: movies.total_pages,
      filters: { genre, year, sort }
    });
  } catch (error) {
    res.status(500).send('Error loading movies');
  }
});

router.get('/tvshows', async (req, res) => {
  try {
    const { genre, year, status, sort = 'popularity.desc', page = 1 } = req.query;
    let endpoint = `/discover/tv?sort_by=${sort}&page=${page}`;
    if (genre) endpoint += `&with_genres=${genre}`;
    if (year) endpoint += `&first_air_date_year=${year}`;
    if (status) endpoint += `&with_status=${status}`;

    const [shows, genres] = await Promise.all([
      fetchTMDB(endpoint),
      fetchTMDB('/genre/tv/list')
    ]);

    res.render('tvshows', {
      shows: shows.results,
      genres: genres.genres,
      currentPage: parseInt(page),
      totalPages: shows.total_pages,
      filters: { genre, year, status, sort }
    });
  } catch (error) {
    res.status(500).send('Error loading TV shows');
  }
});

router.get('/anime', async (req, res) => {
  try {
    const { year, sort = 'popularity.desc', page = 1 } = req.query;
    let endpoint = `/discover/tv?with_genres=16&with_keywords=210024|287501&sort_by=${sort}&page=${page}`;
    if (year) endpoint += `&first_air_date_year=${year}`;

    const anime = await fetchTMDB(endpoint);

    res.render('anime', {
      anime: anime.results,
      currentPage: parseInt(page),
      totalPages: anime.total_pages,
      filters: { year, sort }
    });
  } catch (error) {
    res.status(500).send('Error loading anime');
  }
});

router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.render('search-results', { query: '', movies: [], shows: [], anime: [] });

    const [movies, shows] = await Promise.all([
      fetchTMDB(`/search/movie?query=${encodeURIComponent(q)}`),
      fetchTMDB(`/search/tv?query=${encodeURIComponent(q)}`)
    ]);

    const anime = shows.results.filter(show =>
      show.genre_ids && show.genre_ids.includes(16)
    );

    res.render('search-results', {
      query: q,
      movies: movies.results,
      shows: shows.results.filter(show => !show.genre_ids || !show.genre_ids.includes(16)),
      anime
    });
  } catch (error) {
    res.status(500).send('Error performing search');
  }
});

router.get('/watch/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;
    let endpoint = '';

    if (type === 'movie') {
      endpoint = `/movie/${id}`;
    } else if (type === 'tv' || type === 'anime') {
      endpoint = `/tv/${id}`;
    } else {
      return res.status(400).send('Invalid type');
    }

    // Fetch details with credits (cast information)
    const [details, credits] = await Promise.all([
      fetchTMDB(endpoint),
      fetchTMDB(`${endpoint}/credits`) // Fetch cast information
    ]);

    // Add credits to details object
    details.credits = credits;

    // Next episode info
    let nextEpisode = null;
    if (details.next_episode_to_air) {
      const airDate = new Date(details.next_episode_to_air.air_date);
      const day = String(airDate.getDate()).padStart(2, '0');
      const month = String(airDate.getMonth() + 1).padStart(2, '0');
      const year = airDate.getFullYear();

      nextEpisode = {
        season: details.next_episode_to_air.season_number,
        episode: details.next_episode_to_air.episode_number,
        title: details.next_episode_to_air.name,
        date: `${day}/${month}/${year}`
      };
    }

    res.render('watch', {
      type,
      id,
      details,
      nextEpisode
    });

  } catch (error) {
    console.error('Watch page error:', error);
    res.status(500).send('Error loading watch page');
  }
});

module.exports = router;
