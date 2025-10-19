import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Paper,
} from "@mui/material";
import {
  Dashboard,
  People,
  MenuBook,
  SwapHoriz,
  Settings,
  Assessment,
  History,
} from "@mui/icons-material";
import { useAuth } from "../../contexts/AuthContext";
import logo from "../../assets/images/logo.png";

const Sidebar = ({ onItemClick }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const handleNavigation = (path) => {
    navigate(path);
    if (onItemClick) onItemClick();
  };

  const isActive = (path) => {
    return (
      location.pathname === path || location.pathname.startsWith(path + "/")
    );
  };

  // Get role-specific dashboard path
  const getDashboardPath = () => {
    if (!user) return "/dashboard";

    switch (user.role) {
      case "admin":
        return "/admin/dashboard";
      case "librarian":
        return "/librarian/dashboard";
      case "staff":
        return "/staff/dashboard";
      case "student":
        return "/student/dashboard";
      default:
        return "/dashboard";
    }
  };

  const navigationItems = [
    {
      label: "Dashboard",
      icon: <Dashboard />,
      path: getDashboardPath(),
      roles: ["admin", "librarian", "staff", "student"],
    },
    {
      label: "Students",
      icon: <People />,
      path: "/students",
      roles: ["admin", "librarian", "staff"],
    },
    {
      label: "Users",
      icon: <People />,
      path: "/users",
      roles: ["admin"],
    },
    {
      label: "Books",
      icon: <MenuBook />,
      path: "/books",
      roles: ["admin", "librarian", "staff", "student"],
    },
    {
      label: "Transactions",
      icon: <SwapHoriz />,
      path: "/transactions",
      roles: ["admin", "librarian", "staff"],
    },
    {
      label: "Reports",
      icon: <Assessment />,
      path: "/reports",
      roles: ["admin", "librarian", "staff"],
    },
    {
      label: "Audit Logs",
      icon: <History />,
      path: "/audit-logs",
      roles: ["admin", "librarian"],
    },
    {
      label: "Settings",
      icon: <Settings />,
      path: "/settings",
      roles: ["admin"],
    },
  ];

  const hasPermission = (roles) => {
    return roles.includes(user?.role);
  };

  return (
    <Paper
      elevation={0}
      sx={{
        width: 240,
        height: "100vh",
        backgroundColor: "#FFFFFF",
        display: "flex",
        flexDirection: "column",
        position: "fixed",
        zIndex: 1200,
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.08)",
        borderRight: "1px solid #E2E8F0",
      }}
    >
      <Box
        sx={{
          p: 2,
          borderBottom: "1px solid #F1F5F9",
          background: "linear-gradient(135deg, #FAFBFC 0%, #F8FAFC 100%)",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <img
            src={logo}
            alt="Library System Logo"
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "4px",
              objectFit: "contain",
            }}
          />{" "}
          <Box>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                color: "#1E293B",
                fontSize: "1.1rem",
                lineHeight: 1.2,
              }}
            >
              {" "}
              Library System{" "}
            </Typography>{" "}
            <Typography
              variant="body2"
              sx={{ color: "#64748B", fontSize: "0.75rem", opacity: 0.8 }}
            >
              {" "}
              The School of Choice{" "}
            </Typography>{" "}
          </Box>{" "}
        </Box>{" "}
      </Box>{" "}
      <Box sx={{ flex: 1, overflowY: "auto", py: 0.5, px: 1 }}>
        <Typography
          variant="overline"
          sx={{
            color: "#94A3B8",
            fontWeight: 600,
            fontSize: "0.6rem",
            letterSpacing: "0.1em",
            mb: 0.5,
            px: 1,
            display: "block",
          }}
        >
          {" "}
          NAVIGATION{" "}
        </Typography>{" "}
        <List sx={{ p: 0 }}>
          {" "}
          {navigationItems
            .filter((item) => hasPermission(item.roles))
            .map((item) => {
              const active = isActive(item.path);
              return (
                <ListItem key={item.label} disablePadding sx={{ mb: 0.25 }}>
                  <ListItemButton
                    onClick={() => handleNavigation(item.path)}
                    selected={active}
                    sx={{
                      borderRadius: "6px",
                      py: 0.5,
                      px: 1,
                      minHeight: 28,
                      transition: "all 0.2s ease",
                      "&.Mui-selected": {
                        backgroundColor: "#22C55E",
                        color: "#FFFFFF",
                        "& .MuiListItemIcon-root": { color: "#FFFFFF" },
                        "&:hover": { backgroundColor: "#16A34A" },
                      },
                      "&:not(.Mui-selected):hover": {
                        backgroundColor: "#F8FAFC",
                        "& .MuiListItemIcon-root": { color: "#305FB7" },
                      },
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        color: active ? "#FFFFFF" : "#64748B",
                        minWidth: 24,
                        "& svg": { fontSize: "0.9rem" },
                      }}
                    >
                      {" "}
                      {item.icon}{" "}
                    </ListItemIcon>{" "}
                    <ListItemText
                      primary={item.label}
                      sx={{
                        "& .MuiTypography-root": {
                          fontSize: "0.75rem",
                          fontWeight: active ? 600 : 500,
                          color: active ? "#FFFFFF" : "#374151",
                        },
                      }}
                    />{" "}
                  </ListItemButton>{" "}
                </ListItem>
              );
            })}{" "}
        </List>{" "}
      </Box>{" "}
    </Paper>
  );
};

export default Sidebar;
