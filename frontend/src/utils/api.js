import axios from "axios";
import toast from "react-hot-toast";

const DEFAULT_BASE_URL = "http://localhost:5001/api";

const normalizeBaseUrl = (value) => {
  const fallback = DEFAULT_BASE_URL;
  if (!value) {
    return fallback;
  }

  const trimmed = value.trim().replace(/\/+$/, "");
  if (trimmed.toLowerCase().endsWith("/api")) {
    return trimmed;
  }

  return `${trimmed}/api`;
};

// Create axios instance
const api = axios.create({
  baseURL: normalizeBaseUrl(process.env.REACT_APP_API_URL),
  timeout: 30000,
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("authToken");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
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
    return response;
  },
  (error) => {
    const { response } = error;

    if (response) {
      const { status, data } = response;

      switch (status) {
        case 401:
          // Unauthorized - token expired or invalid
          localStorage.removeItem("authToken");
          localStorage.removeItem("userData");
          if (window.location.pathname !== "/login") {
            toast.error("Session expired. Please login again.");
            window.location.href = "/login";
          }
          break;
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

// API helper functions
export const authAPI = {
  login: (usernameOrEmail, password) =>
    api.post("/auth/login", { usernameOrEmail, password }),
  logout: () => api.post("/auth/logout"),
  getProfile: () => api.get("/auth/profile"),
  updateProfile: (data) => api.put("/auth/profile", data),
  verifyToken: () => api.get("/auth/verify"),
};

export const usersAPI = {
  getAll: (params) => api.get("/users", { params }),
  getById: (id) => api.get(`/users/${id}`),
  create: (data) => api.post("/users", data),
  update: (id, data) => api.put(`/users/${id}`, data),
  updateStatus: (id, isActive) => api.put(`/users/${id}/status`, { isActive }),
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
  return: (id, data) => api.post(`/transactions/${id}/return`, data),
  renew: (id, data) => api.post(`/transactions/${id}/renew`, data),
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
  getByCategory: (category) => api.get(`/settings/category/${category}`),
  update: (key, value) => api.put(`/settings/${key}`, { value }),
  updateMultiple: (settings) => api.put("/settings/bulk", { settings }),
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
