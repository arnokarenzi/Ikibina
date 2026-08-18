// routes/memberRoutes.js
const express = require("express");
const router = express.Router();
const db = require("../config/db");
const bcrypt = require("bcryptjs");

const COMMITTEE_ROLES = [
  "CHAIRPERSON",
  "TREASURER",
  "AUDITOR",
  "COMMITTEE",
  "ADMIN",
];

// PUT /api/members/:id/profile - Update member details and password
router.put("/:id/profile", async (req, res) => {
  const memberId = req.params.id;
  const {
    full_name,
    phone_number,
    email,
    current_password,
    new_password,
    role: bodyRole,
  } = req.body;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Fetch current member record
    const [rows] = await connection.query(
      "SELECT * FROM members WHERE id = ?",
      [memberId],
    );

    if (rows.length === 0) {
      await connection.release();
      return res.status(404).json({ error: "Member not found." });
    }

    const member = rows[0];
    let newPasswordHash = member.password_hash;

    // Determine if the updater is a committee member
    const requesterRole = String(
      req.user?.role || bodyRole || member.role || "",
    ).toUpperCase();
    const isCommitteeMember = COMMITTEE_ROLES.some((r) =>
      requesterRole.includes(r),
    );

    // Enforce name and email lock for standard members
    let finalFullName = member.full_name;
    let finalEmail = member.email;

    if (isCommitteeMember) {
      finalFullName = full_name !== undefined ? full_name : member.full_name;
      finalEmail = email !== undefined ? email : member.email;
    } else {
      if (
        (full_name && full_name !== member.full_name) ||
        (email && email !== member.email)
      ) {
        await connection.release();
        return res.status(403).json({
          error:
            "Standard members cannot update their name or email. Please contact a committee member.",
        });
      }
    }

    // 2. If changing password, verify current password first
    if (new_password) {
      if (!current_password) {
        await connection.release();
        return res.status(400).json({
          error: "Current password is required to set a new password.",
        });
      }

      const isPasswordValid = await bcrypt.compare(
        current_password,
        member.password_hash,
      );
      if (!isPasswordValid) {
        await connection.release();
        return res
          .status(401)
          .json({ error: "Current password is incorrect." });
      }

      const saltRounds = 10;
      newPasswordHash = await bcrypt.hash(new_password, saltRounds);
    }

    // 3. Update member details in the database
    await connection.query(
      `UPDATE members 
       SET full_name = ?, phone_number = ?, email = ?, password_hash = ? 
       WHERE id = ?`,
      [
        finalFullName,
        phone_number || member.phone_number,
        finalEmail,
        newPasswordHash,
        memberId,
      ],
    );

    await connection.commit();
    await connection.release();

    res.json({ message: "Profile updated successfully!" });
  } catch (err) {
    await connection.rollback();
    await connection.release();
    console.error("Profile update error:", err);
    res.status(500).json({ error: "Failed to update profile." });
  }
});

