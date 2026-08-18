// routes/loanRoutes.js
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const PenaltyAndRepaymentService = require('../services/penaltyAndRepaymentService');

// Helper function to map frontend asset types to DB ENUMs
const mapAssetType = (type) => {
  const upper = (type || '').toUpperCase();
  if (upper.includes('LAND')) return 'LAND_TITLE';
  if (upper.includes('VEHICLE') || upper.includes('CAR')) return 'VEHICLE_LOGBOOK';
  return 'FIXED_DEPOSIT';
};

// GET /api/loans - Fetch loans with dynamic time-scaled interest, 90-day (Tier 1) / 180-day (Tier 2) adjustments, and rolling due dates
router.get('/', async (req, res) => {
  try {
    const [loans] = await db.query(`
      SELECT l.*, m.full_name AS borrower_name, m.member_number, m.phone_number,
             DATE_ADD(COALESCE(l.start_date, l.created_at), INTERVAL (GREATEST(1, CEIL(DATEDIFF(NOW(), COALESCE(l.start_date, l.created_at)) / 30.0)) * 30) DAY) AS due_date,
             (l.remaining_principal + 
              (l.remaining_principal / 100.0 * (
                CASE 
                  WHEN l.loan_type = 'TIER_1' THEN 
                    (LEAST(GREATEST(1, CEIL(DATEDIFF(NOW(), COALESCE(l.start_date, l.created_at)) / 30.0)), 3) * 5.00) + 
                    (GREATEST(0, GREATEST(1, CEIL(DATEDIFF(NOW(), COALESCE(l.start_date, l.created_at)) / 30.0)) - 3) * 10.00)
                  WHEN l.loan_type = 'TIER_2' THEN 
                    (LEAST(GREATEST(1, CEIL(DATEDIFF(NOW(), COALESCE(l.start_date, l.created_at)) / 30.0)), 6) * 5.00) + 
                    (GREATEST(0, GREATEST(1, CEIL(DATEDIFF(NOW(), COALESCE(l.start_date, l.created_at)) / 30.0)) - 6) * 10.00)
                  ELSE 
                    (GREATEST(1, CEIL(DATEDIFF(NOW(), COALESCE(l.start_date, l.created_at)) / 30.0)) * 5.00)
                END
              )) + 
              COALESCE(l.accrued_penalty_balance, 0) + 
              COALESCE(l.accrued_admin_fee, 0)) AS total_due
      FROM loans l
      LEFT JOIN members m ON l.borrower_id = m.id
      ORDER BY l.created_at DESC
    `);

    for (let loan of loans) {
      const [guarantors] = await db.query(`
        SELECT lg.*, m.full_name, m.member_number, m.phone_number 
        FROM loan_guarantors lg
        JOIN members m ON lg.guarantor_member_id = m.id
        WHERE lg.loan_id = ?
      `, [loan.id]);
      loan.guarantors = guarantors;
    }

    res.json(loans);
  } catch (error) {
    console.error('Error fetching loans:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/loans/borrower/:borrowerId - Fetch active borrower debt with dynamic interest and rolling due dates
router.get('/borrower/:borrowerId', async (req, res) => {
  try {
    const borrowerId = req.params.borrowerId;
    const [loans] = await db.query(`
      SELECT id, loan_type, principal_amount, remaining_principal, 
             monthly_interest_rate, start_date, created_at,
             accrued_penalty_balance, accrued_admin_fee, status,
             DATE_ADD(COALESCE(start_date, created_at), INTERVAL (GREATEST(1, CEIL(DATEDIFF(NOW(), COALESCE(start_date, created_at)) / 30.0)) * 30) DAY) AS due_date,
             (remaining_principal + 
              (remaining_principal / 100.0 * (
                CASE 
                  WHEN loan_type = 'TIER_1' THEN 
                    (LEAST(GREATEST(1, CEIL(DATEDIFF(NOW(), COALESCE(start_date, created_at)) / 30.0)), 3) * 5.00) + 
                    (GREATEST(0, GREATEST(1, CEIL(DATEDIFF(NOW(), COALESCE(start_date, created_at)) / 30.0)) - 3) * 10.00)
                  WHEN loan_type = 'TIER_2' THEN 
                    (LEAST(GREATEST(1, CEIL(DATEDIFF(NOW(), COALESCE(start_date, created_at)) / 30.0)), 6) * 5.00) + 
                    (GREATEST(0, GREATEST(1, CEIL(DATEDIFF(NOW(), COALESCE(start_date, created_at)) / 30.0)) - 6) * 10.00)
                  ELSE 
                    (GREATEST(1, CEIL(DATEDIFF(NOW(), COALESCE(start_date, created_at)) / 30.0)) * 5.00)
                END
              )) + 
              COALESCE(accrued_penalty_balance, 0) + 
              COALESCE(accrued_admin_fee, 0)) AS total_due
      FROM loans 
      WHERE borrower_id = ? AND status IN ('ACTIVE', 'PENALTY_ZONE')
    `, [borrowerId]);
    res.json(loans);
  } catch (error) {
    console.error('Error fetching borrower loans:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/loans/repay - Member submits a repayment payload directly
router.post('/repay', async (req, res) => {
  try {
    const { loan_id, amount, member_id, memberId } = req.body;
    const borrowerId = member_id || memberId || (req.user ? req.user.id : null);
    const parsedAmount = parseFloat(amount);

    if (!loan_id || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Loan ID and a valid repayment amount greater than zero are required.' });
    }

    const [loans] = await db.query(`
      SELECT l.*,
             (l.remaining_principal + 
              (l.remaining_principal / 100.0 * (
                CASE 
                  WHEN l.loan_type = 'TIER_1' THEN 
                    (LEAST(GREATEST(1, CEIL(DATEDIFF(NOW(), COALESCE(l.start_date, l.created_at)) / 30.0)), 3) * 5.00) + 
                    (GREATEST(0, GREATEST(1, CEIL(DATEDIFF(NOW(), COALESCE(l.start_date, l.created_at)) / 30.0)) - 3) * 10.00)
                  WHEN l.loan_type = 'TIER_2' THEN 
                    (LEAST(GREATEST(1, CEIL(DATEDIFF(NOW(), COALESCE(l.start_date, l.created_at)) / 30.0)), 6) * 5.00) + 
                    (GREATEST(0, GREATEST(1, CEIL(DATEDIFF(NOW(), COALESCE(l.start_date, l.created_at)) / 30.0)) - 6) * 10.00)
                  ELSE 
                    (GREATEST(1, CEIL(DATEDIFF(NOW(), COALESCE(l.start_date, l.created_at)) / 30.0)) * 5.00)
                END
              )) + 
              COALESCE(l.accrued_penalty_balance, 0) + 
              COALESCE(l.accrued_admin_fee, 0)) AS total_due
      FROM loans l WHERE l.id = ?
    `, [loan_id]);

    if (loans.length === 0) return res.status(404).json({ error: 'Loan not found.' });

    const totalDueFloat = parseFloat(loans[0].total_due);
    
    if (parsedAmount > totalDueFloat) {
      return res.status(400).json({ 
        error: `Payment rejected: The entered amount (${parsedAmount} RWF) exceeds your total balance due (${totalDueFloat.toFixed(2)} RWF).` 
      });
    }

    await db.query(
      `INSERT INTO loan_repayments (loan_id, member_id, amount, status) VALUES (?, ?, ?, 'PENDING')`,
      [loan_id, borrowerId, parsedAmount]
    );

    res.status(201).json({ message: 'Repayment request submitted successfully. Awaiting committee verification.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/loans/repayments - Fetch all repayment logs with borrower names
router.get('/repayments', async (req, res) => {
  try {
    const [requests] = await db.query(`
      SELECT r.*, l.loan_type, l.remaining_principal, l.accrued_penalty_balance, l.accrued_admin_fee,
             m.full_name AS borrower_name, m.phone_number, m.member_number
      FROM loan_repayments r
      JOIN loans l ON r.loan_id = l.id
      JOIN members m ON l.borrower_id = m.id
      ORDER BY r.created_at DESC
    `);

    const formattedRequests = requests.map(r => ({
      ...r,
      member_id: r.borrower_name || r.full_name || r.member_id
    }));

    res.json(formattedRequests);
  } catch (error) {
    console.error('Error fetching repayments:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/loans/:id/repay-request - Member submits parametric repayment
router.post('/:id/repay-request', async (req, res) => {
  try {
    const loanId = req.params.id;
    const { amount, member_id, memberId } = req.body;
    const borrowerId = member_id || memberId || (req.user ? req.user.id : null);
    const parsedAmount = parseFloat(amount);

    if (parsedAmount <= 0) return res.status(400).json({ error: 'Repayment amount must be greater than zero.' });

    const [loans] = await db.query(`
      SELECT l.*,
             (l.remaining_principal + 
              (l.remaining_principal / 100.0 * (
                CASE 
                  WHEN l.loan_type = 'TIER_1' THEN 
                    (LEAST(GREATEST(1, CEIL(DATEDIFF(NOW(), COALESCE(l.start_date, l.created_at)) / 30.0)), 3) * 5.00) + 
                    (GREATEST(0, GREATEST(1, CEIL(DATEDIFF(NOW(), COALESCE(l.start_date, l.created_at)) / 30.0)) - 3) * 10.00)
                  WHEN l.loan_type = 'TIER_2' THEN 
                    (LEAST(GREATEST(1, CEIL(DATEDIFF(NOW(), COALESCE(l.start_date, l.created_at)) / 30.0)), 6) * 5.00) + 
                    (GREATEST(0, GREATEST(1, CEIL(DATEDIFF(NOW(), COALESCE(l.start_date, l.created_at)) / 30.0)) - 6) * 10.00)
                  ELSE 
                    (GREATEST(1, CEIL(DATEDIFF(NOW(), COALESCE(l.start_date, l.created_at)) / 30.0)) * 5.00)
                END
              )) + 
              COALESCE(l.accrued_penalty_balance, 0) + 
              COALESCE(l.accrued_admin_fee, 0)) AS total_due
      FROM loans l WHERE l.id = ?
    `, [loanId]);

    if (loans.length === 0) return res.status(404).json({ error: 'Loan not found.' });

    const totalDueFloat = parseFloat(loans[0].total_due);
    
    if (parsedAmount > totalDueFloat) {
      return res.status(400).json({ 
        error: `Payment rejected: The entered amount (${parsedAmount} RWF) exceeds your total balance due (${totalDueFloat.toFixed(2)} RWF).` 
      });
    }

    await db.query(
      `INSERT INTO loan_repayments (loan_id, member_id, amount, status) VALUES (?, ?, ?, 'PENDING')`,
      [loanId, borrowerId, parsedAmount]
    );

    res.status(201).json({ message: 'Repayment request submitted.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/loans/repayments/pending - Committee views pending requests with borrower names
router.get('/repayments/pending', async (req, res) => {
  try {
    const [requests] = await db.query(`
      SELECT r.*, l.loan_type, l.remaining_principal, l.accrued_penalty_balance, l.accrued_admin_fee,
             m.full_name AS borrower_name, m.phone_number, m.member_number
      FROM loan_repayments r
      JOIN loans l ON r.loan_id = l.id
      JOIN members m ON l.borrower_id = m.id
      WHERE r.status = 'PENDING'
      ORDER BY r.created_at DESC
    `);

    const formattedRequests = requests.map(r => ({
      ...r,
      member_id: r.borrower_name || r.full_name || r.member_id
    }));

    res.json(formattedRequests);
  } catch (error) {
    console.error('Error fetching pending repayments:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/loans/repayments/:repaymentId/approve - Committee approves repayment
router.post('/repayments/:repaymentId/approve', async (req, res) => {
  try {
    const repaymentId = req.params.repaymentId;
    const userRole = req.body?.role || req.user?.role;
    const userId = req.body?.userId || req.user?.id;
    const action = req.body?.action || 'APPROVE';

    if (!['CHAIRPERSON', 'TREASURER', 'AUDITOR'].includes(String(userRole || '').toUpperCase())) {
      return res.status(403).json({ error: 'Only committee members are authorized.' });
    }

    const [repayments] = await db.query('SELECT * FROM loan_repayments WHERE id = ?', [repaymentId]);
    if (repayments.length === 0) return res.status(404).json({ error: 'Repayment not found.' });
    const repayment = repayments[0];

    if (repayment.status !== 'PENDING') return res.status(400).json({ error: 'Already processed.' });
    if (userId && String(repayment.member_id) === String(userId)) return res.status(403).json({ error: 'Cannot approve own repayment.' });

    if (action === 'REJECT') {
      await db.query('UPDATE loan_repayments SET status = "REJECTED" WHERE id = ?', [repaymentId]);
      return res.status(200).json({ message: 'Repayment request rejected.' });
    }

    const result = await PenaltyAndRepaymentService.processLoanRepayment(repayment.loan_id, repayment.amount);
    await db.query('UPDATE loan_repayments SET status = "APPROVED" WHERE id = ?', [repaymentId]);

    res.status(200).json({ message: 'Repayment approved!', result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/loans/guarantor-requests/:userId - Fetch pending guarantor requests
router.get('/guarantor-requests/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const [requests] = await db.query(`
      SELECT DISTINCT l.id AS loan_id, l.principal_amount, l.created_at, l.status AS status,
             m.full_name AS borrower_name, m.phone_number AS borrower_phone,
             lg.guaranteed_amount, lg.status AS guarantor_status
      FROM loans l
      JOIN members m ON l.borrower_id = m.id
      LEFT JOIN loan_guarantors lg ON l.id = lg.loan_id
      WHERE (lg.guarantor_member_id = ? AND lg.status = 'PENDING') OR l.status = 'APPROVED'
    `, [userId]);
    res.json(requests);
  } catch (error) {
    console.error('Error fetching guarantor requests:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/loans/apply - Apply for a loan with Rulebook Base Interest (5.00%)
router.post('/apply', async (req, res) => {
  try {
    const { member_id, tier, amount, duration_months, purpose, guarantorIds, asset_type, estimated_value, collateral } = req.body;

    const borrowerId = member_id || (req.user ? req.user.id : null);
    const parsedAmount = parseFloat(amount);
    const termMonths = parseInt(duration_months, 10);
    const loanType = tier === 'TIER_1' ? 'TIER_1' : 'TIER_2';
    const monthlyInterestRate = 5.00; 

    if (loanType === 'TIER_1' && parsedAmount > 300000) {
      return res.status(400).json({ error: 'Tier 1 amount cannot exceed 300,000 RWF.' });
    }

    if (loanType === 'TIER_1' && Array.isArray(guarantorIds) && guarantorIds.length > 0) {
      if (guarantorIds.includes(borrowerId)) return res.status(400).json({ error: 'Cannot act as own guarantor.' });

      for (const gid of guarantorIds) {
        const [memberRows] = await db.query('SELECT full_name FROM members WHERE id = ?', [gid]);
        const memberName = memberRows.length > 0 ? memberRows[0].full_name : `Member ID ${gid}`;
        const [activeGuarantees] = await db.query(
          `SELECT COUNT(*) as count FROM loan_guarantors WHERE guarantor_member_id = ? AND status IN ('PENDING', 'ACTIVE')`, [gid]
        );
        if (activeGuarantees[0].count >= 2) return res.status(400).json({ error: `${memberName} has reached the exposure limit.` });
      }
    }

    const [loanRes] = await db.query(
      `INSERT INTO loans (borrower_id, loan_type, principal_amount, remaining_principal, monthly_interest_rate, term_months, status, start_date) 
       VALUES (?, ?, ?, ?, ?, ?, 'SUBMITTED', NOW())`,
      [borrowerId, loanType, parsedAmount, parsedAmount, monthlyInterestRate, termMonths]
    );

    const loanId = loanRes.insertId;

    if (loanType === 'TIER_1' && Array.isArray(guarantorIds) && guarantorIds.length > 0) {
      const guaranteedAmountPerPerson = parsedAmount / guarantorIds.length;
      for (const gid of guarantorIds) {
        await db.query(
          `INSERT INTO loan_guarantors (loan_id, guarantor_member_id, guaranteed_amount, status) VALUES (?, ?, ?, 'PENDING')`,
          [loanId, gid, guaranteedAmountPerPerson]
        );
      }
    }

    if (loanType === 'TIER_2') {
      const dbAssetType = mapAssetType(asset_type);
      const marketValue = parseFloat(estimated_value || parsedAmount);
      const collateralDesc = collateral || purpose || 'Collateral provided for Tier 2 loan';

      await db.query(
        `INSERT INTO loan_collateral (loan_id, asset_type, description, estimated_market_value, document_url) VALUES (?, ?, ?, ?, ?)`,
        [loanId, dbAssetType, collateralDesc, marketValue, 'N/A']
      );
    }

    res.status(201).json({ message: `${loanType} loan submitted successfully.`, loanId });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/loans/:id/guarantor-action - Member Approve/Decline
router.post('/:id/guarantor-action', async (req, res) => {
  try {
    const loanId = req.params.id;
    const guarantorId = req.user?.id || req.body?.userId;
    const { action } = req.body;

    if (action === 'REJECT') {
      await db.query('UPDATE loan_guarantors SET status = "REJECTED" WHERE loan_id = ? AND guarantor_member_id = ?', [loanId, guarantorId]);
      await db.query('UPDATE loans SET status = "CLOSED" WHERE id = ?', [loanId]);
      return res.json({ message: 'Declined guarantor request. Loan closed.' });
    }

    await db.query('UPDATE loan_guarantors SET status = "ACTIVE" WHERE loan_id = ? AND guarantor_member_id = ?', [loanId, guarantorId]);
    const [allGuarantors] = await db.query('SELECT status FROM loan_guarantors WHERE loan_id = ?', [loanId]);
    const allSigned = allGuarantors.length > 0 && allGuarantors.every(g => g.status === 'ACTIVE');

    if (allSigned) {
      await db.query('UPDATE loans SET status = "APPROVED" WHERE id = ?', [loanId]);
      return res.json({ message: 'Loan is APPROVED!' });
    }

    res.json({ message: 'Sign-off recorded.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/loans/:id/approve - Committee Multi-Sig
router.post('/:id/approve', async (req, res) => {
  try {
    const loanId = req.params.id;
    const userRole = req.user?.role || req.body?.role;
    const action = req.body?.action || 'APPROVE';

    if (action === 'REJECT') {
      await db.query('UPDATE loans SET status = ? WHERE id = ?', ['CLOSED', loanId]);
      return res.status(200).json({ message: `Loan #${loanId} rejected.` });
    }

    if (!['CHAIRPERSON', 'TREASURER', 'AUDITOR'].includes(userRole)) {
      return res.status(403).json({ error: 'Only Committee members can approve loans.' });
    }

    let updateCol = '';
    if (userRole === 'CHAIRPERSON') updateCol = 'approved_by_chairperson';
    else if (userRole === 'TREASURER') updateCol = 'approved_by_treasurer';
    else if (userRole === 'AUDITOR') updateCol = 'approved_by_auditor';

    await db.query(`UPDATE loans SET ${updateCol} = 1 WHERE id = ?`, [loanId]);

    const [updatedRows] = await db.query('SELECT approved_by_chairperson, approved_by_treasurer, approved_by_auditor FROM loans WHERE id = ?', [loanId]);
    const updatedLoan = updatedRows[0];

    if (updatedLoan.approved_by_chairperson && updatedLoan.approved_by_treasurer && updatedLoan.approved_by_auditor) {
      await db.query('UPDATE loans SET status = "APPROVED" WHERE id = ?', [loanId]);
      return res.status(200).json({ message: `Loan #${loanId} is APPROVED!` });
    }

    res.status(200).json({ message: `Approval recorded for ${userRole}.` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/loans/:id/disburse - Release money
router.post('/:id/disburse', async (req, res) => {
  try {
    const loanId = req.params.id;
    const userRole = req.body?.role || req.user?.role;

    if (!['CHAIRPERSON', 'TREASURER', 'AUDITOR'].includes(String(userRole).toUpperCase())) {
      return res.status(403).json({ error: 'Only committee members can disburse.' });
    }

    const [loans] = await db.query('SELECT * FROM loans WHERE id = ?', [loanId]);
    if (loans.length === 0) return res.status(404).json({ error: 'Loan not found.' });
    const loan = loans[0];

    if (loan.status !== 'APPROVED') return res.status(400).json({ error: 'Must be fully approved.' });

    await db.query('UPDATE loans SET status = "ACTIVE", start_date = NOW() WHERE id = ?', [loanId]);

    try {
      await db.query(
        `INSERT INTO ledger_entries (debit_account, credit_account, amount, transaction_type, reference_id, is_realized_cash, description) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['LOAN_RECEIVABLE', 'CASH', loan.principal_amount, 'LOAN_DISBURSEMENT', loanId, true, `Disbursement for Loan #${loanId}`]
      );
    } catch (ledgerErr) {
      console.log('Ledger error:', ledgerErr.message);
    }

    res.status(200).json({ message: `Loan #${loanId} disbursed.` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
