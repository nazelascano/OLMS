import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Avatar,
  Button,
  TextField,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider,
  InputAdornment,
  Tooltip,
  LinearProgress,
  Slider,
  MenuItem,
} from "@mui/material";
import {
  Person,
  Email,
  School,
  Assignment,
  Warning,
  Edit,
  Cancel,
  LibraryBooks,
  Visibility,
  VisibilityOff,
  Security,
  ArrowBack,
  Phone,
  Save,
  PhotoCamera,
} from "@mui/icons-material";
import Cropper from "react-easy-crop";
import { useAuth } from "../../contexts/AuthContext";
import { useSettings } from "../../contexts/SettingsContext";
import { api, usersAPI, booksAPI } from "../../utils/api";
import { formatCurrency } from "../../utils/currency";
import { ensureUserAttributes, getSectionsForGrade } from "../../utils/userAttributes";
import { useNavigate, useParams } from "react-router-dom";

const createImage = (url) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.setAttribute("crossOrigin", "anonymous");
    image.src = url;
  });

const getCroppedImage = async (file, cropArea) => {
  if (!cropArea) {
    return { file, blob: file };
  }

  const imageUrl = URL.createObjectURL(file);
  try {
    const image = await createImage(imageUrl);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const pixelRatio = window.devicePixelRatio || 1;
    const { width, height, x, y } = cropArea;

    canvas.width = width * pixelRatio;
    canvas.height = height * pixelRatio;

    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.imageSmoothingQuality = "high";

    ctx.drawImage(image, x, y, width, height, 0, 0, width, height);

    const mimeType = file.type === "image/png" ? "image/png" : "image/jpeg";

    return await new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Failed to crop image"));
            return;
          }
          const croppedFile = new File([blob], `avatar-${Date.now()}.${mimeType === "image/png" ? "png" : "jpg"}`, {
            type: mimeType,
          });
          resolve({ blob, file: croppedFile });
        },
        mimeType,
        0.95,
      );
    });
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
};

const sanitizePhoneInput = (value = "") =>
  String(value ?? "").replace(/\D/g, "").slice(0, 11);

const withSanitizedPhone = (data = {}) => {
  if (!data || typeof data !== "object") {
    return {};
  }

  const normalizedPhone =
    data.phoneNumber != null
      ? sanitizePhoneInput(data.phoneNumber)
      : sanitizePhoneInput(data.profile?.phone);

  return {
    ...data,
    phoneNumber: normalizedPhone,
  };
};

const hydrateProfileData = (data = {}) => {
  const sanitized = withSanitizedPhone(data);
  const resolvedGrade =
    sanitized.grade ||
    sanitized.gradeLevel ||
    sanitized.student?.grade ||
    "";
  const resolvedSection =
    sanitized.section ||
    sanitized.student?.section ||
    sanitized.studentProfile?.section ||
    "";

  return {
    ...sanitized,
    grade: resolvedGrade,
    gradeLevel: resolvedGrade || sanitized.gradeLevel || "",
    section: resolvedSection,
  };
};

const PASSWORD_MIN_LENGTH = 6;

const createPasswordFormState = () => ({
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
});

const createPasswordErrorState = () => ({
  current: "",
  new: "",
  confirm: "",
  general: "",
});

const derivePasswordChangeError = (error) => {
  const fallback = "Failed to change password. Please try again.";
  if (!error) {
    return fallback;
  }
  if (error.response) {
    return error.response.data?.message || fallback;
  }
  if (error.request) {
    return "Unable to reach the server. Please check your connection and try again.";
  }
  return error.message || fallback;
};

