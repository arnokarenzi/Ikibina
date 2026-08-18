// seedMembers.js
const bcrypt = require('bcryptjs');
const db = require('./config/db');

async function seedMembers() {
  try {
    const defaultPassword = 'password123';
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(defaultPassword, saltRounds);

    const testMembers = [
      [1, 'Alice Mutoni', '0788000001', 'chair@coop.rw', 'CHAIRPERSON'],
      [2, 'Bob Kagabo', '0788000002', 'treasurer@coop.rw', 'TREASURER'],
      [3, 'Chantal Uwase', '0788000003', 'auditor@coop.rw', 'AUDITOR'],
      [4, 'David Nkurunziza', '0788000004', 'david@coop.rw', 'MEMBER'],
      [5, 'Eric Habimana', '0788000005', 'eric@coop.rw', 'MEMBER'],
      [6, 'Fiona Uwimana', '0788000006', 'fiona@coop.rw', 'MEMBER'],
      [7, 'Gabin Mugisha', '0788000007', 'gabin@coop.rw', 'MEMBER'],
      [8, 'Hilda Umutesi', '0788000008', 'hilda@coop.rw', 'MEMBER'],
      [9, 'Jean Claude Ndayisenga', '0788000009', 'jean@coop.rw', 'MEMBER'],
      [10, 'Kellen Uwera', '0788000010', 'kellen@coop.rw', 'MEMBER'],
      [11, 'Léonard Gasana', '0788000011', 'leonard@coop.rw', 'MEMBER'],
      [12, 'Marie Claire Mukamana', '0788000012', 'marie@coop.rw', 'MEMBER'],
      [13, 'Norbert Ndayizeye', '0788000013', 'norbert@coop.rw', 'MEMBER'],
      [14, 'Olive Uwamahoro', '0788000014', 'olive@coop.rw', 'MEMBER'],
      [15, 'Patrick Bizimana', '0788000015', 'patrick@coop.rw', 'MEMBER'],
      [16, 'Queen Ingabire', '0788000016', 'queen@coop.rw', 'MEMBER'],
      [17, 'Robert Nshimiyimana', '0788000017', 'robert@coop.rw', 'MEMBER'],
      [18, 'Sandrine Umuhoza', '0788000018', 'sandrine@coop.rw', 'MEMBER'],
      [19, 'Thierry Karasanyi', '0788000019', 'thierry@coop.rw', 'MEMBER'],
      [20, 'Umutoniwase Diane', '0788000020', 'diane@coop.rw', 'MEMBER'],
      [21, 'Vincent Ruzindana', '0788000021', 'vincent@coop.rw', 'MEMBER'],
      [22, 'Winnie Uwase', '0788000022', 'winnie@coop.rw', 'MEMBER'],
      [23, 'Xavier Ndayisaba', '0788000023', 'xavier@coop.rw', 'MEMBER'],
      [24, 'Yvette Mukandayisenga', '0788000024', 'yvette@coop.rw', 'MEMBER'],
      [25, 'Zacharie Niyonzima', '0788000025', 'zacharie@coop.rw', 'MEMBER'],
      [26, 'Aline Uwamariya', '0788000026', 'aline@coop.rw', 'MEMBER'],
      [27, 'Bruno Rugamba', '0788000027', 'bruno@coop.rw', 'MEMBER'],
      [28, 'Clarisse Mutesi', '0788000028', 'clarisse@coop.rw', 'MEMBER'],
      [29, 'Denis Nzigiyimana', '0788000029', 'denis@coop.rw', 'MEMBER'],
      [30, 'Esther Uwimbabazi', '0788000030', 'esther@coop.rw', 'MEMBER']
    ];

    for (const m of testMembers) {
      const [id, fullName, phone, email, role] = m;
      const memberNumber = id;
      
      await db.query(
        `INSERT INTO members (id, member_number, full_name, phone_number, email, password_hash, role, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
         ON DUPLICATE KEY UPDATE 
           member_number = VALUES(member_number),
           full_name = VALUES(full_name),
           phone_number = VALUES(phone_number),
           email = VALUES(email),
           password_hash = VALUES(password_hash),
           role = VALUES(role),
           status = 'ACTIVE'`,
        [id, memberNumber, fullName, phone, email, passwordHash, role]
      );
    }

    console.log('Successfully seeded 30 test member accounts (IDs 1-30)![cite: 10, 11]');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding test accounts:', error);
    process.exit(1);
  }
}

seedMembers();
