import React, { useEffect, useRef, useState } from "react";
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
  Popper,
  Paper,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  CircularProgress,
  ClickAwayListener,
  Chip,
  Fade,
} from "@mui/material";
import {
  Menu as MenuIcon,
  Search,
  Notifications,
  AccountCircle,
  ExitToApp,
  KeyboardArrowDown,
  MenuBook,
  People,
  SwapHoriz,
  School,
  InfoOutlined,
} from "@mui/icons-material";
import { useAuth } from "../../contexts/AuthContext";
import { searchAPI, notificationsAPI } from "../../utils/api";
import Sidebar from "./Sidebar";

const SEARCH_SECTION_LABELS = {
  books: "Books",
  users: "Staff & Users",
  students: "Students",
  transactions: "Transactions",
};

const NOTIFICATION_SEVERITY_COLORS = {
  high: "#EF4444",
  medium: "#F97316",
  low: "#10B981",
  info: "#3B82F6",
};

const getSeverityColor = (severity) =>
  NOTIFICATION_SEVERITY_COLORS[severity] || NOTIFICATION_SEVERITY_COLORS.info;

const formatRelativeTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  const label = (count, unit) => `${count} ${unit}${count === 1 ? "" : "s"}`;

  if (abs < minute) {
    return diff >= 0 ? "in under a minute" : "just now";
  }

  if (abs < hour) {
    const minutes = Math.round(abs / minute);
    return diff >= 0
      ? `in ${label(minutes, "minute")}`
      : `${label(minutes, "minute")} ago`;
  }

  if (abs < day) {
    const hours = Math.round(abs / hour);
    return diff >= 0
      ? `in ${label(hours, "hour")}`
      : `${label(hours, "hour")} ago`;
  }

  const days = Math.round(abs / day);
  return diff >= 0 ? `in ${label(days, "day")}` : `${label(days, "day")} ago`;
};

const commonSearchSx = {
  "& .MuiOutlinedInput-root": {
    backgroundColor: "#FFFFFF",
    borderRadius: "10px",
    boxShadow: "0 1px 8px rgba(15, 23, 42, 0.08)",
    border: "1px solid #E2E8F0",
    transition: "all 0.2s ease",
    "& fieldset": {
      borderColor: "transparent",
    },
    "&:hover": {
      boxShadow: "0 2px 14px rgba(15, 23, 42, 0.12)",
      "& fieldset": {
        borderColor: "#305FB7",
      },
    },
    "&.Mui-focused": {
      boxShadow: "0 4px 16px rgba(37, 99, 235, 0.16)",
      "& fieldset": {
        borderColor: "#305FB7",
        borderWidth: "1px",
      },
    },
  },
  "& .MuiInputBase-input": {
    py: 1,
    fontSize: "0.9rem",
    color: "#0F172A",
    "&::placeholder": {
      color: "#94A3B8",
      opacity: 1,
    },
  },
};

const baseNotificationButtonSx = {
  backgroundColor: "#F8FAFC",
  border: "1px solid #E2E8F0",
  color: "#64748B",
  width: 40,
  height: 40,
  borderRadius: "12px",
  transition: "all 0.2s ease",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  "&:hover": {
    backgroundColor: "#EEF2FF",
    borderColor: "#CBD5E1",
    transform: "translateY(-1px)",
    boxShadow: "0 4px 12px rgba(15, 23, 42, 0.15)",
  },
};

