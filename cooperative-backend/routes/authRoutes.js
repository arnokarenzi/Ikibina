// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const [rows] = await pool.query('SELECT * FROM members WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const member = rows[0];

    const isPasswordValid = await bcrypt.compare(password, member.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (member.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'Account is inactive. Contact cooperative administration.' });
    }

    const tokenPayload = {
      id: member.id,
      member_number: member.member_number,
      role: member.role,
      full_name: member.full_name
    };

    // Short-lived Access Token (15 minutes)
    const accessToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m'
    });

    // Long-lived Refresh Token (7 days)
    const refreshToken = jwt.sign(
      tokenPayload, 
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET + '_refresh', 
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
    );

    // Set Refresh Token in an HttpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.status(200).json({
      message: 'Login successful',
      token: accessToken,
      user: {
        id: member.id,
        member_number: member.member_number,
        full_name: member.full_name,
        email: member.email,
        role: member.role
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const cookies = req.cookies;
    if (!cookies?.refreshToken) {
      return res.status(401).json({ error: 'Refresh token not found.' });
    }

    const refreshToken = cookies.refreshToken;

    jwt.verify(
      refreshToken, 
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET + '_refresh', 
      (err, decoded) => {
        if (err) {
          return res.status(403).json({ error: 'Invalid or expired refresh token.' });
        }

        const tokenPayload = {
          id: decoded.id,
          member_number: decoded.member_number,
          role: decoded.role,
          full_name: decoded.full_name
        };

        const newAccessToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
          expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m'
        });

        res.json({ token: newAccessToken });
      }
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production'
  });
  res.status(200).json({ message: 'Logged out successfully.' });
});

module.exports = router;
