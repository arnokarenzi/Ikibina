// config/db.js
const mysql = require("mysql2/promise");
require("dotenv").config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  // socketPath removed for remote Aiven cloud connection
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: {
    rejectUnauthorized: false, // Required for Aiven secure SSL/TLS connections
  },
});

async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log("✅ Connected to Aiven MySQL/MariaDB successfully!");
    connection.release();
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
  }
}

testConnection();

module.exports = pool;
