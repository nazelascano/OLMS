import axios from "axios";
import toast from "react-hot-toast";

const DEFAULT_BASE_URL = "http://localhost:5001/api";
const DEV_SERVER_PORTS = new Set(["3000", "3001", "5173"]);
const SESSION_REFRESH_HEADER = "x-session-refresh";

const dispatchTokenRefresh = (token) => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent("olms-token-refresh", {
      detail: { token },
    }),
  );
};

const persistRefreshedToken = (token) => {
  if (typeof window === "undefined") {
    return;
  }

  if (token) {
    window.localStorage.setItem("authToken", token);
  }
  dispatchTokenRefresh(token);
  try {
    if (token) {
      window.sessionStorage.setItem("authToken", token);
    } else {
      window.sessionStorage.removeItem("authToken");
    }
  } catch (error) {
    console.warn("Failed to persist session token copy", error);
  }
};

const handleSessionRefreshHeader = (response) => {
  if (!response || typeof window === "undefined") {
    return;
  }
  const headerToken = response.headers?.[SESSION_REFRESH_HEADER];
  if (headerToken) {
    persistRefreshedToken(headerToken);
    window.sessionStorage.setItem("authTokenRefreshedAt", Date.now().toString());
  }
};

const attachAuthHeader = (config, token) => {
  if (!config || !token) {
    return config;
  }
  if (config.headers && typeof config.headers.set === "function") {
    config.headers.set("Authorization", `Bearer ${token}`);
  } else {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
};

let silentVerifyPromise = null;
const runSilentSessionCheck = async () => {
  if (silentVerifyPromise) {
    return silentVerifyPromise;
  }
  silentVerifyPromise = api
    .get("/auth/verify", { __skipAuthHandler: true })
    .then((response) => {
      const sessionToken = response?.data?.token;
      if (sessionToken) {
        persistRefreshedToken(sessionToken);
      }
      return true;
    })
    .catch((probeError) => {
      if (probeError?.response?.status === 401) {
        return false;
      }
      console.warn("Silent session check failed", probeError);
      return null;
    })
    .finally(() => {
      silentVerifyPromise = null;
    });
  return silentVerifyPromise;
};

const resolveAutomaticBaseUrl = () => {
  if (typeof window === "undefined") {
    return DEFAULT_BASE_URL;
  }

  const { protocol, hostname, port } = window.location;
  const normalizedPort = (port || "").trim();
  const backendPort =
    process.env.REACT_APP_API_PORT ||
    process.env.REACT_APP_BACKEND_PORT ||
    "5001";

  const isLoopbackHost = /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(hostname);
  if (isLoopbackHost) {
    return DEFAULT_BASE_URL;
  }

  if (!normalizedPort || normalizedPort === "80" || normalizedPort === "443") {
    return `${protocol}//${hostname}/api`;
  }

  if (DEV_SERVER_PORTS.has(normalizedPort)) {
    return `${protocol}//${hostname}:${backendPort}/api`;
  }

  return `${protocol}//${hostname}:${normalizedPort}/api`;
};

const shouldUseFallback = (candidate) => {
  if (typeof window === "undefined") {
    return false;
  }

  const loopbackPattern = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?/i;
  const isLoopbackCandidate = loopbackPattern.test(candidate);
  const isViewerLoopback = /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(
    window.location.hostname,
  );

  return isLoopbackCandidate && !isViewerLoopback;
};

const normalizeBaseUrl = (value) => {
  const fallback = resolveAutomaticBaseUrl();
  if (!value) {
    return fallback;
  }

  const trimmed = value.trim().replace(/\/+$/, "");

  if (shouldUseFallback(trimmed)) {
    return fallback;
  }
  if (trimmed.toLowerCase().endsWith("/api")) {
    return trimmed;
  }

  return `${trimmed}/api`;
};

const readBrowserToken = () => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return (
      window.localStorage.getItem("authToken") ||
      window.sessionStorage.getItem("authToken") ||
      null
    );
  } catch (error) {
    console.warn("Failed to read stored auth token", error);
    return null;
  }
};

