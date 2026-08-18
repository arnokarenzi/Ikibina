// src/components/Navbar.jsx
import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  Shield,
  LayoutDashboard,
  Coins,
  CreditCard,
  BookOpen,
  Users,
  UserCheck,
  CheckSquare,
  LogOut,
} from "lucide-react";

const COMMITTEE_ROLES = ["CHAIRPERSON", "TREASURER", "AUDITOR"];

export default function Navbar() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const userRole = user?.role ? String(user.role).trim().toUpperCase() : "";
  const isCommittee = COMMITTEE_ROLES.includes(userRole);

  // Split navigation items based on role
  const standardLinks = [
    { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
    { label: "My Savings", path: "/contributions", icon: Coins },
    { label: "My Loans", path: "/loans", icon: CreditCard },
    {
      label: "Guarantor Requests",
      path: "/guarantor-requests",
      icon: UserCheck,
    },
  ];

  const committeeLinks = [
    { label: "Ledger Audit", path: "/ledger", icon: BookOpen },
    { label: "Member Mgmt", path: "/members", icon: Users },
  ];

  const navItems = isCommittee
    ? [...standardLinks, ...committeeLinks]
    : standardLinks;

  return (
    <header className="bg-coop-primary text-white shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/dashboard" className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <Shield className="w-6 h-6 text-blue-200" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight">
                Ikibina Manager
              </span>
              <span className="hidden sm:block text-xs text-blue-200">
                Cooperative Financial Portal
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-blue-900 text-white shadow-inner"
                      : "text-blue-100 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-4">
            {/* Clickable Profile Link */}
            <Link
              to="/profile"
              title="Go to Profile"
              className="hidden sm:flex flex-col text-right hover:opacity-85 transition-opacity group cursor-pointer"
            >
              <span className="text-sm font-semibold group-hover:underline">
                {user?.full_name || "Guest"}
              </span>
              <span className="text-xs bg-blue-800 text-blue-200 px-2 py-0.5 rounded-full inline-block self-end font-mono">
                {userRole || "MEMBER"}
              </span>
            </Link>

            <button
              onClick={logout}
              title="Sign Out"
              className="p-2 text-blue-100 hover:text-white hover:bg-red-700/80 rounded-lg transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
