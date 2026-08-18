// routes/ledgerRoutes.js
const express = require('express');
const router = express.Router();
const LedgerService = require('../services/ledgerService');
const pool = require('../config/db');
const { requireRole } = require('../middleware/auth');

// Get Real-time Account Balances
router.get('/balances', requireRole(['MEMBER', 'CHAIRPERSON', 'TREASURER', 'AUDITOR']), async (req, res) => {
  try {
    const cash = await LedgerService.getAccountBalance('CASH');
    const payoutPool = await LedgerService.getAccountBalance('PAYOUT_POOL');
    const reserveCapital = await LedgerService.getAccountBalance('RESERVE_CAPITAL');
    const loanReceivable = await LedgerService.getAccountBalance('LOAN_RECEIVABLE');
    const interestIncome = await LedgerService.getAccountBalance('INTEREST_INCOME');

    res.status(200).json({
      CASH: cash,
      PAYOUT_POOL: payoutPool,
      RESERVE_CAPITAL: reserveCapital,
      LOAN_RECEIVABLE: loanReceivable,
      INTEREST_INCOME: interestIncome
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Audit Trail Entries
router.get('/entries', requireRole(['AUDITOR', 'TREASURER', 'CHAIRPERSON']), async (req, res) => {
  try {
    const [entries] = await pool.query('SELECT * FROM ledger_entries ORDER BY created_at DESC LIMIT 50');
    res.status(200).json(entries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
