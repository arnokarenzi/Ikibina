// src/pages/Loans.jsx
import React, { useState, useEffect, useMemo } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { 
  FilePlus, 
  CheckSquare, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  Check, 
  ShieldCheck,
  UserCheck,
  Receipt
} from 'lucide-react';

export default function Loans() {
  const { user } = useAuth();
  
  const userRole = user?.role ? String(user.role).trim().toUpperCase() : '';
  const isCommitteeMember = ['CHAIRPERSON', 'TREASURER', 'AUDITOR'].includes(userRole);

  const [activeTab, setActiveTab] = useState('apply'); 
  const [members, setMembers] = useState([]);
  const [loans, setLoans] = useState([]);
  const [repayments, setRepayments] = useState([]);
  const [loadingLoans, setLoadingLoans] = useState(false);

  // Application State
  const [selectedMember, setSelectedMember] = useState(user?.id || '');
  const [loanTier, setLoanTier] = useState('TIER_1');
  const [amount, setAmount] = useState('50000');
  const [durationMonths, setDurationMonths] = useState('3');
  const [purpose, setPurpose] = useState('');
  
  const [guarantor1, setGuarantor1] = useState('');
  const [guarantor2, setGuarantor2] = useState('');

  const [assetType, setAssetType] = useState('LAND');
  const [collateralValue, setCollateralValue] = useState('');
  const [collateralDescription, setCollateralDescription] = useState('');

  const [applyLoading, setApplyLoading] = useState(false);
  const [applyMessage, setApplyMessage] = useState(null);
  const [applyError, setApplyError] = useState(null);

  // Committee Action State
  const [approvalLoading, setApprovalLoading] = useState({});
  const [approvalMessage, setApprovalMessage] = useState(null);
  const [approvalError, setApprovalError] = useState(null);

  // Repayment State
  const [repayLoanId, setRepayLoanId] = useState('');
  const [repayAmount, setRepayAmount] = useState('');
  const [repayLoading, setRepayLoading] = useState(false);
  const [repayMessage, setRepayMessage] = useState(null);
  const [repayError, setRepayError] = useState(null);
  const [repaymentActionLoading, setRepaymentActionLoading] = useState({});

  useEffect(() => {
    if (user?.id) setSelectedMember(user.id);
    fetchMembers();
    fetchLoans();
    fetchRepayments();
  }, [user]);

  const fetchMembers = async () => {
    try {
      const res = await api.get('/members');
      setMembers(res.data);
    } catch (err) {
      console.error('Failed to load members:', err);
    }
  };

  const fetchLoans = async () => {
    setLoadingLoans(true);
    try {
      const res = await api.get('/loans');
      const filteredLoans = isCommitteeMember 
        ? res.data 
        : res.data.filter(l => String(l.borrower_id) === String(user.id) || String(l.member_id) === String(user.id));
      setLoans(filteredLoans);
    } catch (err) {
      console.error('Failed to load loans:', err);
    } finally {
      setLoadingLoans(false);
    }
  };

  const fetchRepayments = async () => {
    try {
      const res = await api.get('/loans/repayments');
      const filteredRepayments = isCommitteeMember
        ? res.data
        : res.data.filter(r => String(r.member_id) === String(user.id));
      setRepayments(filteredRepayments);
    } catch (err) {
      console.error('Failed to load repayments:', err);
    }
  };

  const handleApplyLoan = async (e) => {
    e.preventDefault();
    setApplyLoading(true);
    setApplyError(null);
    setApplyMessage(null);

    try {
      let preparedGuarantors = [];
      if (loanTier === 'TIER_1') {
        if (!guarantor1 || !guarantor2 || guarantor1 === guarantor2) {
          throw new Error("You must select two distinct guarantors.");
        }
        preparedGuarantors = [parseInt(guarantor1, 10), parseInt(guarantor2, 10)];
      }

      const payload = {
        member_id: parseInt(selectedMember, 10),
        tier: loanTier,
        amount: parseFloat(amount),
        duration_months: parseInt(durationMonths, 10),
        purpose,
        guarantorIds: preparedGuarantors,
        asset_type: assetType,
        estimated_value: parseFloat(collateralValue || amount),
        collateral: collateralDescription || purpose
      };

      const res = await api.post('/loans/apply', payload);
      setApplyMessage(res.data.message || 'Loan application submitted successfully.');
      fetchLoans();
    } catch (err) {
      setApplyError(err.response?.data?.error || err.message || 'Failed to submit loan application.');
    } finally {
      setApplyLoading(false);
    }
  };

  const handleCommitteeApproval = async (loanId, action) => {
    setApprovalLoading(prev => ({ ...prev, [loanId]: true }));
    setApprovalError(null);
    setApprovalMessage(null);

    try {
      const res = await api.post(`/loans/${loanId}/approve`, {
        userId: user?.id,
        role: userRole,
        action
      });
      setApprovalMessage(res.data.message || `Action ${action} processed successfully.`);
      await fetchLoans();
    } catch (err) {
      setApprovalError(err.response?.data?.error || err.message || 'Failed to process approval.');
    } finally {
      setApprovalLoading(prev => ({ ...prev, [loanId]: false }));
    }
  };

  const handleRepaymentSubmit = async (e) => {
    e.preventDefault();
    setRepayLoading(true);
    setRepayError(null);
    setRepayMessage(null);

    try {
      const payload = {
        loan_id: parseInt(repayLoanId, 10),
        member_id: parseInt(user?.id, 10),
        amount: parseFloat(repayAmount)
      };

      const res = await api.post('/loans/repay', payload);
      setRepayMessage(res.data.message || 'Repayment request submitted successfully.');
      setRepayAmount('');
      setRepayLoanId('');
      fetchRepayments();
    } catch (err) {
      setRepayError(err.response?.data?.error || err.message || 'Failed to submit repayment.');
    } finally {
      setRepayLoading(false);
    }
  };

  const handleRepaymentApproval = async (repaymentId, action) => {
    setRepaymentActionLoading(prev => ({ ...prev, [repaymentId]: true }));
    try {
      const res = await api.post(`/loans/repayments/${repaymentId}/approve`, { 
        action,
        role: userRole,
        userId: user?.id 
      });
      alert(res.data.message);
      fetchRepayments();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to process repayment action.');
    } finally {
      setRepaymentActionLoading(prev => ({ ...prev, [repaymentId]: false }));
    }
  };

  const hasUserApproved = (loan) => {
    if (userRole === 'CHAIRPERSON') return !!loan.approved_by_chairperson;
    if (userRole === 'TREASURER') return !!loan.approved_by_treasurer;
    if (userRole === 'AUDITOR') return !!loan.approved_by_auditor;
    return false;
  };

  const availableGuarantorList = useMemo(() => {
    return members.filter((m) => String(m.id) !== String(selectedMember));
  }, [members, selectedMember]);

  const pendingCommitteeLoans = loans.filter(
    (l) => (l.status === 'SUBMITTED' || l.status === 'PENDING') && (l.tier === 'TIER_2' || l.loan_type === 'TIER_2')
  );

  const myActiveLoans = loans.filter(l => String(l.borrower_id) === String(user?.id) && (l.status === 'ACTIVE' || l.status === 'PENALTY_ZONE' || l.status === 'APPROVED'));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Loans Management</h1>
        <p className="text-sm text-slate-500 mt-1">Apply for loans, manage repayments, and track schedules.</p>
      </div>

      <div className="flex border-b border-slate-200 gap-4">
        <button
          onClick={() => setActiveTab('apply')}
          className={`pb-3 px-1 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'apply' ? 'border-coop-primary text-coop-primary' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          <FilePlus className="w-4 h-4" /> Apply for Loan
        </button>

        <button
          onClick={() => setActiveTab('repayments')}
          className={`pb-3 px-1 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'repayments' ? 'border-coop-primary text-coop-primary' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          <Receipt className="w-4 h-4" /> Repayments
        </button>
        
        {isCommitteeMember && (
          <button
            onClick={() => setActiveTab('approvals')}
            className={`pb-3 px-1 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'approvals' ? 'border-coop-primary text-coop-primary' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            <CheckSquare className="w-4 h-4" /> Committee Approvals
            {pendingCommitteeLoans.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-amber-100 text-amber-800 font-bold rounded-full">{pendingCommitteeLoans.length}</span>
            )}
          </button>
        )}
      </div>

      {activeTab === 'apply' && (
        <div className="max-w-2xl bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
          <form onSubmit={handleApplyLoan} className="space-y-4">
            {applyMessage && <div className="p-3 bg-emerald-50 text-emerald-800 rounded-lg text-sm">{applyMessage}</div>}
            {applyError && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{applyError}</div>}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Loan Tier</label>
                <select value={loanTier} onChange={(e) => setLoanTier(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
                  <option value="TIER_1">Tier 1 - Emergency (Max 300k RWF)</option>
                  <option value="TIER_2">Tier 2 - Development</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Amount (RWF)</label>
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" required />
              </div>
            </div>

            {loanTier === 'TIER_1' && (
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <label className="block text-xs font-semibold text-slate-600 mb-2">Select 2 Guarantors (Cannot be yourself)</label>
                <div className="grid grid-cols-2 gap-4">
                  <select value={guarantor1} onChange={(e) => setGuarantor1(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" required>
                    <option value="">Guarantor 1</option>
                    {availableGuarantorList.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                  </select>
                  <select value={guarantor2} onChange={(e) => setGuarantor2(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" required>
                    <option value="">Guarantor 2</option>
                    {availableGuarantorList.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                  </select>
                </div>
              </div>
            )}

            {loanTier === 'TIER_2' && (
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                 <label className="block text-xs font-semibold text-slate-600 mb-1">Collateral Required</label>
                 <select value={assetType} onChange={(e) => setAssetType(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-2">
                    <option value="LAND">Land / Real Estate</option>
                    <option value="VEHICLE">Vehicle / Automobile</option>
                    <option value="OTHER">Other Valuable Asset</option>
                 </select>
                 <input type="text" value={collateralDescription} onChange={(e) => setCollateralDescription(e.target.value)} placeholder="Collateral Document Ref (UPI/Reg #)" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" required />
              </div>
            )}

            <button type="submit" disabled={applyLoading} className="w-full py-2.5 bg-coop-primary hover:bg-blue-900 text-white font-semibold rounded-lg text-sm disabled:opacity-50">
              {applyLoading ? 'Submitting...' : 'Submit Loan Application'}
            </button>
          </form>
        </div>
      )}

      {activeTab === 'repayments' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Submit Repayment Form */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
            <h3 className="font-bold text-slate-800 text-lg">Make Loan Repayment</h3>
            
            <form onSubmit={handleRepaymentSubmit} className="space-y-4">
              {repayMessage && <div className="p-3 bg-emerald-50 text-emerald-800 rounded-lg text-sm">{repayMessage}</div>}
              {repayError && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{repayError}</div>}

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Select Active Loan & View Balance Owed</label>
                <select value={repayLoanId} onChange={(e) => setRepayLoanId(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" required>
                  <option value="">-- Choose Loan --</option>
                  {myActiveLoans.map((l) => {
                    const principal = Number(l.principal_amount || l.amount || 0);
                    const remainingPrincipal = Number(l.remaining_principal ?? principal);
                    const profitRate = Number(l.profit_rate || 0.05);
                    const profitAmount = Number(l.profit_amount ?? l.interest_amount ?? (remainingPrincipal * profitRate));
                    const totalDue = Number(l.total_due ?? (remainingPrincipal + profitAmount + Number(l.accrued_penalty_balance || 0) + Number(l.accrued_admin_fee || 0)));

                    return (
                      <option key={l.id} value={l.id}>
                        Loan #{l.id} | Borrowed: {principal.toLocaleString()} RWF | Total Due: {totalDue.toLocaleString()} RWF
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Repayment Amount (RWF)</label>
                <input type="number" value={repayAmount} onChange={(e) => setRepayAmount(e.target.value)} placeholder="e.g., 10000" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" required />
              </div>

              <button type="submit" disabled={repayLoading} className="w-full py-2.5 bg-coop-primary hover:bg-blue-900 text-white font-semibold rounded-lg text-sm disabled:opacity-50">
                {repayLoading ? 'Submitting...' : 'Submit Repayment Request'}
              </button>
            </form>
          </div>

          {/* Repayments History / List */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-800 text-lg">Repayment Logs</h3>
            
            {repayments.length === 0 ? (
              <div className="p-6 text-center border border-dashed border-slate-200 rounded-xl text-slate-500 text-sm">
                No repayment records found.
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {repayments.map((r) => (
                  <div key={r.id} className="p-4 border border-slate-200 rounded-xl bg-slate-50/50 flex justify-between items-center">
                    <div>
                      <div className="font-semibold text-slate-900 text-sm">Loan #{r.loan_id} - {Number(r.amount).toLocaleString()} RWF</div>
                      <div className="text-xs text-slate-500 mt-0.5">Member ID: {r.member_id} | Status: <span className={`font-medium ${r.status === 'APPROVED' ? 'text-emerald-600' : r.status === 'REJECTED' ? 'text-red-600' : 'text-amber-600'}`}>{r.status}</span></div>
                    </div>

                    {isCommitteeMember && r.status === 'PENDING' && (
                      <div className="flex gap-2">
                        <button 
                          onClick={() => handleRepaymentApproval(r.id, 'APPROVE')} 
                          disabled={repaymentActionLoading[r.id]}
                          className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700"
                        >
                          Approve
                        </button>
                        <button 
                          onClick={() => handleRepaymentApproval(r.id, 'REJECT')} 
                          disabled={repaymentActionLoading[r.id]}
                          className="px-3 py-1.5 bg-red-100 text-red-700 text-xs font-medium rounded-lg hover:bg-red-200"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'approvals' && isCommitteeMember && (
        <div className="p-6 bg-white rounded-xl border border-slate-200 shadow-sm space-y-6">
          <div>
            <h3 className="font-bold text-slate-800 text-lg">Pending Tier 2 Multi-Sig Queue</h3>
            <p className="text-xs text-slate-500">Tier 2 development loans require multi-signature approval from Chairperson, Treasurer, and Auditor.</p>
          </div>

          {approvalMessage && <div className="p-3 bg-emerald-50 text-emerald-800 rounded-lg text-sm flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />{approvalMessage}</div>}
          {approvalError && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm flex items-center gap-2"><AlertCircle className="w-4 h-4" />{approvalError}</div>}

          {pendingCommitteeLoans.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-slate-200 rounded-xl text-slate-500 text-sm">
              No pending Tier 2 loan applications awaiting committee approval.
            </div>
          ) : (
            <div className="space-y-4">
              {pendingCommitteeLoans.map((loan) => {
                const userSigned = hasUserApproved(loan);
                const isLoading = !!approvalLoading[loan.id];

                return (
                  <div key={loan.id} className="p-5 border border-slate-200 rounded-xl bg-slate-50/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-slate-900 text-base">Loan #{loan.id}</span>
                        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
                          {loan.borrower_name || `Member #${loan.borrower_id}`}
                        </span>
                        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800">
                          Tier 2 Development
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600">
                        <div><strong className="text-slate-800">Amount:</strong> {Number(loan.principal_amount || loan.amount).toLocaleString()} RWF</div>
                        <div><strong className="text-slate-800">Duration:</strong> {loan.term_months || loan.duration_months} Months</div>
                      </div>

                      <div className="flex items-center gap-3 pt-2">
                        <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5" /> Signatures:
                        </span>
                        
                        <span className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 ${loan.approved_by_chairperson ? 'bg-emerald-100 text-emerald-800 font-medium' : 'bg-slate-200 text-slate-600'}`}>
                          {loan.approved_by_chairperson ? <Check className="w-3 h-3" /> : <Clock className="w-3 h-3" />} Chair
                        </span>

                        <span className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 ${loan.approved_by_treasurer ? 'bg-emerald-100 text-emerald-800 font-medium' : 'bg-slate-200 text-slate-600'}`}>
                          {loan.approved_by_treasurer ? <Check className="w-3 h-3" /> : <Clock className="w-3 h-3" />} Treasurer
                        </span>

                        <span className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 ${loan.approved_by_auditor ? 'bg-emerald-100 text-emerald-800 font-medium' : 'bg-slate-200 text-slate-600'}`}>
                          {loan.approved_by_auditor ? <Check className="w-3 h-3" /> : <Clock className="w-3 h-3" />} Auditor
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end md:self-center">
                      {userSigned ? (
                        <div className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 bg-emerald-100 text-emerald-800 rounded-lg">
                          <UserCheck className="w-4 h-4" /> Signed Off
                        </div>
                      ) : (
                        <button
                          onClick={() => handleCommitteeApproval(loan.id, 'APPROVE')}
                          disabled={isLoading}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs rounded-lg flex items-center gap-1 disabled:opacity-50 transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" /> {isLoading ? 'Processing...' : 'Approve'}
                        </button>
                      )}

                      <button
                        onClick={() => handleCommitteeApproval(loan.id, 'REJECT')}
                        disabled={isLoading}
                        className="px-3 py-2 bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-600 border border-slate-200 font-medium text-xs rounded-lg flex items-center gap-1 disabled:opacity-50 transition-colors"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