// Create axios instance
const api = axios.create({
  baseURL: normalizeBaseUrl(process.env.REACT_APP_API_URL),
  timeout: 30000,
  withCredentials: true,
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = readBrowserToken();
    if (token) {
      attachAuthHeader(config, token);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => {
    handleSessionRefreshHeader(response);
    return response;
  },
  async (error) => {
    const { response, config } = error;
    const skipAuthHandler = Boolean(config?.__skipAuthHandler);

    if (response) {
      handleSessionRefreshHeader(response);
      const { status, data } = response;

      switch (status) {
        case 401: {
          if (!skipAuthHandler) {
            const storedToken = readBrowserToken();
            const alreadyRetried = Boolean(config?.__authRetryAttempted);

            if (storedToken && config && !alreadyRetried) {
              config.__authRetryAttempted = true;
              attachAuthHeader(config, storedToken);
              return api.request(config);
            }

            const sessionValid = await runSilentSessionCheck();
            if (sessionValid) {
              const refreshedToken = readBrowserToken();
              if (config) {
                config.__authRetryAttempted = true;
                attachAuthHeader(config, refreshedToken);
                return api.request(config);
              }
            }

            if (typeof window !== "undefined") {
              window.localStorage.removeItem("authToken");
              window.localStorage.removeItem("userData");
              try {
                window.sessionStorage.removeItem("authToken");
                window.sessionStorage.removeItem("userData");
              } catch (storageError) {
                console.warn("Failed to clear session storage copy", storageError);
              }
            }
            if (window.location.pathname !== "/login") {
              toast.error("Session expired. Please login again.");
              window.location.href = "/login";
            }
          }
          break;
        }
        case 403:
          toast.error("Access denied. Insufficient permissions.");
          break;
        case 404:
          toast.error("Resource not found.");
          break;
        case 422:
          // Validation errors
          if (data.errors) {
            data.errors.forEach((err) => toast.error(err.message));
          } else {
            toast.error(data.message || "Validation error");
          }
          break;
        case 429:
          toast.error("Too many requests. Please try again later.");
          break;
        case 500:
          toast.error("Server error. Please try again later.");
          break;
        default:
          toast.error(data.message || "An error occurred");
      }
    } else if (error.request) {
      // Network error
      toast.error("Network error. Please check your connection.");
    } else {
      // Other error
      toast.error("An unexpected error occurred.");
    }

    return Promise.reject(error);
  },
);

const SETTINGS_CATEGORY_ENDPOINTS = {
  library: "/settings/library",
  borrowing: "/settings/borrowing-rules",
  "borrowing-rules": "/settings/borrowing-rules",
  notifications: "/settings/notifications",
  system: "/settings/system",
  user: "/settings/user-attributes",
  "user-attributes": "/settings/user-attributes",
};

const resolveSettingsCategoryPath = (category) => {
  const normalized = String(category || "")
    .trim()
    .toLowerCase();

  if (!normalized) {
    throw new Error("Settings category is required");
  }

  return SETTINGS_CATEGORY_ENDPOINTS[normalized] || `/settings/${normalized}`;
};

// API helper functions
export const authAPI = {
  login: (usernameOrEmail, password) =>
    api.post(
      "/auth/login",
      { usernameOrEmail, password },
      { __skipAuthHandler: true },
    ),
  logout: () => api.post("/auth/logout", undefined, { __skipAuthHandler: true }),
  getProfile: () => api.get("/auth/profile"),
  updateProfile: (data) => api.put("/auth/profile", data),
  verifyToken: () => api.get("/auth/verify"),
  getPreferences: () => api.get("/auth/preferences"),
  updatePreferences: (preferences) =>
    api.put("/auth/preferences", { preferences }),
};

export const verifySession = (config = {}) => api.get("/auth/verify", config);

export const usersAPI = {
  getAll: (params) => api.get("/users", { params }),
  getById: (id) => api.get(`/users/${id}`),
  getRoles: () => api.get("/users/roles"),
  getProfileAttributes: () => api.get("/users/profile/user-attributes"),
  create: (data) => api.post("/users", data),
  update: (id, data) => api.put(`/users/${id}`, data),
  updateStatus: (id, isActive) => api.put(`/users/${id}/status`, { isActive }),
  resetPassword: (id, newPassword) =>
    api.post(`/users/${id}/reset-password`, { newPassword }),
  uploadAvatar: (id, file, onProgress) => {
    const formData = new FormData();
    formData.append("avatar", file);

    return api.post(`/users/${id}/avatar`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      onUploadProgress: (event) => {
        if (onProgress && event.total) {
          const percent = Math.round((event.loaded * 100) / event.total);
          onProgress(percent);
        }
      },
    });
  },
  delete: (id) => api.delete(`/users/${id}`),
  bulkImport: (students) => api.post("/users/bulk-import", { students }),
};

export const studentsAPI = {
  getAll: (params) => api.get("/students", { params }),
  getById: (id) => api.get(`/students/${id}`),
  create: (data) => api.post("/students", data),
  update: (id, data) => api.put(`/students/${id}`, data),
  delete: (id) => api.delete(`/students/${id}`),
  payDues: (id, data) => api.post(`/students/${id}/pay-dues`, data),
  getTransactions: (id, params) =>
    api.get(`/students/${id}/transactions`, { params }),
  bulkImport: (students) => api.post("/students/bulk-import", { students }),
};

export const booksAPI = {
  getAll: (params) => api.get("/books", { params }),
  getById: (id) => api.get(`/books/${id}`),
  create: (data) => api.post("/books", data),
  update: (id, data) => api.put(`/books/${id}`, data),
  delete: (id) => api.delete(`/books/${id}`),
  bulkImport: (books) => api.post("/books/bulk-import", { books }),
  downloadBarcodes: (bookId, params) =>
    api.get(`/books/${bookId}/copies/barcodes`, {
      params,
      responseType: "blob",
    }),
  getCopies: (bookId, params) => api.get(`/books/${bookId}/copies`, { params }),
  createCopy: (bookId, data) => api.post(`/books/${bookId}/copies`, data),
  updateCopy: (bookId, copyId, data) =>
    api.put(`/books/${bookId}/copies/${copyId}`, data),
  deleteCopy: (bookId, copyId) =>
    api.delete(`/books/${bookId}/copies/${copyId}`),
};

export const transactionsAPI = {
  getAll: (params) => api.get("/transactions", { params }),
  getById: (id) => api.get(`/transactions/${id}`),
  create: (data) => api.post("/transactions", data),
  update: (id, data) => api.put(`/transactions/${id}`, data),
  getStats: () => api.get("/transactions/stats"),
  return: (id, data) => api.post(`/transactions/${id}/return`, data),
  cancelRequest: (id, data) => api.post(`/transactions/cancel/${id}`, data),
  bulkReturn: (data) => api.post("/transactions/bulk-return", data),
  bulkAssign: (data) => api.post("/transactions/bulk-assign", data),
  generateReceipt: (id) => api.get(`/transactions/${id}/receipt`),
  getOverdue: (params) => api.get("/transactions/overdue", { params }),
  getAnnual: (params) => api.get("/transactions/annual", { params }),
};

export const annualSetsAPI = {
  getAll: (params) => api.get("/annual-sets", { params }),
  getById: (id) => api.get(`/annual-sets/${id}`),
  create: (data) => api.post("/annual-sets", data),
  update: (id, data) => api.put(`/annual-sets/${id}`, data),
  remove: (id) => api.delete(`/annual-sets/${id}`),
  preview: (data) => api.post("/annual-sets/preview", data),
  getIssueContext: (id, params) =>
    api.get(`/annual-sets/${id}/issue-context`, { params }),
  issue: (id, data) => api.post(`/annual-sets/${id}/issue`, data),
};

export const reportsAPI = {
  getStats: () => api.get("/reports/stats"),
  getDailyTrends: () => api.get("/reports/trends/daily"),
  getRecentOverdue: () => api.get("/reports/overdue/recent"),
  getRecentCheckouts: () => api.get("/reports/transactions/recent"),
  getDashboard: (params) => api.get("/reports/dashboard", { params }),
  getCirculation: (params) => api.get("/reports/circulation", { params }),
  getPopularBooks: (params) => api.get("/reports/popular-books", { params }),
  getUserActivity: (params) => api.get("/reports/user-activity", { params }),
  getFines: (params) => api.get("/reports/fines", { params }),
  getInventory: (params) => api.get("/reports/inventory", { params }),
  getMostBorrowed: (params) => api.get("/reports/most-borrowed", { params }),
  getActiveUsers: (params) => api.get("/reports/active-users", { params }),
  getTrends: (params) => api.get("/reports/trends", { params }),
  getOverdue: (params) => api.get("/reports/overdue", { params }),
  getAnnualCompliance: (params) =>
    api.get("/reports/annual-compliance", { params }),
  export: (type, params) =>
    api.get(`/reports/export/${type}`, {
      params,
      responseType: "blob",
    }),
};

export const settingsAPI = {
  getAll: () => api.get("/settings"),
  getByCategory: (category) => api.get(resolveSettingsCategoryPath(category)),
  update: (key, value) => api.put(`/settings/${key}`, { value }),
  updateMultiple: (settings) => api.put("/settings/bulk", { settings }),
  getUserAttributes: () => api.get("/settings/user-attributes"),
  updateUserAttributes: (data) => api.put("/settings/user-attributes", data),
};

export const auditAPI = {
  getLogs: (params) => api.get("/audit", { params }),
  getStats: (params) => api.get("/audit/stats", { params }),
  getSummary: (params) => api.get("/audit/stats/summary", { params }),
  getRecentActivity: (params) => api.get("/audit/recent/activity", { params }),
  getByUser: (userId, params) => api.get(`/audit/user/${userId}`, { params }),
  getByAction: (action, params) =>
    api.get(`/audit/action/${action}`, { params }),
  getById: (id) => api.get(`/audit/${id}`),
  exportCsv: (params) =>
    api.get("/audit/export/csv", {
      params,
      responseType: "blob",
    }),
};

export const searchAPI = {
  global: (params) => api.get("/search", { params }),
};

export const notificationsAPI = {
  getAll: (params) => api.get("/notifications", { params }),
  markRead: (id, read = true) => {
    const normalizedId = id === undefined || id === null ? "" : String(id).trim();
    if (!normalizedId) {
      return Promise.reject(new Error("Notification id is required"));
    }
    const encodedId = encodeURIComponent(normalizedId);
    return api.put(`/notifications/${encodedId}/read`, { read });
  },
  delete: (id) => api.delete(`/notifications/${id}`),
};

// File upload helper
export const uploadFile = async (file, endpoint, onProgress) => {
  const formData = new FormData();
  formData.append("file", file);

  return api.post(endpoint, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
    onUploadProgress: (progressEvent) => {
      if (onProgress) {
        const percentCompleted = Math.round(
          (progressEvent.loaded * 100) / progressEvent.total,
        );
        onProgress(percentCompleted);
      }
    },
  });
};

// Download helper
export const downloadFile = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

export { api };
