// services/loanService.js
const pool = require("../config/db");
const LedgerService = require("./ledgerService");

class LoanService {
  /**
   * Submits a Tier 1 (Unsecured Micro-Loan) request with 2 guarantors
   */
  static async applyTier1Loan({
    borrowerId,
    principalAmount,
    termMonths,
    guarantorIds,
  }) {
    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      // Rule Validation
      if (principalAmount < 1 || principalAmount > 300000) {
        throw new Error(
          "Tier 1 loan principal must be between 1 and 300,000 RWF.",
        );
      }
      if (termMonths < 1 || termMonths > 3) {
        throw new Error("Tier 1 standard term must be between 1 and 3 months.");
      }
      if (!guarantorIds || guarantorIds.length !== 2) {
        throw new Error(
          "Tier 1 loans require exactly two (2) distinct guarantors.",
        );
      }
      if (guarantorIds.includes(borrowerId)) {
        throw new Error("A borrower cannot act as their own guarantor.");
      }

      // Check Guarantor Exposure Ceiling (Max 2 active loans per guarantor)
      for (const guarantorId of guarantorIds) {
        const [activeGuarantees] = await connection.query(
          `SELECT COUNT(*) as count FROM loan_guarantors 
           WHERE guarantor_member_id = ? AND status IN ('PENDING', 'ACTIVE')`,
          [guarantorId],
        );
        if (activeGuarantees[0].count >= 2) {
          throw new Error(
            `Member ${guarantorId} has reached the maximum guarantor exposure limit (2 active loans).`,
          );
        }
      }

      // 1. Insert Loan Record
      const [loanResult] = await connection.query(
        `INSERT INTO loans 
         (borrower_id, loan_type, principal_amount, remaining_principal, monthly_interest_rate, term_months, status)
         VALUES (?, 'TIER_1', ?, ?, 5.00, ?, 'SUBMITTED')`,
        [borrowerId, principalAmount, principalAmount, termMonths],
      );
      const loanId = loanResult.insertId;

      // 2. Attach Guarantors (50% guaranteed liability each)
      const guaranteedAmount = principalAmount / 2;
      for (const guarantorId of guarantorIds) {
        await connection.query(
          `INSERT INTO loan_guarantors (loan_id, guarantor_member_id, guaranteed_amount, status)
           VALUES (?, ?, ?, 'PENDING')`,
          [loanId, guarantorId, guaranteedAmount],
        );
      }

      await connection.commit();
      return {
        success: true,
        loanId,
        message: "Tier 1 loan application submitted successfully.",
      };
    } catch (error) {
      if (connection) await connection.rollback();
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * Submits a Tier 2 (Secured Strategic Loan) request with collateral
   */
  static async applyTier2Loan({
    borrowerId,
    principalAmount,
    termMonths,
    collateral,
  }) {
    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      // Rule Validation
      if (principalAmount <= 300000 || principalAmount > 1500000) {
        throw new Error(
          "Tier 2 loan principal must be between 300,001 and 1,500,000 RWF.",
        );
      }
      if (termMonths < 1 || termMonths > 6) {
        throw new Error("Tier 2 standard term must be between 1 and 6 months.");
      }

      // Collateral Validation (Min 150% valuation)
      const minimumCollateralValue = principalAmount * 1.5;
      if (collateral.estimatedMarketValue < minimumCollateralValue) {
        throw new Error(
          `Collateral valuation (${collateral.estimatedMarketValue} RWF) must be at least 150% of principal (${minimumCollateralValue} RWF).`,
        );
      }

      // 1. Insert Loan Record
      const [loanResult] = await connection.query(
        `INSERT INTO loans 
         (borrower_id, loan_type, principal_amount, remaining_principal, monthly_interest_rate, term_months, status)
         VALUES (?, 'TIER_2', ?, ?, 5.00, ?, 'SUBMITTED')`,
        [borrowerId, principalAmount, principalAmount, termMonths],
      );
      const loanId = loanResult.insertId;

      // 2. Attach Collateral Record
      await connection.query(
        `INSERT INTO loan_collateral 
         (loan_id, asset_type, description, estimated_market_value, document_url, is_verified)
         VALUES (?, ?, ?, ?, ?, TRUE)`,
        [
          loanId,
          collateral.assetType,
          collateral.description,
          collateral.estimatedMarketValue,
          collateral.documentUrl,
        ],
      );

      await connection.commit();
      return {
        success: true,
        loanId,
        message: "Tier 2 loan application submitted successfully.",
      };
    } catch (error) {
      if (connection) await connection.rollback();
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * Approves a loan request by a Loan Committee member (Chairperson, Treasurer, Auditor)
   */
  static async approveLoan(loanId, memberRole) {
    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const [loans] = await connection.query(
        "SELECT * FROM loans WHERE id = ?",
        [loanId],
      );
      if (loans.length === 0) throw new Error("Loan not found.");
      const loan = loans[0];

      let updateField = "";
      if (memberRole === "CHAIRPERSON")
        updateField = "approved_by_chairperson = TRUE";
      else if (memberRole === "TREASURER")
        updateField = "approved_by_treasurer = TRUE";
      else if (memberRole === "AUDITOR")
        updateField = "approved_by_auditor = TRUE";
      else
        throw new Error(
          "Unauthorized: Only Chairperson, Treasurer, or Auditor can approve loans.",
        );

      await connection.query(`UPDATE loans SET ${updateField} WHERE id = ?`, [
        loanId,
      ]);

      // Check if all 3 approvals are granted
      const [updatedLoan] = await connection.query(
        "SELECT * FROM loans WHERE id = ?",
        [loanId],
      );
      const l = updatedLoan[0];

      if (
        l.approved_by_chairperson &&
        l.approved_by_treasurer &&
        l.approved_by_auditor
      ) {
        await connection.query(
          "UPDATE loans SET status = 'APPROVED' WHERE id = ?",
          [loanId],
        );
      }

      await connection.commit();
      return {
        success: true,
        message: `Loan ${loanId} approved by ${memberRole}.`,
      };
    } catch (error) {
      if (connection) await connection.rollback();
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * Disburses funds for an APPROVED loan and records double-entry ledger entries (Principal + 5% Profit)
   */
  static async disburseLoan(loanId) {
    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const [loans] = await connection.query(
        "SELECT * FROM loans WHERE id = ?",
        [loanId],
      );
      if (loans.length === 0) throw new Error("Loan not found.");
      const loan = loans[0];

      if (loan.status !== "APPROVED") {
        throw new Error(
          "Cannot disburse: Loan must be approved by all 3 committee members first.",
        );
      }

      // Calculate dates
      const startDate = new Date().toISOString().split("T")[0];
      const dueDate = new Date();
      dueDate.setMonth(dueDate.getMonth() + loan.term_months);
      const dueDateStr = dueDate.toISOString().split("T")[0];

      const principalAmount = parseFloat(loan.principal_amount);
      const profitRate = (parseFloat(loan.monthly_interest_rate) || 5.0) / 100;
      const profitAmount = principalAmount * profitRate; // e.g., 50,000 RWF for 1M RWF principal

      // Update Loan Status
      await connection.query(
        `UPDATE loans 
         SET status = 'ACTIVE', start_date = ?, due_date = ? 
         WHERE id = ?`,
        [startDate, dueDateStr, loanId],
      );

      // Activate Guarantors if Tier 1
      if (loan.loan_type === "TIER_1") {
        await connection.query(
          "UPDATE loan_guarantors SET status = 'ACTIVE' WHERE loan_id = ?",
          [loanId],
        );
      }

      // 1. Debit LOAN_RECEIVABLE & Credit CASH for Principal Disbursement (1,000,000 RWF)
      await LedgerService.recordEntry(connection, {
        debitAccount: "LOAN_RECEIVABLE",
        creditAccount: "CASH",
        amount: principalAmount,
        transactionType: "LOAN_DISBURSEMENT",
        referenceId: loanId,
        description: `${loan.loan_type} Principal Disbursement for Borrower Member ID ${loan.borrower_id}`,
      });

      // 2. Debit LOAN_RECEIVABLE & Credit INTEREST_INCOME for 5% Profit Accrual (50,000 RWF)
      await LedgerService.recordEntry(connection, {
        debitAccount: "LOAN_RECEIVABLE",
        creditAccount: "INTEREST_INCOME",
        amount: profitAmount,
        transactionType: "LOAN_PROFIT_ACCRUAL",
        referenceId: loanId,
        description: `${loan.loan_type} 5% Profit Accrual for Borrower Member ID ${loan.borrower_id}`,
      });

      await connection.commit();
      return {
        success: true,
        message: `Loan ${loanId} disbursed successfully. Principal: ${principalAmount.toLocaleString()} RWF | Total Receivable: ${(principalAmount + profitAmount).toLocaleString()} RWF.`,
      };
    } catch (error) {
      if (connection) await connection.rollback();
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * Closes a loan and releases its guarantors when fully paid off.
   */
  static async closeLoan(loanId) {
    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const [loans] = await connection.query(
        "SELECT * FROM loans WHERE id = ?",
        [loanId],
      );
      if (loans.length === 0) throw new Error("Loan not found.");

      // 1. Update loan status to CLOSED and clear remaining principal
      await connection.query(
        `UPDATE loans SET status = 'CLOSED', remaining_principal = 0 WHERE id = ?`,
        [loanId],
      );

      // 2. Release associated guarantors by updating status to 'COMPLETED'
      await connection.query(
        `UPDATE loan_guarantors SET status = 'COMPLETED' WHERE loan_id = ?`,
        [loanId],
      );

      await connection.commit();
      return {
        success: true,
        message: `Loan ${loanId} successfully closed and guarantors released.`,
      };
    } catch (error) {
      if (connection) await connection.rollback();
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }
}

module.exports = LoanService;
