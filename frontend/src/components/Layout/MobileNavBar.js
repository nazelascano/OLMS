import React, { useMemo } from "react";
import {
  BottomNavigation,
  BottomNavigationAction,
  Paper,
} from "@mui/material";
import {
  Dashboard,
  MenuBook,
  Notifications,
  SwapHoriz,
  AccountCircle,
} from "@mui/icons-material";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

const resolveDashboardPath = (role) => {
  switch ((role || "").toLowerCase()) {
    case "admin":
      return "/admin/dashboard";
    case "librarian":
      return "/librarian/dashboard";
    case "staff":
      return "/staff/dashboard";
    case "student":
      return "/student/dashboard";
    default:
      return "/login";
  }
};

const resolveTransactionsPath = (role) => {
  switch ((role || "").toLowerCase()) {
    case "admin":
    case "librarian":
    case "staff":
      return "/transactions";
    case "student":
      return "/transactions/request";
    default:
      return null;
  }
};

const MobileNavBar = ({ onNavigate }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const navItems = useMemo(() => {
    if (!user) {
      return [];
    }

    const role = user.role || "";
    const items = [];
    const dashboardPath = resolveDashboardPath(role);
    items.push({
      key: "dashboard",
      label: "Home",
      icon: <Dashboard fontSize="small" />,
      path: dashboardPath,
      matchers: ["/admin/dashboard", "/librarian/dashboard", "/staff/dashboard", "/student/dashboard"],
    });

    if (["librarian", "staff", "student"].includes(role)) {
      items.push({
        key: "books",
        label: "Books",
        icon: <MenuBook fontSize="small" />,
        path: "/books",
        matchers: ["/books"],
      });
    }

    const transactionsPath = resolveTransactionsPath(role);
    if (transactionsPath) {
      items.push({
        key: "transactions",
        label: "Records",
        icon: <SwapHoriz fontSize="small" />,
        path: transactionsPath,
        matchers: ["/transactions", "/annual-borrowing"],
      });
    }

    items.push({
      key: "notifications",
      label: "Alerts",
      icon: <Notifications fontSize="small" />,
      path: "/notifications",
      matchers: ["/notifications"],
    });

    items.push({
      key: "profile",
      label: "Profile",
      icon: <AccountCircle fontSize="small" />,
      path: "/profile",
      matchers: ["/profile"],
    });

    return items;
  }, [user]);

  const currentKey = useMemo(() => {
    const pathname = location.pathname || "/";
    const activeItem = navItems.find((item) => {
      if (!item.matchers || item.matchers.length === 0) {
        return pathname === item.path || pathname.startsWith(`${item.path}/`);
      }
      return item.matchers.some((matcher) => pathname.startsWith(matcher));
    });
    return activeItem?.key || navItems[0]?.key || "";
  }, [location.pathname, navItems]);

  const handleChange = (event, newValue) => {
    const target = navItems.find((item) => item.key === newValue);
    if (!target || !target.path) {
      return;
    }
    if (location.pathname !== target.path) {
      navigate(target.path);
    }
    if (typeof onNavigate === "function") {
      onNavigate(target.path);
    }
  };

  if (!navItems.length) {
    return null;
  }

  return (
    <Paper
      elevation={12}
      sx={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        borderTopLeftRadius: 18,
        borderTopRightRadius: 18,
        paddingBottom: "max(var(--safe-area-inset-bottom, 0px), 8px)",
        zIndex: 1500,
      }}
    >
      <BottomNavigation
        value={currentKey}
        onChange={handleChange}
        showLabels
        sx={{
          minHeight: 64,
          borderTop: "1px solid #E2E8F0",
          "& .MuiBottomNavigationAction-root": {
            minWidth: "auto",
            padding: "6px 8px",
            fontSize: "0.7rem",
          },
        }}
      >
        {navItems.map((item) => (
          <BottomNavigationAction
            key={item.key}
            value={item.key}
            icon={item.icon}
            label={item.label}
          />
        ))}
      </BottomNavigation>
    </Paper>
  );
};

export default MobileNavBar;
