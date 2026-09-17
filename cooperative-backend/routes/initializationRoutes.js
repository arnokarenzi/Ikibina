// routes/initializationRoutes.js
const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const bcrypt = require("bcryptjs");
const { requireRole } = require("../middleware/auth");

const COMMITTEE_ROLES = [
  "CHAIRPERSON",
  "TREASURER",
  "AUDITOR",
  "COMMITTEE",
  "ADMIN",
];

// Helper function to format local CAT (Kigali UTC+2) date (prevents Render UTC cloud shifts)
const getLocalDateString = (dateObj = new Date()) => {
  return new Date(dateObj).toLocaleDateString("sv-SE", {
    timeZone: "Africa/Kigali",
  });
};

// 1. Request Project Initialization (Committee only)
router.post("/request", requireRole(COMMITTEE_ROLES), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [existing] = await connection.query(
      "SELECT * FROM project_initialization_requests WHERE status = 'PENDING'"
    );
    if (existing.length > 0) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        error: "An initialization request is already pending committee approval.",
      });
    }

    const [result] = await connection.query(
      "INSERT INTO project_initialization_requests (requested_by, status) VALUES (?, ?)",
      [req.user.id, "PENDING"]
    );
    const requestId = result.insertId;

    await connection.query(
      "INSERT INTO initialization_approvals (request_id, member_id) VALUES (?, ?)",
      [requestId, req.user.id]
    );

    await connection.commit();
    connection.release();

    res.status(201).json({
      message: "Initialization request created. Awaiting remaining committee approvals.",
      requestId,
    });
  } catch (error) {
    await connection.rollback();
    connection.release();
    res.status(500).json({ error: error.message });
  }
});

// 2. Get Pending Initialization Status & Approvals
router.get("/status", requireRole(COMMITTEE_ROLES), async (req, res) => {
  try {
    const [requests] = await pool.query(
      `SELECT r.*, m.full_name AS requester_name 
       FROM project_initialization_requests r 
       JOIN members m ON r.requested_by = m.id 
       WHERE r.status = 'PENDING' 
       ORDER BY r.created_at DESC`
    );

    if (requests.length === 0) {
      return res.json({ pendingRequest: null, approvals: [] });
    }

    const request = requests[0];
    const [approvals] = await pool.query(
      `SELECT a.*, m.full_name 
       FROM initialization_approvals a 
       JOIN members m ON a.member_id = m.id 
       WHERE a.request_id = ?`,
      [request.id]
    );

    res.json({ pendingRequest: request, approvals });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Approve Initialization Request & Execute Clean Reset
router.post("/:id/approve", requireRole(COMMITTEE_ROLES), async (req, res) => {
  const requestId = req.params.id;
  const memberId = req.user.id;
  const password = req.body?.password;

  if (!password) {
    return res.status(400).json({ error: "Password is required for security verification." });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [userRows] = await connection.query(
      "SELECT password_hash AS password FROM members WHERE id = ?",
      [memberId]
    );

    if (userRows.length === 0 || !userRows[0].password) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ error: "Member password hash not found." });
    }

    const isPasswordValid = await bcrypt.compare(password, userRows[0].password);
    if (!isPasswordValid) {
      await connection.rollback();
      connection.release();
      return res.status(401).json({ error: "Invalid password. Authorization denied." });
    }

    const [reqRows] = await connection.query(
      "SELECT * FROM project_initialization_requests WHERE id = ? AND status = 'PENDING'",
      [requestId]
    );
    if (reqRows.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ error: "Pending initialization request not found." });
    }

    try {
      await connection.query(
        "INSERT INTO initialization_approvals (request_id, member_id) VALUES (?, ?)",
        [requestId, memberId]
      );
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY") {
        await connection.rollback();
        connection.release();
        return res.status(400).json({ error: "You have already approved this request." });
      }
      throw err;
    }

    const [approvalCountRows] = await connection.query(
      "SELECT COUNT(*) as count FROM initialization_approvals WHERE request_id = ?",
      [requestId]
    );
    const totalApprovals = approvalCountRows[0].count;

    // Hard reset triggers inside a single atomic transaction on 3rd approval
    if (totalApprovals >= 3) {
      await connection.query("SET FOREIGN_KEY_CHECKS = 0");

      await connection.query("DELETE FROM daily_contributions");
      await connection.query("DELETE FROM loan_repayments");
      await connection.query("DELETE FROM loan_guarantors");
      await connection.query("DELETE FROM loan_collateral");
      await connection.query("DELETE FROM loans");
      await connection.query("DELETE FROM ledger_entries");
      await connection.query("DELETE FROM payout_cycles");
      await connection.query("DELETE FROM rotation_queue");

      await connection.query("SET FOREIGN_KEY_CHECKS = 1");

      const [activeMembers] = await connection.query(
        "SELECT id FROM members WHERE status = 'ACTIVE' ORDER BY RAND()"
      );

      // Seed rotation_queue for Cycle 1
      for (let i = 0; i < activeMembers.length; i++) {
        const turnStatus = i < 2 ? "CURRENT_TURN" : "PENDING";
        await connection.query(
          `INSERT INTO rotation_queue (cycle_id, member_id, turn_position, bid_amount, status) 
           VALUES (1, ?, ?, 0.00, ?)`,
          [activeMembers[i].id, i + 1, turnStatus]
        );
      }

      // Seed payout_cycles using local CAT calendar dates
      if (activeMembers.length > 0) {
        const startDate = new Date();
        const scheduleEntries = [];

        for (let i = 0; i < activeMembers.length; i++) {
          const dayOffset = Math.floor(i / 2);
          const payoutDate = new Date(startDate);
          payoutDate.setDate(payoutDate.getDate() + dayOffset);
          const dateStr = getLocalDateString(payoutDate);

          scheduleEntries.push([1, dateStr, activeMembers[i].id, 75000.00, "SCHEDULED"]);
        }

        await connection.query(
          `INSERT INTO payout_cycles (cycle_number, payout_date, recipient_member_id, amount, status) VALUES ?`,
          [scheduleEntries]
        );
      }

      await connection.query(
        "UPDATE project_initialization_requests SET status = 'EXECUTED' WHERE id = ?",
        [requestId]
      );

      await connection.commit();
      connection.release();
      return res.json({
        message: "Project successfully initialized! Ledger, daily contributions, and cutoff status completely reset.",
        executed: true,
      });
    }

    await connection.commit();
    connection.release();
    res.json({
      message: `Approval recorded successfully. Total approvals: ${totalApprovals}/3.`,
      executed: false,
      totalApprovals,
    });
  } catch (error) {
    await connection.rollback();
    connection.release();
    res.status(500).json({ error: error.message });
  }
});

// 4. Cancel/Void Pending Initialization Request
router.post("/:id/cancel", requireRole(COMMITTEE_ROLES), async (req, res) => {
  const requestId = req.params.id;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      "SELECT * FROM project_initialization_requests WHERE id = ? AND status = 'PENDING'",
      [requestId]
    );

    if (rows.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ error: "No pending initialization request found to cancel." });
    }

    await connection.query("DELETE FROM initialization_approvals WHERE request_id = ?", [requestId]);
    await connection.query("UPDATE project_initialization_requests SET status = 'CANCELLED' WHERE id = ?", [requestId]);

    await connection.commit();
    connection.release();

    res.json({ message: "Pending initialization request successfully cancelled." });
  } catch (error) {
    await connection.rollback();
    connection.release();
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
