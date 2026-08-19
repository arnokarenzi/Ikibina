// src/App.jsx
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Contributions from "./pages/Contributions";
import Loans from "./pages/Loans";
import GuarantorRequests from "./pages/GuarantorRequests";
import LedgerAudit from "./pages/LedgerAudit";
import MemberManagement from "./pages/MemberManagement";
import Profile from "./pages/Profile";

// Upgraded ProtectedRoute with RBAC support
function ProtectedRoute({ children, allowedRoles }) {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;

  if (allowedRoles) {
    const userRole = String(user.role).trim().toUpperCase();
    if (!allowedRoles.includes(userRole)) {
      // Redirect unauthorized users back to their dashboard
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <Layout>{children}</Layout>;
}

export default function App() {
  const COMMITTEE_ROLES = ["CHAIRPERSON", "TREASURER", "AUDITOR"];

  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />

          {/* Universal Authenticated Routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/contributions"
            element={
              <ProtectedRoute>
                <Contributions />
              </ProtectedRoute>
            }
          />
          <Route
            path="/loans"
            element={
              <ProtectedRoute>
                <Loans />
              </ProtectedRoute>
            }
          />
          <Route
            path="/guarantor-requests"
            element={
              <ProtectedRoute>
                <GuarantorRequests />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />

          {/* Committee-Only Routes */}
          <Route
            path="/ledger"
            element={
              <ProtectedRoute allowedRoles={COMMITTEE_ROLES}>
                <LedgerAudit />
              </ProtectedRoute>
            }
          />
          <Route
            path="/members"
            element={
              <ProtectedRoute allowedRoles={COMMITTEE_ROLES}>
                <MemberManagement />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
