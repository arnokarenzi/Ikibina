// src/pages/LedgerAudit.jsx
import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { BookOpen, RefreshCw, AlertCircle, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

export default function LedgerAudit() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchLedgerEntries = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/ledger/entries');
      setEntries(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load ledger audit trail.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLedgerEntries();
  }, []);

  const formatCurrency = (val) => `${Number(val || 0).toLocaleString()} RWF`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-coop-primary rounded-xl">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Double-Entry Audit Logs</h1>
            <p className="text-sm text-slate-500 mt-0.5">Immutable financial transaction trail across all accounts.</p>
          </div>
        </div>
        <button
          onClick={fetchLedgerEntries}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-sm rounded-lg transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh Ledger
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">ID</th>
                <th className="py-3 px-4">Transaction Type</th>
                <th className="py-3 px-4">Debit Account</th>
                <th className="py-3 px-4">Credit Account</th>
                <th className="py-3 px-4 text-right">Amount</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-slate-500">Loading ledger entries...</td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-slate-500">No audit entries found.</td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50/80 transition-colors font-mono text-xs">
                    <td className="py-3.5 px-4 font-bold text-slate-700">#{entry.id}</td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-1 bg-slate-100 text-slate-800 rounded font-semibold">
                        {entry.transaction_type}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-emerald-700 font-semibold">{entry.debit_account}</td>
                    <td className="py-3.5 px-4 text-red-700 font-semibold">{entry.credit_account}</td>
                    <td className="py-3.5 px-4 text-right font-bold text-slate-900 font-sans">
                      {formatCurrency(entry.amount)}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 font-sans max-w-xs truncate" title={entry.description}>
                      {entry.description || 'N/A'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500">
                      {entry.created_at ? new Date(entry.created_at).toLocaleString() : 'N/A'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
