// services/contributionService.js
const pool = require('../config/db');
const LedgerService = require('./ledgerService');

class ContributionService {
  
  static async recordMemberContribution(memberId, contributionDate, amountPaid = 5100.00) {
    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const [existing] = await connection.query(
        'SELECT id, status, late_fee_applied FROM daily_contributions WHERE member_id = ? AND contribution_date = ?', 
        [memberId, contributionDate]
      );

      if (existing.length > 0 && existing[0].status === 'PAID') {
        throw new Error(`Member ${memberId} has already paid for ${contributionDate}.`);
      }

      const isReserveReplenishment = existing.length > 0 && existing[0].status === 'COVERED_BY_RESERVE';
      const payoutShare = 5000.00;
      const reserveShare = 100.00;
      const penaltyAmount = Math.max(0, amountPaid - 5100.00);

      if (existing.length > 0) {
        await connection.query(
          `UPDATE daily_contributions SET amount_paid = ?, paid_at = CURRENT_TIMESTAMP, status = 'PAID' WHERE id = ?`,
          [amountPaid, existing[0].id]
        );
      } else {
        await connection.query(
          `INSERT INTO daily_contributions (member_id, contribution_date, amount_paid, paid_at, status) VALUES (?, ?, ?, CURRENT_TIMESTAMP, 'PAID')`,
          [memberId, contributionDate, amountPaid]
        );
      }

      if (isReserveReplenishment) {
        // Reimburses RESERVE_CAPITAL for the 5,100 RWF float advanced during 4:00 PM cutoff[cite: 13]
        await LedgerService.recordEntry(connection, {
          debitAccount: 'CASH', creditAccount: 'RESERVE_CAPITAL', amount: 5100.00,
          transactionType: 'RESERVE_REPLENISHMENT', referenceId: memberId, 
          description: `Late contribution float reimbursement (${contributionDate}) - Member ${memberId}`
        });
      } else {
        // Normal daily contribution split[cite: 13]
        await LedgerService.recordEntry(connection, {
          debitAccount: 'CASH', creditAccount: 'PAYOUT_POOL', amount: payoutShare,
          transactionType: 'DAILY_CONTRIBUTION', referenceId: memberId, 
          description: `Daily Contribution (${contributionDate}) - Member ${memberId} Payout Pool`
        });

        await LedgerService.recordEntry(connection, {
          debitAccount: 'CASH', creditAccount: 'RESERVE_CAPITAL', amount: reserveShare,
          transactionType: 'DAILY_CONTRIBUTION', referenceId: memberId, 
          description: `Daily Contribution (${contributionDate}) - Member ${memberId} Reserve Retention`
        });
      }

      // Posts penalty/late fee income into RESERVE_CAPITAL when paid[cite: 13, 20]
      if (penaltyAmount > 0) {
        await LedgerService.recordEntry(connection, {
          debitAccount: 'CASH', creditAccount: 'RESERVE_CAPITAL', amount: penaltyAmount,
          transactionType: 'PENALTY_FEE', referenceId: memberId, 
          description: `Late contribution penalty fee (${contributionDate}) - Member ${memberId}`
        });
      }

      await connection.commit();
      return { success: true, message: `Contribution recorded for Member ${memberId}.` };
    } catch (error) {
      if (connection) await connection.rollback();
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }

  static async initializePayoutSchedule(cycleNumber, startDate) {
    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const [members] = await connection.query('SELECT id, member_number FROM members ORDER BY member_number ASC');
      if (members.length !== 30) throw new Error('System must have exactly 30 active members.');

      let currentDate = new Date(startDate);
      const scheduleEntries = [];

      for (let day = 0; day < 15; day++) {
        const dateStr = currentDate.toISOString().split('T')[0];
        const memberA = members[day * 2];
        const memberB = members[day * 2 + 1];

        scheduleEntries.push([cycleNumber, dateStr, memberA.id, 75000.00, 'SCHEDULED']);
        scheduleEntries.push([cycleNumber, dateStr, memberB.id, 75000.00, 'SCHEDULED']);
        currentDate.setDate(currentDate.getDate() + 1);
      }

      await connection.query(`INSERT INTO payout_cycles (cycle_number, payout_date, recipient_member_id, amount, status) VALUES ?`, [scheduleEntries]);
      await connection.commit();
      return { success: true, message: `Cycle ${cycleNumber} payout schedule created.` };
    } catch (error) {
      if (connection) await connection.rollback();
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }

