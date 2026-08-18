// routes/contributionRoutes.js
const express = require('express');
const router = express.Router();
const ContributionService = require('../services/contributionService');
const { requireRole } = require('../middleware/auth');

// Record daily contribution (5,100 RWF)
router.post('/pay', requireRole(['MEMBER', 'CHAIRPERSON', 'TREASURER', 'AUDITOR']), async (req, res) => {
  try {
    const { memberId, contributionDate, amount } = req.body;
    const date = contributionDate || new Date().toISOString().split('T')[0];
    const result = await ContributionService.recordMemberContribution(memberId || req.user.id, date, amount || 5100.00);
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Initialize 15-day rotational payout schedule
router.post('/schedule', requireRole(['CHAIRPERSON', 'TREASURER']), async (req, res) => {
  try {
    const { cycleNumber, startDate } = req.body;
    const result = await ContributionService.initializePayoutSchedule(cycleNumber || 1, startDate || new Date().toISOString().split('T')[0]);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Trigger 4:00 PM Cutoff & Rotational Payout Processing
router.post('/cutoff', requireRole(['CHAIRPERSON', 'TREASURER', 'AUDITOR']), async (req, res) => {
  try {
    const { targetDate } = req.body;
    const date = targetDate || new Date().toISOString().split('T')[0];
    const result = await ContributionService.executeDaily4PMCutoff(date);
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