// PUT /api/members/:id - Committee member updates any member details
router.put("/:id", async (req, res) => {
  const memberId = req.params.id;
  const { full_name, phone_number, email, role, status } = req.body;

  try {
    await db.query(
      `UPDATE members 
       SET full_name = COALESCE(?, full_name), 
           phone_number = COALESCE(?, phone_number), 
           email = COALESCE(?, email), 
           role = COALESCE(?, role), 
           status = COALESCE(?, status) 
       WHERE id = ?`,
      [full_name, phone_number, email, role, status, memberId],
    );
    res.json({ message: "Member updated successfully!" });
  } catch (error) {
    console.error("Error updating member:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/members/guarantors - Fetch active members excluding current user
router.get("/guarantors", async (req, res) => {
  try {
    const currentUserId = req.user?.id || req.query.userId;

    if (!currentUserId) {
      return res
        .status(400)
        .json({ error: "User ID is required to filter guarantors." });
    }

    const [members] = await db.query(
      `SELECT id, full_name, member_number, phone_number 
       FROM members 
       WHERE id != ? AND status = 'ACTIVE' 
       ORDER BY full_name ASC`,
      [currentUserId],
    );

    res.json(members);
  } catch (error) {
    console.error("Error fetching guarantors:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/members/rotation-queue - Fetch rotation queue for the latest or specified cycle
router.get("/rotation-queue", async (req, res) => {
  try {
    const requestedCycle = req.query.cycleId;

    let query = `
      SELECT rq.*, m.full_name, m.member_number, m.phone_number, m.email
      FROM rotation_queue rq
      JOIN members m ON rq.member_id = m.id
    `;
    let queryParams = [];

    if (requestedCycle) {
      query += ` WHERE rq.cycle_id = ?`;
      queryParams.push(requestedCycle);
    } else {
      query += ` WHERE rq.cycle_id = (SELECT MAX(cycle_id) FROM rotation_queue)`;
    }

    query += ` ORDER BY rq.turn_position ASC`;

    const [queue] = await db.query(query, queryParams);
    res.json(queue);
  } catch (error) {
    console.error("Error fetching rotation queue:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/members/rotation/override - Committee member manually updates a turn position with smart swapping
router.post("/rotation/override", async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { queueId, newPosition, role } = req.body;
    const userRole = String(role || req.user?.role || "").toUpperCase();

    if (!COMMITTEE_ROLES.some((r) => userRole.includes(r))) {
      await connection.release();
      return res.status(403).json({
        error:
          "Unauthorized: Only Committee members can override turn positions.",
      });
    }

    if (!queueId || !newPosition || newPosition < 1) {
      await connection.release();
      return res
        .status(400)
        .json({ error: "Valid queue ID and turn position are required." });
    }

    const [targetItem] = await connection.query(
      `SELECT * FROM rotation_queue WHERE id = ?`,
      [queueId],
    );

    if (targetItem.length === 0) {
      await connection.release();
      return res.status(404).json({ error: "Rotation queue item not found." });
    }

    const oldPosition = targetItem[0].turn_position;
    const cycleId = targetItem[0].cycle_id;

    const [occupant] = await connection.query(
      `SELECT * FROM rotation_queue WHERE cycle_id = ? AND turn_position = ? AND id != ?`,
      [cycleId, newPosition, queueId],
    );

    if (occupant.length > 0) {
      await connection.query(
        `UPDATE rotation_queue SET turn_position = ?, is_manual_override = TRUE WHERE id = ?`,
        [oldPosition, occupant[0].id],
      );
    }

    await connection.query(
      `UPDATE rotation_queue SET turn_position = ?, is_manual_override = TRUE WHERE id = ?`,
      [newPosition, queueId],
    );

    await connection.commit();
    connection.release();

    res.json({
      success: true,
      message: "Turn position successfully updated and swapped.",
    });
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error("Error updating rotation turn:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/members/:id/summary - Fetch member financial summary for dashboard
router.get("/:id/summary", async (req, res) => {
  try {
    const memberId = req.params.id;

    const [loans] = await db.query(
      `SELECT SUM(remaining_principal + accrued_penalty_balance + accrued_admin_fee) AS active_debt,
              MIN(due_date) AS next_payment_date,
              SUM(principal_amount / term_months) AS next_payment_amount
       FROM loans 
       WHERE borrower_id = ? AND status IN ('ACTIVE', 'PENALTY_ZONE')`,
      [memberId],
    );

    let totalSavings = 0;
    try {
      const [contributions] = await db.query(
        `SELECT SUM(amount) AS total FROM contributions WHERE member_id = ?`,
        [memberId],
      );
      if (contributions && contributions[0] && contributions[0].total) {
        totalSavings = contributions[0].total;
      }
    } catch (e) {
      totalSavings = 0;
    }

    res.status(200).json({
      active_debt: loans[0]?.active_debt || 0,
      total_savings: totalSavings,
      next_payment_amount: loans[0]?.next_payment_amount || 0,
      next_payment_date: loans[0]?.next_payment_date || null,
    });
  } catch (error) {
    console.error("Error fetching member summary:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/members/rotation/advance-cycle - Complete current cycle and start next cycle
router.post("/rotation/advance-cycle", async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const userRole = String(
      req.body.role || req.user?.role || "",
    ).toUpperCase();
    if (!COMMITTEE_ROLES.some((r) => userRole.includes(r))) {
      await connection.release();
      return res.status(403).json({
        error: "Unauthorized: Only Committee members can advance cycles.",
      });
    }

    const [maxCycle] = await connection.query(
      `SELECT MAX(cycle_id) as current_cycle FROM rotation_queue`,
    );
    const currentCycle = maxCycle[0]?.current_cycle || 1;

    const [pendingItems] = await connection.query(
      `SELECT COUNT(*) as count FROM rotation_queue WHERE cycle_id = ? AND status != 'PAID_OUT'`,
      [currentCycle],
    );

    if (pendingItems[0].count > 0) {
      await connection.release();
      return res.status(400).json({
        error: `Cannot advance cycle. There are still ${pendingItems[0].count} members who have not been marked PAID_OUT in Cycle ${currentCycle}.`,
      });
    }

    const nextCycle = currentCycle + 1;
    const [activeMembers] = await connection.query(
      "SELECT id FROM members WHERE status = 'ACTIVE' ORDER BY RAND()",
    );

    for (let i = 0; i < activeMembers.length; i++) {
      await connection.query(
        `INSERT INTO rotation_queue (cycle_id, member_id, turn_position, bid_amount, status) 
         VALUES (?, ?, ?, 0.00, 'PENDING')`,
        [nextCycle, activeMembers[i].id, i + 1],
      );
    }

    await connection.commit();
    connection.release();

    res.json({
      success: true,
      message: `Cycle ${currentCycle} completed successfully! Advanced to Cycle ${nextCycle} with a new rotation queue.`,
    });
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error("Error advancing cycle:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/members - Fetch all members
router.get("/", async (req, res) => {
  try {
    const [members] = await db.query(
      "SELECT id, member_number, full_name, phone_number, email, role, status FROM members ORDER BY id DESC",
    );
    res.json(members);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
