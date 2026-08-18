// services/ledgerService.js
const pool = require('../config/db');

/**
 * Double-Entry Accounting Accounts:
 * - CASH: Actual physical/bank money held by cooperative[cite: 14].
 * - PAYOUT_POOL: Funds pooled daily for 75,000 RWF payouts[cite: 14].
 * - RESERVE_CAPITAL: Mandatory 100 RWF per member daily retention account[cite: 14].
 * - LOAN_RECEIVABLE: Money owed to cooperative by borrowers[cite: 14].
 * - MEMBER_SAVINGS: Deposits made by individual members[cite: 14].
 * - INTEREST_INCOME: Profit collected from 5%/10% loan rates[cite: 14].
 * - ACCRUED_RECEIVABLES: Uncollected paper profits from defaulting loans[cite: 14].
 * - EMERGENCY_FUND: Permanent 20% institutional reserve fund[cite: 14].
 */

class LedgerService {
  /**
   * Records a double-entry transaction inside an active MySQL transaction pool[cite: 14]
   * @param {Object} connection - MySQL Transaction Connection[cite: 14]
   * @param {Object} entryData - Transaction details[cite: 14]
   */
  static async recordEntry(connection, {
    debitAccount,
    creditAccount,
    amount,
    transactionType,
    referenceId = null,
    isRealizedCash = true,
    description = ''
  }) {
    if (amount <= 0) {
      throw new Error('Ledger transaction amount must be greater than zero.');
    }

    const query = `
      INSERT INTO ledger_entries 
      (debit_account, credit_account, amount, transaction_type, reference_id, is_realized_cash, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await connection.query(query, [
      debitAccount,
      creditAccount,
      amount,
      transactionType,
      referenceId,
      isRealizedCash,
      description
    ]);

    return result.insertId;
  }

  /**
   * Calculates total account balance by distinguishing Credit-normal from Debit-normal accounts[cite: 14]
   * @param {String} accountName 
   * @returns {Number} Net balance
   */
  static async getAccountBalance(accountName) {
    // Accounts where balance increases on CREDIT (Equity, Reserves, Liabilities, Income)[cite: 14]
    const creditNormalAccounts = [
      'RESERVE_CAPITAL', 
      'PAYOUT_POOL', 
      'INTEREST_INCOME', 
      'MEMBER_SAVINGS', 
      'EMERGENCY_FUND'
    ];

    const isCreditNormal = creditNormalAccounts.includes(accountName);

    const query = isCreditNormal
      ? `SELECT 
          COALESCE(SUM(CASE WHEN credit_account = ? THEN amount ELSE 0 END), 0) -
          COALESCE(SUM(CASE WHEN debit_account = ? THEN amount ELSE 0 END), 0) AS balance
        FROM ledger_entries`
      : `SELECT 
          COALESCE(SUM(CASE WHEN debit_account = ? THEN amount ELSE 0 END), 0) -
          COALESCE(SUM(CASE WHEN credit_account = ? THEN amount ELSE 0 END), 0) AS balance
        FROM ledger_entries`;

    const [rows] = await pool.query(query, [accountName, accountName]);
    return parseFloat(rows[0].balance);
  }
}

module.exports = LedgerService;
