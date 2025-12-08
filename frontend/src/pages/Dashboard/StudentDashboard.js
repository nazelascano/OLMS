import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, Grid, Card, CardContent, Button, Avatar, Stack, Divider, IconButton } from "@mui/material";
import { School, Email, Phone, Badge, Close } from "@mui/icons-material";
import toast from "react-hot-toast";
import { api, authAPI, transactionsAPI } from "../../utils/api";
import { useAuth } from "../../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { resolveEntityAvatar } from "../../utils/media";

const StudentDashboard = () => {
  const { user, updateUserData } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cancelingId, setCancelingId] = useState(null);
  const [showWelcomeCard, setShowWelcomeCard] = useState(() => {
    const dismissed = Boolean(
      user?.preferences?.studentDashboard?.welcomeDismissed,
    );
    return !dismissed;
  });
  const navigate = useNavigate();
  const studentAvatarSrc = useMemo(() => resolveEntityAvatar(user), [user]);
  const studentDisplayName = user
    ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username || "Student"
    : "Student";
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

  const normalizeStatus = (status) => {
    if (!status) return "pending";
    return String(status).toLowerCase();
  };

  const isActiveBorrowStatus = (status) => {
    const normalized = normalizeStatus(status);
    return normalized === "borrowed" || normalized === "active";
  };

  const isPendingRequestStatus = (status) => {
    const normalized = normalizeStatus(status);
    return normalized === "requested" || normalized === "pending";
  };

  useEffect(() => {
    const dismissed = Boolean(
      user?.preferences?.studentDashboard?.welcomeDismissed,
    );
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
        console.error('Failed to load user transactions', err);
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

  const currentBorrows = transactions.filter(t => isActiveBorrowStatus(t.status));
  const requests = transactions.filter(t => isPendingRequestStatus(t.status));
  const overdue = transactions.filter(t => {
    try {
      if (!t.dueDate) return false;
      const due = new Date(t.dueDate);
      return isActiveBorrowStatus(t.status) && due < new Date();
    } catch (e) { return false; }
  });

  const totalBorrowed = user?.borrowingStats?.totalBorrowed ?? transactions.filter(t => {
    const status = normalizeStatus(t.status);
    return status === 'borrowed' || status === 'returned' || status === 'active';
  }).length;
  const currentlyBorrowed = user?.borrowingStats?.currentlyBorrowed ?? currentBorrows.length;
  const pendingRequestsCount = requests.length;

  const handleCancelRequest = async (transactionId) => {
    if (!transactionId) return;
    const confirmed = window.confirm('Are you sure you want to cancel this request?');
    if (!confirmed) return;

    try {
      setCancelingId(transactionId);
      const response = await transactionsAPI.cancelRequest(transactionId);
      toast.success(response?.data?.message || 'Request cancelled');
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
            status: 'cancelled',
            cancelledAt: new Date().toISOString()
          };
        })
      );
    } catch (error) {
      console.error('Failed to cancel request', error);
      toast.error(error?.response?.data?.message || 'Failed to cancel request');
    } finally {
      setCancelingId(null);
    }
  };

  return (
    <Box>
      <Typography variant="h1" sx={{ mb: 3, fontSize: "1.5rem", fontWeight: 600, color: "white" }}>
        Student Dashboard
      </Typography>
      {showWelcomeCard ? (
        <Paper sx={{ p: 3, mb: 3, position: "relative" }}>
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

      {/* Student details card (polished layout) */}
      <Paper
        sx={{
          p: { xs: 2.5, sm: 3 },
          mb: 3,
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
                    <School fontSize="inherit" /> Active Borrows
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
                <Box>
                  <Typography variant="caption" color="primary.main" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    Overdue Items
                  </Typography>
                  <Typography variant="h6" sx={{ mt: 0.5, fontWeight: 700 }} color={overdue.length > 0 ? 'error.main' : 'text.primary'}>
                    {overdue.length}
                  </Typography>
                </Box>
              </Stack>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* Stat cards + quick actions */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={8}>
          <Grid container spacing={2}>
            <Grid item xs={6} sm={4}>
              <Card>
                <CardContent>
                  <Typography variant="subtitle2" color="textSecondary">Total Borrowed</Typography>
                  <Typography variant="h5">{totalBorrowed}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} sm={4}>
              <Card>
                <CardContent>
                  <Typography variant="subtitle2" color="textSecondary">Currently Borrowed</Typography>
                  <Typography variant="h5">{currentlyBorrowed}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} sm={4}>
              <Card>
                <CardContent>
                  <Typography variant="subtitle2" color="textSecondary">Pending / Overdue</Typography>
                  <Typography variant="h5">{pendingRequestsCount + overdue.length}</Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle2" color="textSecondary">Quick Actions</Typography>
              <Box mt={2} display="flex" flexDirection={{ xs: 'column', sm: 'row' }} gap={1}>
                <Button variant="contained" color="primary" onClick={() => navigate('/transactions/request')}>Request Borrow</Button>
                <Button variant="outlined" onClick={() => navigate('/books')}>Browse Books</Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Box mb={3}>
        <Typography variant="h6" sx={{ color: 'white', mb: 1 }}>Current Borrows</Typography>
        <Paper>
          <TableContainer>
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
                  <TableRow><TableCell colSpan={5} align="center">{loading ? 'Loading...' : 'No current borrows'}</TableCell></TableRow>
                ) : (
                  currentBorrows.map(tx => (
                    <TableRow key={tx.id || tx._id || tx.transactionId}>
                      <TableCell>{tx.id || tx.transactionId || tx._id}</TableCell>
                      <TableCell>{(tx.items && tx.items[0]) ? (tx.items[0].title || tx.items[0].bookTitle || tx.items[0].bookId) : (tx.bookTitle || '')}</TableCell>
                      <TableCell>{tx.borrowDate ? new Date(tx.borrowDate).toLocaleDateString() : ''}</TableCell>
                      <TableCell>{tx.dueDate ? new Date(tx.dueDate).toLocaleDateString() : ''}</TableCell>
                      <TableCell><Chip label={String(tx.status).toUpperCase()} size="small" /></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Box>

      <Box>
        <Typography variant="h6" sx={{ color: 'white', mb: 1 }}>Pending Requests</Typography>
        <Paper>
          <TableContainer>
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
                  <TableRow><TableCell colSpan={5} align="center">No pending requests</TableCell></TableRow>
                ) : (
                  requests.map(tx => {
                    const transactionId = resolveTransactionId(tx);
                    return (
                      <TableRow key={transactionId}>
                        <TableCell>{transactionId}</TableCell>
                      <TableCell>{(tx.items || []).length}</TableCell>
                      <TableCell>{tx.createdAt ? new Date(tx.createdAt).toLocaleString() : ''}</TableCell>
                        <TableCell><Chip label={String(tx.status).toUpperCase()} size="small" /></TableCell>
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
        </Paper>
      </Box>
    </Box>
  );
};

export default StudentDashboard;
