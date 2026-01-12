/* eslint-disable unicode-bom */
import React, { useState, useEffect, useMemo } from "react";
import {
  Box,
  Grid,
  Card,
  CardActionArea,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useNavigate } from "react-router-dom";
import { reportsAPI, auditAPI } from "../../utils/api";
import { useAuth } from "../../contexts/AuthContext";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { PageLoading } from "../../components/Loading";

const normalizeApiList = (payload) => {
  const data = payload?.data ?? payload;
  if (Array.isArray(data?.logs)) return data.logs;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data)) return data;
  return [];
};

const buildVisitorLoginSeries = (logs = [], days = 14) => {
  const counts = logs.reduce((acc, log) => {
    const timestamp = log?.timestamp || log?.createdAt;
    if (!timestamp) {
      return acc;
    }
    const parsed = new Date(timestamp);
    if (Number.isNaN(parsed.getTime())) {
      return acc;
    }
    const key = parsed.toISOString().split("T")[0];
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const today = new Date();
  const series = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const target = new Date(today);
    target.setDate(today.getDate() - i);
    const isoKey = target.toISOString().split("T")[0];
    series.push({
      name: target.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      logins: counts[isoKey] || 0,
    });
  }
  return series;
};

const formatTimestamp = (value) => {
  if (!value) {
    return "N/A";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "N/A";
  }
  return date.toLocaleString();
};

const shouldHideAuditAction = (action) => {
  if (!action) {
    return false;
  }
  const normalized = String(action).trim().toUpperCase();
  return normalized === "LOGIN" || normalized === "LOGOUT";
};

const getCurrentSchoolYearLabel = () => {
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth();
  const baseYear = currentMonth >= 5 ? currentDate.getFullYear() : currentDate.getFullYear() - 1;
  const nextYear = baseYear + 1;
  return `${baseYear}-${nextYear}`;
};

const AdminDashboard = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading, user, authToken } = useAuth();
  const [stats, setStats] = useState(null);
  const [loginChartData, setLoginChartData] = useState([]);
  const [recentAuditLogs, setRecentAuditLogs] = useState([]);
  const [auditInfoMessage, setAuditInfoMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const sessionReady = useMemo(() => {
    if (authLoading) {
      return false;
    }
    if (typeof isAuthenticated === "function") {
      return isAuthenticated();
    }
    return Boolean(authToken && user);
  }, [authLoading, isAuthenticated, authToken, user]);

  useEffect(() => {
    if (!sessionReady) {
      if (!authLoading) {
        setStats(null);
        setLoginChartData([]);
        setRecentAuditLogs([]);
        setAuditInfoMessage("");
        setLoading(false);
      }
      return;
    }

    const fetchWithFallback = async (loader, fallback) => {
      try {
        const response = await loader();
        return response?.data ?? fallback;
      } catch (error) {
        console.error("Dashboard data fetch failed:", error);
        return fallback;
      }
    };

    const loadDashboardData = async () => {
      try {
        setLoading(true);
        const [statsData, loginLogsData, auditLogsData] = await Promise.all([
          fetchWithFallback(() => reportsAPI.getStats(), null),
          fetchWithFallback(() => auditAPI.getLogs({ action: "LOGIN", limit: 200 }), []),
          fetchWithFallback(() => auditAPI.getRecentActivity({ limit: 100 }), []),
        ]);

        setStats(statsData);

        const loginSeries = buildVisitorLoginSeries(normalizeApiList(loginLogsData));
        setLoginChartData(loginSeries);

        const auditRaw = normalizeApiList(auditLogsData);
        const filteredAudits = auditRaw.filter((log) => !shouldHideAuditAction(log?.action));
        if (filteredAudits.length === 0) {
          setAuditInfoMessage(
            auditRaw.length > 0
              ? "No audit entries beyond login/logout for this period."
              : "No audit activity recorded yet."
          );
        } else {
          setAuditInfoMessage("");
        }
        setRecentAuditLogs(filteredAudits.slice(0, 6));
      } catch (error) {
        console.error("Error loading dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, [sessionReady, authLoading]);

  const StatCard = ({ title, value, onClick }) => {
    const isInteractive = typeof onClick === "function";
    const content = (
      <CardContent
        sx={{
          p: 1.5,
          height: "100%",
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          justifyContent: { xs: "flex-start", sm: "space-between" },
          alignItems: { xs: "flex-start", sm: "center" },
          gap: 0.75,
        }}
      >
        <Typography
          variant="body2"
          sx={{
            color: "#6B7280",
            fontSize: "0.75rem",
            mb: 0.25,
            fontWeight: 500,
          }}
        >
          {title}
        </Typography>
        <Typography
          variant="h2"
          sx={{
            fontWeight: 700,
            color: "#111827",
            fontSize: { xs: "1.5rem", sm: "1.8rem" },
            lineHeight: 1,
          }}
        >
          {value ?? 0}
        </Typography>
      </CardContent>
    );

    return (
      <Card
        sx={{
          backgroundColor: "#FFFFFF",
          border: "none",
          borderRadius: "6px",
          boxShadow: "0 1px 4px rgba(0, 0, 0, 0.08)",
          height: { xs: "auto", sm: "70px" },
          cursor: isInteractive ? "pointer" : "default",
          "&:hover": {
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.12)",
            transition: "all 0.2s ease",
          },
        }}
      >
        {isInteractive ? (
          <CardActionArea onClick={onClick} sx={{ height: "100%" }} aria-label={`View ${title}`}>
            {content}
          </CardActionArea>
        ) : (
          content
        )}
      </Card>
    );
  };

  const handleCardNavigate = (path, filters = {}) => {
    if (!path) {
      return;
    }

    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "" && value !== "all") {
        params.set(key, value);
      }
    });

    const query = params.toString();
    navigate(query ? `${path}?${query}` : path);
  };

  const totalStudentCount =
    stats?.totalStudents ?? stats?.studentCount ?? stats?.newStudents ?? 0;
  const visitorCount = stats?.visitors ?? stats?.activeUsers ?? 0;
  const newStudentsCount = stats?.newStudents ?? stats?.studentsThisYear ?? 0;
  const schoolYearLabel = stats?.currentSchoolYear ?? getCurrentSchoolYearLabel();

  useEffect(() => {
    if (!sessionReady) {
      return undefined;
    }

    let active = true;
    const refreshVisitorCount = async () => {
      try {
        const response = await reportsAPI.getStats();
        const refreshedStats = response?.data;
        if (!active || !refreshedStats) {
          return;
        }
        setStats((previous) => ({ ...(previous || {}), ...refreshedStats }));
      } catch (error) {
        console.error("Visitor count refresh failed:", error);
      }
    };

    refreshVisitorCount();
    const intervalId = window.setInterval(refreshVisitorCount, 60_000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [sessionReady]);

  const renderAuditRows = () => {
    if (recentAuditLogs.length === 0) {
      return (
        <TableRow key="audit-empty">
          <TableCell
            colSpan={4}
            sx={{
              py: 3,
              border: "none",
              textAlign: "center",
              color: "#9CA3AF",
              fontSize: "0.875rem",
            }}
          >
            {auditInfoMessage || "No audit activity found"}
          </TableCell>
        </TableRow>
      );
    }

    return recentAuditLogs.map((log, index) => (
      <TableRow key={log.id || log._id || index}>
        <TableCell
          scope="row"
          headers="audit-timestamp-header"
          sx={{ py: 1, border: "none", color: "#6B7280", fontSize: "0.75rem" }}
        >
          {formatTimestamp(log.timestamp || log.createdAt)}
        </TableCell>
        <TableCell
          headers="audit-user-header"
          sx={{ py: 1, border: "none", color: "#111827", fontSize: "0.75rem", fontWeight: 500 }}
        >
          <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, color: "#111827" }}>
            {log.userName || log.userEmail || "Unknown user"}
          </Typography>
          {(log.userRole || log.userEmail) && (
            <Typography sx={{ fontSize: "0.7rem", color: "#6B7280" }}>
              {log.userRole || log.userEmail}
            </Typography>
          )}
        </TableCell>
        <TableCell
          headers="audit-action-header"
          sx={{ py: 1, border: "none", color: "#6B7280", fontSize: "0.75rem" }}
        >
          {log.action || "N/A"}
        </TableCell>
        <TableCell
          headers="audit-details-header"
          sx={{ py: 1, border: "none", color: "#6B7280", fontSize: "0.75rem" }}
        >
          {log.description || log.entity || log.resource || "No details"}
        </TableCell>
      </TableRow>
    ));
  };

  if (loading || authLoading) {
    return <PageLoading message="Loading dashboard data..." />;
  }

  if (!sessionReady) {
    return (
      <Box sx={{ p: { xs: 1.5, md: 2 } }}>
        <Typography variant="h1" sx={{ mb: 2, fontSize: "1.5rem", fontWeight: 600, color: "white" }}>
          Admin Dashboard
        </Typography>
        <Card>
          <CardContent>
            <Typography variant="body1">Please sign in to view dashboard reports.</Typography>
          </CardContent>
        </Card>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 1.5, md: 2 } }}>
      <Typography variant="h1" sx={{ mb: 3, fontSize: "1.5rem", fontWeight: 600, color: "white" }}>
        Admin Dashboard
      </Typography>

      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} sm={6} md={6}>
          <StatCard
            title="Total Users"
            value={stats?.totalUsers}
            onClick={() => handleCardNavigate("/users")}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={6}>
          <StatCard
            title="Total Students"
            value={totalStudentCount}
            onClick={() => handleCardNavigate("/students")}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={6}>
          <StatCard
            title="Visitors"
            value={visitorCount}
            onClick={() => handleCardNavigate("/audit-logs", { action: "LOGIN" })}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={6}>
          <StatCard
            title={`New Students (S.Y. ${schoolYearLabel})`}
            value={newStudentsCount}
            onClick={() => handleCardNavigate("/users", { role: "student" })}
          />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} lg={6}>
          <Card
            sx={{
              backgroundColor: "#FFFFFF",
              borderRadius: "6px",
              boxShadow: "0 1px 4px rgba(0, 0, 0, 0.08)",
            }}
          >
            <CardContent sx={{ p: 2 }}>
              <Typography
                variant="h2"
                sx={{
                  mb: 1.5,
                  fontWeight: 600,
                  color: "#111827",
                  fontSize: "0.875rem",
                }}
              >
                Visitor login trend
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
                <Box
                  sx={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    backgroundColor: (theme) => theme.palette.primary.main,
                  }}
                />
                <Typography variant="body2" sx={{ color: "#6B7280", fontSize: "0.75rem" }}>
                  Visitor logins
                </Typography>
              </Box>
              <Box sx={{ height: { xs: 220, md: 180 } }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={loginChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: "#6B7280" }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: "#6B7280" }}
                    />
                    <Line type="monotone" dataKey="logins" stroke={theme.palette.primary.main} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} lg={6}>
          <Card
            sx={{
              backgroundColor: "#FFFFFF",
              borderRadius: "6px",
              boxShadow: "0 1px 4px rgba(0, 0, 0, 0.08)",
            }}
          >
            <CardContent sx={{ p: 2 }}>
              <Typography
                variant="h2"
                sx={{
                  mb: 1.5,
                  fontWeight: 600,
                  color: "#111827",
                  fontSize: "0.875rem",
                }}
              >
                Most recent audit logs
              </Typography>
              {auditInfoMessage && (
                <Typography sx={{ mb: 1.5, fontSize: "0.75rem", color: "#6B7280" }}>
                  {auditInfoMessage}
                </Typography>
              )}
              <TableContainer sx={{ maxHeight: 220 }}>
                <Table size="small" aria-label="Recent audit logs table">
                  <TableHead>
                    <TableRow>
                      <TableCell
                        scope="col"
                        id="audit-timestamp-header"
                        sx={{ fontWeight: 600, color: "#6B7280", fontSize: "0.75rem", py: 0.75, border: "none" }}
                      >
                        Timestamp
                      </TableCell>
                      <TableCell
                        scope="col"
                        id="audit-user-header"
                        sx={{ fontWeight: 600, color: "#6B7280", fontSize: "0.75rem", py: 0.75, border: "none" }}
                      >
                        User
                      </TableCell>
                      <TableCell
                        scope="col"
                        id="audit-action-header"
                        sx={{ fontWeight: 600, color: "#6B7280", fontSize: "0.75rem", py: 0.75, border: "none" }}
                      >
                        Action
                      </TableCell>
                      <TableCell
                        scope="col"
                        id="audit-details-header"
                        sx={{ fontWeight: 600, color: "#6B7280", fontSize: "0.75rem", py: 0.75, border: "none" }}
                      >
                        Details
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>{renderAuditRows()}</TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default AdminDashboard;