const UserProfile = () => {
  const { user, updateUserData } = useAuth();
  const { finesEnabled } = useSettings();
  const { id } = useParams();
  const navigate = useNavigate();
  const [profileData, setProfileData] = useState({});
  const [borrowingHistory, setBorrowingHistory] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [changePasswordDialog, setChangePasswordDialog] = useState(false);
  const [passwordData, setPasswordData] = useState(() => createPasswordFormState());
  const [passwordErrors, setPasswordErrors] = useState(() => createPasswordErrorState());
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [stats, setStats] = useState({
    totalBorrowings: 0,
    currentlyBorrowed: 0,
    overdueBorrowings: 0,
    totalFines: 0,
  });
  const [isSelfProfile, setIsSelfProfile] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarProgress, setAvatarProgress] = useState(0);
  const [selectedAvatarFile, setSelectedAvatarFile] = useState(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const fileInputRef = useRef(null);
  const [bookLookups, setBookLookups] = useState(null);
  const [booksLoading, setBooksLoading] = useState(false);
  const [booksError, setBooksError] = useState("");
  const [attributeOptions, setAttributeOptions] = useState(() => ensureUserAttributes());
  const [attributeLoading, setAttributeLoading] = useState(false);
  const [attributeError, setAttributeError] = useState("");
  const resolvedProfileRole = (profileData?.role || user?.role || "").toLowerCase();
  const isStudentProfileView = resolvedProfileRole === "student";

  useEffect(() => {
    if (!avatarPreviewUrl) {
      return undefined;
    }
    return () => {
      URL.revokeObjectURL(avatarPreviewUrl);
    };
  }, [avatarPreviewUrl]);

  const resolveApiOrigin = () => {
    const base = api.defaults.baseURL || "";
    if (!base) {
      if (typeof window === "undefined") {
        return "";
      }
      return window.location.origin.replace(/\/$/, "");
    }
    const sanitized = base.replace(/\/api$/i, "");
    return sanitized || base;
  };

  const getAvatarUrl = (data) => {
    if (!data || typeof data !== "object") {
      return "";
    }

    const raw = data.avatar?.url || data.avatarUrl;
    if (!raw) {
      return "";
    }

    if (/^https?:\/\//i.test(raw) || raw.startsWith("data:")) {
      return raw;
    }

    const origin = resolveApiOrigin();
    const normalizedPath = raw.startsWith("/") ? raw : `/${raw}`;
    return `${origin}${normalizedPath}`;
  };

  const getUserIdentifier = (value) => value?._id || value?.id || value?.uid;

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

  const getAvatarInitial = (data) => {
    if (!data || typeof data !== "object") {
      return "";
    }

    return (
      [data.firstName, data.lastName, data.username, data.email]
        .map(resolveInitial)
        .find(Boolean) || ""
    );
  };

  const computeStatsFromHistory = (history = []) => {
    const now = new Date();
    return {
      totalBorrowings: history.length,
      currentlyBorrowed: history.filter((t) => t.status === "borrowed").length,
      overdueBorrowings: history.filter((t) => {
        if (t.status !== "borrowed") return false;
        if (!t.dueDate) return false;
        return new Date(t.dueDate) < now;
      }).length,
      totalFines: history.reduce((sum, t) => sum + (t.fineAmount || t.fine || 0), 0),
    };
  };

  const dedupeValues = (values = []) => {
    const normalizedList = Array.isArray(values) ? values : [];
    const seen = new Set();
    const result = [];

    normalizedList.forEach((value) => {
      if (!value) return;
      const trimmed = typeof value === "string" ? value.trim() : value;
      if (!trimmed) return;
      const key = typeof trimmed === "string" ? trimmed.toLowerCase() : trimmed;
      if (seen.has(key)) return;
      seen.add(key);
      result.push(trimmed);
    });

    return result;
  };

  const summarizeValues = (values = []) => {
    const deduped = dedupeValues(values);
    if (deduped.length === 0) return "";
    if (deduped.length === 1) return deduped[0];
    if (deduped.length === 2) return deduped.join(", ");
    return `${deduped[0]}, ${deduped[1]} (+${deduped.length - 2} more)`;
  };

  const buildBookLookups = (books = []) => {
    const byBookId = new Map();
    const byCopyId = new Map();
    const byIsbn = new Map();

    books.forEach((book = {}) => {
      const normalized = {
        id: book._id || book.id || book.bookId,
        title: book.title,
        author: book.author,
        isbn: book.isbn,
      };

      [book._id, book.id, book.bookId]
        .map((value) => (value ? String(value) : ""))
        .filter(Boolean)
        .forEach((key) => {
          byBookId.set(key, normalized);
        });

      if (book.isbn) {
        byIsbn.set(String(book.isbn).toLowerCase(), normalized);
      }

      (book.copies || []).forEach((copy = {}) => {
        if (copy.copyId) {
          byCopyId.set(String(copy.copyId), normalized);
        }
      });
    });

    return { byBookId, byCopyId, byIsbn };
  };

  const loadBookLookups = useCallback(async () => {
    if (bookLookups) {
      return bookLookups;
    }

    try {
      setBooksLoading(true);
      const response = await booksAPI.getAll({ limit: -1 });
      const list = response.data?.books || response.data || [];
      const lookups = buildBookLookups(Array.isArray(list) ? list : []);
      setBookLookups(lookups);
      setBooksError("");
      return lookups;
    } catch (error) {
      console.error("Failed to load book metadata", error);
      const message =
        error?.response?.data?.message || "Unable to load book details for transactions.";
      setBooksError(message);
      return null;
    } finally {
      setBooksLoading(false);
    }
  }, [bookLookups]);

  const loadStudentAttributeOptions = useCallback(async () => {
    try {
      setAttributeLoading(true);
      setAttributeError("");
      const response = await usersAPI.getProfileAttributes();
      const normalized = ensureUserAttributes(response.data);
      setAttributeOptions(normalized);
      setProfileData((prev) => {
        if (!prev || typeof prev !== "object") {
          return prev;
        }

        const rawGrade = prev.grade || prev.gradeLevel || "";
        const normalizedGrade = typeof rawGrade === "string" ? rawGrade.trim() : "";
        const gradeExists = normalized.gradeStructure.some((entry = {}) => {
          const gradeName = typeof entry.grade === "string" ? entry.grade.trim().toLowerCase() : "";
          return gradeName && normalizedGrade && gradeName === normalizedGrade.toLowerCase();
        });
        const nextGrade = gradeExists ? normalizedGrade : "";
        const availableSections = getSectionsForGrade(normalized.gradeStructure, nextGrade);
        const sectionExists = availableSections.includes(prev.section);

        return {
          ...prev,
          grade: nextGrade,
          gradeLevel: nextGrade || prev.gradeLevel || "",
          section: sectionExists ? prev.section : "",
        };
      });
    } catch (error) {
      console.error("Failed to load profile attribute options", error);
      setAttributeError("Unable to load grade and section options.");
    } finally {
      setAttributeLoading(false);
    }
  }, []);

  const resolveBookDetailsFromTransaction = (transaction = {}, lookups = null) => {
    const fallbackTitle =
      transaction.bookTitle ||
      transaction.title ||
      transaction.book?.title ||
      "Unknown Book";
    const fallbackAuthor =
      transaction.author ||
      transaction.bookAuthor ||
      transaction.book?.author ||
      "";

    const items = Array.isArray(transaction.items) ? transaction.items : [];
    const lookupTitles = [];
    const lookupAuthors = [];

    const registerLookupRecord = (record) => {
      if (!record) return;
      if (record.title) {
        lookupTitles.push(record.title);
      }
      if (record.author) {
        lookupAuthors.push(record.author);
      }
    };

    const tryLookupByBookId = (value) => {
      if (!value || !lookups?.byBookId) return;
      const record = lookups.byBookId.get(String(value));
      registerLookupRecord(record);
    };

    const tryLookupByCopyId = (value) => {
      if (!value || !lookups?.byCopyId) return;
      const record = lookups.byCopyId.get(String(value));
      registerLookupRecord(record);
    };

    const tryLookupByIsbn = (value) => {
      if (!value || !lookups?.byIsbn) return;
      const record = lookups.byIsbn.get(String(value).toLowerCase());
      registerLookupRecord(record);
    };

    if (transaction.bookId) {
      tryLookupByBookId(transaction.bookId);
    }
    if (transaction.isbn) {
      tryLookupByIsbn(transaction.isbn);
    }

    items.forEach((item) => {
      tryLookupByBookId(item?.bookId);
      tryLookupByCopyId(item?.copyId);
      tryLookupByIsbn(item?.isbn);
    });

    const itemDerivedTitles = items
      .map((item) =>
        item?.book?.title || item?.title || item?.isbn || item?.copyId || "",
      )
      .filter(Boolean);
    const itemDerivedAuthors = items
      .map((item) => item?.book?.author || item?.author || "")
      .filter(Boolean);

    const combinedTitles = [...lookupTitles, ...itemDerivedTitles];
    const combinedAuthors = [...lookupAuthors, ...itemDerivedAuthors];

    return {
      title:
        combinedTitles.length > 0
          ? summarizeValues(combinedTitles)
          : fallbackTitle,
      author:
        combinedAuthors.length > 0
          ? summarizeValues(combinedAuthors)
          : fallbackAuthor,
    };
  };

  const normalizeBorrowingHistoryRecords = (records = [], lookups = null) => {
    if (!Array.isArray(records)) {
      return [];
    }

    return records.map((transaction) => {
      const { title, author } = resolveBookDetailsFromTransaction(transaction, lookups);
      return {
        ...transaction,
        bookTitle: title,
        author,
      };
    });
  };

  useEffect(() => {
    const initializeProfile = async () => {
      if (!user) return;

      setError("");
      setSuccess("");

      const currentUserId = getUserIdentifier(user);
      const viewingSelf = !id || id === currentUserId;
      setIsSelfProfile(viewingSelf);

      if (!viewingSelf) {
        setEditMode(false);
        setChangePasswordDialog(false);
      }

      if (viewingSelf) {
        setProfileData(hydrateProfileData(user));
        const history = await fetchBorrowingHistory(currentUserId, true);
        await fetchUserStats(currentUserId, true, history);
      } else {
        await loadProfileById(id);
      }
    };

    initializeProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, id]);

  useEffect(() => {
    if (!user || !isStudentProfileView) {
      return;
    }
    loadStudentAttributeOptions();
  }, [user, isStudentProfileView, loadStudentAttributeOptions]);

  const loadProfileById = async (targetUserId) => {
    try {
      setProfileLoading(true);
      const response = await api.get(`/users/${targetUserId}`);
      setProfileData(hydrateProfileData(response.data));
      await fetchBorrowingHistory(targetUserId, false);
    } catch (err) {
      console.error("Error loading user profile:", err);
      setError("Failed to load user profile");
    } finally {
      setProfileLoading(false);
    }
  };

  const fetchBorrowingHistory = async (targetUserId, viewingSelf) => {
    try {
      let response;
      if (viewingSelf) {
        response = await api.get("/users/profile/borrowing-history");
      } else {
        response = await api.get(`/transactions/user/${targetUserId}`);
      }

      const historyData = Array.isArray(response.data)
        ? response.data
        : response.data?.transactions || [];

      const lookups = await loadBookLookups();
      const normalizedHistory = normalizeBorrowingHistoryRecords(historyData, lookups);

      setBorrowingHistory(normalizedHistory);

      if (!viewingSelf) {
        setStats(computeStatsFromHistory(normalizedHistory));
      }

      return normalizedHistory;
    } catch (err) {
      console.error("Error fetching borrowing history:", err);
      if (!viewingSelf) {
        setStats(computeStatsFromHistory([]));
      }
      return [];
    }
  };

  const fetchUserStats = async (targetUserId, viewingSelf, historyData) => {
    if (!viewingSelf) {
      setStats(computeStatsFromHistory(historyData || []));
      return;
    }

    try {
      const response = await api.get("/users/profile/stats");
      setStats(response.data);
    } catch (err) {
      console.error("Error fetching user stats:", err);
    }
  };

  const availableGradeOptions = useMemo(() => {
    const structureGrades = (attributeOptions.gradeStructure || [])
      .map((entry = {}) => entry.grade)
      .filter(Boolean);
    if (structureGrades.length > 0) {
      return structureGrades;
    }
    return attributeOptions.gradeLevels || [];
  }, [attributeOptions]);

  const selectedGrade = profileData.grade || "";
  const availableSections = useMemo(
    () => getSectionsForGrade(attributeOptions.gradeStructure, selectedGrade),
    [attributeOptions, selectedGrade]
  );
  const hasGradeOptions = availableGradeOptions.length > 0;
  const hasSectionOptions = availableSections.length > 0;
  const shouldRenderSectionSelect = Boolean(selectedGrade) && hasSectionOptions;
  const selectedSection = profileData.section || "";

  const handleGradeSelectChange = (value) => {
    const normalizedValue = typeof value === "string" ? value : "";
    setProfileData((prev) => {
      const allowedSections = getSectionsForGrade(attributeOptions.gradeStructure, normalizedValue);
      const nextSection = normalizedValue && allowedSections.includes(prev.section) ? prev.section : "";
      return {
        ...prev,
        grade: normalizedValue,
        gradeLevel: normalizedValue,
        section: nextSection,
      };
    });
  };

  const handleSectionSelectChange = (value) => {
    setProfileData((prev) => ({
      ...prev,
      section: typeof value === "string" ? value : "",
    }));
  };

  const handleProfileUpdate = async () => {
    if (!isSelfProfile) return;

    try {
      setLoading(true);
      const targetId = getUserIdentifier(profileData);
      if (!targetId) {
        setError("Unable to determine user identifier");
        return;
      }

      const updatePayload = {
        firstName: profileData.firstName,
        lastName: profileData.lastName,
        phoneNumber: sanitizePhoneInput(profileData.phoneNumber),
        address: profileData.address,
      };

      if (isStudentProfileView) {
        const hasGradeField = Object.prototype.hasOwnProperty.call(profileData || {}, "grade");
        const hasSectionField = Object.prototype.hasOwnProperty.call(profileData || {}, "section");

        if (hasGradeField) {
          const trimmedGrade =
            typeof profileData.grade === "string"
              ? profileData.grade.trim()
              : profileData.grade ?? "";
          updatePayload.grade = trimmedGrade;
          updatePayload.gradeLevel = trimmedGrade;
        }

        if (hasSectionField) {
          const trimmedSection =
            typeof profileData.section === "string"
              ? profileData.section.trim()
              : profileData.section ?? "";
          updatePayload.section = trimmedSection;
        }
      }

      await api.put(`/users/${targetId}`, updatePayload);
      setSuccess("Profile updated successfully");
      setProfileData((prev) => ({
        ...prev,
        ...updatePayload,
        gradeLevel:
          updatePayload.grade !== undefined
            ? updatePayload.grade
            : prev?.gradeLevel,
      }));
      if (isSelfProfile) {
        updateUserData((prev) => {
          const base = prev || {};
          return {
            ...base,
            ...updatePayload,
            gradeLevel:
              updatePayload.grade !== undefined ? updatePayload.grade : base.gradeLevel,
            grade:
              updatePayload.grade !== undefined ? updatePayload.grade : base.grade,
            section:
              updatePayload.section !== undefined ? updatePayload.section : base.section,
          };
        });
      }
      setEditMode(false);
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError("Failed to update profile");
      console.error("Error updating profile:", err);
    } finally {
      setLoading(false);
    }
  };

  const resetPasswordDialogState = useCallback(() => {
    setPasswordData(createPasswordFormState());
    setPasswordErrors(createPasswordErrorState());
  }, []);

  const handlePasswordFieldChange = (field) => (event) => {
    const value = event.target.value;
    setPasswordData((prev) => ({ ...prev, [field]: value }));
    setPasswordErrors((prev) => {
      const next = { ...prev, general: "" };
      if (field === "currentPassword") {
        next.current = "";
      } else if (field === "newPassword") {
        next.new = "";
      } else {
        next.confirm = "";
      }
      return next;
    });
  };

  const handlePasswordDialogOpen = () => {
    resetPasswordDialogState();
    setChangePasswordDialog(true);
  };

  const handlePasswordDialogClose = () => {
    setChangePasswordDialog(false);
    resetPasswordDialogState();
  };

  const handlePasswordChange = async () => {
    if (!isSelfProfile) return;

    const trimmedCurrent = passwordData.currentPassword.trim();
    const trimmedNew = passwordData.newPassword.trim();
    const trimmedConfirm = passwordData.confirmPassword.trim();

    const nextErrors = createPasswordErrorState();

    if (!trimmedCurrent) {
      nextErrors.current = "Current password is required.";
    }

    if (!trimmedNew) {
      nextErrors.new = "New password is required.";
    }

    if (!trimmedConfirm) {
      nextErrors.confirm = "Please confirm the new password.";
    }

    if (!nextErrors.new && trimmedNew.length < PASSWORD_MIN_LENGTH) {
      nextErrors.new = `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
    }

    if (!nextErrors.confirm && trimmedNew && trimmedConfirm && trimmedNew !== trimmedConfirm) {
      nextErrors.confirm = "New passwords do not match.";
    }

    if (nextErrors.current || nextErrors.new || nextErrors.confirm) {
      setPasswordErrors(nextErrors);
      return;
    }

    try {
      setLoading(true);
      await api.post("/auth/change-password", {
        currentPassword: trimmedCurrent,
        newPassword: trimmedNew,
      });
      setSuccess("Password changed successfully");
      setChangePasswordDialog(false);
      resetPasswordDialogState();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      const derivedMessage = derivePasswordChangeError(err);
      setPasswordErrors((prev) => ({
        ...prev,
        general: derivedMessage,
      }));
      console.error("Error changing password:", err);
    } finally {
      setLoading(false);
    }
  };

  const resetAvatarSelection = () => {
    setAvatarPreviewUrl("");
    setSelectedAvatarFile(null);
    setCroppedAreaPixels(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleAvatarFileSelect = (event) => {
    const file = event.target.files?.[0];
    if (!file || avatarUploading) {
      return;
    }

    setError("");
    setSuccess("");

    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file.");
      if (event.target) {
        event.target.value = "";
      }
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("Please upload an image that is 5 MB or smaller.");
      if (event.target) {
        event.target.value = "";
      }
      return;
    }

    if (avatarPreviewUrl) {
      URL.revokeObjectURL(avatarPreviewUrl);
    }

    const previewUrl = URL.createObjectURL(file);
    setSelectedAvatarFile(file);
    setAvatarPreviewUrl(previewUrl);
    setAvatarProgress(0);
    setAvatarDialogOpen(true);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleAvatarDialogClose = () => {
    if (avatarUploading) {
      return;
    }
    setAvatarDialogOpen(false);
    resetAvatarSelection();
    setAvatarProgress(0);
  };

  const handleCropComplete = useCallback((_, areaPixels) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const uploadSelectedAvatar = async () => {
    if (!selectedAvatarFile) {
      return;
    }

    const targetId = getUserIdentifier(profileData) || getUserIdentifier(user);
    if (!targetId) {
      setError("Unable to determine the user identifier for this profile.");
      return;
    }

    try {
      setError("");
      setSuccess("");
      setAvatarUploading(true);
      setAvatarProgress(0);

      let fileToUpload = selectedAvatarFile;
      if (croppedAreaPixels) {
        try {
          const { file: croppedFile } = await getCroppedImage(selectedAvatarFile, croppedAreaPixels);
          fileToUpload = croppedFile;
        } catch (cropError) {
          console.error("Error cropping avatar:", cropError);
          setError("Failed to crop image. Please try again or choose a different photo.");
          setAvatarUploading(false);
          return;
        }
      }

      const response = await usersAPI.uploadAvatar(
        targetId,
        fileToUpload,
        (value) => setAvatarProgress(value || 0),
      );

      const updatedAvatar = response.data?.avatar;
      const updatedAvatarUrl = response.data?.avatarUrl || updatedAvatar?.url || "";

      setProfileData((prev) => ({
        ...prev,
        avatar: updatedAvatar,
        avatarUrl: updatedAvatarUrl,
      }));

      if (isSelfProfile) {
        updateUserData((prev) => ({
          ...(prev || {}),
          avatar: updatedAvatar,
          avatarUrl: updatedAvatarUrl,
        }));
      }

      setSuccess("Profile photo updated successfully");
      setTimeout(() => setSuccess(""), 3000);
      setAvatarDialogOpen(false);
      resetAvatarSelection();
      setAvatarProgress(0);
    } catch (err) {
      const message = err?.response?.data?.message || "Failed to upload profile photo";
      setError(message);
      console.error("Error uploading avatar:", err);
    } finally {
      setAvatarUploading(false);
      setAvatarProgress(0);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "active":
        return "primary";
      case "returned":
        return "success";
      case "overdue":
        return "error";
      default:
        return "default";
    }
  };

  const togglePasswordVisibility = (field) => {
    setShowPasswords((prev) => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  const avatarUrl = getAvatarUrl(profileData);
  const isPasswordSubmitDisabled =
    loading ||
    !passwordData.currentPassword.trim() ||
    !passwordData.newPassword.trim() ||
    !passwordData.confirmPassword.trim();

  return (
    <Box>
      <Box display="flex" alignItems="center" gap={1.5} mb={2}>
        <IconButton aria-label="Go back" onClick={() => navigate(-1)}>
          <ArrowBack />
        </IconButton>
        <Typography variant="h4" gutterBottom sx={{ mb: 0 ,color: 'white'}}>
          {isSelfProfile ? "My Profile" : "User Profile"} {" "}
        </Typography>
      </Box>
      {profileLoading && (
        <Box
          display="flex"
          alignItems="center"
          gap={1}
          color="text.secondary"
          sx={{ mb: 2 }}
        >
          <CircularProgress size={20} />
          <Typography variant="body2">Loading user profile...</Typography>
        </Box>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {" "}
          {error}{" "}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {" "}
          {success}{" "}
        </Alert>
      )}
      <Grid container spacing={3}>
        {" "}
        {/* Profile Information */}{" "}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box
                display="flex"
                flexDirection="column"
                alignItems="center"
                mb={3}
              >
                <Box position="relative" display="inline-flex">
                  <Avatar
                    src={avatarUrl || undefined}
                    alt={profileData?.firstName || profileData?.username || "Profile"}
                    sx={{
                      width: 100,
                      height: 100,
                      mb: 2,
                      bgcolor: avatarUrl ? "transparent" : "primary.main",
                      fontSize: "2.5rem",
                      color: "primary.contrastText",
                    }}
                  >
                    {getAvatarInitial(profileData) || <Person />} {" "}
                  </Avatar>
                  {avatarUploading && (
                    <Box
                      position="absolute"
                      top={0}
                      left={0}
                      width="100%"
                      height="100%"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      borderRadius="50%"
                      sx={{ bgcolor: "rgba(15, 23, 42, 0.45)" }}
                    >
                      <CircularProgress size={42} sx={{ color: "#ffffff" }} />
                    </Box>
                  )}
                  {isSelfProfile && (
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={handleAvatarFileSelect}
                      />
                      <Tooltip title="Change profile photo">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => fileInputRef.current?.click()}
                          sx={{
                            position: "absolute",
                            bottom: -4,
                            right: -4,
                            bgcolor: "background.paper",
                            boxShadow: 2,
                            "&:hover": {
                              bgcolor: "background.paper",
                            },
                          }}
                        >
                          <PhotoCamera fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </>
                  )}
                </Box>
                {avatarUploading && (
                  <Box width="100%" mt={1}>
                    <LinearProgress
                      variant={avatarProgress > 0 ? "determinate" : "indeterminate"}
                      value={avatarProgress}
                    />
                  </Box>
                )}
                <Typography variant="h6">
                  {" "}
                  {profileData.firstName} {profileData.lastName}{" "}
                </Typography>{" "}
                {profileData.role && (
                  <Chip
                    label={profileData.role}
                    color="primary"
                    size="small"
                    sx={{ textTransform: "capitalize" }}
                  />
                )}{" "}
              </Box>
              <Divider sx={{ mb: 2 }} />
              <List>
                <ListItem>
                  <ListItemIcon>
                    <Person />
                  </ListItemIcon>{" "}
                  <ListItemText
                    primary="Username"
                    secondary={profileData.username}
                  />{" "}
                </ListItem>{" "}
                <ListItem>
                  <ListItemIcon>
                    <Email />
                  </ListItemIcon>{" "}
                  <ListItemText
                    primary="Email"
                    secondary={profileData.email}
                  />{" "}
                </ListItem>{" "}
                {/* Student-specific details: shown when this profile is a student */}
                {profileData.role === "student" && (
                  <>
                    {profileData.libraryCardNumber && (
                      <ListItem>
                        <ListItemIcon>
                          <Assignment />
                        </ListItemIcon>
                        <ListItemText primary="Library Card" secondary={profileData.libraryCardNumber} />
                      </ListItem>
                    )}
                    {profileData.studentId && (
                      <ListItem>
                        <ListItemIcon>
                          <School />
                        </ListItemIcon>
                        <ListItemText primary="Student ID" secondary={profileData.studentId} />
                      </ListItem>
                    )}
                    {profileData.lrn && (
                      <ListItem>
                        <ListItemIcon>
                          <Assignment />
                        </ListItemIcon>
                        <ListItemText primary="LRN" secondary={profileData.lrn} />
                      </ListItem>
                    )}
                    {(profileData.grade || profileData.section) && (
                      <ListItem>
                        <ListItemIcon>
                          <LibraryBooks />
                        </ListItemIcon>
                        <ListItemText
                          primary="Grade / Section"
                          secondary={`${profileData.grade || ""}${profileData.grade && profileData.section ? " • " : ""}${profileData.section || ""}`}
                        />
                      </ListItem>
                    )}
                    {profileData.fullAddress && (
                      <ListItem>
                        <ListItemText primary="Address" secondary={profileData.fullAddress} />
                      </ListItem>
                    )}
                  </>
                )}
                {profileData.phoneNumber && (
                  <ListItem>
                    <ListItemIcon>
                      <Phone />
                    </ListItemIcon>{" "}
                    <ListItemText
                      primary="Phone"
                      secondary={profileData.phoneNumber}
                    />{" "}
                  </ListItem>
                )}{" "}
                {profileData.curriculum && (
                  <ListItem>
                    <ListItemText
                      primary="Curriculum"
                      secondary={profileData.curriculum}
                    />{" "}
                  </ListItem>
                )}{" "}
              </List>
              <Box mt={2}>
                {isSelfProfile && (
                  <Box>
                    <Button
                      fullWidth
                      variant="outlined"
                      startIcon={<Edit />}
                      onClick={() => setEditMode(true)}
                      sx={{ mb: 1 }}
                    >
                      Edit Profile{" "}
                    </Button>{" "}
                    <Button
                      fullWidth
                      variant="outlined"
                      startIcon={<Security />}
                      onClick={handlePasswordDialogOpen}
                    >
                      Change Password{" "}
                    </Button>{" "}
                  </Box>
                )}
                {!isSelfProfile && profileData.role === "student" && (user && (user.role === "admin" || user.role === "librarian" || user.role === "staff")) && (
                  <Box mt={2}>
                    <Button
                      fullWidth
                      variant="contained"
                      onClick={() => {
                        const targetId = profileData._id || profileData.id;
                        if (targetId) navigate(`/students/${targetId}/edit`);
                      }}
                    >
                      Edit Student Record
                    </Button>
                  </Box>
                )}
              </Box>{" "}
            </CardContent>{" "}
          </Card>
        </Grid>
        {/* Statistics and Activity */}
        <Grid item xs={12} md={8}>
          {/* Statistics Cards */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={6} md={3}>
              <Card>
                <CardContent sx={{ textAlign: "center" }}>
                  <LibraryBooks color="primary" sx={{ fontSize: 40, mb: 1 }} />
                  <Typography variant="h6">{stats.totalBorrowings}</Typography>
                  <Typography variant="body2" color="textSecondary">
                    Total Borrowed
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} md={3}>
              <Card>
                <CardContent sx={{ textAlign: "center" }}>
                  <Assignment color="info" sx={{ fontSize: 40, mb: 1 }} />
                  <Typography variant="h6">{stats.currentlyBorrowed}</Typography>
                  <Typography variant="body2" color="textSecondary">
                    Currently Borrowed
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            {finesEnabled ? (
              <Grid item xs={6} md={3}>
                <Card>
                  <CardContent sx={{ textAlign: "center" }}>
                    <Warning color="error" sx={{ fontSize: 40, mb: 1 }} />
                    <Typography variant="h6">{stats.overdueBorrowings}</Typography>
                    <Typography variant="body2" color="textSecondary">
                      Overdue
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ) : null}
            {finesEnabled ? (
              <Grid item xs={6} md={3}>
                <Card>
                  <CardContent sx={{ textAlign: "center" }}>
                    <Typography variant="h6" color="error">
                      {formatCurrency(stats.totalFines)}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      Total Fines
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ) : null}
          </Grid>
          {/* Borrowing History */}
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Recent Borrowing History
              </Typography>
              {booksLoading && (
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                  Resolving book titles...
                </Typography>
              )}
              {booksError && (
                <Alert severity="warning" sx={{ mb: 1 }}>
                  {booksError}
                </Alert>
              )}
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Book Title</TableCell>
                      <TableCell>Borrow Date</TableCell>
                      <TableCell>Due Date</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {borrowingHistory.slice(0, 10).map((transaction) => (
                      <TableRow key={transaction._id}>
                        <TableCell>
                          <Typography variant="body2" fontWeight="medium">
                            {transaction.bookTitle || "Unknown Book"}
                          </Typography>
                          {transaction.author && (
                            <Typography variant="caption" color="textSecondary">
                              {transaction.author}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          {new Date(transaction.borrowDate).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          {new Date(transaction.dueDate).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={transaction.status}
                            color={getStatusColor(transaction.status)}
                            size="small"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {borrowingHistory.length === 0 && (
                <Typography
                  textAlign="center"
                  color="textSecondary"
                  sx={{ py: 3 }}
                >
                  No borrowing history found
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      {isSelfProfile && (
        <>
          {/* Avatar Preview Dialog */}
          <Dialog
            open={avatarDialogOpen}
            onClose={handleAvatarDialogClose}
            maxWidth="xs"
            fullWidth
          >
            <DialogTitle>Preview Profile Photo</DialogTitle>
            <DialogContent>
              {avatarPreviewUrl ? (
                <>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Drag the image to reposition and use the slider to adjust zoom. The cropped area will be saved as your profile photo.
                  </Typography>
                  <Box
                    sx={{
                      position: "relative",
                      width: "100%",
                      height: 280,
                      bgcolor: "#0F172A0A",
                      borderRadius: 2,
                      overflow: "hidden",
                    }}
                  >
                    <Cropper
                      image={avatarPreviewUrl}
                      crop={crop}
                      zoom={zoom}
                      aspect={1}
                      cropShape="round"
                      showGrid={false}
                      onCropChange={setCrop}
                      onZoomChange={setZoom}
                      onCropComplete={handleCropComplete}
                      objectFit="cover"
                    />
                  </Box>
                  <Box mt={3}>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Zoom
                    </Typography>
                    <Slider
                      value={zoom}
                      min={1}
                      max={3}
                      step={0.05}
                      onChange={(_, value) => {
                        if (typeof value === "number") {
                          setZoom(value);
                        }
                      }}
                      disabled={avatarUploading}
                      aria-label="Zoom"
                    />
                  </Box>
                </>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Select an image to preview it before uploading.
                </Typography>
              )}
              {avatarUploading && (
                <Box mt={2}>
                  <LinearProgress
                    variant={avatarProgress > 0 ? "determinate" : "indeterminate"}
                    value={avatarProgress}
                  />
                </Box>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={handleAvatarDialogClose} disabled={avatarUploading}>
                Cancel
              </Button>
              <Button
                onClick={uploadSelectedAvatar}
                variant="contained"
                disabled={!selectedAvatarFile || avatarUploading}
              >
                {avatarUploading ? "Uploading..." : "Upload"}
              </Button>
            </DialogActions>
          </Dialog>
          {/* Edit Profile Dialog */}
          <Dialog
            open={editMode}
            onClose={() => setEditMode(false)}
            maxWidth="sm"
            fullWidth
          >
            <DialogTitle> Edit Profile </DialogTitle>
            <DialogContent>
              {isStudentProfileView && attributeError && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  {attributeError}
                </Alert>
              )}
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="First Name"
                    value={profileData.firstName || ""}
                    onChange={(e) =>
                      setProfileData({
                        ...profileData,
                        firstName: e.target.value,
                      })
                    }
                    margin="normal"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Last Name"
                    value={profileData.lastName || ""}
                    onChange={(e) =>
                      setProfileData({
                        ...profileData,
                        lastName: e.target.value,
                      })
                    }
                    margin="normal"
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Phone Number"
                    value={profileData.phoneNumber || ""}
                    onChange={(e) =>
                      setProfileData({
                        ...profileData,
                        phoneNumber: sanitizePhoneInput(e.target.value),
                      })
                    }
                    margin="normal"
                    inputProps={{ inputMode: "numeric", pattern: "[0-9]*", maxLength: 11 }}
                  />
                </Grid>
                {isStudentProfileView && (
                  <>
                    <Grid item xs={12} sm={6}>
                      {hasGradeOptions ? (
                        <TextField
                          select
                          fullWidth
                          label="Grade Level"
                          value={selectedGrade}
                          onChange={(e) => handleGradeSelectChange(e.target.value)}
                          margin="normal"
                          disabled={attributeLoading}
                        >
                          <MenuItem value="">
                            <em>Select grade</em>
                          </MenuItem>
                          {availableGradeOptions.map((gradeOption) => (
                            <MenuItem key={gradeOption} value={gradeOption}>
                              {gradeOption}
                            </MenuItem>
                          ))}
                        </TextField>
                      ) : (
                        <TextField
                          fullWidth
                          label="Grade Level"
                          value={selectedGrade}
                          onChange={(e) => handleGradeSelectChange(e.target.value)}
                          margin="normal"
                          disabled={attributeLoading}
                          helperText="Enter grade level"
                        />
                      )}
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      {shouldRenderSectionSelect ? (
                        <TextField
                          select
                          fullWidth
                          label="Section"
                          value={selectedSection}
                          onChange={(e) => handleSectionSelectChange(e.target.value)}
                          margin="normal"
                          disabled={attributeLoading}
                        >
                          <MenuItem value="">
                            <em>Select section</em>
                          </MenuItem>
                          {availableSections.map((sectionOption) => (
                            <MenuItem key={sectionOption} value={sectionOption}>
                              {sectionOption}
                            </MenuItem>
                          ))}
                        </TextField>
                      ) : (
                        <TextField
                          fullWidth
                          label="Section"
                          value={selectedSection}
                          onChange={(e) => handleSectionSelectChange(e.target.value)}
                          margin="normal"
                          disabled={
                            attributeLoading || (hasSectionOptions && !selectedGrade)
                          }
                          helperText={
                            !selectedGrade && hasSectionOptions
                              ? "Select a grade to choose a section"
                              : selectedGrade && !hasSectionOptions
                              ? "No sections configured for this grade"
                              : "Enter section"
                          }
                        />
                      )}
                    </Grid>
                  </>
                )}
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Address"
                    multiline
                    rows={3}
                    value={profileData.address || ""}
                    onChange={(e) =>
                      setProfileData({
                        ...profileData,
                        address: e.target.value,
                      })
                    }
                    margin="normal"
                  />
                </Grid>
              </Grid>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setEditMode(false)} startIcon={<Cancel />}>
                Cancel
              </Button>
              <Button
                onClick={handleProfileUpdate}
                variant="contained"
                disabled={loading}
                startIcon={<Save />}
              >
                {loading ? "Saving..." : "Save Changes"}
              </Button>
            </DialogActions>
          </Dialog>
          {/* Change Password Dialog */}
          <Dialog
            open={changePasswordDialog}
            onClose={handlePasswordDialogClose}
            maxWidth="sm"
            fullWidth
          >
            <DialogTitle> Change Password </DialogTitle>
            <DialogContent>
              {passwordErrors.general && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {passwordErrors.general}
                </Alert>
              )}
              <TextField
                fullWidth
                label="Current Password"
                autoComplete="off"
                type={showPasswords.current ? "text" : "password"}
                value={passwordData.currentPassword}
                onChange={handlePasswordFieldChange("currentPassword")}
                margin="normal"
                error={Boolean(passwordErrors.current)}
                helperText={passwordErrors.current || " "}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => togglePasswordVisibility("current")}
                        edge="end"
                      >
                        {showPasswords.current ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              <TextField
                fullWidth
                label="New Password"
                autoComplete="new-password"
                type={showPasswords.new ? "text" : "password"}
                value={passwordData.newPassword}
                onChange={handlePasswordFieldChange("newPassword")}
                margin="normal"
                error={Boolean(passwordErrors.new)}
                helperText={
                  passwordErrors.new ||
                  `Minimum of ${PASSWORD_MIN_LENGTH} characters.`
                }
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => togglePasswordVisibility("new")}
                        edge="end"
                      >
                        {showPasswords.new ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              <TextField
                fullWidth
                label="Confirm New Password"
                autoComplete="new-password"
                type={showPasswords.confirm ? "text" : "password"}
                value={passwordData.confirmPassword}
                onChange={handlePasswordFieldChange("confirmPassword")}
                margin="normal"
                error={Boolean(passwordErrors.confirm)}
                helperText={passwordErrors.confirm || "Must match the new password."}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => togglePasswordVisibility("confirm")}
                        edge="end"
                      >
                        {showPasswords.confirm ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            </DialogContent>
            <DialogActions>
              <Button
                onClick={handlePasswordDialogClose}
                startIcon={<Cancel />}
              >
                Cancel
              </Button>
              <Button
                onClick={handlePasswordChange}
                variant="contained"
                disabled={isPasswordSubmitDisabled}
                startIcon={<Save />}
              >
                {loading ? "Changing..." : "Change Password"}
              </Button>
            </DialogActions>
          </Dialog>
        </>
      )}
    </Box>
  );
};

export default UserProfile;
