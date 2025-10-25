require('dotenv').config();
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const User = require('../models/user');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { storeTempUser, getTempUser, removeTempUser } = require('../utils/tempUsers');
const { storeResetToken, getResetToken, removeResetToken } = require('../utils/resetTokens');

// Middleware to redirect a user to the homepage if they are already logged in
function redirectIfLoggedIn(req, res, next) {
    if (req.session.user) {
        return res.redirect('/');
    }
    next();
}

// Nodemailer transporter setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// GET /register - Display the registration page
router.get('/register', redirectIfLoggedIn, (req, res) => {
    res.render('register');
});

// POST /register - Handle new user registration
router.post('/register', redirectIfLoggedIn, async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Restrict to Gmail addresses only
    if (!email.toLowerCase().endsWith('@gmail.com')) {
        return res.status(400).render('register', { error: 'Only Gmail addresses are allowed to register.' });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
        return res.status(409).render('register', { error: 'A user with that email or username already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationCode = crypto.randomBytes(3).toString('hex').toUpperCase();
    const verificationToken = crypto.randomBytes(20).toString('hex');

    storeTempUser(verificationToken, {
        username,
        email,
        password: hashedPassword,
        verificationCode,
    });

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: '🌟 Thanks for Choosing KurdForest.xyz',
        html: `
        <div style="
            font-family: 'Arial', sans-serif;
            background: #0b0b0b;
            color: #e0ffe0;
            text-align: center;
            padding: 40px 20px;
            border-radius: 12px;
            box-shadow: 0 0 30px rgba(0, 255, 80, 0.3);
            max-width: 600px;
            margin: auto;
        ">
            <img src="./public/images/banner.svg" alt="KurdForest Banner"
            style="width: 100%; max-width: 500px; border-radius: 8px; margin-bottom: 25px;">
            <h1 style="color: #00ff7f; margin-bottom: 10px;">Welcome to KurdForest.xyz 🍿</h1>
            <p style="font-size: 16px; color: #b0ffb0;">
                Thanks for choosing KurdForest! Registering your email is optional, 
                but if you'd like to unlock extra features, you can verify your email using the code below.
            </p>
            <div style="
                background: radial-gradient(circle at top, #00ff7f, #003300);
                color: #000;
                font-size: 28px;
                font-weight: bold;
                letter-spacing: 4px;
                border-radius: 10px;
                padding: 15px 25px;
                margin: 30px auto;
                width: fit-content;
                box-shadow: 0 0 20px rgba(0, 255, 100, 0.6);
            ">
                ${verificationCode}
            </div>
            <p style="font-size: 14px; color: #9fdc9f;">
                This code is required and expires in <strong>1 minute</strong>.
            </p>
            <p style="font-size: 14px; color: #90b490; margin-top: 15px;">
                If you didn't register, no worries — you can still enjoy KurdForest!
            </p>
            <hr style="border: none; height: 1px; background: #1f3d20; margin: 30px 0;">
            <p style="font-size: 13px; color: #6fa76f;">
                🎥 KurdForest.xyz — Thanks for being part of our movie forest
            </p>
        </div>
        `
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Error sending verification email:', error);
            return res.status(500).render('register', { error: 'An error occurred while sending the verification email.' });
        }
        res.redirect(`/verify?token=${verificationToken}`);
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).render('register', { error: 'An error occurred during registration.' });
  }
});

// GET /verify - Display the verification page
router.get('/verify', (req, res) => {
    const { token } = req.query;
    if (!token || !getTempUser(token)) {
        return res.redirect('/register');
    }
    res.render('verify', { token });
});

// POST /verify - Handle email verification
router.post('/verify', async (req, res) => {
    const { token, code } = req.body;
    const tempUser = getTempUser(token);

    if (!tempUser || (Date.now() - tempUser.timestamp) > 60000) {
        if(tempUser) removeTempUser(token);
        return res.render('verify', { error: 'Verification code has expired. Please register again.', token: null });
    }

    if (tempUser.verificationCode !== code.toUpperCase()) {
        return res.render('verify', { error: 'Invalid verification code.', token });
    }

    try {
        const { username, email, password } = tempUser;
        const user = new User({ username, email, password, isVerified: true });
        await user.save();
        removeTempUser(token);
        req.session.user = { id: user._id, username: user.username, profilePicture: user.profilePicture };
        req.session.save(err => {
            if (err) {
                console.error('Session save error:', err);
                return res.status(500).render('verify', { error: 'An error occurred during verification.', token });
            }
            res.redirect('/');
        });
    } catch (error) {
        console.error('Verification error:', error);
        res.status(500).render('verify', { error: 'An error occurred during verification.', token });
    }
});

// GET /login - Display the login page
router.get('/login', redirectIfLoggedIn, (req, res) => {
    res.render('login');
});

