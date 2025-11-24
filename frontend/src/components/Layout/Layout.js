import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
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
import { api, searchAPI, notificationsAPI } from "../../utils/api";
import Sidebar from "./Sidebar";
import { SCAN_EVENT, dispatchScanEvent } from "../../utils/scanEvents";

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

const NOTIFICATION_READ_STORAGE_PREFIX = "olms.notification.read.v1";

const getNotificationFingerprint = (item) => {
  if (!item || typeof item !== "object") {
    return null;
  }

  const candidates = [
    item.id,
    item._id,
    item.transactionId,
    item?.meta?.transactionId,
    item?.link ? `${item.type || "notification"}:${item.link}` : null,
  ];

  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null) {
      const normalized = String(candidate).trim();
      if (normalized) {
        return normalized;
      }
    }
  }

  if (item.title || item.message) {
    return `${item.type || "notification"}:${item.title || ""}:${item.message || ""}`;
  }

  return null;
};

const INPUT_SELECTOR =
  'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), [contenteditable="true"]';

const isHtmlInputElement = (element) =>
  element instanceof HTMLInputElement && element.type !== "hidden" && !element.disabled;

const isHtmlTextAreaElement = (element) =>
  element instanceof HTMLTextAreaElement && !element.disabled;

const isHtmlSelectElement = (element) =>
  element instanceof HTMLSelectElement && !element.disabled;

const isContentEditableElement = (element) =>
  element instanceof HTMLElement && element.isContentEditable;

const isEligibleInputElement = (element) => {
  if (!element) return false;
  if (
    !(isHtmlInputElement(element) ||
      isHtmlTextAreaElement(element) ||
      isHtmlSelectElement(element) ||
      isContentEditableElement(element))
  ) {
    return false;
  }

  if (typeof window === "undefined") {
    return true;
  }

  const style = window.getComputedStyle(element);
  if (!style || style.visibility === "hidden" || style.display === "none") {
    return false;
  }

  const rect = element.getBoundingClientRect();
  if ((rect.width || rect.height) === 0) {
    return false;
  }

  return true;
};

const collectInputCandidates = () => {
  if (typeof document === "undefined") return [];
  const nodes = Array.from(document.querySelectorAll(INPUT_SELECTOR));
  return nodes.filter((node) => isEligibleInputElement(node));
};

const findInputAtCoordinates = (x, y) => {
  if (typeof document === "undefined" || typeof document.elementsFromPoint !== "function") {
    return null;
  }
  const stack = document.elementsFromPoint(x, y);
  return stack.find((element) => isEligibleInputElement(element)) || null;
};

const findClosestInputCandidate = (x, y, candidates) => {
  let closest = null;
  let minDistance = Number.POSITIVE_INFINITY;

  candidates.forEach((element) => {
    const rect = element.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = cx - x;
    const dy = cy - y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < minDistance) {
      minDistance = distance;
      closest = element;
    }
  });

  return closest;
};

const findNearestInputElement = ({ root, pointer } = {}) => {
  const candidates = collectInputCandidates();
  if (candidates.length === 0) {
    return null;
  }

  const resolvePoint = (point) => {
    if (!point) return null;
    const { x, y } = point;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }

    const atPoint = findInputAtCoordinates(x, y);
    if (atPoint && candidates.includes(atPoint)) {
      return atPoint;
    }

    return findClosestInputCandidate(x, y, candidates);
  };

  const prioritized = resolvePoint(pointer);
  if (prioritized) {
    return prioritized;
  }

  if (root instanceof HTMLElement) {
    const rect = root.getBoundingClientRect();
    const center = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    const byRoot = resolvePoint(center);
    if (byRoot) {
      return byRoot;
    }
  }

  return candidates[0] || null;
};

const focusInputElement = (element) => {
  if (!element || typeof element.focus !== "function") {
    return;
  }

  try {
    element.focus({ preventScroll: true });
  } catch (error) {
    try {
      element.focus();
    } catch (err) {
      // ignore focus errors
    }
  }
};

