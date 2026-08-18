// services/penaltyAndRepaymentService.js
const pool = require('../config/db');
const LedgerService = require('./ledgerService');

class PenaltyAndRepaymentService {
  
  static async processLoanRepayment(loanId, amountPaid) {
    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      // 1. Fetch the loan alongside the corrected segmented dynamic interest calculation
      const [loans] = await connection.query(`
        SELECT l.*,
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
               )) AS calculated_interest,
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

      if (loans.length === 0) throw new Error('Loan not found.');
      const loan = loans[0];

      const amountPaidFloat = parseFloat(amountPaid);
      const totalDueFloat = parseFloat(loan.total_due);

      if (amountPaidFloat <= 0) throw new Error('Repayment amount must be greater than zero.');

      // 2. BACKEND INTERFERENCE: Strictly reject overpayments to prevent manual entry mistakes
      if (amountPaidFloat > totalDueFloat) {
        throw new Error(`Payment rejected: The entered amount (${amountPaidFloat} RWF) exceeds the total balance due (${totalDueFloat} RWF).`);
      }

      let remainingPayment = amountPaidFloat;
      let adminFeePaid = 0;
      let penaltyPaid = 0;
      let principalPaid = 0;
      let interestPaid = 0;

      // 3. Deduct Admin Fees
      if (loan.accrued_admin_fee > 0) {
        adminFeePaid = Math.min(remainingPayment, parseFloat(loan.accrued_admin_fee));
        remainingPayment -= adminFeePaid;
      }
      
      // 4. Deduct Penalties
      if (remainingPayment > 0 && loan.accrued_penalty_balance > 0) {
        penaltyPaid = Math.min(remainingPayment, parseFloat(loan.accrued_penalty_balance));
        remainingPayment -= penaltyPaid;
      }
      
      // 5. Deduct Principal
      if (remainingPayment > 0 && loan.remaining_principal > 0) {
        principalPaid = Math.min(remainingPayment, parseFloat(loan.remaining_principal));
        remainingPayment -= principalPaid;
      }

      // 6. The remainder is exactly the dynamic interest/profit portion
      if (remainingPayment > 0) {
        interestPaid = remainingPayment;
        remainingPayment = 0;
      }

      const newAdminFee = parseFloat(loan.accrued_admin_fee) - adminFeePaid;
      const newPenalty = parseFloat(loan.accrued_penalty_balance) - penaltyPaid;
      const newPrincipal = parseFloat(loan.remaining_principal) - principalPaid;
      const newStatus = (newPrincipal === 0 && newPenalty === 0 && newAdminFee === 0) ? 'CLOSED' : loan.status;

      // Update Loan Balances in DB
      await connection.query(
        `UPDATE loans SET remaining_principal = ?, accrued_penalty_balance = ?, accrued_admin_fee = ?, status = ? WHERE id = ?`,
        [newPrincipal, newPenalty, newAdminFee, newStatus, loanId]
      );

      // 7. Move Money to the Company's Pool (Debit CASH) and clear Principal from LOAN_RECEIVABLE
      if (principalPaid > 0) {
        await LedgerService.recordEntry(connection, {
          debitAccount: 'CASH', creditAccount: 'LOAN_RECEIVABLE', amount: principalPaid,
          transactionType: 'LOAN_REPAYMENT', referenceId: loanId, description: `Principal recovery for Loan ID ${loanId}`
        });
      }

      // 8. Move Profit Money to the Company's Pool (Debit CASH) and credit INTEREST_INCOME
      if (penaltyPaid + adminFeePaid + interestPaid > 0) {
        await LedgerService.recordEntry(connection, {
          debitAccount: 'CASH', creditAccount: 'INTEREST_INCOME', amount: penaltyPaid + adminFeePaid + interestPaid,
          transactionType: 'PENALTY_FEE', referenceId: loanId, isRealizedCash: true, description: `Profit/Interest collected for Loan ID ${loanId}`
        });
      }

      await connection.commit();
      return { success: true, message: `Payment processed. Principal: ${principalPaid}, Profit/Fees: ${penaltyPaid + adminFeePaid + interestPaid}.` };
    } catch (error) {
      if (connection) await connection.rollback();
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }

  static async processMonthlyInterestAndPenalties(currentMonthIndex) {
    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const [activeLoans] = await connection.query(
        "SELECT * FROM loans WHERE status IN ('ACTIVE', 'PENALTY_ZONE')"
      );

      for (const loan of activeLoans) {
        const isTier1 = loan.loan_type === 'TIER_1';
        const penaltyStartMonth = isTier1 ? 4 : 7;
        const isPenaltyZone = currentMonthIndex >= penaltyStartMonth;

        const remainingPrincipal = parseFloat(loan.remaining_principal);
        let interestRate = 5.00;
        let newStatus = loan.status;
        let monthlyCharge = 0;
        let adminFee = 0;

        if (isPenaltyZone) {
          interestRate = 10.00;
          monthlyCharge = (remainingPrincipal * interestRate) / 100;
          adminFee = (remainingPrincipal * 2.00) / 100;
          newStatus = 'DEFAULTED'; 
        } else {
          monthlyCharge = (remainingPrincipal * interestRate) / 100;
        }

        const updatedPenaltyBalance = parseFloat(loan.accrued_penalty_balance) + monthlyCharge;
        const updatedAdminFeeBalance = parseFloat(loan.accrued_admin_fee) + adminFee;

        await connection.query(
          `UPDATE loans SET monthly_interest_rate = ?, accrued_penalty_balance = ?, accrued_admin_fee = ?, status = ? WHERE id = ?`,
          [interestRate, updatedPenaltyBalance, updatedAdminFeeBalance, newStatus, loan.id]
        );

        await LedgerService.recordEntry(connection, {
          debitAccount: 'LOAN_RECEIVABLE', creditAccount: 'INTEREST_INCOME', amount: monthlyCharge + adminFee,
          transactionType: 'PENALTY_FEE', referenceId: loan.id, isRealizedCash: false, 
          description: `Month ${currentMonthIndex} Interest/Penalty assessment (${interestRate}% rate) for Loan ID ${loan.id}`
        });
      }

      await connection.commit();
      return { success: true, message: `Processed monthly interest/penalties for ${activeLoans.length} loans.` };
    } catch (error) {
      if (connection) await connection.rollback();
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }

  static async enforceTier1Default(loanId) {
    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const [loans] = await connection.query('SELECT * FROM loans WHERE id = ?', [loanId]);
      if (loans.length === 0) throw new Error('Loan not found.');
      const loan = loans[0];

      if (loan.loan_type !== 'TIER_1') throw new Error('Default enforcement is strictly for Tier 1 loans.');

      const totalDebt = parseFloat(loan.remaining_principal) + parseFloat(loan.accrued_penalty_balance) + parseFloat(loan.accrued_admin_fee);
      const halfDebt = totalDebt / 2;

      const [guarantors] = await connection.query('SELECT * FROM loan_guarantors WHERE loan_id = ?', [loanId]);
      for (const guarantor of guarantors) {
        await connection.query("UPDATE loan_guarantors SET status = 'DEFAULT_DEDUCTED' WHERE id = ?", [guarantor.id]);
        
        await LedgerService.recordEntry(connection, {
          debitAccount: 'MEMBER_SAVINGS', creditAccount: 'LOAN_RECEIVABLE', amount: halfDebt,
          transactionType: 'LOAN_REPAYMENT', referenceId: loanId, 
          description: `Tier 1 Default recovery deducted from Guarantor Member ID ${guarantor.guarantor_member_id}`
        });
      }

      await connection.query(
        "UPDATE loans SET remaining_principal = 0, accrued_penalty_balance = 0, accrued_admin_fee = 0, status = 'DEFAULTED' WHERE id = ?",
        [loanId]
      );

      await connection.commit();
      return { success: true, message: `Tier 1 Loan ${loanId} defaulted.` };
    } catch (error) {
      if (connection) await connection.rollback();
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }
}

module.exports = PenaltyAndRepaymentService;
