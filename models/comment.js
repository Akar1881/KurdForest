const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  username: { type: String, required: true },
  profile_picture: { type: String },
  tmdb_id: { type: String, required: true },
  media_type: { type: String, required: true },
  comment: { type: String, required: true },
  created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Comment', commentSchema);