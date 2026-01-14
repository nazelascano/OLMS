import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api } from "../utils/api";
import { resolveAssetUrl } from "../utils/media";
import { useAuth } from "./AuthContext";

export const SETTINGS_UPDATED_EVENT = "olms-settings-updated";
const SettingsContext = createContext(null);
const FALLBACK_TAGLINE = "The School of Choice";

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
  const [librarySettings, setLibrarySettings] = useState(null);
  const [librarySettingsLoading, setLibrarySettingsLoading] = useState(false);
  const [librarySettingsError, setLibrarySettingsError] = useState("");

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

  const loadLibrarySettings = useCallback(async () => {
    setLibrarySettingsLoading(true);
    setLibrarySettingsError("");
    try {
      const response = await api.get("/settings/library");
      setLibrarySettings(response.data || null);
    } catch (error) {
      console.error("Failed to load library settings", error);
      setLibrarySettings(null);
      setLibrarySettingsError(
        error?.response?.data?.message || "Unable to load library settings",
      );
    } finally {
      setLibrarySettingsLoading(false);
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
    loadLibrarySettings();
  }, [loadLibrarySettings]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleSettingsUpdate = (event) => {
      const category = event?.detail?.category;
      if (!category || category === "borrowing" || category === "borrowing-rules" || category === "all") {
        loadBorrowingRules();
      }
      if (!category || category === "library" || category === "all") {
        loadLibrarySettings();
      }
    };

    window.addEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdate);
    return () => {
      window.removeEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdate);
    };
  }, [loadBorrowingRules, loadLibrarySettings]);

  const value = useMemo(() => {
    const finesEnabled = getBoolean(borrowingRules?.enableFines, true);
    const libraryTagline = (librarySettings?.loginMotto || "").trim() || FALLBACK_TAGLINE;
    const libraryLogoUrl = resolveAssetUrl(librarySettings?.loginLogoUrl || "");
    return {
      borrowingRules,
      borrowingRulesLoading,
      borrowingRulesError,
      refreshBorrowingRules: loadBorrowingRules,
      finesEnabled,
      librarySettings,
      librarySettingsLoading,
      librarySettingsError,
      refreshLibrarySettings: loadLibrarySettings,
      libraryTagline,
      libraryLogoUrl,
    };
  }, [
    borrowingRules,
    borrowingRulesLoading,
    borrowingRulesError,
    loadBorrowingRules,
    librarySettings,
    librarySettingsLoading,
    librarySettingsError,
    loadLibrarySettings,
  ]);

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