  static async executeDaily4PMCutoff(targetDate) {
    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const [paidRecords] = await connection.query('SELECT member_id FROM daily_contributions WHERE contribution_date = ? AND status = "PAID"', [targetDate]);
      const paidMemberIds = new Set(paidRecords.map(r => r.member_id));
      const [allMembers] = await connection.query('SELECT id FROM members');
      const unpaidMembers = allMembers.filter(m => !paidMemberIds.has(m.id));
      const shortfallsCount = unpaidMembers.length;

      if (shortfallsCount > 0 && shortfallsCount <= 3) {
        const floatAmount = shortfallsCount * 5100.00;
        await LedgerService.recordEntry(connection, {
          debitAccount: 'RESERVE_CAPITAL', creditAccount: 'PAYOUT_POOL', amount: floatAmount,
          transactionType: 'RESERVE_FLOAT', description: `Reserve Capital Float advance for ${shortfallsCount} missed contributions on ${targetDate}`
        });

        for (const member of unpaidMembers) {
          await connection.query(
            `INSERT INTO daily_contributions (member_id, contribution_date, amount_paid, is_late, late_fee_applied, status) VALUES (?, ?, 0.00, TRUE, 500.00, 'COVERED_BY_RESERVE')`,
            [member.id, targetDate]
          );
        }
      } else if (shortfallsCount > 3) {
        throw new Error(`Execution halted: ${shortfallsCount} members missed contributions. Reserve float limit is 3.`);
      }

      const [scheduledPayouts] = await connection.query('SELECT * FROM payout_cycles WHERE payout_date = ? AND status = "SCHEDULED"', [targetDate]);

      for (const payout of scheduledPayouts) {
        let finalPayoutAmount = payout.amount;
        let seizureAmount = 0;
        
        const [defaultedGuarantees] = await connection.query(
          "SELECT lg.id, lg.guaranteed_amount FROM loan_guarantors lg JOIN loans l ON lg.loan_id = l.id WHERE lg.guarantor_member_id = ? AND l.status = 'DEFAULTED'", 
          [payout.recipient_member_id]
        );

        for (const badDebt of defaultedGuarantees) {
          if (finalPayoutAmount > 0) {
            const deduction = Math.min(finalPayoutAmount, badDebt.guaranteed_amount);
            finalPayoutAmount -= deduction;
            seizureAmount += deduction;

            await connection.query("UPDATE loan_guarantors SET guaranteed_amount = guaranteed_amount - ?, status = 'SEIZED' WHERE id = ?", [deduction, badDebt.id]);
          }
        }

        if (seizureAmount > 0) {
          await LedgerService.recordEntry(connection, {
            debitAccount: 'PAYOUT_POOL', creditAccount: 'LOAN_RECEIVABLE', amount: seizureAmount,
            transactionType: 'TREASURY_SEIZURE', referenceId: payout.recipient_member_id, 
            description: `Automated seizure of default debt from Member ID ${payout.recipient_member_id} rotational payout`
          });
        }

        if (finalPayoutAmount > 0) {
          await LedgerService.recordEntry(connection, {
            debitAccount: 'PAYOUT_POOL', creditAccount: 'CASH', amount: finalPayoutAmount,
            transactionType: 'ROTATIONAL_PAYOUT', referenceId: payout.recipient_member_id, 
            description: `Daily Rotational Payout to Member ID ${payout.recipient_member_id}`
          });
        }

        await connection.query('UPDATE payout_cycles SET status = "DISBURSED", processed_at = CURRENT_TIMESTAMP WHERE id = ?', [payout.id]);
      }

      await connection.commit();
      return { success: true, message: `4:00 PM Cutoff executed for ${targetDate}. Payouts Disbursed: ${scheduledPayouts.length}` };
    } catch (error) {
      if (connection) await connection.rollback();
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }
}

module.exports = ContributionService;
