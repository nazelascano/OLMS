import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, Grid, Card, CardContent, Button, Avatar, Stack, Divider, IconButton } from "@mui/material";
import { School, Email, Phone, Badge, Close, MenuBook, History, PendingActions } from "@mui/icons-material";
import toast from "react-hot-toast";
import { api, authAPI, transactionsAPI } from "../../utils/api";
import { useAuth } from "../../contexts/AuthContext";
import { useSettings } from "../../contexts/SettingsContext";
import { useNavigate } from "react-router-dom";
import { resolveEntityAvatar } from "../../utils/media";

const ACTIVE_TRANSACTION_STATUSES = new Set([
  "borrowed",
  "active",
  "missing",
  "lost",
  "damaged",
  "overdue",
  "released",
]);

const REQUEST_TRANSACTION_STATUSES = new Set([
  "requested",
  "pending",
  "reservation-expired",
  "queued",
  "processing",
  "awaiting-approval",
]);

const normalizeStatusValue = (status) => {
  if (!status) return "pending";
  return String(status).trim().toLowerCase();
};

const formatStatValue = (value) => {
  if (value === null || value === undefined) {
    return "0";
  }

  if (typeof value === "number") {
    return new Intl.NumberFormat("en-US").format(value);
  }

  const numericValue = Number(value);
  if (!Number.isNaN(numericValue)) {
    return new Intl.NumberFormat("en-US").format(numericValue);
  }

  return String(value);
};

const StatCard = ({ title, value, caption, icon: Icon, iconColor = "#2563EB", iconBg = "rgba(37, 99, 235, 0.12)" }) => {
  const displayValue = formatStatValue(value);

  return (
    <Card
      sx={{
        borderRadius: 3,
        border: "1px solid",
        borderColor: "divider",
        boxShadow: "0 14px 30px rgba(15, 23, 42, 0.12)",
        height: "100%",
        backgroundColor: "#fff",
      }}
    >
      <CardContent sx={{ p: 2.5, display: "flex", flexDirection: "column", gap: 1.5 }}>
        <Box display="flex" alignItems="flex-start" justifyContent="space-between" gap={1.5}>
          <Box>
            <Typography
              variant="caption"
              sx={{
                color: "text.secondary",
                letterSpacing: "0.08em",
                fontWeight: 600,
                textTransform: "uppercase",
              }}
            >
              {title}
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 700, color: "#0F172A", mt: 0.75 }}>
              {displayValue}
            </Typography>
          </Box>
          {Icon ? (
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 2,
                backgroundColor: iconBg,
                color: iconColor,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon fontSize="small" />
            </Box>
          ) : null}
        </Box>
        {caption ? (
          <Typography variant="body2" sx={{ color: "text.secondary", fontSize: "0.8rem" }}>
            {caption}
          </Typography>
        ) : null}
      </CardContent>
    </Card>
  );
};

const SectionCard = ({ title, subtitle, children }) => (
  <Paper
    sx={{
      p: { xs: 2, md: 3 },
      borderRadius: 3,
      border: "1px solid",
      borderColor: "divider",
      backgroundColor: "#fff",
      boxShadow: "0 18px 45px rgba(15, 23, 42, 0.12)",
    }}
  >
    <Box mb={2}>
      {subtitle ? (
        <Typography
          variant="caption"
          sx={{
            color: "text.secondary",
            letterSpacing: "0.08em",
            fontWeight: 600,
            textTransform: "uppercase",
          }}
        >
          {subtitle}
        </Typography>
      ) : null}
      <Typography variant="h6" sx={{ color: "#0F172A", fontWeight: 700 }}>
        {title}
      </Typography>
    </Box>
    <Divider sx={{ mb: 2 }} />
    {children}
  </Paper>
);

