// jobs/cronJobs.js
const cron = require('node-cron');
const ContributionService = require('../services/contributionService');
const PenaltyAndRepaymentService = require('../services/penaltyAndRepaymentService');

function initializeCronJobs() {
  // 1. Daily 4:00 PM CAT Cutoff (Cron expression: 0 16 * * *)
  cron.schedule('0 16 * * *', async () => {
    const today = new Date().toISOString().split('T')[0];
    console.log(`⏰ [CRON] Triggering Daily 4:00 PM CAT Cutoff for ${today}...`);
    try {
      const result = await ContributionService.executeDaily4PMCutoff(today);
      console.log(`✅ [CRON] Daily Cutoff Completed: ${result.message}`);
    } catch (error) {
      console.error(`❌ [CRON] Daily Cutoff Error: ${error.message}`);
    }
  }, {
    timezone: "Africa/Kigali"
  });

  // 2. First Day of Every Month at Midnight: Process Monthly Interest & Penalties (0 0 1 * *)
  cron.schedule('0 0 1 * *', async () => {
    const currentMonthIndex = new Date().getMonth() + 1;
    console.log(`📅 [CRON] Triggering Monthly Interest & Penalty Processing for Month ${currentMonthIndex}...`);
    try {
      const result = await PenaltyAndRepaymentService.processMonthlyInterestAndPenalties(currentMonthIndex);
      console.log(`✅ [CRON] Monthly Interest Completed: ${result.message}`);
    } catch (error) {
      console.error(`❌ [CRON] Monthly Interest Error: ${error.message}`);
    }
  }, {
    timezone: "Africa/Kigali"
  });

  console.log('⏰ Automated Cron Jobs initialized for CAT (Africa/Kigali) timezone.');
}

module.exports = initializeCronJobs;
