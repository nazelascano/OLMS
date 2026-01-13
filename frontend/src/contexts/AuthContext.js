import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { authAPI, verifySession, api } from "../utils/api";

const TOKEN_REFRESH_EVENT = "olms-token-refresh";
const VERIFY_INTERVAL_MS = 2 * 60 * 1000; // ping backend every 2 minutes
const MIN_MANUAL_VERIFY_GAP_MS = 15 * 1000; // avoid spamming on rapid focus changes
const COOKIE_SESSION_FLAG = "olmsCookieSession";

const readStoredToken = () => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return (
      window.localStorage.getItem("authToken") ||
      window.sessionStorage.getItem("authToken")
    );
  } catch (error) {
    console.warn("Failed to read stored auth token", error);
    return null;
  }
};

const readStoredUserPayload = () => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const stored =
      window.localStorage.getItem("userData") ||
      window.sessionStorage.getItem("userData");
    if (!stored) {
      return null;
    }
    return JSON.parse(stored);
  } catch (error) {
    console.warn("Failed to read stored user payload", error);
    return null;
  }
};

const getCookieSessionFlag = () => {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.sessionStorage.getItem(COOKIE_SESSION_FLAG) === "true";
  } catch (error) {
    console.warn("Failed to read cookie session flag", error);
    return false;
  }
};

const setCookieSessionFlag = (isActive) => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (isActive) {
      window.sessionStorage.setItem(COOKIE_SESSION_FLAG, "true");
    } else {
      window.sessionStorage.removeItem(COOKIE_SESSION_FLAG);
    }
  } catch (error) {
    console.warn("Failed to update cookie session flag", error);
  }
};

const normalizeRole = (role) => {
  if (!role && role !== 0) {
    return "";
  }
  const value = String(role).trim().toLowerCase();
  if (!value) {
    return "";
  }
  switch (value) {
    case "super admin":
    case "super-admin":
    case "superadmin":
    case "administrator":
      return "admin";
    default:
      return value;
  }
};

const normalizeUserPayload = (user) => {
  if (!user || typeof user !== "object") {
    return null;
  }

  const originalRole = user.roleLabel || user.role || "";
  const normalizedRole = normalizeRole(user.effectiveRole || originalRole);

  return {
    ...user,
    role: normalizedRole || "",
    roleLabel: originalRole || normalizedRole || "",
  };
};

const applyAxiosAuthHeader = (token) => {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
};

