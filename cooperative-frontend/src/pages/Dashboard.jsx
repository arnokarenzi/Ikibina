import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import InitializationWidget from "../components/InitializationWidget";
import {
  Vault,
  Coins,
  PiggyBank,
  TrendingUp,
  RefreshCw,
  AlertCircle,
  Bell,
  X,
  Info,
} from "lucide-react";

export default function Dashboard() {
  const { user } = useAuth();
  const [balances, setBalances] = useState(null);
  const [loans, setLoans] = useState([]);
  const [personalStats, setPersonalStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showLoanModal, setShowLoanModal] = useState(false);

  const userRole = user?.role ? String(user.role).trim().toUpperCase() : "";
  const isCommittee = ["CHAIRPERSON", "TREASURER", "AUDITOR"].includes(
    userRole,
  );

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isCommittee) {
        const [balanceRes, loansRes] = await Promise.all([
          api.get("/ledger/balances"),
          api.get("/loans"),
        ]);
        setBalances(balanceRes.data ?? {});
        setLoans(Array.isArray(loansRes.data) ? loansRes.data : []);
      } else if (user?.id) {
        const response = await api.get(`/members/${user.id}/summary`);
        setPersonalStats(response.data ?? {});
      }
    } catch (err) {
      setError(
        err?.response?.data?.error ||
          err?.message ||
          "Failed to connect to backend.",
      );
    } finally {
      setLoading(false);
    }
  }, [isCommittee, user?.id]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const formatCurrency = (val) => `${Number(val || 0).toLocaleString()} RWF`;

  // Filter active and penalty-zone loans
  const activeLoans = loans.filter((l) =>
    ["ACTIVE", "PENALTY_ZONE"].includes(l.status),
  );

  // Calculate totals
  const totalPrincipal = Number(balances?.LOAN_RECEIVABLE || 0);
  const totalExpectedReceivables = activeLoans.reduce(
    (sum, l) => sum + Number(l.total_due || 0),
    0,
  );
  const totalExpectedProfits = Math.max(
    0,
    totalExpectedReceivables - totalPrincipal,
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {isCommittee ? "Executive Summary" : "My Financial Summary"}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Welcome back,{" "}
            <span className="font-semibold text-slate-700">
              {user?.full_name}
            </span>
          </p>
        </div>
        <button
          onClick={fetchDashboardData}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-sm rounded-lg transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {/* --- MEMBER VIEW --- */}
      {!isCommittee && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Active Debt Balance
              </span>
              <p className="text-2xl font-bold text-red-600 mt-2">
                {loading ? "..." : formatCurrency(personalStats?.active_debt)}
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Total Savings / Equity
              </span>
              <p className="text-2xl font-bold text-emerald-600 mt-2">
                {loading ? "..." : formatCurrency(personalStats?.total_savings)}
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Next Payment Due
              </span>
              <p className="text-2xl font-bold text-slate-900 mt-2">
                {loading
                  ? "..."
                  : formatCurrency(personalStats?.next_payment_amount)}
              </p>
              <span className="text-xs text-slate-500 mt-1 block">
                Deadline: {personalStats?.next_payment_date || "N/A"}
              </span>
            </div>
          </div>

          <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-6 flex justify-between items-center">
            <div>
              <h3 className="font-bold text-blue-900 flex items-center gap-2">
                <Bell className="w-5 h-5" /> Pending Guarantor Requests
              </h3>
              <p className="text-sm text-blue-800 mt-1">
                Check if other members have requested your sign-off.
              </p>
            </div>
            <Link
              to="/guarantor-requests"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow transition-colors"
            >
              View Requests
            </Link>
          </div>
        </>
      )}

      {/* --- COMMITTEE VIEW --- */}
      {isCommittee && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-start justify-between">
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Cash Vault / Treasury
                </span>
                <p className="text-2xl font-bold text-slate-900 mt-2">
                  {loading ? "..." : formatCurrency(balances?.CASH)}
                </p>
              </div>
              <div className="p-3 bg-blue-50 text-coop-primary rounded-xl">
                <Vault className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-start justify-between">
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Rotational Payout Pool
                </span>
                <p className="text-2xl font-bold text-slate-900 mt-2">
                  {loading ? "..." : formatCurrency(balances?.PAYOUT_POOL)}
                </p>
              </div>
              <div className="p-3 bg-sky-50 text-coop-secondary rounded-xl">
                <Coins className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-start justify-between">
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Institutional Reserve
                </span>
                <p className="text-2xl font-bold text-slate-900 mt-2">
                  {loading ? "..." : formatCurrency(balances?.RESERVE_CAPITAL)}
                </p>
              </div>
              <div className="p-3 bg-purple-50 text-purple-700 rounded-xl">
                <PiggyBank className="w-6 h-6" />
              </div>
            </div>

            {/* Clickable Loan Receivables Card */}
            <div
              onClick={() => !loading && setShowLoanModal(true)}
              className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-amber-300 transition-all cursor-pointer flex items-start justify-between group"
            >
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Loan Receivables (Principal)
                  </span>
                  <Info className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-600 transition-colors" />
                </div>
                <p className="text-2xl font-bold text-slate-900 mt-2">
                  {loading ? "..." : formatCurrency(totalPrincipal)}
                </p>

                <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-1 text-xs text-emerald-700 font-medium">
                  <span>Expected Total Recovery:</span>
                  <span className="font-bold">
                    {loading ? "..." : formatCurrency(totalExpectedReceivables)}
                  </span>
                </div>
              </div>
              <div className="p-3 bg-amber-50 text-amber-700 rounded-xl group-hover:bg-amber-100 transition-colors">
                <TrendingUp className="w-6 h-6" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            <Link
              to="/loans"
              className="group bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all border-l-4 border-l-amber-500"
            >
              <h3 className="font-bold text-slate-800">
                Loan Management Portal
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Process Tier 1 & Tier 2 applications and multi-sig approvals.
              </p>
            </Link>
            <Link
              to="/ledger"
              className="group bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all border-l-4 border-l-coop-primary"
            >
              <h3 className="font-bold text-slate-800">
                Double-Entry Audit Logs
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Review full immutable credit and debit ledger entries.
              </p>
            </Link>
          </div>

          {/* Project Initialization Widget (Restricted to Committee View) */}
          <div className="mt-6">
            <InitializationWidget />
          </div>
        </>
      )}

      {/* --- LOAN BREAKDOWN MODAL --- */}
      {showLoanModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Loan Portfolio Breakdown
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Audited ledger principal vs. projected total recovery across
                  active loans.
                </p>
              </div>
              <button
                onClick={() => setShowLoanModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Summary Cards inside Modal */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Ledger Principal
                  </span>
                  <p className="text-xl font-bold text-slate-900 mt-1">
                    {formatCurrency(totalPrincipal)}
                  </p>
                </div>
                <div className="bg-amber-50 p-4 rounded-xl border border-amber-200">
                  <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider">
                    Expected Profits / Interest
                  </span>
                  <p className="text-xl font-bold text-amber-800 mt-1">
                    {formatCurrency(totalExpectedProfits)}
                  </p>
                </div>
                <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200">
                  <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
                    Total Expected Recovery
                  </span>
                  <p className="text-xl font-bold text-emerald-800 mt-1">
                    {formatCurrency(totalExpectedReceivables)}
                  </p>
                </div>
              </div>

              {/* Active Loans Table */}
              <div>
                <h4 className="text-sm font-bold text-slate-800 mb-3">
                  Active & Penalty Zone Loans ({activeLoans.length})
                </h4>
                {activeLoans.length === 0 ? (
                  <p className="text-sm text-slate-500 py-6 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    No active loans found in the portfolio.
                  </p>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="bg-slate-100 text-slate-600 font-semibold text-xs uppercase tracking-wider">
                          <th className="p-3">Loan ID / Member</th>
                          <th className="p-3">Status</th>
                          <th className="p-3 text-right">Principal</th>
                          <th className="p-3 text-right">
                            Total Due (Expected)
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {activeLoans.map((loan) => (
                          <tr
                            key={loan.id}
                            className="hover:bg-slate-50/80 transition-colors"
                          >
                            <td className="p-3 font-medium text-slate-900">
                              #{loan.id}{" "}
                              <span className="text-xs font-normal text-slate-500 block">
                                {loan.borrower_name ||
                                  loan.member_name ||
                                  `Member ID: ${loan.member_id}`}
                              </span>
                            </td>
                            <td className="p-3">
                              <span
                                className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${
                                  loan.status === "PENALTY_ZONE"
                                    ? "bg-red-100 text-red-700"
                                    : "bg-emerald-100 text-emerald-700"
                                }`}
                              >
                                {loan.status}
                              </span>
                            </td>
                            <td className="p-3 text-right font-medium text-slate-700">
                              {formatCurrency(loan.principal || loan.amount)}
                            </td>
                            <td className="p-3 text-right font-bold text-slate-900">
                              {formatCurrency(loan.total_due)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={() => setShowLoanModal(false)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-medium text-sm rounded-xl transition-colors shadow-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
