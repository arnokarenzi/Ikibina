// scripts/initProduction.js
const pool = require('../config/db');
const bcrypt = require('bcryptjs');

async function initializeProductionDatabase() {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    console.log('⚠️ Wiping test transactional data and test accounts...');

    // 1. Clear test tables in foreign-key safe order
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    await connection.query('TRUNCATE TABLE ledger_entries');
    await connection.query('TRUNCATE TABLE daily_contributions');
    await connection.query('TRUNCATE TABLE payout_cycles');
    await connection.query('TRUNCATE TABLE loan_guarantors');
    await connection.query('TRUNCATE TABLE loan_collateral');
    await connection.query('TRUNCATE TABLE loans');
    await connection.query('TRUNCATE TABLE members');
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');

    // 2. Create Default System Admin (Chairperson Account)
    const adminPasswordHash = await bcrypt.hash('Admin@Cooperative2026', 10);
    
    await connection.query(
      `INSERT INTO members (member_number, full_name, phone_number, email, password_hash, role, status)
       VALUES (1, 'System Administrator', '+250780000000', 'admin@cooperative.rw', ?, 'CHAIRPERSON', 'ACTIVE')`,
      [adminPasswordHash]
    );

    await connection.commit();

    console.log('\n✅ Production Initialization Complete!');
    console.log('--------------------------------------------------');
    console.log('Financial Ledgers Balance : 0.00 RWF');
    console.log('Initial Admin Account     : admin@cooperative.rw');
    console.log('Initial Admin Password    : Admin@Cooperative2026');
    console.log('--------------------------------------------------');
    console.log('Notice: Share these credentials securely with the cooperative owners and prompt them to change the password upon first login.');

  } catch (error) {
    if (connection) await connection.rollback();
    console.error('❌ Production initialization failed:', error.message);
  } finally {
    if (connection) connection.release();
    process.exit(0);
  }
}

initializeProductionDatabase();
