import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Box, ThemeProvider, CssBaseline } from "@mui/material";
import customTheme from "./theme/customTheme";
import { useAuth } from "./contexts/AuthContext";

// Layout Components
import Layout from "./components/Layout/Layout";
import ProtectedRoute from "./components/Auth/ProtectedRoute";

// Auth Components
import LoginPage from "./pages/Auth/LoginPage";

// Dashboard Components
import AdminDashboard from "./pages/Dashboard/AdminDashboard";
import LibrarianDashboard from "./pages/Dashboard/LibrarianDashboard";
import StaffDashboard from "./pages/Dashboard/StaffDashboard";
import StudentDashboard from "./pages/Dashboard/StudentDashboard";

// User Management
import UsersList from "./pages/Users/UsersList";
import UserForm from "./pages/Users/UserForm";
import UserProfile from "./pages/Users/UserProfile";

// Student Management
import StudentsList from "./pages/Students/StudentsList";
import StudentForm from "./pages/Students/StudentForm";

// Book Management
import BooksList from "./pages/Books/BooksList";
import BookForm from "./pages/Books/BookForm";
import BookDetails from "./pages/Books/BookDetails";
import BookCopies from "./pages/Books/BookCopies";

// Transaction Management
import TransactionsList from "./pages/Transactions/TransactionsList";
import BorrowForm from "./pages/Transactions/BorrowForm";
import ReturnForm from "./pages/Transactions/ReturnForm";
import TransactionDetails from "./pages/Transactions/TransactionDetails";
import AnnualBorrowing from "./pages/Transactions/AnnualBorrowing";

// Reports
import ReportsPage from "./pages/Reports/ReportsPage";
import AuditLogs from "./pages/Reports/AuditLogs";

// Settings
import SettingsPage from "./pages/Settings/SettingsPage";

