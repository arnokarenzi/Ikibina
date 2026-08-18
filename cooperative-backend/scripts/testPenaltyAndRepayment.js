// scripts/testPenaltyAndRepayment.js
const PenaltyAndRepaymentService = require('../services/penaltyAndRepaymentService');
const LedgerService = require('../services/ledgerService');

async function testPenaltyAndRepaymentWorkflow() {
  try {
    const loanId = 1; // The Tier 1 loan disbursed in Step 6 (200,000 RWF)

    console.log('💵 Step 1: Processing partial repayment of 50,000 RWF for Loan 1...');
    const repayRes = await PenaltyAndRepaymentService.processLoanRepayment(loanId, 50000.00);
    console.log(`  -> ${repayRes.message}`);

    console.log('\n📅 Step 2: Simulating transition into Month 4 (Penalty Zone - 10% rate)...');
    const month4Res = await PenaltyAndRepaymentService.processMonthlyInterestAndPenalties(4);
    console.log(`  -> ${month4Res.message}`);

    console.log('\n🚨 Step 3: Simulating 30-day default into Month 4 and enforcing Guarantor Deduction...');
    const defaultRes = await PenaltyAndRepaymentService.enforceTier1Default(loanId);
    console.log(`  -> ${defaultRes.message}`);

    console.log('\n📊 Step 4: Verifying Final Ledger Status:');
    const loanReceivable = await LedgerService.getAccountBalance('LOAN_RECEIVABLE');
    console.log(`- Remaining LOAN_RECEIVABLE Balance: ${loanReceivable} RWF (Should be 0 after default recovery)`);

  } catch (error) {
    console.error('❌ Penalty/Repayment test failed:', error.message);
  } finally {
    process.exit(0);
  }
}

testPenaltyAndRepaymentWorkflow();
