// controllers/cronController.js
const ContributionService = require('../services/contributionService');
const PenaltyAndRepaymentService = require('../services/penaltyAndRepaymentService');

exports.handleCronJob = async (req, res) => {
  const { action, key } = req.query;

  // 1. Security Check: Require a secret key so strangers cannot trigger your cron routines
  const CRON_SECRET = process.env.CRON_SECRET || "your_secret_key_here";
  if (key !== CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized cron request." });
  }

  try {
    // 2. Daily 4:00 PM Cutoff Routine
    if (action === "daily-cutoff") {
      const today = new Date().toISOString().split('T')[0];
      const result = await ContributionService.executeDaily4PMCutoff(today);
      return res.status(200).json(result);
    }

    // 3. Monthly Penalty & Interest Routine
    if (action === "monthly-interest") {
      const currentMonthIndex = new Date().getMonth() + 1; // 1 - 12
      const result = await PenaltyAndRepaymentService.processMonthlyInterestAndPenalties(currentMonthIndex);
      return res.status(200).json(result);
    }

    return res.status(400).json({ error: "Invalid cron action parameter." });
  } catch (error) {
    console.error("Cron execution failed:", error);
    return res.status(500).json({ error: error.message });
  }
};