// Error Pages
import NotFoundPage from "./pages/Error/NotFoundPage";
import UnauthorizedPage from "./pages/Error/UnauthorizedPage";

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
      >
        <div> Loading... </div>{" "}
      </Box>
    );
  }

  // Redirect to appropriate dashboard based on role
  const getDashboardRoute = () => {
    if (!user) return "/login";

    switch (user.role) {
      case "admin":
        return "/admin/dashboard";
      case "librarian":
        return "/librarian/dashboard";
      case "staff":
        return "/staff/dashboard";
      case "student":
        return "/student/dashboard";
      default:
        return "/login";
    }
  };

  return (
    <ThemeProvider theme={customTheme}>
      <CssBaseline />
      <Routes>
        {" "}
        {/* Public Routes */}{" "}
        <Route
          path="/login"
          element={
            user ? <Navigate to={getDashboardRoute()} replace /> : <LoginPage />
          }
        />
        {/* Protected Routes */}{" "}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          {/* Default redirect */}{" "}
          <Route
            index
            element={<Navigate to={getDashboardRoute()} replace />}
          />
          {/* Admin Routes */}{" "}
          <Route
            path="admin/dashboard"
            element={
              <ProtectedRoute roles={["admin"]}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          {/* Librarian Routes */}{" "}
          <Route
            path="librarian/dashboard"
            element={
              <ProtectedRoute roles={["librarian"]}>
                <LibrarianDashboard />
              </ProtectedRoute>
            }
          />
          {/* Staff Routes */}{" "}
          <Route
            path="staff/dashboard"
            element={
              <ProtectedRoute roles={["staff"]}>
                <StaffDashboard />
              </ProtectedRoute>
            }
          />
          {/* Student Routes */}{" "}
          <Route
            path="student/dashboard"
            element={
              <ProtectedRoute roles={["student"]}>
                <StudentDashboard />
              </ProtectedRoute>
            }
          />
          {/* User Management Routes */}{" "}
          <Route
            path="users"
            element={
              <ProtectedRoute roles={["admin", "librarian", "staff"]}>
                <UsersList />
              </ProtectedRoute>
            }
          />{" "}
          <Route
            path="users/new"
            element={
              <ProtectedRoute roles={["admin", "librarian", "staff"]}>
                <UserForm />
              </ProtectedRoute>
            }
          />{" "}
          <Route
            path="users/:id/edit"
            element={
              <ProtectedRoute roles={["admin", "librarian", "staff"]}>
                <UserForm />
              </ProtectedRoute>
            }
          />{" "}
          <Route
            path="users/:id"
            element={
              <ProtectedRoute roles={["admin", "librarian", "staff"]}>
                <UserProfile />
              </ProtectedRoute>
            }
          />
          {/* Student Management Routes */}{" "}
          <Route
            path="students"
            element={
              <ProtectedRoute roles={["admin", "librarian", "staff"]}>
                <StudentsList />
              </ProtectedRoute>
            }
          />{" "}
          <Route
            path="students/new"
            element={
              <ProtectedRoute roles={["admin", "librarian", "staff"]}>
                <StudentForm />
              </ProtectedRoute>
            }
          />{" "}
          <Route
            path="students/:id/edit"
            element={
              <ProtectedRoute roles={["admin", "librarian", "staff"]}>
                <StudentForm />
              </ProtectedRoute>
            }
          />
          {/* Book Management Routes */}{" "}
          <Route
            path="books"
            element={
              <ProtectedRoute roles={["admin", "librarian", "staff"]}>
                <BooksList />
              </ProtectedRoute>
            }
          />{" "}
          <Route
            path="books/new"
            element={
              <ProtectedRoute roles={["admin", "librarian"]}>
                <BookForm />
              </ProtectedRoute>
            }
          />{" "}
          <Route
            path="books/:id/edit"
            element={
              <ProtectedRoute roles={["admin", "librarian"]}>
                <BookForm />
              </ProtectedRoute>
            }
          />{" "}
          <Route
            path="books/:id"
            element={
              <ProtectedRoute roles={["admin", "librarian", "staff"]}>
                <BookDetails />
              </ProtectedRoute>
            }
          />{" "}
          <Route
            path="books/:id/copies"
            element={
              <ProtectedRoute roles={["admin", "librarian"]}>
                <BookCopies />
              </ProtectedRoute>
            }
          />
          {/* Transaction Routes */}{" "}
          <Route
            path="transactions"
            element={
              <ProtectedRoute roles={["admin", "librarian", "staff"]}>
                <TransactionsList />
              </ProtectedRoute>
            }
          />{" "}
          <Route
            path="transactions/borrow"
            element={
              <ProtectedRoute roles={["admin", "librarian", "staff"]}>
                <BorrowForm />
              </ProtectedRoute>
            }
          />{" "}
          <Route
            path="transactions/return"
            element={
              <ProtectedRoute roles={["admin", "librarian", "staff"]}>
                <ReturnForm />
              </ProtectedRoute>
            }
          />{" "}
          <Route
            path="transactions/:id"
            element={
              <ProtectedRoute roles={["admin", "librarian", "staff"]}>
                <TransactionDetails />
              </ProtectedRoute>
            }
          />{" "}
          <Route
            path="annual-borrowing"
            element={
              <ProtectedRoute roles={["admin", "librarian"]}>
                <AnnualBorrowing />
              </ProtectedRoute>
            }
          />
          {/* Reports Routes */}{" "}
          <Route
            path="reports"
            element={
              <ProtectedRoute roles={["admin", "librarian", "staff"]}>
                <ReportsPage />
              </ProtectedRoute>
            }
          />{" "}
          <Route
            path="audit-logs"
            element={
              <ProtectedRoute roles={["admin", "librarian"]}>
                <AuditLogs />
              </ProtectedRoute>
            }
          />
          {/* Settings Routes */}{" "}
          <Route
            path="settings"
            element={
              <ProtectedRoute roles={["admin"]}>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          {/* Profile Route */}{" "}
          <Route path="profile" element={<UserProfile />} />
          {/* Error Routes */}{" "}
          <Route path="unauthorized" element={<UnauthorizedPage />} />{" "}
          <Route path="*" element={<NotFoundPage />} />{" "}
        </Route>{" "}
      </Routes>{" "}
    </ThemeProvider>
  );
}

export default App;
