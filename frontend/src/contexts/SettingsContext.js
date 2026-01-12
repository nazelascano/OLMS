import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api } from "../utils/api";
import { useAuth } from "./AuthContext";

export const SETTINGS_UPDATED_EVENT = "olms-settings-updated";
const SettingsContext = createContext(null);

const getBoolean = (value, fallback = true) => {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no"].includes(normalized)) {
      return false;
    }
  }
  return fallback;
};

export const SettingsProvider = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const [borrowingRules, setBorrowingRules] = useState(null);
  const [borrowingRulesLoading, setBorrowingRulesLoading] = useState(false);
  const [borrowingRulesError, setBorrowingRulesError] = useState("");

  const loadBorrowingRules = useCallback(async () => {
    setBorrowingRulesLoading(true);
    setBorrowingRulesError("");
    try {
      const response = await api.get("/settings/borrowing-rules");
      setBorrowingRules(response.data || {});
    } catch (error) {
      console.error("Failed to load borrowing rules", error);
      setBorrowingRules(null);
      setBorrowingRulesError(
        error?.response?.data?.message || "Unable to load borrowing rules",
      );
    } finally {
      setBorrowingRulesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) {
      return;
    }
    if (!user) {
      setBorrowingRules(null);
      setBorrowingRulesError("");
      setBorrowingRulesLoading(false);
      return;
    }
    loadBorrowingRules();
  }, [authLoading, user, loadBorrowingRules]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleSettingsUpdate = (event) => {
      const category = event?.detail?.category;
      if (!category || category === "borrowing" || category === "borrowing-rules" || category === "all") {
        loadBorrowingRules();
      }
    };

    window.addEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdate);
    return () => {
      window.removeEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdate);
    };
  }, [loadBorrowingRules]);

  const value = useMemo(() => {
    const finesEnabled = getBoolean(borrowingRules?.enableFines, true);
    return {
      borrowingRules,
      borrowingRulesLoading,
      borrowingRulesError,
      refreshBorrowingRules: loadBorrowingRules,
      finesEnabled,
    };
  }, [borrowingRules, borrowingRulesLoading, borrowingRulesError, loadBorrowingRules]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
};
