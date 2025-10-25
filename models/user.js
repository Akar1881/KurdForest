const mongoose = require('mongoose');
require('./movie.js');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  profilePicture: { type: String, default: '/images/banner.png' },
  bio: { type: String, default: '' },
  watchlist: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Movie'
  }],
  isVerified: { type: Boolean, default: false }
});

module.exports = mongoose.model('User', userSchema);