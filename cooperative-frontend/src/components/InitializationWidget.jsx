// src/components/InitializationWidget.jsx
import { useState, useEffect, useCallback } from "react";
import api from "../api/axios";
import {
  AlertTriangle,
  CheckCircle,
  RotateCcw,
  Users,
  Lock,
} from "lucide-react";

export default function InitializationWidget() {
  const [statusData, setStatusData] = useState({
    pendingRequest: null,
    approvals: [],
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get("/initialization/status");
      setStatusData(res.data);
    } catch (err) {
      console.error("Failed to fetch initialization status", err);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    Promise.resolve().then(() => {
      if (isMounted) {
        fetchStatus();
      }
    });
    return () => {
      isMounted = false;
    };
  }, [fetchStatus]);

  const handleRequestInit = async () => {
    if (
      !window.confirm(
        "Are you sure you want to request a full project initialization? This will reset all balances to zero once approved by all 3 committee members.",
      )
    )
      return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await api.post("/initialization/request");
      setMessage(res.data.message);
      fetchStatus();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to submit request.");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (requestId) => {
    if (!password) {
      setError(
        "Please enter your account password to authorize this approval.",
      );
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await api.post(`/initialization/${requestId}/approve`, {
        password,
      });
      setMessage(res.data.message);
      setPassword("");
      fetchStatus();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to approve request.");
    } finally {
      setLoading(false);
    }
  };

  const { pendingRequest, approvals } = statusData;
  const approvalCount = approvals.length;

  return (
    <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              Project Initialization Control
            </h2>
            <p className="text-xs text-slate-500">
              Requires unanimous approval from all 3 committee members to reset.
            </p>
          </div>
        </div>
      </div>

      {message && (
        <div className="p-3 bg-emerald-50 text-emerald-700 rounded-lg text-sm">
          {message}
        </div>
      )}
      {error && (
        <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {!pendingRequest ? (
        <div>
          <p className="text-sm text-slate-600 mb-4">
            No active initialization requests. Starting a new cycle requires
            setting all balances, contributions, and active ledger logs back to
            zero.
          </p>
          <button
            onClick={handleRequestInit}
            disabled={loading}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg text-sm shadow transition-colors flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Request Project Initialization
          </button>
        </div>
      ) : (
        <div className="space-y-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-slate-700">
              Status:{" "}
              <strong className="text-amber-600">
                Pending Committee Approvals
              </strong>
            </span>
            <span className="text-sm font-bold text-slate-800 flex items-center gap-1">
              <Users className="w-4 h-4 text-slate-500" /> {approvalCount} / 3
              Approvals
            </span>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Approved By Committee Members:
            </p>
            <ul className="space-y-1">
              {approvals.map((app) => (
                <li
                  key={app.id}
                  className="text-xs text-slate-700 flex items-center gap-2 bg-white p-2 rounded border border-slate-100"
                >
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                  <span>{app.full_name}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Password Input for Security Verification */}
          <div className="space-y-2 pt-2 border-t border-slate-200">
            <label className="block text-xs font-semibold text-slate-700">
              Enter Password to Authorize Approval
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your account password"
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <button
            onClick={() => handleApprove(pendingRequest.id)}
            disabled={loading || !password}
            className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-semibold rounded-lg text-sm shadow transition-colors"
          >
            {loading ? "Processing..." : "Approve Initialization Request"}
          </button>
        </div>
      )}
    </div>
  );
}