const StudentDashboard = () => {
  const { user, updateUserData } = useAuth();
  const { finesEnabled } = useSettings();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cancelingId, setCancelingId] = useState(null);
  const [showWelcomeCard, setShowWelcomeCard] = useState(() => {
    const dismissed = Boolean(user?.preferences?.studentDashboard?.welcomeDismissed);
    return !dismissed;
  });
  const navigate = useNavigate();
  const studentAvatarSrc = useMemo(() => resolveEntityAvatar(user), [user]);
  const studentDisplayName = useMemo(() => {
    if (!user) return "Student";
    const fallback = user.username || "Student";
    const fullName = `${user.firstName || ""} ${user.lastName || ""}`.trim();
    return fullName || fallback;
  }, [user]);
  const studentInitial = (studentDisplayName.charAt(0) || "U").toUpperCase();
  const userIdentifier = useMemo(() => {
    return (
      user?.id ||
      user?._id ||
      user?.userId ||
      user?.libraryCardNumber ||
      ""
    );
  }, [user]);

  const resolveTransactionId = useCallback((tx) => {
    if (!tx) return "";
    return tx.id || tx._id || tx.transactionId || tx.documentId || "";
  }, []);

  const normalizeStatus = useCallback((status) => normalizeStatusValue(status), []);

  const isBorrowedStatus = useCallback(
    (status) => ACTIVE_TRANSACTION_STATUSES.has(normalizeStatus(status)),
    [normalizeStatus],
  );

  const isPendingRequestStatus = useCallback(
    (status) => REQUEST_TRANSACTION_STATUSES.has(normalizeStatus(status)),
    [normalizeStatus],
  );

  useEffect(() => {
    const dismissed = Boolean(user?.preferences?.studentDashboard?.welcomeDismissed);
    setShowWelcomeCard(!dismissed);

    const fetchUserTransactions = async () => {
      if (!userIdentifier) return;
      try {
        setLoading(true);
        const encodedId = encodeURIComponent(userIdentifier);
        const resp = await api.get(`/transactions/user/${encodedId}`);
        const txs = Array.isArray(resp.data) ? resp.data : resp.data?.transactions || [];
        setTransactions(txs);
      } catch (err) {
        console.error("Failed to load user transactions", err);
        setTransactions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchUserTransactions();
  }, [user, userIdentifier]);

  const handleDismissWelcomeCard = async () => {
    setShowWelcomeCard(false);
    try {
      await authAPI.updatePreferences({
        studentDashboard: { welcomeDismissed: true },
      });
      updateUserData((previous) => {
        const base = previous && typeof previous === "object" ? previous : {};
        const existingPreferences =
          base.preferences && typeof base.preferences === "object"
            ? base.preferences
            : {};
        const updatedPreferences = {
          ...existingPreferences,
          studentDashboard: {
            ...(existingPreferences.studentDashboard || {}),
            welcomeDismissed: true,
          },
        };

        return {
          ...base,
          preferences: updatedPreferences,
        };
      });
    } catch (error) {
      console.error("Failed to persist welcome preference", error);
    }
  };

  const currentBorrows = useMemo(
    () => transactions.filter((t) => isBorrowedStatus(t.status)),
    [transactions, isBorrowedStatus],
  );

  const requests = useMemo(
    () => transactions.filter((t) => isPendingRequestStatus(t.status)),
    [transactions, isPendingRequestStatus],
  );

  const overdue = useMemo(() => {
    return transactions.filter((t) => {
      try {
        if (!t.dueDate) return false;
        const due = new Date(t.dueDate);
        return isBorrowedStatus(t.status) && due < new Date();
      } catch (error) {
        return false;
      }
    });
  }, [transactions, isBorrowedStatus]);

  const totalBorrowed = useMemo(() => transactions.length, [transactions]);

  const currentlyBorrowed = useMemo(() => currentBorrows.length, [currentBorrows]);

  const pendingRequestsCount = requests.length;
  const pendingCardLabel = finesEnabled ? "Pending / Overdue" : "Pending Requests";
  const pendingDisplayValue = finesEnabled
    ? pendingRequestsCount + overdue.length
    : pendingRequestsCount;

  const statCards = useMemo(
    () => [
      {
        title: "Total Borrowed",
        value: totalBorrowed,
        caption: "Lifetime checkouts",
        icon: MenuBook,
        iconColor: "#A855F7",
        iconBg: "rgba(168, 85, 247, 0.16)",
      },
      {
        title: "Currently Borrowed",
        value: currentlyBorrowed,
        caption: "Books in hand",
        icon: History,
        iconColor: "#2563EB",
        iconBg: "rgba(37, 99, 235, 0.12)",
      },
      {
        title: pendingCardLabel,
        value: pendingDisplayValue,
        caption: finesEnabled ? "Requests + overdue" : "Awaiting approval",
        icon: PendingActions,
        iconColor: "#F97316",
        iconBg: "rgba(249, 115, 22, 0.16)",
      },
    ],
    [totalBorrowed, currentlyBorrowed, pendingDisplayValue, pendingCardLabel, finesEnabled],
  );

  const handleCancelRequest = async (transactionId) => {
    if (!transactionId) return;
    const confirmed = window.confirm("Are you sure you want to cancel this request?");
    if (!confirmed) return;

    try {
      setCancelingId(transactionId);
      const response = await transactionsAPI.cancelRequest(transactionId);
      toast.success(response?.data?.message || "Request cancelled");
      setTransactions((prev) =>
        prev.map((entry) => {
          const entryId = resolveTransactionId(entry);
          if (entryId !== transactionId) {
            return entry;
          }
          const updated = response?.data?.transaction;
          if (updated) {
            return updated;
          }
          return {
            ...entry,
            status: "cancelled",
            cancelledAt: new Date().toISOString(),
          };
        }),
      );
    } catch (error) {
      console.error("Failed to cancel request", error);
      toast.error(error?.response?.data?.message || "Failed to cancel request");
    } finally {
      setCancelingId(null);
    }
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Typography variant="h1" sx={{ fontSize: "1.5rem", fontWeight: 600, color: "white" }}>
        Student Dashboard
      </Typography>
      {showWelcomeCard ? (
        <Paper sx={{ p: 3, position: "relative", borderRadius: 3, boxShadow: 4 }}>
          <IconButton
            size="small"
            aria-label="Dismiss welcome message"
            onClick={handleDismissWelcomeCard}
            sx={{ position: "absolute", top: 12, right: 12 }}
          >
            <Close fontSize="small" />
          </IconButton>
          <Typography variant="h6">Welcome to your library portal!</Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
            View your borrowed books, due dates, and borrowing history.
            <br />Request borrowing of books easily.
          </Typography>
        </Paper>
      ) : null}

      <Paper
        sx={{
          p: { xs: 2.5, sm: 3 },
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
          boxShadow: 6,
          backgroundColor: '#fff',
        }}
      >
        <Grid container spacing={3} alignItems="center">
          <Grid item xs={12} md={4} lg={3}>
            <Box display="flex" alignItems="center" gap={2}>
              <Avatar
                src={studentAvatarSrc || undefined}
                alt={studentDisplayName}
                sx={{ width: 80, height: 80, bgcolor: 'primary.main', color: 'primary.contrastText', fontSize: 34 }}
              >
                {studentInitial}
              </Avatar>
              <Box>
                <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 1 }}>
                  Student
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 600 }}>
                  {studentDisplayName}
                </Typography>
                <Stack direction="row" spacing={1} mt={1} flexWrap="wrap" useFlexGap>
                  {user?.curriculum && <Chip size="small" color="primary" variant="outlined" label={`Curriculum: ${user.curriculum}`} />}
                  {(user?.grade || user?.section) && (
                    <Chip
                      size="small"
                      color="primary"
                      variant="outlined"
                      label={`Grade ${user?.grade || '—'}${user?.section ? ` • ${user.section}` : ''}`}
                    />
                  )}
                  {user?.libraryCardNumber && (
                    <Chip size="small" variant="outlined" color="secondary" label={`Library ID ${user.libraryCardNumber}`} />
                  )}
                </Stack>
              </Box>
            </Box>
          </Grid>

          <Grid item xs={12} md={4} lg={4}>
            <Stack spacing={1.25}>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  Student ID
                </Typography>
                <Box display="flex" alignItems="center" gap={1.25}>
                  <Badge fontSize="small" color="action" />
                  <Typography variant="body1" fontWeight={600}>
                    {user ? (user.studentId || '—') : '—'}
                  </Typography>
                </Box>
              </Box>

              <Divider flexItem sx={{ borderStyle: 'dashed', borderColor: 'divider' }} />

              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  Contact Information
                </Typography>
                <Stack spacing={0.5}>
                  <Box display="flex" alignItems="center" gap={1.25}>
                    <Email fontSize="small" color="action" />
                    <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
                      {user?.email || '—'}
                    </Typography>
                  </Box>
                  <Box display="flex" alignItems="center" gap={1.25}>
                    <Phone fontSize="small" color="action" />
                    <Typography variant="body2" color="text.secondary">
                      {user?.phoneNumber || user?.profile?.phone || '—'}
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            </Stack>
          </Grid>

          <Grid item xs={12} md={4} lg={5}>
            <Box
              sx={{
                px: { xs: 2, sm: 3 },
                py: { xs: 2, sm: 2.5 },
                borderRadius: 2,
                backgroundColor: (theme) =>
                  theme.palette.mode === 'dark'
                    ? 'rgba(25, 118, 210, 0.15)'
                    : 'rgba(25, 118, 210, 0.08)',
              }}
            >
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1.5, sm: 3 }} divider={<Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', sm: 'block' }, borderStyle: 'dashed', borderColor: 'primary.light' }} />}>
                <Box>
                  <Typography variant="caption" color="primary.main" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <School fontSize="inherit" /> Borrowed Items
                  </Typography>
                  <Typography variant="h6" sx={{ mt: 0.5, fontWeight: 700 }}>
                    {currentlyBorrowed || 0}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="primary.main" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    Pending Requests
                  </Typography>
                  <Typography variant="h6" sx={{ mt: 0.5, fontWeight: 700 }}>
                    {pendingRequestsCount}
                  </Typography>
                </Box>
                {finesEnabled ? (
                  <Box>
                    <Typography variant="caption" color="primary.main" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      Overdue Items
                    </Typography>
                    <Typography variant="h6" sx={{ mt: 0.5, fontWeight: 700 }} color={overdue.length > 0 ? 'error.main' : 'text.primary'}>
                      {overdue.length}
                    </Typography>
                  </Box>
                ) : null}
              </Stack>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      <Grid container spacing={2}>
        <Grid item xs={12} lg={8}>
          <Grid container spacing={2}>
            {statCards.map((card) => (
              <Grid item xs={12} sm={6} md={4} key={card.title}>
                <StatCard {...card} />
              </Grid>
            ))}
          </Grid>
        </Grid>
        <Grid item xs={12} lg={4}>
          <Card
            sx={{
              height: '100%',
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
              boxShadow: '0 14px 30px rgba(15, 23, 42, 0.12)',
            }}
          >
            <CardContent sx={{ p: 2.5 }}>
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                  letterSpacing: '0.08em',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                }}
              >
                Quick Actions
              </Typography>
              <Typography variant="h6" sx={{ color: '#0F172A', fontWeight: 700, mt: 0.5 }}>
                Stay productive
              </Typography>
              <Box mt={2} display="flex" flexDirection={{ xs: 'column', sm: 'row' }} gap={1}>
                <Button variant="contained" color="primary" onClick={() => navigate('/transactions/request')} sx={{ flex: 1, width: '100%' }}>
                  Request Borrow
                </Button>
                <Button variant="outlined" onClick={() => navigate('/books')} sx={{ flex: 1, width: '100%' }}>
                  Browse Books
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <SectionCard title="Current Borrows" subtitle="Items you currently have checked out">
        <TableContainer sx={{ width: '100%', overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Transaction ID</TableCell>
                <TableCell>Book</TableCell>
                <TableCell>Borrow Date</TableCell>
                <TableCell>Due Date</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {currentBorrows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center">
                    {loading ? 'Loading...' : 'No current borrows'}
                  </TableCell>
                </TableRow>
              ) : (
                currentBorrows.map((tx) => (
                  <TableRow key={tx.id || tx._id || tx.transactionId}>
                    <TableCell>{tx.id || tx.transactionId || tx._id}</TableCell>
                    <TableCell>
                      {(tx.items && tx.items[0])
                        ? (tx.items[0].title || tx.items[0].bookTitle || tx.items[0].bookId)
                        : (tx.bookTitle || '')}
                    </TableCell>
                    <TableCell>{tx.borrowDate ? new Date(tx.borrowDate).toLocaleDateString() : ''}</TableCell>
                    <TableCell>{tx.dueDate ? new Date(tx.dueDate).toLocaleDateString() : ''}</TableCell>
                    <TableCell>
                      <Chip label={String(tx.status).toUpperCase()} size="small" />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </SectionCard>

      <SectionCard title="Pending Requests" subtitle="Awaiting librarian review">
        <TableContainer sx={{ width: '100%', overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Request ID</TableCell>
                <TableCell>Items</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {requests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center">
                    No pending requests
                  </TableCell>
                </TableRow>
              ) : (
                requests.map((tx) => {
                  const transactionId = resolveTransactionId(tx);
                  return (
                    <TableRow key={transactionId}>
                      <TableCell>{transactionId}</TableCell>
                      <TableCell>{(tx.items || []).length}</TableCell>
                      <TableCell>{tx.createdAt ? new Date(tx.createdAt).toLocaleString() : ''}</TableCell>
                      <TableCell>
                        <Chip label={String(tx.status).toUpperCase()} size="small" />
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          variant="outlined"
                          color="error"
                          size="small"
                          onClick={() => handleCancelRequest(transactionId)}
                          disabled={cancelingId === transactionId}
                        >
                          {cancelingId === transactionId ? 'Cancelling...' : 'Cancel Request'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </SectionCard>
    </Box>
  );
};

export default StudentDashboard;
