// src/pages/Contributions.jsx
import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { Coins, Calendar, Clock, CheckCircle2, AlertCircle, Play, ShieldAlert } from 'lucide-react';

export default function Contributions() {
  const { user } = useAuth();
  const isCommitteeMember = ['CHAIRPERSON', 'TREASURER', 'AUDITOR'].includes(user?.role);

  // Member restricts to self
  const [selectedMember, setSelectedMember] = useState(user?.id || '');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState('5100');
  
  const [payMessage, setPayMessage] = useState(null);

  // Cutoff state
  const [cutoffDate, setCutoffDate] = useState(new Date().toISOString().split('T')[0]);
  const [cutoffLoading, setCutoffLoading] = useState(false);
  const [cutoffResult, setCutoffResult] = useState(null);

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/contributions/pay', {
        member_id: parseInt(selectedMember, 10),
        payment_date: paymentDate,
        amount: parseFloat(amount)
      });
      setPayMessage('Contribution recorded successfully.');
    } catch (err) {
      alert('Failed to record contribution.');
    }
  };

  const handleExecuteCutoff = async (e) => {
    e.preventDefault();
    if (!isCommitteeMember) return;
    setCutoffLoading(true);
    try {
      const res = await api.post('/contributions/cutoff', { targetDate: cutoffDate });
      setCutoffResult(res.data);
    } catch (err) {
      alert('Failed to execute cutoff.');
    } finally {
      setCutoffLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My Savings & Shares</h1>
        <p className="text-sm text-slate-500 mt-1">Manage your cooperative daily contributions.</p>
      </div>

      <div className={`grid grid-cols-1 ${isCommitteeMember ? 'lg:grid-cols-2' : ''} gap-8`}>
        
        {/* Record Personal Payment */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
             <div className="p-2.5 bg-blue-50 text-coop-primary rounded-lg"><Coins className="w-5 h-5" /></div>
             <div>
               <h2 className="font-bold text-slate-800">Record Daily Payment</h2>
               <p className="text-xs text-slate-500">Standard 5,100 RWF deposit</p>
             </div>
          </div>

          <form onSubmit={handleRecordPayment} className="space-y-4">
            {payMessage && <div className="p-3 bg-emerald-50 text-emerald-800 rounded-lg text-sm">{payMessage}</div>}
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Payment Date</label>
                <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Amount (RWF)</label>
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-semibold" required readOnly={!isCommitteeMember} />
              </div>
            </div>

            <button type="submit" className="w-full py-2.5 bg-coop-primary hover:bg-blue-900 text-white font-semibold rounded-lg text-sm">
              Record Contribution
            </button>
          </form>
        </div>

        {/* 4:00 PM Cutoff - STRICTLY COMMITTEE ONLY */}
        {isCommitteeMember && (
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="p-2.5 bg-purple-50 text-purple-700 rounded-lg"><Clock className="w-5 h-5" /></div>
              <div>
                <h2 className="font-bold text-slate-800">4:00 PM CAT Engine</h2>
                <p className="text-xs text-slate-500">Automated shortfall coverage</p>
              </div>
            </div>
            
            <form onSubmit={handleExecuteCutoff} className="space-y-4">
              <input type="date" value={cutoffDate} onChange={(e) => setCutoffDate(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" required />
              <button type="submit" disabled={cutoffLoading} className="w-full py-2.5 bg-purple-700 hover:bg-purple-800 text-white font-semibold rounded-lg text-sm flex justify-center items-center gap-2">
                <Play className="w-4 h-4 fill-current" /> {cutoffLoading ? 'Executing...' : 'Run Engine'}
              </button>
            </form>

            {cutoffResult && (
               <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-xs space-y-1 text-emerald-800 font-mono">
                 <div>Disbursed: {cutoffResult.payout_amount?.toLocaleString()} RWF</div>
               </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
