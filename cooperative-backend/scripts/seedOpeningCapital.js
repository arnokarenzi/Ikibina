// scripts/seedOpeningCapital.js
const pool = require('../config/db');
const LedgerService = require('../services/ledgerService');

async function seedOpeningCapital() {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const initialCapitalAmount = 15000000.00; // 15,000,000 RWF Opening Institutional Capital

    await LedgerService.recordEntry(connection, {
      debitAccount: 'CASH',
      creditAccount: 'RESERVE_CAPITAL',
      amount: initialCapitalAmount,
      transactionType: 'OPENING_BALANCE',
      description: 'Opening institutional treasury capital deposit'
    });

    await connection.commit();
    console.log(`✅ Opening capital of ${initialCapitalAmount.toLocaleString()} RWF deposited successfully.`);
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('❌ Error seeding capital:', error.message);
  } finally {
    if (connection) connection.release();
    process.exit(0);
  }
}

seedOpeningCapital();
