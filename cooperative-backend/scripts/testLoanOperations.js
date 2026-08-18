// scripts/testLoanOperations.js
const LoanService = require('../services/loanService');
const LedgerService = require('../services/ledgerService');

async function testLoanLifecycle() {
  try {
    console.log('📝 Step 1: Submitting Tier 1 Loan Application (200,000 RWF for Member 4)...');
    const tier1App = await LoanService.applyTier1Loan({
      borrowerId: 4,
      principalAmount: 200000.00,
      termMonths: 3,
      guarantorIds: [5, 6]
    });
    const loanId1 = tier1App.loanId;
    console.log(`  -> ${tier1App.message} (Loan ID: ${loanId1})`);

    console.log('\n🏛️ Step 2: Committee Members Approving Loan...');
    await LoanService.approveLoan(loanId1, 'CHAIRPERSON');
    await LoanService.approveLoan(loanId1, 'TREASURER');
    const finalApprove = await LoanService.approveLoan(loanId1, 'AUDITOR');
    console.log(`  -> ${finalApprove.message} Status should now be APPROVED.`);

    console.log('\n💸 Step 3: Disbursing Loan Funds...');
    const disburseResult = await LoanService.disburseLoan(loanId1);
    console.log(`  -> ${disburseResult.message}`);

    console.log('\n📊 Step 4: Verifying Ledger Accounts Post-Disbursement:');
    const loanReceivable = await LedgerService.getAccountBalance('LOAN_RECEIVABLE');
    const cashBalance = await LedgerService.getAccountBalance('CASH');

    console.log(`- LOAN_RECEIVABLE Asset Balance: ${loanReceivable} RWF`);
    console.log(`- Remaining Net CASH Balance: ${cashBalance} RWF`);

  } catch (error) {
    console.error('❌ Loan test failed:', error.message);
  } finally {
    process.exit(0);
  }
}

testLoanLifecycle();
