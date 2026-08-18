// routes/initializationRoutes.js
const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const bcrypt = require("bcrypt");
const { requireRole } = require("../middleware/auth");

const COMMITTEE_ROLES = [
  "CHAIRPERSON",
  "TREASURER",
  "AUDITOR",
  "COMMITTEE",
  "ADMIN",
];

// 1. Request Project Initialization (Committee only)
router.post("/request", requireRole(COMMITTEE_ROLES), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Check if there's already a pending request
    const [existing] = await connection.query(
      "SELECT * FROM project_initialization_requests WHERE status = 'PENDING'",
    );
    if (existing.length > 0) {
      await connection.release();
      return res.status(400).json({
        error:
          "An initialization request is already pending committee approval.",
      });
    }

    // Create the request
    const [result] = await connection.query(
      "INSERT INTO project_initialization_requests (requested_by, status) VALUES (?, ?)",
      [req.user.id, "PENDING"],
    );
    const requestId = result.insertId;

    // Automatically record the requester's approval as the first approval
    await connection.query(
      "INSERT INTO initialization_approvals (request_id, member_id) VALUES (?, ?)",
      [requestId, req.user.id],
    );

    await connection.commit();
    connection.release();

    res.status(201).json({
      message:
        "Initialization request created successfully. Waiting for other committee members to approve.",
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
      "SELECT r.*, m.full_name as requester_name FROM project_initialization_requests r JOIN members m ON r.requested_by = m.id WHERE r.status = 'PENDING'",
    );

    if (requests.length === 0) {
      return res.json({ pendingRequest: null, approvals: [] });
    }

    const request = requests[0];
    const [approvals] = await pool.query(
      "SELECT a.*, m.full_name FROM initialization_approvals a JOIN members m ON a.member_id = m.id WHERE a.request_id = ?",
      [request.id],
    );

    res.json({ pendingRequest: request, approvals });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Approve Initialization Request (Requires password verification & 3 total committee approvals)
router.post("/:id/approve", requireRole(COMMITTEE_ROLES), async (req, res) => {
  const requestId = req.params.id;
  const memberId = req.user.id;

  // Safe extraction to prevent crashes if req.body is undefined
  const password = req.body?.password;

  if (!password) {
    return res
      .status(400)
      .json({ error: "Password is required for security verification." });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Verify committee member's password hash from database
    const [userRows] = await connection.query(
      "SELECT password_hash AS password FROM members WHERE id = ?",
      [memberId],
    );

    if (userRows.length === 0 || !userRows[0].password) {
      await connection.release();
      return res.status(404).json({
        error:
          "Member password hash not found. Please run 'node seed.js' to initialize member accounts.",
      });
    }

    const isPasswordValid = await bcrypt.compare(
      password,
      userRows[0].password,
    );
    if (!isPasswordValid) {
      await connection.release();
      return res
        .status(401)
        .json({ error: "Invalid password. Authorization denied." });
    }

    // Check if request is still pending
    const [reqRows] = await connection.query(
      "SELECT * FROM project_initialization_requests WHERE id = ? AND status = 'PENDING'",
      [requestId],
    );
    if (reqRows.length === 0) {
      await connection.release();
      return res
        .status(404)
        .json({ error: "Pending initialization request not found." });
    }

    // Insert approval (will throw duplicate entry error via UNIQUE KEY if already approved by this user)
    try {
      await connection.query(
        "INSERT INTO initialization_approvals (request_id, member_id) VALUES (?, ?)",
        [requestId, memberId],
      );
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY") {
        await connection.release();
        return res.status(400).json({
          error: "You have already approved this initialization request.",
        });
      }
      throw err;
    }

    // Count total approvals
    const [approvalCountRows] = await connection.query(
      "SELECT COUNT(*) as count FROM initialization_approvals WHERE request_id = ?",
      [requestId],
    );
    const totalApprovals = approvalCountRows[0].count;

    // If 3 approvals are reached, execute the reset transaction!
    if (totalApprovals >= 3) {
      // Temporarily disable foreign key checks to safely clear all financial tables
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

      // Automatically populate rotation queue with active members in randomized order for Cycle 1
      const [activeMembers] = await connection.query(
        "SELECT id FROM members WHERE status = 'ACTIVE' ORDER BY RAND()",
      );

      for (let i = 0; i < activeMembers.length; i++) {
        await connection.query(
          `INSERT INTO rotation_queue (cycle_id, member_id, turn_position, bid_amount, status) 
           VALUES (1, ?, ?, 0.00, 'PENDING')`,
          [activeMembers[i].id, i + 1],
        );
      }

      // Mark request as executed
      await connection.query(
        "UPDATE project_initialization_requests SET status = 'EXECUTED' WHERE id = ?",
        [requestId],
      );

      await connection.commit();
      connection.release();
      return res.json({
        message:
          "Project successfully initialized! Balances reset and rotation queue populated randomly.",
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

module.exports = router;
