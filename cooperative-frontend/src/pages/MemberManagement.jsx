// src/pages/MemberManagement.jsx
import { useState, useEffect, useCallback } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import {
  Users,
  Search,
  RefreshCw,
  AlertCircle,
  ShieldCheck,
  Mail,
  Phone,
  ArrowUpDown,
  Edit2,
  Check,
  X,
} from "lucide-react";

export default function MemberManagement() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("directory"); // 'directory' or 'rotation'
  const [members, setMembers] = useState([]);
  const [rotationQueue, setRotationQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Turn override modal state
  const [editingQueueItem, setEditingQueueItem] = useState(null);
  const [newPosition, setNewPosition] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Member edit modal state
  const [editingMember, setEditingMember] = useState(null);
  const [memberFormData, setMemberFormData] = useState({
    full_name: "",
    email: "",
    phone_number: "",
    role: "MEMBER",
    status: "ACTIVE",
  });
  const [savingMember, setSavingMember] = useState(false);

  const userRole = user?.role ? String(user.role).trim().toUpperCase() : "";
  const isCommitteeMember = ["CHAIRPERSON", "TREASURER", "AUDITOR"].includes(
    userRole,
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const [memRes, rotRes] = await Promise.all([
        api.get("/members"),
        api.get("/members/rotation-queue").catch(() => ({ data: [] })),
      ]);
      setMembers(Array.isArray(memRes.data) ? memRes.data : []);
      setRotationQueue(Array.isArray(rotRes.data) ? rotRes.data : []);
    } catch (err) {
      setError(
        err.response?.data?.error || "Failed to load member management data.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    Promise.resolve().then(() => {
      if (isMounted) {
        fetchData();
      }
    });
    return () => {
      isMounted = false;
    };
  }, [fetchData]);

  const handleTurnOverride = async (e) => {
    e.preventDefault();
    if (!editingQueueItem || !newPosition) return;
    setSubmitting(true);
    setError(null);

    try {
      await api.post("/members/rotation/override", {
        queueId: editingQueueItem.id,
        newPosition: parseInt(newPosition, 10),
        role: userRole,
      });
      setMessage(
        `Successfully updated turn position for ${editingQueueItem.full_name}.`,
      );
      setEditingQueueItem(null);
      setNewPosition("");
      await fetchData();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to update turn position.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateMember = async (e) => {
    e.preventDefault();
    if (!editingMember) return;
    setSavingMember(true);
    setError(null);
    setMessage(null);

    try {
      await api.put(`/members/${editingMember.id}`, memberFormData);
      setMessage(
        `Successfully updated profile for ${memberFormData.full_name}.`,
      );
      setEditingMember(null);
      await fetchData();
    } catch (err) {
      try {
        await api.put(`/members/${editingMember.id}/profile`, memberFormData);
        setMessage(
          `Successfully updated profile for ${memberFormData.full_name}.`,
        );
        setEditingMember(null);
        await fetchData();
      } catch (innerErr) {
        setError(
          innerErr.response?.data?.error ||
            err.response?.data?.error ||
            "Failed to update member profile.",
        );
      }
    } finally {
      setSavingMember(false);
    }
  };

  const filteredMembers = members.filter(
    (m) =>
      m.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(m.member_number || "")
        .toLowerCase()
        .includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-coop-primary rounded-xl">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Member & Rotation Management
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Manage cooperative member directory and ROSCA payout rotation
              queue.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-sm rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-6">
        <button
          onClick={() => setActiveTab("directory")}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "directory"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Member Directory ({members.length})
        </button>
        <button
          onClick={() => setActiveTab("rotation")}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "rotation"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Payout Rotation Queue ({rotationQueue.length})
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}

      {message && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm flex items-center gap-2">
          <Check className="w-5 h-5 flex-shrink-0" />
          {message}
        </div>
      )}

      {activeTab === "directory" ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, email, or member number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-transparent border-none text-sm focus:outline-none text-slate-800 placeholder-slate-400"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Member #</th>
                  <th className="py-3 px-4">
                    Full Name{" "}
                    {isCommitteeMember && (
                      <span className="text-[10px] font-normal text-blue-600 lowercase">
                        (click name to edit)
                      </span>
                    )}
                  </th>
                  <th className="py-3 px-4">Email / Contact</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loading ? (
                  <tr>
                    <td colSpan="5" className="py-8 text-center text-slate-500">
                      Loading member directory...
                    </td>
                  </tr>
                ) : filteredMembers.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-8 text-center text-slate-500">
                      No members match your search.
                    </td>
                  </tr>
                ) : (
                  filteredMembers.map((member) => (
                    <tr
                      key={member.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-700">
                        {member.member_number || `#${member.id}`}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-900">
                        {isCommitteeMember ? (
                          <button
                            onClick={() => {
                              setEditingMember(member);
                              setMemberFormData({
                                full_name: member.full_name || "",
                                email: member.email || "",
                                phone_number: member.phone_number || "",
                                role: member.role || "MEMBER",
                                status: member.status || "ACTIVE",
                              });
                            }}
                            className="text-left text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1.5 group transition-colors"
                            title="Click to edit member profile"
                          >
                            <span>{member.full_name}</span>
                            <Edit2 className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        ) : (
                          member.full_name
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 space-y-0.5">
                        <div className="flex items-center gap-1.5 text-xs">
                          <Mail className="w-3.5 h-3.5 text-slate-400" />{" "}
                          {member.email}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />{" "}
                          {member.phone_number || "N/A"}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono font-bold ${
                            ["CHAIRPERSON", "TREASURER", "AUDITOR"].includes(
                              member.role,
                            )
                              ? "bg-purple-100 text-purple-800"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          <ShieldCheck className="w-3 h-3" />
                          {member.role || "MEMBER"}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                            member.status === "ACTIVE"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {member.status || "ACTIVE"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <ArrowUpDown className="w-4 h-4 text-blue-600" />
              Active ROSCA Payout Queue & Bidding Positions
            </div>
            {isCommitteeMember && (
              <span className="text-xs bg-purple-100 text-purple-800 px-2.5 py-1 rounded-full font-medium">
                Committee Override Enabled
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Turn #</th>
                  <th className="py-3 px-4">Member Name</th>
                  <th className="py-3 px-4">Bid Amount (RWF)</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Override Flag</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loading ? (
                  <tr>
                    <td colSpan="6" className="py-8 text-center text-slate-500">
                      Loading rotation queue...
                    </td>
                  </tr>
                ) : rotationQueue.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-8 text-center text-slate-500">
                      No rotation queue initialized for this cycle yet.
                    </td>
                  </tr>
                ) : (
                  rotationQueue.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-mono font-bold text-blue-600">
                        #{item.turn_position}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-900">
                        {item.full_name}{" "}
                        <span className="text-xs font-normal text-slate-500">
                          ({item.member_number})
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-700">
                        {Number(item.bid_amount || 0).toLocaleString()} RWF
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                            item.status === "CURRENT_TURN"
                              ? "bg-amber-100 text-amber-800 animate-pulse"
                              : item.status === "PAID_OUT"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs">
                        {item.is_manual_override ? (
                          <span className="text-purple-700 bg-purple-50 px-2 py-0.5 rounded font-medium">
                            Manual Override
                          </span>
                        ) : (
                          <span className="text-slate-400">Automated</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {isCommitteeMember && (
                          <button
                            onClick={() => {
                              setEditingQueueItem(item);
                              setNewPosition(item.turn_position);
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-600 rounded-lg text-xs font-medium transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" /> Edit Turn
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Turn Modal */}
      {editingQueueItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">
                Override Turn Position
              </h3>
              <button
                onClick={() => setEditingQueueItem(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-600">
              Adjusting turn position for{" "}
              <strong className="text-slate-900">
                {editingQueueItem.full_name}
              </strong>
              . This will be marked as a committee override.
            </p>
            <form onSubmit={handleTurnOverride} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  New Turn Position
                </label>
                <input
                  type="number"
                  min="1"
                  value={newPosition}
                  onChange={(e) => setNewPosition(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingQueueItem(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-lg transition-colors shadow-sm disabled:opacity-50"
                >
                  {submitting ? "Saving..." : "Save Override"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Member Profile Modal */}
      {editingMember && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Edit Member Profile
                </h3>
                <p className="text-xs text-slate-500">
                  Updating details for member #
                  {editingMember.member_number || editingMember.id}
                </p>
              </div>
              <button
                onClick={() => setEditingMember(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateMember} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  name="full_name"
                  value={memberFormData.full_name}
                  onChange={(e) =>
                    setMemberFormData({
                      ...memberFormData,
                      full_name: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={memberFormData.email}
                    onChange={(e) =>
                      setMemberFormData({
                        ...memberFormData,
                        email: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    name="phone_number"
                    value={memberFormData.phone_number}
                    onChange={(e) =>
                      setMemberFormData({
                        ...memberFormData,
                        phone_number: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Role
                  </label>
                  <select
                    name="role"
                    value={memberFormData.role}
                    onChange={(e) =>
                      setMemberFormData({
                        ...memberFormData,
                        role: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="MEMBER">MEMBER</option>
                    <option value="TREASURER">TREASURER</option>
                    <option value="CHAIRPERSON">CHAIRPERSON</option>
                    <option value="AUDITOR">AUDITOR</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Status
                  </label>
                  <select
                    name="status"
                    value={memberFormData.status}
                    onChange={(e) =>
                      setMemberFormData({
                        ...memberFormData,
                        status: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                    <option value="SUSPENDED">SUSPENDED</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingMember}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-lg transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                >
                  {savingMember ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