const applyValueToInput = (element, value) => {
  if (!element) return;

  if (element instanceof HTMLInputElement) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (setter) {
      setter.call(element, value);
    } else {
      element.value = value;
    }
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    try {
      element.setSelectionRange(value.length, value.length);
    } catch (error) {
      // ignore selection errors
    }
    return;
  }

  if (element instanceof HTMLTextAreaElement) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    if (setter) {
      setter.call(element, value);
    } else {
      element.value = value;
    }
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    try {
      element.setSelectionRange(value.length, value.length);
    } catch (error) {
      // ignore selection errors
    }
    return;
  }

  if (element instanceof HTMLSelectElement) {
    element.value = value;
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  if (element instanceof HTMLElement && element.isContentEditable) {
    element.textContent = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }
};

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

const IGNORED_CONTROL_KEYS = new Set([
  "Shift",
  "Control",
  "Alt",
  "Meta",
  "CapsLock",
  "Tab",
  "NumLock",
  "ScrollLock",
  "Pause",
  "Insert",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Escape",
  "Unidentified",
  "OSLeft",
  "OSRight",
  "ContextMenu",
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
  "F6",
  "F7",
  "F8",
  "F9",
  "F10",
  "F11",
  "F12",
]);

const Layout = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("lg"));
  const isSmall = useMediaQuery(theme.breakpoints.down("sm"));
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [searchValue, setSearchValue] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const searchInputRef = useRef(null);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const lastFocusedInputRef = useRef(null);
  const scanBufferRef = useRef("");
  const lastKeyTimeRef = useRef(0);
  const scanStartTimeRef = useRef(0);
  const lastHandledScanRef = useRef({ value: "", ts: 0 });
  const isTopLevelDashboard = /^\/(admin|librarian|staff|student)\/dashboard\/?$/.test(
    location.pathname,
  );
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState("");
  const [notificationsAnchorEl, setNotificationsAnchorEl] = useState(null);
  const [notificationsFetchedAt, setNotificationsFetchedAt] = useState(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [liveRegionMessage, setLiveRegionMessage] = useState("");
  const [readNotificationIds, setReadNotificationIds] = useState([]);
  const readNotificationIdSet = useMemo(
    () => new Set(readNotificationIds),
    [readNotificationIds]
  );
  const userNotificationId = useMemo(
    () => user?.id || user?._id || user?.userId || null,
    [user]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (!userNotificationId) {
      setReadNotificationIds([]);
      return;
    }

    const storageKey = `${NOTIFICATION_READ_STORAGE_PREFIX}:${userNotificationId}`;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        setReadNotificationIds([]);
        return;
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const maxEntries = 200;
        const trimmed =
          parsed.length > maxEntries
            ? parsed.slice(parsed.length - maxEntries)
            : parsed;
        setReadNotificationIds(trimmed);
      } else {
        setReadNotificationIds([]);
      }
    } catch (error) {
      console.error("Failed to load notification read cache:", error);
      setReadNotificationIds([]);
    }
  }, [userNotificationId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (!userNotificationId) {
      return;
    }

    const storageKey = `${NOTIFICATION_READ_STORAGE_PREFIX}:${userNotificationId}`;
    try {
      const maxEntries = 200;
      const trimmed =
        readNotificationIds.length > maxEntries
          ? readNotificationIds.slice(readNotificationIds.length - maxEntries)
          : readNotificationIds;
      window.localStorage.setItem(storageKey, JSON.stringify(trimmed));
    } catch (error) {
      console.error("Failed to persist notification read cache:", error);
    }
  }, [userNotificationId, readNotificationIds]);

  const markNotificationsRead = useCallback((items) => {
    if (!Array.isArray(items) || items.length === 0) {
      return;
    }

    const ids = Array.from(
      new Set(
        items
          .map((item) =>
            item?._id || item?.id || item?.fingerprint || getNotificationFingerprint(item),
          )
          .filter((value) => value !== undefined && value !== null)
          .map((value) => String(value).trim())
          .filter(Boolean)
      )
    );

    if (ids.length === 0) {
      return;
    }

    ids.forEach((id) => {
      notificationsAPI
        .markRead(id, true)
        .catch((error) => console.error("Failed to mark notification read:", error));
    });
  }, []);

  const registerReadNotifications = (items) => {
    if (!Array.isArray(items) || items.length === 0) {
      return;
    }

    const aggregate = new Set(readNotificationIdSet);
    let changed = false;
    const markable = [];

    items.forEach((item) => {
      const fingerprint = item?.fingerprint || getNotificationFingerprint(item);
      if (fingerprint && !aggregate.has(fingerprint)) {
        aggregate.add(fingerprint);
        changed = true;
      }
      if (!item?.read) {
        markable.push(item);
      }
    });

    if (changed) {
      const idsArray = Array.from(aggregate);
      const maxEntries = 200;
      const trimmed =
        idsArray.length > maxEntries
          ? idsArray.slice(idsArray.length - maxEntries)
          : idsArray;
      setReadNotificationIds(trimmed);
    }

    markNotificationsRead(markable);
  };

  const handleSearchResultsWheel = (event) => {
    event.stopPropagation();
  };

  const handleSearchResultsTouchMove = (event) => {
    event.stopPropagation();
  };

  // Reset focused index when search results change
  useEffect(() => {
    setFocusedIndex(-1);
  }, [searchResults]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }

    const handlePointerDown = (event) => {
      lastPointerRef.current = {
        x: event.clientX,
        y: event.clientY,
      };

      if (isEligibleInputElement(event.target)) {
        lastFocusedInputRef.current = event.target;
      }
    };

    const handleFocusIn = (event) => {
      if (isEligibleInputElement(event.target)) {
        lastFocusedInputRef.current = event.target;
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("focusin", handleFocusIn, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("focusin", handleFocusIn, true);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const SCAN_RESET_MS = 80;
  const MAX_SCAN_DURATION_MS = 1500;
    const MIN_SCAN_LENGTH = 4;

    const handleKeyDown = (event) => {
      const now = Date.now();
      const keyValue = typeof event.key === "string" ? event.key : "";

      if (now - lastKeyTimeRef.current > SCAN_RESET_MS) {
        scanBufferRef.current = "";
        scanStartTimeRef.current = now;
      }

      if (keyValue === "Enter") {
        const bufferedValue = scanBufferRef.current;
        scanBufferRef.current = "";
        lastKeyTimeRef.current = now;

        if (
          bufferedValue.length >= MIN_SCAN_LENGTH &&
          now - scanStartTimeRef.current <= MAX_SCAN_DURATION_MS
        ) {
          event.preventDefault();
          dispatchScanEvent(bufferedValue, {
            source: "keyboard",
            pointer: { ...lastPointerRef.current },
          });
        }
        return;
      }

      if (
        keyValue.length === 1 &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        if (!scanBufferRef.current) {
          scanStartTimeRef.current = now;
        }
        scanBufferRef.current += keyValue;
        lastKeyTimeRef.current = now;
      } else if (keyValue && !IGNORED_CONTROL_KEYS.has(keyValue)) {
        scanBufferRef.current = "";
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleScan = (event) => {
      const detail = event.detail || {};
      const rawValue = detail.value;
      if (rawValue == null) {
        return;
      }

      const normalizedValue =
        typeof rawValue === "string" ? rawValue : String(rawValue);
      const sanitizedValue = normalizedValue.replace(/[\r\n]+/g, "");
      if (!sanitizedValue.trim()) {
        return;
      }

      const now = Date.now();
      if (
        lastHandledScanRef.current.value === sanitizedValue &&
        now - lastHandledScanRef.current.ts < 250
      ) {
        return;
      }
      lastHandledScanRef.current = { value: sanitizedValue, ts: now };

      const meta = detail.meta || {};
      const pointer = meta.pointer || lastPointerRef.current;

      let target = null;

      if (isTopLevelDashboard && searchInputRef.current) {
        target = searchInputRef.current;
      }

      if (!target && meta.targetSelector && typeof document !== "undefined") {
        const candidate = document.querySelector(meta.targetSelector);
        if (isEligibleInputElement(candidate)) {
          target = candidate;
        }
      }

      if (!target && meta.elementId && typeof document !== "undefined") {
        const root = document.getElementById(meta.elementId);
        target = findNearestInputElement({ root, pointer });
      }

      if (!target && meta.rect) {
        const rect = meta.rect;
        if (
          Number.isFinite(rect.left) &&
          Number.isFinite(rect.top) &&
          Number.isFinite(rect.width) &&
          Number.isFinite(rect.height)
        ) {
          const centerPointer = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          };
          target = findNearestInputElement({ pointer: centerPointer });
        }
      }

      if (!target && pointer) {
        target = findNearestInputElement({ pointer });
      }

      if (!target && isEligibleInputElement(document.activeElement)) {
        target = document.activeElement;
      }

      if (!target && isEligibleInputElement(lastFocusedInputRef.current)) {
        target = lastFocusedInputRef.current;
      }

      if (!target) {
        target = findNearestInputElement({ pointer: lastPointerRef.current });
      }

      if (!target) {
        return;
      }

      focusInputElement(target);
  applyValueToInput(target, sanitizedValue);

      if (target instanceof HTMLElement) {
        const rect = target.getBoundingClientRect();
        lastPointerRef.current = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
      }
      lastFocusedInputRef.current = target;

      if (target === searchInputRef.current) {
        setSearchValue(sanitizedValue);
        setFocusedIndex(-1);
        setSearchError("");
        setSearchOpen(true);
      }
    };

    window.addEventListener(SCAN_EVENT, handleScan);
    return () => window.removeEventListener(SCAN_EVENT, handleScan);
  }, [isTopLevelDashboard, setFocusedIndex, setSearchError, setSearchOpen, searchInputRef]);

  // Announce notifications to screen readers
  useEffect(() => {
    if (notifications.length > 0) {
      const unreadCount = notifications.filter(n => !n.read).length;
      if (unreadCount > 0) {
        setLiveRegionMessage(`${unreadCount} unread notifications`);
      }
    }
  }, [notifications]);

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
    setFocusedIndex(-1);
  };

  const handleSearchKeyDown = (event) => {
    if (!searchResults.length) return;

    const totalItems = searchResults.reduce((sum, section) => sum + section.items.length, 0);

    switch (event.key) {
      case "Escape":
        setSearchOpen(false);
        setFocusedIndex(-1);
        break;
      case "ArrowDown":
        event.preventDefault();
        setFocusedIndex(prev => (prev < totalItems - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        event.preventDefault();
        setFocusedIndex(prev => (prev > 0 ? prev - 1 : totalItems - 1));
        break;
      case "Enter":
        event.preventDefault();
        if (focusedIndex >= 0) {
          let currentIndex = 0;
          for (const section of searchResults) {
            for (const item of section.items) {
              if (currentIndex === focusedIndex) {
                handleSearchResultClick(item);
                return;
              }
              currentIndex++;
            }
          }
        }
        break;
      default:
        break;
    }
  };

  const handleSearchResultClick = (item) => {
    if (!item) return;

    // Role-aware routing for search results.
    // Some backend search links point to staff-only routes (e.g. /students/:id)
    // which don't exist for student users. Map student search results to
    // appropriate pages depending on the current user role.

    try {
      const category = item.category;
      const id = item.id;

      if (category === "students") {
        // If the current user is the same student, send them to their profile.
        // Staff/admin/librarian users stay within the /students route so the
        // sidebar keeps the Students tab highlighted.
        const currentUserId = (user && (user._id || user.id || "")) + "";
        if (user && user.role === "student") {
          if (id && id === currentUserId) {
            navigate("/profile");
          } else {
            // Students should not view other students' profiles.
            navigate("/unauthorized");
          }
        } else {
          // Staff/admin/librarian: open the shared UserProfile component under /students.
          if (id) navigate(`/students/${id}`);
        }
      } else if (category === "transactions") {
        // Transactions detail is staff-only. If current user is student and
        // the transaction belongs to them, redirect to /student/dashboard
        // (students can't view the staff transaction details page).
        if (user && user.role === "student") {
          // If the search item includes a field indicating ownership, prefer it.
          // Otherwise, send student to their dashboard where they can view own transactions.
          navigate("/student/dashboard");
        } else {
          if (item.link) navigate(item.link);
        }
      } else {
        // Default: use the provided link if available.
        if (item.link) navigate(item.link);
      }
    } catch (err) {
      console.error("Failed to navigate from search result:", err);
      if (item.link) navigate(item.link);
    } finally {
      setSearchOpen(false);
      setSearchResults([]);
      setSearchValue("");
    }
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

  const loadNotifications = useCallback(async () => {
    try {
      setNotificationsLoading(true);
      const { data } = await notificationsAPI.getAll({ limit: 10 });
      const sourceItems = Array.isArray(data?.notifications)
        ? data.notifications
        : [];
      const items = sourceItems.map((item) => {
        const fingerprint = item?.fingerprint || getNotificationFingerprint(item);
        const serverRead = Boolean(item?.read);
        const cachedRead = fingerprint ? readNotificationIdSet.has(fingerprint) : false;
        const resolvedRead = serverRead || cachedRead;
        return { ...item, read: resolvedRead, fingerprint };
      });
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
  }, [readNotificationIdSet]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }

    if (!searchOpen) {
      return undefined;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [searchOpen]);

  const handleNotificationsOpen = (event) => {
    setNotificationsAnchorEl(event.currentTarget);
    const staleAfter = 5 * 60 * 1000;
    if (!notificationsFetchedAt || Date.now() - notificationsFetchedAt > staleAfter) {
      loadNotifications();
    }
  };

  const handleNotificationsClose = () => {
    setNotificationsAnchorEl(null);
    setNotifications((prev) => {
      if (!prev || prev.length === 0) {
        return [];
      }
      registerReadNotifications(prev);
      return prev.map((item) => ({ ...item, read: true }));
    });
  };

  const handleNotificationNavigate = (item) => {
    if (item) {
      registerReadNotifications([item]);
    }
    handleNotificationsClose();
    if (item?.link) {
      navigate(item.link);
    }
  };

  useEffect(() => {
    const trimmed = searchValue.trim();
    if (!trimmed) {
      setSearchOpen(false);
      setSearchResults([]);
      if (!isTopLevelDashboard) {
        setSearchValue("");
      }
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
  }, [searchValue, isTopLevelDashboard]);

  const unreadCount = notifications.reduce(
    (acc, item) => acc + (item.read ? 0 : 1),
    0,
  );

  const resolveInitial = (value) => {
    if (!value || (typeof value !== "string" && typeof value !== "number")) {
      return "";
    }

    const normalized = String(value).trim();
    if (!normalized) {
      return "";
    }

    return normalized.charAt(0).toUpperCase();
  };

  const userInitial =
    [user?.firstName, user?.lastName, user?.username, user?.email]
      .map(resolveInitial)
      .find((initial) => Boolean(initial)) || "U";
  const resolveApiOrigin = () => {
    const base = api.defaults.baseURL || "";
    if (base) {
      const sanitized = base.replace(/\/api$/i, "");
      return sanitized || base;
    }
    if (typeof window !== "undefined") {
      return window.location.origin;
    }
    return "";
  };
  const avatarSrc = (() => {
    const raw = user?.avatar?.url || user?.avatarUrl;
    if (!raw) {
      return "";
    }
    if (/^https?:\/\//i.test(raw) || raw.startsWith("data:")) {
      return raw;
    }
    const origin = resolveApiOrigin();
    const normalized = raw.startsWith("/") ? raw : `/${raw}`;
    return `${origin}${normalized}`;
  })();
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
        src={avatarSrc || undefined}
        sx={{
          width: 30,
          height: 30,
          backgroundColor: avatarSrc ? "transparent" : "#2563EB",
          color: "#FFFFFF",
          fontSize: "0.85rem",
          fontWeight: 600,
          boxShadow: "0 2px 6px rgba(37, 99, 235, 0.35)",
        }}
      >
        {!avatarSrc && userInitial}
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
        src={avatarSrc || undefined}
        sx={{
          width: 32,
          height: 32,
          backgroundColor: avatarSrc ? "transparent" : "#2563EB",
          color: "#FFFFFF",
          fontSize: "0.85rem",
          fontWeight: 600,
          boxShadow: "0 2px 6px rgba(37, 99, 235, 0.35)",
        }}
      >
        {!avatarSrc && userInitial}
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
      {/* Skip Links */}
      <a 
        href="#main-content" 
        className="skip-link"
        onFocus={(e) => e.target.style.top = "6px"}
        onBlur={(e) => e.target.style.top = "-40px"}
      >
        Skip to main content
      </a>
      <a 
        href="#navigation" 
        className="skip-link"
        onFocus={(e) => e.target.style.top = "6px"}
        onBlur={(e) => e.target.style.top = "-40px"}
      >
        Skip to navigation
      </a>
      
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
        role="main"
        id="main-content"
        aria-label="Main content"
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
          role="banner"
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
                    // allow the search box to grow on larger screens so it can be longer
                    flexGrow: 1,
                    width: { sm: "100%", md: "100%" },
                    // increase search max width more for roomy desktop layouts
                    maxWidth: { sm: "100%", md: 720 },
                    mr: { sm: 0, md: 3 },
                  }}
                >
                  <TextField
                    fullWidth
                    size="medium"
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
                        key={
                          item.id ||
                          item._id ||
                          item.fingerprint ||
                          item.transactionId ||
                          item.timestamp ||
                          item.title
                        }
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
                  // Match search input width so the dropdown aligns nicely
                  width: { xs: "100vw", sm: 720 },
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
                    <Box
                      sx={{
                        maxHeight: { xs: "65vh", sm: 360 },
                        overflowY: "auto",
                      }}
                      onWheel={handleSearchResultsWheel}
                      onTouchMove={handleSearchResultsTouchMove}
                    >
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
                              {section.items.map((item, itemIndex) => {
                                let globalIndex = 0;
                                for (let i = 0; i < searchResults.indexOf(section); i++) {
                                  globalIndex += searchResults[i].items.length;
                                }
                                globalIndex += itemIndex;
                                const isFocused = globalIndex === focusedIndex;

                                return (
                                  <ListItemButton
                                    key={`${section.key}-${item.id}`}
                                    onClick={() => handleSearchResultClick(item)}
                                    alignItems="flex-start"
                                    sx={{
                                      px: 2,
                                      py: 1.25,
                                      gap: 1.5,
                                      backgroundColor: isFocused ? '#EEF2FF' : 'transparent',
                                      '&:hover': {
                                        backgroundColor: isFocused ? '#E0E7FF' : '#F8FAFC',
                                      },
                                    }}
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
                                );
                              })}
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
                  </Box>
                </ClickAwayListener>
              </Paper>
            </Fade>
          )}
        </Popper>
        {/* Live region for screen reader announcements */}
        <div
          aria-live="polite"
          aria-atomic="true"
          style={{ position: "absolute", left: "-10000px", width: "1px", height: "1px", overflow: "hidden" }}
        >
          {liveRegionMessage}
        </div>
        
        {/* Page Content */}
        <Box sx={{ p: { xs: 2, sm: 3, lg: 4 }, backgroundColor: "transparent" }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
};

export default Layout;
