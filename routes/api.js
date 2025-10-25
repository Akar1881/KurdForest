const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const User = require('../models/user');
const Movie = require('../models/movie');
const Comment = require('../models/comment');
require('dotenv').config();

const TMDB_KEY = process.env.TMDB_KEY;
const TMDB_BASE = 'https://api.themoviedb.org/3';

async function fetchTMDB(endpoint) {
  const url = `${TMDB_BASE}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${TMDB_KEY}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('TMDB API error');
  return await response.json();
}

// Fetch episodes of a TV season
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
  } catch {
    res.status(500).json({ error: 'Error fetching episodes' });
  }
});

// Check if an item is in the user's watchlist
router.get('/watchlist/check/:tmdbId', async (req, res) => {
  if (!req.session.user) return res.json({ inWatchlist: false });
  try {
    const { tmdbId } = req.params;
    const movie = await Movie.findOne({ tmdbId });
    if (!movie) return res.json({ inWatchlist: false });

    const user = await User.findById(req.session.user.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const inWatchlist = user.watchlist.includes(movie._id);
    res.json({ inWatchlist });
  } catch (error) {
    console.error('Watchlist check error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

// Add to watchlist
router.post('/watchlist/add', async (req, res) => {
  if (!req.session.user)
    return res.status(401).json({ error: 'You must be logged in to add to your watchlist.' });

  const { tmdbId, media_type } = req.body;

  try {
    const user = await User.findById(req.session.user.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const actualMediaType = media_type === 'anime' ? 'tv' : media_type;
    let movie = await Movie.findOne({ tmdbId });

    if (!movie) {
      const details = await fetchTMDB(`/${actualMediaType}/${tmdbId}?append_to_response=credits`);
      movie = new Movie({
        tmdbId: details.id,
        media_type,
        title: details.title || details.name,
        overview: details.overview,
        poster_path: details.poster_path,
        release_date: details.release_date || details.first_air_date,
        vote_average: details.vote_average,
        genres: details.genres,
        credits: {
          cast: details.credits.cast.slice(0, 20).map(p => ({
            name: p.name,
            character: p.character,
            profile_path: p.profile_path
          }))
        }
      });
      await movie.save();
    }

    if (user.watchlist.some(id => id.equals(movie._id)))
      return res.status(409).json({ message: 'Item already in watchlist.' });

    user.watchlist.push(movie._id);
    await user.save();

    res.json({ success: true, message: 'Added to watchlist.' });
  } catch (error) {
    console.error('Error adding to watchlist:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

// Remove from watchlist
router.post('/watchlist/remove', async (req, res) => {
  if (!req.session.user)
    return res.status(401).json({ error: 'You must be logged in to remove from your watchlist.' });

  try {
    const { tmdbId } = req.body;
    const movie = await Movie.findOne({ tmdbId });
    if (!movie) return res.status(404).json({ error: 'Item not found.' });

    await User.findByIdAndUpdate(req.session.user.id, {
      $pull: { watchlist: movie._id }
    });

    res.json({ success: true, message: 'Removed from watchlist.' });
  } catch (error) {
    console.error('Error removing from watchlist:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

// Get comments (paginated)
router.get('/comments/:tmdbId', async (req, res) => {
  try {
    const { tmdbId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = 15;
    const skip = (page - 1) * limit;

    const [comments, count] = await Promise.all([
      Comment.find({ tmdb_id: tmdbId })
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit),
      Comment.countDocuments({ tmdb_id: tmdbId })
    ]);

    res.json({
      comments,
      currentPage: page,
      totalPages: Math.ceil(count / limit)
    });
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

// Add comment
router.post('/comments/add', async (req, res) => {
  if (!req.session.user)
    return res.status(401).json({ error: 'You must be logged in to comment.' });

  try {
    const { tmdbId, mediaType, comment } = req.body;
    const userId = req.session.user.id;

    const existing = await Comment.findOne({ tmdb_id: tmdbId, user_id: userId });
    if (existing)
      return res.status(409).json({ error: 'You have already commented on this series.' });

    const newComment = new Comment({
      user_id: userId,
      username: req.session.user.username,
      profile_picture: req.session.user.profilePicture,
      tmdb_id: tmdbId,
      media_type: mediaType,
      comment
    });

    await newComment.save();
    res.json({ success: true, comment: newComment });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

// Delete comment
router.delete('/comments/delete/:commentId', async (req, res) => {
  if (!req.session.user)
    return res.status(401).json({ error: 'You must be logged in.' });

  try {
    const { commentId } = req.params;
    const deleted = await Comment.findOneAndDelete({
      _id: commentId,
      user_id: req.session.user.id
    });

    if (!deleted)
      return res.status(404).json({ error: 'Comment not found or not yours.' });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;