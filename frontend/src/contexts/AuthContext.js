import React, { createContext, useContext, useState, useEffect } from "react";
import { authAPI } from "../utils/api";

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
  const [authToken, setAuthToken] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("authToken");
    const userData = localStorage.getItem("userData");

    if (token && userData) {
      try {
        const parsedUser = JSON.parse(userData);
        setAuthToken(token);
        setUser(parsedUser);
      } catch (error) {
        console.error("Error parsing stored user data:", error);
        localStorage.removeItem("authToken");
        localStorage.removeItem("userData");
      }
    }

    setLoading(false);
  }, []);

  const login = async (username, password) => {
    try {
      const { data } = await authAPI.login(username, password);

      setAuthToken(data.token);
      setUser(data.user);
      localStorage.setItem("authToken", data.token);
      localStorage.setItem("userData", JSON.stringify(data.user));
      return { success: true, user: data.user };
    } catch (error) {
      console.error("Login error:", error);
      const message =
        error?.response?.data?.message || error?.message || "Login failed";
      return { success: false, error: message };
    }
  };

  const logout = () => {
    setUser(null);
    setAuthToken(null);
    localStorage.removeItem("authToken");
    localStorage.removeItem("userData");
  };

  const getAuthHeaders = () => {
    return authToken ? { Authorization: `Bearer ${authToken}` } : {};
  };

  const isAuthenticated = () => {
    return !!authToken && !!user;
  };

  const hasRole = (role) => {
    return user && user.role === role;
  };

  const hasPermission = (permission) => {
    if (!user) return false;

    // If user has explicit permissions, use those
    if (user.permissions && Array.isArray(user.permissions)) {
      return user.permissions.includes(permission);
    }

    // Otherwise, map role to permissions
    const rolePermissions = {
      admin: ["*"], // Admin has all permissions
      librarian: [
        "users.view",
        "users.create",
        "users.update",
        "users.delete",
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
        "students.create",
        "students.update",
        "books.view",
        "books.create",
        "books.update",
        "transactions.view",
        "transactions.create",
        "transactions.update",
        "reports.view",
      ],
      student: ["books.view", "transactions.view"],
    };

    const userPermissions = rolePermissions[user.role] || [];

    // Check if user has all permissions (admin) or specific permission
    return (
      userPermissions.includes("*") || userPermissions.includes(permission)
    );
  };

  const value = {
    user,
    authToken,
    loading,
    login,
    logout,
    getAuthHeaders,
    isAuthenticated,
    hasRole,
    hasPermission,
  };

  return (
    <AuthContext.Provider value={value}> {children} </AuthContext.Provider>
  );
};
