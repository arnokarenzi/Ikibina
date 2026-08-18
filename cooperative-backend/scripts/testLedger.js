// scripts/testLedger.js
const pool = require('../config/db');
const LedgerService = require('../services/ledgerService');

async function testLedgerEntry() {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    console.log('🧪 Simulating Day 1 Member 1 Contribution (5,100 RWF)...');

    // 1. Record 5,000 RWF into Payout Pool
    await LedgerService.recordEntry(connection, {
      debitAccount: 'CASH',
      creditAccount: 'PAYOUT_POOL',
      amount: 5000.00,
      transactionType: 'DAILY_CONTRIBUTION',
      referenceId: 1,
      description: 'Day 1 Contribution - Member ID 1 (Payout Allocation)'
    });

    // 2. Record 100 RWF into Reserve Capital
    await LedgerService.recordEntry(connection, {
      debitAccount: 'CASH',
      creditAccount: 'RESERVE_CAPITAL',
      amount: 100.00,
      transactionType: 'DAILY_CONTRIBUTION',
      referenceId: 1,
      description: 'Day 1 Contribution - Member ID 1 (Reserve Retention)'
    });

    await connection.commit();
    console.log('✅ Ledger test entries committed successfully.');

    // Verify Balances
    const cashBalance = await LedgerService.getAccountBalance('CASH');
    const payoutPoolBalance = await LedgerService.getAccountBalance('PAYOUT_POOL');
    const reserveBalance = await LedgerService.getAccountBalance('RESERVE_CAPITAL');

    console.log(`\n📊 Account Balances:`);
    console.log(`- CASH: ${cashBalance} RWF`);
    console.log(`- PAYOUT_POOL: ${payoutPoolBalance} RWF`);
    console.log(`- RESERVE_CAPITAL: ${reserveBalance} RWF`);

  } catch (error) {
    if (connection) await connection.rollback();
    console.error('❌ Ledger test failed:', error.message);
  } finally {
    if (connection) connection.release();
    process.exit(0);
  }
}

testLedgerEntry();
