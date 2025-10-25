
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const User = require('../models/user');

// Middleware to check if a user is authenticated
function isAuthenticated(req, res, next) {
    if (req.session.user) {
        return next();
    }
    res.redirect('/login');
}

// --- File Upload Configuration (Multer) for profile pictures ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = 'public/uploads/profile_pictures';
        // Ensure the directory exists before saving
        fs.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        // Create a unique filename to prevent conflicts
        cb(null, req.session.user.id + '-' + Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 1024 * 1024 }, // 1MB limit
    fileFilter: function (req, file, cb) {
        const filetypes = /jpeg|jpg|png|gif/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files (jpeg, jpg, png, gif) are allowed!'));
        }
    }
});

// --- Profile Routes ---

// GET /profile - Redirect to the logged-in user's profile page
router.get('/profile', isAuthenticated, (req, res) => {
    res.redirect(`/profile/${req.session.user.username}`);
});

// GET /profile/:username - Display a user's profile page
router.get('/profile/:username', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username }).populate('watchlist');
        if (!user) {
            return res.status(404).render('404');
        }

        const isOwnProfile = req.session.user && req.session.user.id === user._id.toString();

        // Separate watchlist by type
        const movies = user.watchlist.filter(item => item.media_type === 'movie');
        const tvShows = user.watchlist.filter(item => item.media_type === 'tv');
        const animes = user.watchlist.filter(item => item.media_type === 'anime');

        res.render('profile', { 
            user, 
            isOwnProfile, 
            watchlist: { movies, tvShows, animes } 
        });
    } catch (error) {
        console.error('Profile view error:', error);
        res.status(500).send('Server error');
    }
});

// POST /profile/edit - Handle profile update form submission
// POST /profile/edit - Handle profile update form submission
router.post('/profile/edit', isAuthenticated, upload.single('profilePicture'), async (req, res) => {
    try {
        const { bio } = req.body;
        const user = await User.findById(req.session.user.id);

        user.bio = bio;

        if (req.file) {
            const uploadDir = path.join(__dirname, '../public/uploads/profile_pictures');
            const ext = path.extname(req.file.originalname).toLowerCase();
            const newFilename = `${user.username}${ext}`;
            const newFilePath = path.join(uploadDir, newFilename);

            // Delete old picture if it's not the default one
            if (user.profilePicture && user.profilePicture !== '/images/banner.png') {
                const oldFilePath = path.join(__dirname, '../public', user.profilePicture);
                if (fs.existsSync(oldFilePath)) {
                    fs.unlinkSync(oldFilePath);
                }
            }

            // Rename uploaded file to match username
            fs.renameSync(req.file.path, newFilePath);

            // Save new path to DB
            user.profilePicture = `/uploads/profile_pictures/${newFilename}`;
        }

        await user.save();

        // Update the session info
        req.session.user.profilePicture = user.profilePicture;

        res.redirect(`/profile/${user.username}`);
    } catch (error) {
        console.error('Profile edit error:', error);
        res.status(500).send('Error updating profile.');
    }
});

// --- Watchlist Routes ---
// GET /watchlist - Display the user's watchlist
router.get('/watchlist', async (req, res) => {
  if (!req.session.user)
    return res.redirect('/login');

  try {
    const user = await User.findById(req.session.user.id).populate('watchlist');
    const movies = user.watchlist.filter(item => item.media_type === 'movie');
    const tvShows = user.watchlist.filter(item => item.media_type === 'tv');
    const animes = user.watchlist.filter(item => item.media_type === 'anime');

    res.render('watchlist', { movies, tvShows, animes });
  } catch (error) {
    console.error('Error loading watchlist:', error);
    res.status(500).send('Server error');
  }
});

// POST /watchlist/add - Add an item to the user's watchlist
router.post('/watchlist/add', isAuthenticated, async (req, res) => {
    try {
        const { itemId, itemType } = req.body;
        await User.findByIdAndUpdate(req.session.user.id, { 
            $addToSet: { watchlist: { id: itemId, itemType: itemType } } 
        });
        res.redirect('back');
    } catch (error) {
        console.error('Watchlist add error:', error);
        res.status(500).send('Server error');
    }
});

// POST /watchlist/remove - Remove an item from the user's watchlist
router.post('/watchlist/remove', isAuthenticated, async (req, res) => {
    try {
        const { itemId } = req.body;
        await User.findByIdAndUpdate(req.session.user.id, { 
            $pull: { watchlist: { id: itemId } } 
        });
        res.redirect('back');
    } catch (error) {
        console.error('Watchlist remove error:', error);
        res.status(500).send('Server error');
    }
});

// GET /watchlist/:username - Show public watchlist of a user
router.get('/watchlist/:username', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username }).populate('watchlist');
        if (!user) return res.status(404).render('404');

        // Separate by type
        const movies = user.watchlist.filter(item => item.media_type === 'movie');
        const tvShows = user.watchlist.filter(item => item.media_type === 'tv');
        const animes = user.watchlist.filter(item => item.media_type === 'anime');

        res.render('watchlist', { 
            movies, 
            tvShows, 
            animes,
            owner: user.username // optional for display
        });
    } catch (error) {
        console.error('Error loading public watchlist:', error);
        res.status(500).send('Server error');
    }
});

module.exports = router;