const Layout = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("lg"));
  const isSmall = useMediaQuery(theme.breakpoints.down("sm"));
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [searchValue, setSearchValue] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const searchInputRef = useRef(null);
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState("");
  const [notificationsAnchorEl, setNotificationsAnchorEl] = useState(null);
  const [notificationsFetchedAt, setNotificationsFetchedAt] = useState(null);

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

  const handleSearchChange = (event) => {
    const value = event.target.value;
    setSearchValue(value);
    if (!value.trim()) {
      setSearchOpen(false);
      setSearchResults([]);
      setSearchError("");
    }
  };

  const handleSearchFocus = () => {
    if ((searchResults.length > 0 || searchError) && searchValue.trim()) {
      setSearchOpen(true);
    }
  };

  const handleSearchClose = () => {
    setSearchOpen(false);
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === "Escape") {
      setSearchOpen(false);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const firstItem = searchResults[0]?.items?.[0];
      if (firstItem) {
        handleSearchResultClick(firstItem);
      }
    }
  };

  const handleSearchResultClick = (item) => {
    if (!item?.link) {
      return;
    }
    navigate(item.link);
    setSearchOpen(false);
    setSearchResults([]);
    setSearchValue("");
  };

  const renderSectionIcon = (key) => {
    switch (key) {
      case "books":
        return <MenuBook fontSize="small" sx={{ color: "#2563EB" }} />;
      case "users":
        return <People fontSize="small" sx={{ color: "#7C3AED" }} />;
      case "students":
        return <School fontSize="small" sx={{ color: "#059669" }} />;
      case "transactions":
        return <SwapHoriz fontSize="small" sx={{ color: "#F97316" }} />;
      default:
        return <InfoOutlined fontSize="small" sx={{ color: "#64748B" }} />;
    }
  };

  const loadNotifications = async () => {
    try {
      setNotificationsLoading(true);
      const { data } = await notificationsAPI.getAll({ limit: 10 });
      const items = Array.isArray(data?.notifications)
        ? data.notifications.map((item) => ({ ...item, read: false }))
        : [];
      setNotifications(items);
      setNotificationsError("");
      setNotificationsFetchedAt(Date.now());
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
      setNotificationsError(
        error?.response?.data?.message || "Failed to load notifications."
      );
    } finally {
      setNotificationsLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const handleNotificationsOpen = (event) => {
    setNotificationsAnchorEl(event.currentTarget);
    const staleAfter = 5 * 60 * 1000;
    if (!notificationsFetchedAt || Date.now() - notificationsFetchedAt > staleAfter) {
      loadNotifications();
    }
  };

  const handleNotificationsClose = () => {
    setNotificationsAnchorEl(null);
    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
  };

  const handleNotificationNavigate = (item) => {
    handleNotificationsClose();
    if (item?.link) {
      navigate(item.link);
    }
  };

  useEffect(() => {
    const trimmed = searchValue.trim();
    if (!trimmed) {
      setSearchResults([]);
      setSearchError("");
      setSearchLoading(false);
      return;
    }

    let isActive = true;
    setSearchLoading(true);
    setSearchError("");

    const handler = setTimeout(() => {
      searchAPI
        .global({ q: trimmed, limit: 6 })
        .then((response) => {
          if (!isActive) return;
          const data = response?.data || {};
          const sections = Object.entries(data.results || {})
            .filter(([, items]) => Array.isArray(items) && items.length > 0)
            .map(([key, items]) => ({ key, items }));

          setSearchResults(sections);
          setSearchOpen(true);
        })
        .catch((error) => {
          if (!isActive) return;
          console.error("Global search failed:", error);
          setSearchResults([]);
          setSearchError(
            error?.response?.data?.message || "Search failed. Please try again."
          );
          setSearchOpen(true);
        })
        .finally(() => {
          if (isActive) {
            setSearchLoading(false);
          }
        });
    }, 250);

    return () => {
      isActive = false;
      clearTimeout(handler);
    };
  }, [searchValue]);

  const unreadCount = notifications.reduce(
    (acc, item) => acc + (item.read ? 0 : 1),
    0,
  );

  const userInitial = (user?.firstName || user?.username || "U")
    .toString()
    .charAt(0)
    .toUpperCase();
  const userDisplayName = (() => {
    const composed = [user?.firstName, user?.lastName]
      .filter((value) => Boolean(value && value.trim()))
      .join(" ");
    if (composed) return composed;
    if (user?.username) return user.username;
    if (user?.email) return user.email;
    return "Account";
  })();
  const userRoleLabel = user?.role
    ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
    : "Member";

  const profileTrigger = isSmall ? (
    <IconButton
      onClick={handleProfileMenuOpen}
      aria-label="Account menu"
      sx={{
        ...baseNotificationButtonSx,
        borderRadius: "50%",
        width: 42,
        height: 42,
      }}
    >
      <Avatar
        sx={{
          width: 30,
          height: 30,
          backgroundColor: "#2563EB",
          fontSize: "0.85rem",
          fontWeight: 600,
          boxShadow: "0 2px 6px rgba(37, 99, 235, 0.35)",
        }}
      >
        {userInitial}
      </Avatar>
    </IconButton>
  ) : (
    <Box
      onClick={handleProfileMenuOpen}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        cursor: "pointer",
        px: 1.5,
        py: 0.75,
        borderRadius: "10px",
        backgroundColor: "#F8FAFC",
        border: "1px solid #E2E8F0",
        transition: "all 0.2s ease",
        minWidth: 160,
        "&:hover": {
          backgroundColor: "#EEF2FF",
          borderColor: "#CBD5E1",
          boxShadow: "0 4px 12px rgba(15, 23, 42, 0.12)",
          transform: "translateY(-1px)",
        },
      }}
    >
      <Avatar
        sx={{
          width: 32,
          height: 32,
          backgroundColor: "#2563EB",
          fontSize: "0.85rem",
          fontWeight: 600,
          boxShadow: "0 2px 6px rgba(37, 99, 235, 0.35)",
        }}
      >
        {userInitial}
      </Avatar>
      <Box sx={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Typography
          variant="body2"
          sx={{
            fontWeight: 600,
            color: "#0F172A",
            fontSize: "0.8rem",
            lineHeight: 1.2,
            textOverflow: "ellipsis",
            overflow: "hidden",
            whiteSpace: "nowrap",
          }}
        >
          {userDisplayName}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            color: "#64748B",
            fontSize: "0.7rem",
            letterSpacing: "0.02em",
            textTransform: "capitalize",
          }}
        >
          {userRoleLabel}
        </Typography>
      </Box>
      <KeyboardArrowDown sx={{ fontSize: 18, color: "#94A3B8" }} />
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", width: "100%" }}>
      {/* Sidebar - Desktop */}
      {!isMobile && <Sidebar />}
      {/* Mobile Sidebar Drawer */}
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
          <Sidebar onItemClick={() => setMobileOpen(false)} />
        </Box>
      )}
      {/* Overlay for mobile */}
      {isMobile && mobileOpen && (
        <Box
          sx={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            zIndex: 1250,
          }}
          onClick={() => setMobileOpen(false)}
        />
      )}
      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          ml: isMobile ? 0 : "240px", // Sidebar width only on desktop
          minHeight: "100vh",
          minWidth: 0,
          backgroundColor: "#305FB7",
        }}
      >
        {/* Header */}
        <AppBar
          position="sticky"
          elevation={0}
          sx={{
            backgroundColor: "#FFFFFF",
            backdropFilter: "blur(20px)",
            borderBottom: "1px solid rgba(0, 0, 0, 0.05)",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
            borderRadius: 0,
            width: "100%",
            boxSizing: "border-box",
          }}
        >
          <Toolbar
            sx={{
              width: "100%",
              px: { xs: 2, md: 3 },
              py: { xs: 1.25, md: 1 },
              minHeight: "64px !important",
              flexWrap: "wrap",
              gap: { xs: 1, sm: 2 },
              alignItems: "center",
            }}
          >
            {isSmall ? (
              <>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    gap: 1.5,
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                    {isMobile && (
                      <IconButton
                        edge="start"
                        aria-label="Toggle navigation"
                        onClick={handleDrawerToggle}
                        sx={{
                          ...baseNotificationButtonSx,
                          borderRadius: "12px",
                          width: 44,
                          height: 44,
                          color: "#1E293B",
                        }}
                      >
                        <MenuIcon />
                      </IconButton>
                    )}
                    <Box sx={{ display: "flex", flexDirection: "column" }}>
                      <Typography
                        variant="subtitle2"
                        sx={{
                          fontWeight: 700,
                          color: "#0F172A",
                          letterSpacing: "0.02em",
                        }}
                      >
                        OLMS Library
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ color: "#64748B", fontSize: "0.68rem" }}
                      >
                        Welcome back, {userDisplayName}
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <IconButton
                      aria-label="Open notifications"
                      onClick={handleNotificationsOpen}
                      aria-haspopup="true"
                      aria-controls={
                        notificationsAnchorEl ? "notifications-menu" : undefined
                      }
                      sx={{
                        ...baseNotificationButtonSx,
                        width: 44,
                        height: 44,
                      }}
                    >
                      <Badge
                        badgeContent={unreadCount}
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
                        <Notifications sx={{ fontSize: 20 }} />
                      </Badge>
                    </IconButton>
                    {profileTrigger}
                  </Box>
                </Box>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Search by title, author, student, etc."
                  value={searchValue}
                  onChange={handleSearchChange}
                  onFocus={handleSearchFocus}
                  onKeyDown={handleSearchKeyDown}
                  inputRef={searchInputRef}
                  autoComplete="off"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Search sx={{ color: "#64748B", fontSize: 18 }} />
                      </InputAdornment>
                    ),
                  }}
                  sx={{
                    ...commonSearchSx,
                    mt: 1,
                  }}
                />
                <Box
                  sx={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    flexWrap: "wrap",
                    mt: 1,
                  }}
                >
                  <Chip
                    icon={<KeyboardArrowDown sx={{ fontSize: 18 }} />}
                    label="Last 2 days"
                    sx={{
                      backgroundColor: "#F8FAFC",
                      border: "1px solid #E2E8F0",
                      fontSize: "0.7rem",
                      height: 32,
                      pr: 1,
                      "& .MuiChip-icon": { color: "#64748B" },
                    }}
                  />
                  <Chip
                    label={userRoleLabel}
                    sx={{
                      backgroundColor: "#EEF2FF",
                      border: "1px solid #CBD5E1",
                      fontSize: "0.7rem",
                      height: 32,
                      color: "#334155",
                      textTransform: "capitalize",
                    }}
                  />
                </Box>
              </>
            ) : (
              <>
                {isMobile && (
                  <IconButton
                    edge="start"
                    aria-label="Toggle navigation"
                    onClick={handleDrawerToggle}
                    sx={{
                      ...baseNotificationButtonSx,
                      borderRadius: "12px",
                      width: 44,
                      height: 44,
                      color: "#1E293B",
                      mr: 2,
                    }}
                  >
                    <MenuIcon />
                  </IconButton>
                )}
                <Box
                  sx={{
                    flexGrow: { sm: 1, md: 0 },
                    width: { sm: "100%", md: "auto" },
                    maxWidth: { sm: "100%", md: 420 },
                    mr: { sm: 0, md: 3 },
                  }}
                >
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Search by title, author, student, etc."
                    value={searchValue}
                    onChange={handleSearchChange}
                    onFocus={handleSearchFocus}
                    onKeyDown={handleSearchKeyDown}
                    inputRef={searchInputRef}
                    autoComplete="off"
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <Search sx={{ color: "#64748B", fontSize: 18 }} />
                        </InputAdornment>
                      ),
                    }}
                    sx={commonSearchSx}
                  />
                </Box>
                <Box
                  sx={{
                    width: "1px",
                    height: 36,
                    backgroundColor: "#E2E8F0",
                    opacity: 0.8,
                    display: { sm: "none", lg: "block" },
                    mr: { lg: 3 },
                  }}
                />
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    ml: "auto",
                  }}
                >
                  <Chip
                    icon={<KeyboardArrowDown sx={{ fontSize: 18 }} />}
                    label="Last 2 days"
                    sx={{
                      backgroundColor: "#F8FAFC",
                      border: "1px solid #E2E8F0",
                      fontSize: "0.72rem",
                      height: 34,
                      pr: 1,
                      "& .MuiChip-icon": { color: "#64748B" },
                    }}
                  />
                  <IconButton
                    aria-label="Open notifications"
                    onClick={handleNotificationsOpen}
                    aria-haspopup="true"
                    aria-controls={
                      notificationsAnchorEl ? "notifications-menu" : undefined
                    }
                    sx={{ ...baseNotificationButtonSx }}
                  >
                    <Badge
                      badgeContent={unreadCount}
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
                      <Notifications sx={{ fontSize: 20 }} />
                    </Badge>
                  </IconButton>
                  {profileTrigger}
                </Box>
              </>
            )}
            {/* Profile Menu */}
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
                Profile
              </MenuItem>
              <MenuItem onClick={handleLogout}>
                <ExitToApp sx={{ mr: 2 }} />
                Logout
              </MenuItem>
            </Menu>
            <Menu
                id="notifications-menu"
                anchorEl={notificationsAnchorEl}
                open={Boolean(notificationsAnchorEl)}
                onClose={handleNotificationsClose}
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
                    width: 340,
                    maxWidth: "95vw",
                    borderRadius: "10px",
                  },
                }}
              >
                <Box sx={{ px: 2, py: 1.5 }}>
                  <Typography
                    variant="subtitle2"
                    sx={{ fontWeight: 600, color: "#0F172A" }}
                  >
                    Notifications
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Latest updates from the library
                  </Typography>
                </Box>
                <Divider />
                {notificationsLoading ? (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      p: 2,
                    }}
                  >
                    <CircularProgress size={20} />
                  </Box>
                ) : notificationsError ? (
                  <Box sx={{ p: 2 }}>
                    <Typography
                      variant="body2"
                      color="error"
                      sx={{ cursor: "pointer" }}
                      onClick={loadNotifications}
                    >
                      {notificationsError} Tap to retry.
                    </Typography>
                  </Box>
                ) : notifications.length > 0 ? (
                  <List sx={{ maxHeight: 360, overflowY: "auto", py: 0 }}>
                    {notifications.map((item) => (
                      <ListItemButton
                        key={item.id}
                        onClick={() => handleNotificationNavigate(item)}
                        alignItems="flex-start"
                        sx={{ gap: 1.5, py: 1, px: 2 }}
                      >
                        <Box
                          sx={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            backgroundColor: getSeverityColor(item.severity || "info"),
                            mt: 0.75,
                          }}
                        />
                        <ListItemText
                          primary={item.title}
                          primaryTypographyProps={{
                            variant: "body2",
                            fontWeight: item.read ? 500 : 600,
                            color: "text.primary",
                          }}
                          secondary={
                            <Box component="span" sx={{ display: "block" }}>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ display: "block" }}
                              >
                                {item.message}
                              </Typography>
                              {item.timestamp ? (
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  sx={{ display: "block", mt: 0.5 }}
                                >
                                  {formatRelativeTime(item.timestamp)}
                                </Typography>
                              ) : null}
                            </Box>
                          }
                        />
                        {!item.read ? (
                          <Chip
                            label="NEW"
                            size="small"
                            color="primary"
                            sx={{ fontSize: "0.625rem", height: 18 }}
                          />
                        ) : null}
                      </ListItemButton>
                    ))}
                  </List>
                ) : (
                  <Box sx={{ p: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      You're all caught up.
                    </Typography>
                  </Box>
                )}
              </Menu>
          </Toolbar>
        </AppBar>
        <Popper
          open={searchOpen && Boolean(searchInputRef.current)}
          anchorEl={searchInputRef.current}
          placement="bottom-start"
          transition
          modifiers={[{ name: "offset", options: { offset: [0, 8] } }]}
          sx={{ zIndex: 1400 }}
        >
          {({ TransitionProps }) => (
            <Fade {...TransitionProps} timeout={120}>
              <Paper
                elevation={3}
                sx={{
                  width: { xs: "100vw", sm: 420 },
                  maxWidth: "95vw",
                  borderRadius: "10px",
                  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.12)",
                  overflow: "hidden",
                }}
              >
                <ClickAwayListener onClickAway={handleSearchClose}>
                  <Box>
                    <Box sx={{ px: 2, py: 1.5 }}>
                      <Typography
                        variant="subtitle2"
                        sx={{ fontWeight: 600, color: "#0F172A" }}
                      >
                        Search
                      </Typography>
                      {searchValue.trim() ? (
                        <Typography variant="caption" color="text.secondary">
                          Results for "{searchValue.trim()}"
                        </Typography>
                      ) : null}
                    </Box>
                    <Divider />
                    {searchLoading ? (
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          p: 2,
                        }}
                      >
                        <CircularProgress size={20} />
                      </Box>
                    ) : searchError ? (
                      <Box sx={{ p: 2 }}>
                        <Typography variant="body2" color="error">
                          {searchError}
                        </Typography>
                      </Box>
                    ) : searchResults.length > 0 ? (
                      <List dense disablePadding>
                        {searchResults.map((section, index) => (
                          <Box key={section.key}>
                            <Box
                              sx={{
                                px: 2,
                                pt: index === 0 ? 1 : 1.5,
                                pb: 0.5,
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                                color: "#64748B",
                              }}
                            >
                              <Typography
                                variant="caption"
                                sx={{ fontWeight: 600, letterSpacing: "0.08em" }}
                              >
                                {SEARCH_SECTION_LABELS[section.key] || section.key}
                              </Typography>
                            </Box>
                            {section.items.map((item) => (
                              <ListItemButton
                                key={`${section.key}-${item.id}`}
                                onClick={() => handleSearchResultClick(item)}
                                alignItems="flex-start"
                                sx={{ px: 2, py: 1.25, gap: 1.5 }}
                              >
                                <ListItemIcon
                                  sx={{
                                    minWidth: 32,
                                    color: "#2563EB",
                                    mt: 0.25,
                                  }}
                                >
                                  {renderSectionIcon(section.key)}
                                </ListItemIcon>
                                <ListItemText
                                  primary={item.primary}
                                  primaryTypographyProps={{
                                    variant: "body2",
                                    fontWeight: 600,
                                    color: "text.primary",
                                  }}
                                  secondary={
                                    item.secondary ? (
                                      <Typography
                                        variant="caption"
                                        color="text.secondary"
                                        sx={{ display: "block", mt: 0.25 }}
                                      >
                                        {item.secondary}
                                      </Typography>
                                    ) : null
                                  }
                                />
                                {item.chip ? (
                                  <Chip
                                    label={item.chip}
                                    size="small"
                                    sx={{
                                      fontSize: "0.65rem",
                                      height: 18,
                                      backgroundColor: "#EFF6FF",
                                      color: "#1D4ED8",
                                    }}
                                  />
                                ) : null}
                              </ListItemButton>
                            ))}
                            {index < searchResults.length - 1 ? <Divider /> : null}
                          </Box>
                        ))}
                      </List>
                    ) : (
                      <Box sx={{ p: 2 }}>
                        <Typography variant="body2" color="text.secondary">
                          No results found.
                        </Typography>
                      </Box>
                    )}
                  </Box>
                </ClickAwayListener>
              </Paper>
            </Fade>
          )}
        </Popper>
        {/* Page Content */}
        <Box sx={{ p: { xs: 2, sm: 3, lg: 4 }, backgroundColor: "transparent" }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
};

export default Layout;
