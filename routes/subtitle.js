const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { fetchAndTranslateSubtitle } = require('../utils/subtitle');

// POST /subtitle/fetch → Fetch & translate then return the correct URL
router.post('/fetch', async (req, res) => {
  try {
    const { tmdbId, type, season, episode } = req.body;

    if (!tmdbId || !type) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // For TV shows, both season and episode are required
    if ((type === 'tv' || type === 'anime') && (!season || !episode)) {
      return res.status(400).json({ error: 'Season and episode required for TV shows' });
    }

    // Fetch and translate subtitle file
    const result = await fetchAndTranslateSubtitle(
      tmdbId,
      type === 'movie' ? 'movie' : 'tv',
      season ? parseInt(season) : null,
      episode ? parseInt(episode) : null
    );

    if (!result.success) {
      return res.status(404).json({ success: false, error: result.error || 'Subtitle not found' });
    }

    // Construct final URL
    let subtitleUrl;
    if (type === 'movie') {
      subtitleUrl = `/subtitles/movies/${tmdbId}/kurdish.vtt`;
    } else {
      subtitleUrl = `/subtitles/tvshows/${tmdbId}/season${season}/episode${episode}/kurdish.vtt`;
    }

    // Return public URL
    return res.json({
      success: true,
      subtitleUrl,
      fromCache: result.fromCache
    });
  } catch (error) {
    console.error('Subtitle fetch error:', error);
    return res.status(500).json({ success: false, error: 'Server error while fetching subtitle' });
  }
});

module.exports = router;