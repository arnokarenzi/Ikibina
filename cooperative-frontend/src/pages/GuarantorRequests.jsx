// src/pages/GuarantorRequests.jsx
import { useState, useEffect, useCallback } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { Users, CheckCircle2, AlertCircle, Check, X, Send } from "lucide-react";

export default function GuarantorRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [actionLoading, setActionLoading] = useState({});
  const [disburseLoading, setDisburseLoading] = useState({});

  const userRole = user?.role ? String(user.role).trim().toUpperCase() : "";
  const isCommitteeMember = ["CHAIRPERSON", "TREASURER", "AUDITOR"].includes(
    userRole,
  );

  // 1. Declare fetchGuarantorRequests BEFORE useEffect
  const fetchGuarantorRequests = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await api.get(`/loans/guarantor-requests/${user.id}`);
      setRequests(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to fetch guarantor requests:", err);
      setError("Failed to load pending guarantor requests.");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // 2. Call inside useEffect after declaration
  useEffect(() => {
    fetchGuarantorRequests();
  }, [fetchGuarantorRequests]);

  const handleAction = async (loanId, action) => {
    if (!user?.id || !loanId) {
      setError(
        "Unable to process the request because the user or loan ID is missing.",
      );
      return;
    }

    setActionLoading((prev) => ({ ...prev, [loanId]: true }));
    setError(null);
    setMessage(null);

    try {
      const res = await api.post(`/loans/${loanId}/guarantor-action`, {
        userId: user.id,
        action,
      });
      setMessage(res.data.message || `Successfully processed ${action}.`);
      await fetchGuarantorRequests();
    } catch (err) {
      setError(
        err.response?.data?.error || err.message || "Failed to process action.",
      );
    } finally {
      setActionLoading((prev) => ({ ...prev, [loanId]: false }));
    }
  };

  const handleDisburse = async (loanId) => {
    if (!user?.id || !loanId) {
      setError(
        "Unable to disburse the loan because the user or loan ID is missing.",
      );
      return;
    }

    setDisburseLoading((prev) => ({ ...prev, [loanId]: true }));
    setError(null);
    setMessage(null);

    try {
      const res = await api.post(`/loans/${loanId}/disburse`, {
        userId: user.id,
        role: userRole,
      });
      setMessage(
        res.data.message ||
          "Loan disbursed successfully and recorded in Ledger Audit.",
      );
      await fetchGuarantorRequests();
    } catch (err) {
      setError(
        err.response?.data?.error ||
          err.message ||
          "Failed to process loan disbursement.",
      );
    } finally {
      setDisburseLoading((prev) => ({ ...prev, [loanId]: false }));
    }
  };

  // ... rest of component render JSX

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Guarantor Requests & Disbursements
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Review emergency guarantee requests and manage fund disbursements for
          approved loans.
        </p>
      </div>

      {message && (
        <div className="p-3 bg-emerald-50 text-emerald-800 rounded-lg text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          {message}
        </div>
      )}
      {error && (
        <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-slate-500 p-8 text-center">
          Loading requests...
        </div>
      ) : requests.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-sm space-y-3">
          <Users className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="font-bold text-slate-800">No Pending Requests</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            You currently have no pending guarantor requests or active
            disbursement actions requiring your sign-off.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {requests.map((req) => {
            const isLoading = !!actionLoading[req.loan_id];
            const isDisbursing = !!disburseLoading[req.loan_id];
            const isReadyForDisbursement =
              req.status === "APPROVED" || req.fully_guaranteed === true;

            return (
              <div
                key={req.loan_id}
                className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-slate-900">
                      Loan #{req.loan_id}
                    </span>
                    <span
                      className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${isReadyForDisbursement ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}
                    >
                      {isReadyForDisbursement
                        ? "Ready for Disbursement"
                        : "Pending Sign-off"}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700">
                    Borrower:{" "}
                    <strong className="text-slate-900">
                      {req.borrower_name}
                    </strong>{" "}
                    ({req.borrower_phone || "No phone"})
                  </p>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500 pt-1">
                    <div>
                      Principal:{" "}
                      <strong className="text-slate-800">
                        {Number(req.principal_amount).toLocaleString()} RWF
                      </strong>
                    </div>
                    <div>
                      Your Guarantee Share:{" "}
                      <strong className="text-slate-800">
                        {Number(req.guaranteed_amount || 0).toLocaleString()}{" "}
                        RWF
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end md:self-center">
                  {!isReadyForDisbursement ? (
                    <>
                      <button
                        onClick={() => handleAction(req.loan_id, "APPROVE")}
                        disabled={isLoading}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs rounded-lg flex items-center gap-1 disabled:opacity-50 transition-colors"
                      >
                        <Check className="w-4 h-4" />{" "}
                        {isLoading ? "Processing..." : "Approve Sign-off"}
                      </button>
                      <button
                        onClick={() => handleAction(req.loan_id, "REJECT")}
                        disabled={isLoading}
                        className="px-3 py-2 bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-600 border border-slate-200 font-medium text-xs rounded-lg flex items-center gap-1 disabled:opacity-50 transition-colors"
                      >
                        <X className="w-4 h-4" /> Decline
                      </button>
                    </>
                  ) : (
                    isCommitteeMember && (
                      <button
                        onClick={() => handleDisburse(req.loan_id)}
                        disabled={isDisbursing}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-lg flex items-center gap-1.5 disabled:opacity-50 transition-colors shadow-sm"
                      >
                        <Send className="w-3.5 h-3.5" />{" "}
                        {isDisbursing
                          ? "Disbursing..."
                          : "Release Money & Post to Ledger"}
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
