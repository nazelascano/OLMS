import React, { useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Avatar,
  Menu,
  MenuItem,
  TextField,
  InputAdornment,
  Badge,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import {
  Menu as MenuIcon,
  Search,
  Notifications,
  AccountCircle,
  ExitToApp,
  KeyboardArrowDown,
} from "@mui/icons-material";
import { useAuth } from "../../contexts/AuthContext";
import Sidebar from "./Sidebar";

const Layout = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("lg"));
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [searchValue, setSearchValue] = useState("");

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleProfileMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleProfileMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login");
    } catch (error) {
      console.error("Logout failed:", error);
    }
    handleProfileMenuClose();
  };

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      {" "}
      {/* Sidebar - Desktop */} {!isMobile && <Sidebar />}
      {/* Mobile Sidebar Drawer */}{" "}
      {isMobile && (
        <Box
          sx={{
            position: "fixed",
            top: 0,
            left: mobileOpen ? 0 : "-240px",
            width: "240px",
            height: "100vh",
            zIndex: 1300,
            transition: "left 0.3s ease",
            backgroundColor: "#FFFFFF",
          }}
        >
          <Sidebar onItemClick={() => setMobileOpen(false)} />{" "}
        </Box>
      )}
      {/* Overlay for mobile */}{" "}
      {isMobile && mobileOpen && (
        <Box
          sx={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            zIndex: 1250,
          }}
          onClick={() => setMobileOpen(false)}
        />
      )}
      {/* Main Content */}{" "}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          ml: isMobile ? 0 : "240px", // Sidebar width only on desktop
          minHeight: "100vh",
          background: "linear-gradient(135deg, #305FB7 0%, #4F7BC9 100%)",
        }}
      >
        {/* Header */}{" "}
        <AppBar
          position="sticky"
          elevation={0}
          sx={{
            backgroundColor: "#FFFFFF",
            backdropFilter: "blur(20px)",
            borderBottom: "1px solid rgba(0, 0, 0, 0.05)",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
            borderRadius: 0,
          }}
        >
          <Toolbar sx={{ px: 3, py: 1, minHeight: "56px !important" }}>
            {" "}
            {/* Mobile Menu Button */}{" "}
            {isMobile && (
              <IconButton
                edge="start"
                color="inherit"
                aria-label="menu"
                onClick={handleDrawerToggle}
                sx={{ mr: 2, color: "#1E293B" }}
              >
                <MenuIcon />
              </IconButton>
            )}
            {/* Search Bar */}{" "}
            <Box sx={{ flexGrow: 1, maxWidth: 400, mr: 3 }}>
              <TextField
                fullWidth
                size="small"
                placeholder="Search Ex: Title, Author, Student, etc."
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search sx={{ color: "#64748B", fontSize: 18 }} />{" "}
                    </InputAdornment>
                  ),
                }}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    backgroundColor: "#FFFFFF",
                    borderRadius: "8px",
                    boxShadow: "0 1px 8px rgba(0, 0, 0, 0.06)",
                    border: "1px solid #E2E8F0",
                    "& fieldset": {
                      borderColor: "transparent",
                    },
                    "&:hover": {
                      boxShadow: "0 2px 12px rgba(0, 0, 0, 0.08)",
                      "& fieldset": {
                        borderColor: "#305FB7",
                      },
                    },
                    "&.Mui-focused": {
                      boxShadow: "0 2px 12px rgba(79, 142, 247, 0.15)",
                      "& fieldset": {
                        borderColor: "#305FB7",
                        borderWidth: "1px",
                      },
                    },
                  },
                  "& .MuiInputBase-input": {
                    py: 1,
                    fontSize: "0.85rem",
                    color: "#1E293B",
                    "&::placeholder": {
                      color: "#64748B",
                      opacity: 1,
                    },
                  },
                }}
              />{" "}
            </Box>
            {/* Separator Line */}{" "}
            <Box
              sx={{
                width: "1px",
                height: "24px",
                backgroundColor: "#E2E8F0",
                mr: 3,
              }}
            />
            {/* Right side - Last 2days dropdown, Notifications, User Profile */}{" "}
            <Box
              sx={{ display: "flex", alignItems: "center", gap: 2, ml: "auto" }}
            >
              {" "}
              {/* Last 2days Dropdown */}{" "}
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  color: "#64748B",
                  cursor: "pointer",
                  px: 2,
                  py: 1,
                  borderRadius: "8px",
                  backgroundColor: "#F8FAFC",
                  border: "1px solid #E2E8F0",
                  transition: "all 0.2s ease",
                  "&:hover": {
                    backgroundColor: "#F1F5F9",
                    borderColor: "#CBD5E1",
                    transform: "translateY(-1px)",
                    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
                  },
                }}
              >
                <Typography
                  variant="body2"
                  sx={{ fontSize: "0.75rem", fontWeight: 500 }}
                >
                  Last 2 days{" "}
                </Typography>{" "}
                <KeyboardArrowDown sx={{ fontSize: 16 }} />{" "}
              </Box>
              {/* Notifications */}{" "}
              <IconButton
                sx={{
                  backgroundColor: "#F8FAFC",
                  border: "1px solid #E2E8F0",
                  color: "#64748B",
                  width: 36,
                  height: 36,
                  borderRadius: "8px",
                  transition: "all 0.2s ease",
                  "&:hover": {
                    backgroundColor: "#F1F5F9",
                    borderColor: "#CBD5E1",
                    transform: "translateY(-1px)",
                    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
                  },
                }}
              >
                <Badge
                  badgeContent={0}
                  color="error"
                  sx={{
                    "& .MuiBadge-badge": {
                      backgroundColor: "#EF4444",
                      color: "#FFFFFF",
                      fontSize: "0.6rem",
                      minWidth: 16,
                      height: 16,
                    },
                  }}
                >
                  <Notifications sx={{ fontSize: 18 }} />{" "}
                </Badge>{" "}
              </IconButton>
              {/* User Profile */}{" "}
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  cursor: "pointer",
                  px: 1.5,
                  py: 0.75,
                  borderRadius: "8px",
                  backgroundColor: "#F8FAFC",
                  border: "1px solid #E2E8F0",
                  transition: "all 0.2s ease",
                  "&:hover": {
                    backgroundColor: "#F1F5F9",
                    borderColor: "#CBD5E1",
                    transform: "translateY(-1px)",
                    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
                  },
                }}
                onClick={handleProfileMenuOpen}
              >
                <Avatar
                  sx={{
                    width: 28,
                    height: 28,
                    backgroundColor: "#22C55E",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    boxShadow: "0 1px 4px rgba(34, 197, 94, 0.3)",
                  }}
                >
                  {user?.firstName?.[0] || "A"}{" "}
                </Avatar>{" "}
                <Box sx={{ display: { xs: "none", md: "block" } }}>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 600,
                      color: "#1E293B",
                      fontSize: "0.75rem",
                    }}
                  >
                    admin{" "}
                  </Typography>{" "}
                  <Typography
                    variant="caption"
                    sx={{ color: "#64748B", fontSize: "0.65rem" }}
                  >
                    System{" "}
                  </Typography>{" "}
                </Box>{" "}
              </Box>
              {/* Profile Menu */}{" "}
              <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleProfileMenuClose}
                anchorOrigin={{
                  vertical: "bottom",
                  horizontal: "right",
                }}
                transformOrigin={{
                  vertical: "top",
                  horizontal: "right",
                }}
                PaperProps={{
                  sx: {
                    mt: 1,
                    borderRadius: "4px",
                    minWidth: 180,
                  },
                }}
              >
                <MenuItem onClick={() => navigate("/profile")}>
                  <AccountCircle sx={{ mr: 2 }} />
                  Profile{" "}
                </MenuItem>{" "}
                <MenuItem onClick={handleLogout}>
                  <ExitToApp sx={{ mr: 2 }} />
                  Logout{" "}
                </MenuItem>{" "}
              </Menu>{" "}
            </Box>{" "}
          </Toolbar>{" "}
        </AppBar>
        {/* Page Content */}{" "}
        <Box sx={{ p: 4, backgroundColor: "transparent" }}>
          <Outlet />
        </Box>{" "}
      </Box>{" "}
    </Box>
  );
};

export default Layout;