const emitTokenRefresh = (token) => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(TOKEN_REFRESH_EVENT, {
      detail: { token },
    }),
  );
};

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [authToken, setAuthToken] = useState(null);
  const [hasCookieSession, setHasCookieSession] = useState(() => getCookieSessionFlag());
  const verifyTimerRef = useRef(null);
  const verifyInFlightRef = useRef(false);
  const lastManualVerifyRef = useRef(0);

  const logout = useCallback(({ reason } = {}) => {
    authAPI.logout().catch(() => {});
    setUser(null);
    setAuthToken(null);
    applyAxiosAuthHeader(null);
    setHasCookieSession(false);
    setCookieSessionFlag(false);
    localStorage.removeItem("authToken");
    localStorage.removeItem("userData");
    try {
      sessionStorage.removeItem("authToken");
      sessionStorage.removeItem("userData");
    } catch (error) {
      console.warn("Failed to clear sessionStorage on logout", error);
    }
    emitTokenRefresh(null);
    if (reason) {
      console.info("Logged out:", reason);
    }
  }, []);

  const runSessionVerify = useCallback(async () => {
    if ((!authToken && !hasCookieSession) || verifyInFlightRef.current) {
      return;
    }
    verifyInFlightRef.current = true;
    try {
      await verifySession();
      setHasCookieSession(true);
      setCookieSessionFlag(true);
    } catch (error) {
      if (error?.response?.status === 401) {
        logout({ reason: "Session expired" });
      } else {
        console.warn("Session verify failed", error);
      }
    } finally {
      verifyInFlightRef.current = false;
    }
  }, [authToken, hasCookieSession, logout]);

  const attemptCookieBootstrap = useCallback(async () => {
    if (!hasCookieSession || verifyInFlightRef.current) {
      return false;
    }
    verifyInFlightRef.current = true;
    try {
      const { data } = await verifySession({ __skipAuthHandler: true });
      const normalizedUser = normalizeUserPayload(data?.user);
      if (!normalizedUser) {
        throw new Error("Invalid server session payload");
      }
      setUser(normalizedUser);
      localStorage.setItem("userData", JSON.stringify(normalizedUser));
      setHasCookieSession(true);
      setCookieSessionFlag(true);
      const resolvedToken = data?.token || readStoredToken();
      if (resolvedToken) {
        applyAxiosAuthHeader(resolvedToken);
        setAuthToken(resolvedToken);
        localStorage.setItem("authToken", resolvedToken);
        try {
          sessionStorage.setItem("authToken", resolvedToken);
        } catch (storageError) {
          console.warn("Failed to persist refreshed auth token", storageError);
        }
        emitTokenRefresh(resolvedToken);
      }
      return true;
    } catch (error) {
      if (error?.response?.status === 401) {
        setHasCookieSession(false);
        setCookieSessionFlag(false);
      } else {
        console.warn("Cookie session bootstrap failed", error);
      }
      return false;
    } finally {
      verifyInFlightRef.current = false;
    }
  }, [hasCookieSession]);

  useEffect(() => {
    let isMounted = true;

    const hydrateFromStorage = async () => {
      const token = readStoredToken();
      const storedUser = readStoredUserPayload();

      if (token && storedUser) {
        try {
          const normalizedUser = normalizeUserPayload(storedUser);
          if (!normalizedUser) {
            throw new Error("Invalid stored user payload");
          }
          applyAxiosAuthHeader(token);
          setAuthToken(token);
          setUser(normalizedUser);
          setHasCookieSession(true);
          setCookieSessionFlag(true);
          if (isMounted) {
            setLoading(false);
          }
          return;
        } catch (error) {
          console.error("Error parsing stored user data:", error);
          localStorage.removeItem("authToken");
          localStorage.removeItem("userData");
          try {
            sessionStorage.removeItem("authToken");
            sessionStorage.removeItem("userData");
          } catch (storageError) {
            console.warn("Failed to clear sessionStorage after parse error", storageError);
          }
          setHasCookieSession(false);
          setCookieSessionFlag(false);
        }
      }

      if (hasCookieSession) {
        await attemptCookieBootstrap();
      }

      if (isMounted) {
        setLoading(false);
      }
    };

    hydrateFromStorage();

    return () => {
      isMounted = false;
    };
  }, [hasCookieSession, attemptCookieBootstrap]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleTokenRefresh = (event) => {
      const nextToken =
        event?.detail?.token ?? localStorage.getItem("authToken") ?? sessionStorage.getItem("authToken");
      applyAxiosAuthHeader(nextToken);
      setAuthToken(nextToken || null);
      if (nextToken) {
        setHasCookieSession(true);
        setCookieSessionFlag(true);
      }
    };

    const handleStorage = (event) => {
      if (event.key === "authToken") {
        const fallback = sessionStorage.getItem("authToken");
        const nextToken = event.newValue || fallback || null;
        applyAxiosAuthHeader(nextToken);
        setAuthToken(nextToken);
        if (event.newValue || fallback) {
          setHasCookieSession(true);
          setCookieSessionFlag(true);
        } else {
          setHasCookieSession(false);
          setCookieSessionFlag(false);
        }
      }
      if (event.key === "userData") {
        if (!event.newValue) {
          setUser(null);
          return;
        }
        try {
          const parsed = JSON.parse(event.newValue);
          const normalized = normalizeUserPayload(parsed);
          setUser(normalized);
        } catch (err) {
          console.error("Failed to parse user data from storage event", err);
          setUser(null);
        }
      }
    };

    window.addEventListener(TOKEN_REFRESH_EVENT, handleTokenRefresh);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(TOKEN_REFRESH_EVENT, handleTokenRefresh);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    if (loading || (!authToken && !hasCookieSession)) {
      return undefined;
    }

    runSessionVerify();
    verifyTimerRef.current = window.setInterval(runSessionVerify, VERIFY_INTERVAL_MS);

    return () => {
      if (verifyTimerRef.current) {
        window.clearInterval(verifyTimerRef.current);
        verifyTimerRef.current = null;
      }
    };
  }, [authToken, hasCookieSession, loading, runSessionVerify]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleFocus = () => {
      if (loading || (!authToken && !hasCookieSession)) {
        return;
      }
      const now = Date.now();
      if (now - lastManualVerifyRef.current < MIN_MANUAL_VERIFY_GAP_MS) {
        return;
      }
      lastManualVerifyRef.current = now;
      runSessionVerify();
    };

    const handleVisibility = () => {
      if (typeof document === "undefined") {
        return;
      }
      if (document.visibilityState === "visible") {
        handleFocus();
      }
    };

    window.addEventListener("focus", handleFocus);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibility);
    }

    return () => {
      window.removeEventListener("focus", handleFocus);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibility);
      }
    };
  }, [authToken, hasCookieSession, loading, runSessionVerify]);

  const login = async (username, password) => {
    try {
      setLoginLoading(true);
      const { data } = await authAPI.login(username, password);

      const normalizedUser = normalizeUserPayload(data.user);

      applyAxiosAuthHeader(data.token);
      setAuthToken(data.token);
      setUser(normalizedUser);
      setHasCookieSession(true);
      setCookieSessionFlag(true);
      localStorage.setItem("authToken", data.token);
      localStorage.setItem("userData", JSON.stringify(normalizedUser));
      try {
        sessionStorage.setItem("authToken", data.token);
        sessionStorage.setItem("userData", JSON.stringify(normalizedUser));
      } catch (error) {
        console.warn("Failed to persist data to sessionStorage", error);
      }
      emitTokenRefresh(data.token);
      return { success: true, user: normalizedUser };
    } catch (error) {
      console.error("Login error:", error);
      const message =
        error?.response?.data?.message || error?.message || "Login failed";
      return { success: false, error: message };
    } finally {
      setLoginLoading(false);
    }
  };

  const updateUserData = (updater) => {
    setUser((prev) => {
      const nextValue =
        typeof updater === "function"
          ? updater(prev)
          : { ...(prev || {}), ...(updater || {}) };

      if (nextValue && typeof nextValue === "object") {
        const normalized = normalizeUserPayload(nextValue);
        if (normalized) {
          localStorage.setItem("userData", JSON.stringify(normalized));
          return normalized;
        }
      }

      localStorage.removeItem("userData");
      return null;
    });
  };

  const getAuthHeaders = () => {
    return authToken ? { Authorization: `Bearer ${authToken}` } : {};
  };

  const isAuthenticated = () => {
    return !!authToken && !!user;
  };

  const hasRole = (role) => {
    return normalizeRole(user?.role) === normalizeRole(role);
  };

  const hasPermission = (permission) => {
    if (!user) return false;

    const normalizedRole = normalizeRole(user.role);
    if (normalizedRole === "admin") {
      return true;
    }

    // If user has explicit permissions, use those
    if (user.permissions && Array.isArray(user.permissions)) {
      return user.permissions.includes(permission);
    }

    // Otherwise, map role to permissions
    const rolePermissions = {
      admin: [
        "*",
      ],
      librarian: [
        "users.view",
        "users.create",
        "users.update",
        "users.delete",
        "users.resetPassword",
        "students.view",
        "students.create",
        "students.update",
        "students.delete",
        "books.view",
        "books.create",
        "books.update",
        "books.delete",
        "transactions.view",
        "transactions.create",
        "transactions.update",
        "transactions.delete",
        "reports.view",
        "settings.view",
        "settings.update",
        "audit.view",
      ],
      staff: [
        "users.view",
        "users.update",
        "students.view",
        "books.view",
        "books.update",
        "transactions.view",
        "transactions.create",
        "transactions.update",
        "reports.view",
      ],
      student: ["books.view", "transactions.view"],
    };

    const userPermissions = rolePermissions[normalizedRole] || [];

    // Check if user has all permissions (admin) or specific permission
    return (
      userPermissions.includes("*") || userPermissions.includes(permission)
    );
  };

  const value = {
    user,
    authToken,
    hasCookieSession,
    loading,
    loginLoading,
    login,
    logout,
    getAuthHeaders,
    isAuthenticated,
    hasRole,
    hasPermission,
    updateUserData,
  };

  return (
    <AuthContext.Provider value={value}> {children} </AuthContext.Provider>
  );
};
