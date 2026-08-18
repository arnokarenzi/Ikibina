// scripts/seedMembers.js
const pool = require('../config/db');
const bcrypt = require('bcryptjs');

async function seedMembers() {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Check if members already exist
    const [existingMembers] = await connection.query('SELECT COUNT(*) as count FROM members');
    if (existingMembers[0].count > 0) {
      console.log('⚠️ Members table is not empty. Seeding skipped.');
      connection.release();
      process.exit(0);
    }

    const defaultPasswordHash = await bcrypt.hash('Member@1234', 10);
    const membersData = [];

    // Generate 30 members matching Article 1 rules (Member numbers 1 to 30)
    for (let i = 1; i <= 30; i++) {
      let role = 'MEMBER';
      let name = `Cooperative Member ${i}`;

      // Assign specific governance roles to the Loan Committee (Article 10)
      if (i === 1) {
        role = 'CHAIRPERSON';
        name = 'Chairperson Arnold';
      } else if (i === 2) {
        role = 'TREASURER';
        name = 'Treasurer Member';
      } else if (i === 3) {
        role = 'AUDITOR';
        name = 'Auditor Member';
      }

      const phoneNumber = `+2507800000${i.toString().padStart(2, '0')}`;
      const email = `member${i}@ikibina.rw`;

      membersData.push([i, name, phoneNumber, email, defaultPasswordHash, role, 'ACTIVE']);
    }

    const query = `
      INSERT INTO members (member_number, full_name, phone_number, email, password_hash, role, status)
      VALUES ?
    `;

    await connection.query(query, [membersData]);
    await connection.commit();

    console.log('✅ Successfully seeded all 30 members into the database!');
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('❌ Error seeding members:', error.message);
  } finally {
    if (connection) connection.release();
    process.exit(0);
  }
}

seedMembers();
