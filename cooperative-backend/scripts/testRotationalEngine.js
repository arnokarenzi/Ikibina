// scripts/testRotationalEngine.js
const pool = require('../config/db');
const ContributionService = require('../services/contributionService');
const LedgerService = require('../services/ledgerService');

async function testEngine() {
  try {
    const today = '2026-08-10';

    console.log('🗓️ Step 1: Initializing 15-day Payout Schedule (Cycle 1)...');
    await ContributionService.initializePayoutSchedule(1, today);

    console.log('\n💵 Step 2: Simulating all 30 members contributing 5,100 RWF for today...');
    for (let memberId = 1; memberId <= 30; memberId++) {
      await ContributionService.recordMemberContribution(memberId, today, 5100.00);
    }
    console.log('  -> All 30 contributions recorded successfully.');

    console.log('\n⏰ Step 3: Executing 4:00 PM Cutoff and Payout Processing...');
    const result = await ContributionService.executeDaily4PMCutoff(today);
    console.log(`  -> ${result.message}`);

    console.log('\n📊 Step 4: Verifying Ledger Balances post-payout:');
    const cash = await LedgerService.getAccountBalance('CASH');
    const payoutPool = await LedgerService.getAccountBalance('PAYOUT_POOL');
    const reserve = await LedgerService.getAccountBalance('RESERVE_CAPITAL');

    console.log(`- Net CASH in hand: ${cash} RWF`);
    console.log(`- PAYOUT_POOL balance: ${payoutPool} RWF`);
    console.log(`- RESERVE_CAPITAL accumulated: ${reserve} RWF`);

  } catch (error) {
    console.error('❌ Engine test failed:', error.message);
  } finally {
    process.exit(0);
  }
}

testEngine();
