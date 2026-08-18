// server.js
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

// Initialize DB connection
require('./config/db');

// Import Cron Engine
const initializeCronJobs = require('./jobs/cronJobs');

const app = express();

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Import Routes
const authRoutes = require('./routes/authRoutes');
const memberRoutes = require('./routes/memberRoutes');
const contributionRoutes = require('./routes/contributionRoutes');
const loanRoutes = require('./routes/loanRoutes');
const ledgerRoutes = require('./routes/ledgerRoutes');
const initializationRoutes = require('./routes/initializationRoutes');

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/contributions', contributionRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/ledger', ledgerRoutes);
app.use('/api/initialization', initializationRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'Cooperative Management API is running.' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Cooperative Management API running on port ${PORT}`);
  initializeCronJobs();
});
