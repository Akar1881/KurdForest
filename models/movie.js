const mongoose = require('mongoose');

const movieSchema = new mongoose.Schema({
  tmdbId: { type: String, required: true, unique: true },
  media_type: { type: String, required: true }, // 'movie' or 'tv'
  title: { type: String, required: true },
  overview: { type: String },
  poster_path: { type: String },
  release_date: { type: String },
  vote_average: { type: Number },
  genres: [{ id: Number, name: String }],
  credits: {
    cast: [{
      name: String,
      character: String,
      profile_path: String
    }]
  }
});

const Movie = mongoose.model('Movie', movieSchema);

module.exports = Movie;