// POST /login - Handle user login
router.post('/login', redirectIfLoggedIn, async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (user && await bcrypt.compare(password, user.password)) {
        if (!user.isVerified) {
            return res.status(401).render('login', { error: 'Please verify your email before logging in.' });
        }
      req.session.user = { id: user._id, username: user.username, profilePicture: user.profilePicture };
      req.session.save(err => {
        if (err) {
            console.error('Session save error:', err);
            return res.status(500).render('login', { error: 'An error occurred during login.' });
        }
        res.redirect('/');
      });
    } else {
      res.status(401).render('login', { error: 'Invalid email or password.' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).render('login', { error: 'An error occurred during login.' });
  }
});

// GET /forgot-password - Display forgot password page
router.get('/forgot-password', redirectIfLoggedIn, (req, res) => {
    res.render('forgotpass');
});

// POST /forgot-password - Handle forgot password request
router.post('/forgot-password', redirectIfLoggedIn, async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        
        if (!user) {
            return res.render('forgotpass', { 
                message: 'If an account with that email exists, a recovery link has been sent.' 
            });
        }

        const resetToken = crypto.randomBytes(20).toString('hex');
        storeResetToken(resetToken, {
            userId: user._id,
            email: user.email
        });

        const resetLink = `${req.protocol}://${req.get('host')}/recover/${resetToken}`;
        
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: '🔐 Password Reset Request - KurdForest.xyz',
            html: `
            <div style="
                font-family: 'Arial', sans-serif;
                background: #0b0b0b;
                color: #e0ffe0;
                text-align: center;
                padding: 40px 20px;
                border-radius: 12px;
                box-shadow: 0 0 30px rgba(0, 255, 80, 0.3);
                max-width: 600px;
                margin: auto;
            ">
                <img src="./public/images/banner.svg" alt="KurdForest Banner"
                style="width: 100%; max-width: 500px; border-radius: 8px; margin-bottom: 25px;">
                <h1 style="color: #00ff7f; margin-bottom: 10px;">Password Reset Request</h1>
                <p style="font-size: 16px; color: #b0ffb0;">
                    We received a request to reset your password for your KurdForest account.
                    Click the button below to create a new password.
                </p>
                <div style="margin: 30px 0;">
                    <a href="${resetLink}" 
                       style="
                           background: linear-gradient(45deg, #00ff7f, #00cc66);
                           color: #000;
                           padding: 15px 30px;
                           text-decoration: none;
                           border-radius: 8px;
                           font-weight: bold;
                           font-size: 16px;
                           display: inline-block;
                           box-shadow: 0 0 15px rgba(0, 255, 100, 0.5);
                       ">
                       Reset Your Password
                    </a>
                </div>
                <p style="font-size: 14px; color: #9fdc9f;">
                    This link will expire in <strong>5 minutes</strong>.
                </p>
                <p style="font-size: 14px; color: #90b490; margin-top: 15px;">
                    If you didn't request this reset, please ignore this email.
                </p>
                <hr style="border: none; height: 1px; background: #1f3d20; margin: 30px 0;">
                <p style="font-size: 13px; color: #6fa76f;">
                    🎥 KurdForest.xyz — Your movie forest
                </p>
            </div>
            `
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error('Error sending recovery email:', error);
                return res.status(500).render('forgotpass', { 
                    error: 'An error occurred while sending the recovery email.' 
                });
            }
            res.render('forgotpass', { 
                message: 'If an account with that email exists, a recovery link has been sent.' 
            });
        });

    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).render('forgotpass', { 
            error: 'An error occurred while processing your request.' 
        });
    }
});

// FIXED: Add this specific route for recover with token
router.get('/recover/:token', redirectIfLoggedIn, (req, res) => {
    const { token } = req.params;
    
    if (!token || !getResetToken(token)) {
        return res.render('recover', { 
            error: 'Invalid or expired recovery link. Please request a new password reset.',
            token: null
        });
    }

    const resetToken = getResetToken(token);
    if ((Date.now() - resetToken.timestamp) > 300000) {
        removeResetToken(token);
        return res.render('recover', { 
            error: 'Recovery link has expired. Please request a new password reset.',
            token: null
        });
    }

    res.render('recover', { token, error: null });
});

// POST /recover - Handle password recovery
router.post('/recover', redirectIfLoggedIn, async (req, res) => {
    const { token, password } = req.body;
    
    if (!token) {
        return res.redirect('/forgot-password');
    }

    const resetToken = getResetToken(token);
    if (!resetToken || (Date.now() - resetToken.timestamp) > 300000) {
        if (resetToken) removeResetToken(token);
        return res.render('recover', { 
            error: 'Recovery link has expired. Please request a new password reset.',
            token: null
        });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        
        await User.findByIdAndUpdate(resetToken.userId, { 
            password: hashedPassword 
        });

        removeResetToken(token);

        res.render('login', { 
            message: 'Password successfully reset. Please login with your new password.' 
        });

    } catch (error) {
        console.error('Password recovery error:', error);
        res.status(500).render('recover', { 
            error: 'An error occurred while resetting your password.',
            token 
        });
    }
});

// GET /logout - Handle user logout
router.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
        console.error("Logout error:", err);
        return res.redirect('/');
    }
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
});

module.exports = router;