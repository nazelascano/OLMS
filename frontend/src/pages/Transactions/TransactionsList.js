import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Grid,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import {
  MoreVert,
  Visibility,
  Assignment,
  AssignmentReturn,
  Search,
  Refresh,
  Warning,
  CheckCircle,
  Schedule,
  Cancel,
  History,
  AutoStories,
} from "@mui/icons-material";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../utils/api";
import { formatCurrency } from "../../utils/currency";

const TransactionsList = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [detailsDialog, setDetailsDialog] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    overdue: 0,
    returned: 0,
  });

  const fetchTransactions = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await api.get("/transactions", {
        params: {
          search: searchTerm || undefined,
          status: statusFilter !== "all" ? statusFilter : undefined,
          type: typeFilter !== "all" ? typeFilter : undefined,
          page: page + 1,
          limit: rowsPerPage,
        },
      });

      const data = Array.isArray(response.data)
        ? response.data
        : response.data?.transactions || [];

      setTransactions(data);
      const total = response.data?.pagination?.total ?? data.length;
      setTotalCount(total);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      setTransactions([]);
      setTotalCount(0);
      setError("Failed to fetch transactions");
    } finally {
      setLoading(false);
    }
  }, [searchTerm, statusFilter, typeFilter, page, rowsPerPage]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await api.get("/transactions/stats");
      setStats(response.data);
    } catch (error) {
      console.error("Error fetching transaction stats:", error);
    }
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    setPage(0);
  }, [searchTerm, statusFilter, typeFilter]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(totalCount / rowsPerPage));
    if (page >= totalPages) {
      setPage(Math.max(0, totalPages - 1));
    }
  }, [totalCount, rowsPerPage, page]);

  const handleMenuClick = (event, transaction) => {
    setAnchorEl(event.currentTarget);
    setSelectedTransaction(transaction);
  };

  const handleMenuClose = (clearSelection = true) => {
    setAnchorEl(null);
    if (clearSelection) {
      setSelectedTransaction(null);
    }
  };

  const handleViewDetails = () => {
    setDetailsDialog(true);
    handleMenuClose(false);
  };

  const getTransactionIdentifier = (transaction) =>
    transaction?.transactionId ||
    transaction?.id ||
    transaction?.documentId ||
    transaction?._id ||
    null;

  const getDisplayTransactionId = (transaction) =>
    getTransactionIdentifier(transaction) || "-";

  const resolveDueDateValue = (transaction) =>
    transaction?.dueDate || transaction?.metadata?.providedDueDate || null;

  const formatDate = (value) => {
    if (!value) {
      return "-";
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return "-";
    }
    return parsed.toLocaleDateString();
  };

  const handleReturnBook = async () => {
    const transactionId = getTransactionIdentifier(selectedTransaction);
    if (!transactionId) {
      setError("Transaction identifier is missing");
      return;
    }

    try {
      await api.post(`/transactions/${transactionId}/return`);
      await fetchTransactions();
      await fetchStats();
      handleMenuClose();
    } catch (error) {
      const message = error.response?.data?.message || "Failed to return book";
      setError(message);
      console.error("Error returning book:", error);
    }
  };

  const handleRenewBook = async () => {
    const transactionId = getTransactionIdentifier(selectedTransaction);
    if (!transactionId) {
      setError("Transaction identifier is missing");
      return;
    }

    try {
      await api.post(`/transactions/${transactionId}/renew`);
      await fetchTransactions();
      await fetchStats();
      handleMenuClose();
    } catch (error) {
      const message = error.response?.data?.message || "Failed to renew book";
      setError(message);
      console.error("Error renewing book:", error);
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
      case "renewed":
        return "warning";
      case "lost":
        return "error";
      default:
        return "default";
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "active":
        return <CheckCircle />;
      case "returned":
        return <AssignmentReturn />;
      case "overdue":
        return <Warning />;
      case "renewed":
        return <Schedule />;
      case "lost":
        return <Cancel />;
      default:
        return <History />;
    }
  };

  const isOverdue = (transaction) => {
    const dueValue = resolveDueDateValue(transaction);
    if (!dueValue) {
      return false;
    }
    const dueDate = new Date(dueValue);
    return transaction.status === "active" && dueDate < new Date();
  };

  const canManageTransactions =
    user?.role === "admin" ||
    user?.role === "librarian" ||
    user?.role === "staff";

  const canManageAnnualBorrowing =
    user?.role === "admin" || user?.role === "librarian";

  const displayedTransactions = transactions;

  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="200px"
      >
        <Typography>Loading transactions...</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems={{ xs: "flex-start", sm: "center" }}
        flexWrap="wrap"
        gap={2}
        mb={3}
      >
        <Typography variant="h4" sx={{ flexGrow: 1 }}>
          Transaction Management
        </Typography>
        {(canManageTransactions || canManageAnnualBorrowing) && (
          <Box
            display="flex"
            gap={2}
            flexWrap="wrap"
            justifyContent="flex-end"
          >
            {canManageAnnualBorrowing && (
              <Button
                variant="outlined"
                startIcon={<AutoStories />}
                onClick={() => navigate("/annual-borrowing")}
                sx={{
                  borderColor: "#0ea5e9",
                  color: "#0ea5e9",
                  minWidth: 160,
                  "&:hover": { backgroundColor: "#0ea5e9", color: "white" },
                }}
              >
                Annual Borrowing
              </Button>
            )}
            <Button
              variant="outlined"
              startIcon={<Assignment />}
              onClick={() => navigate("/transactions/borrow")}
              sx={{
                borderColor: "#22C55E",
                color: "#22C55E",
                minWidth: 140,
                "&:hover": { backgroundColor: "#22C55E", color: "white" },
              }}
            >
              New Borrow
            </Button>
            <Button
              variant="contained"
              startIcon={<AssignmentReturn />}
              onClick={() => navigate("/transactions/return")}
              sx={{
                backgroundColor: "#22C55E",
                minWidth: 150,
                "&:hover": { backgroundColor: "#16A34A" },
              }}
            >
              Return Books
            </Button>
          </Box>
        )}
      </Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {/* Statistics Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <History color="primary" sx={{ mr: 2 }} />
                <Box>
                  <Typography variant="h6">{stats.total}</Typography>
                  <Typography variant="body2" color="textSecondary">
                    Total Transactions
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <CheckCircle color="primary" sx={{ mr: 2 }} />
                <Box>
                  <Typography variant="h6">{stats.active}</Typography>
                  <Typography variant="body2" color="textSecondary">
                    Active Borrowings
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <Warning color="error" sx={{ mr: 2 }} />
                <Box>
                  <Typography variant="h6">{stats.overdue}</Typography>
                  <Typography variant="body2" color="textSecondary">
                    Overdue Books
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <AssignmentReturn color="success" sx={{ mr: 2 }} />
                <Box>
                  <Typography variant="h6">{stats.returned}</Typography>
                  <Typography variant="body2" color="textSecondary">
                    Returned Today
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      {/* Search and Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              placeholder="Search by book, borrower, or copy ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <Search sx={{ mr: 1, color: "text.secondary" }} />
                ),
              }}
            />
          </Grid>
          <Grid item xs={12} md={3}>
            <FormControl fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                label="Status"
              >
                <MenuItem value="all">All Status</MenuItem>
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="returned">Returned</MenuItem>
                <MenuItem value="overdue">Overdue</MenuItem>
                <MenuItem value="renewed">Renewed</MenuItem>
                <MenuItem value="lost">Lost</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={3}>
            <FormControl fullWidth>
              <InputLabel>Type</InputLabel>
              <Select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                label="Type"
              >
                <MenuItem value="all">All Types</MenuItem>
                <MenuItem value="regular">Regular</MenuItem>
                <MenuItem value="annual">Annual</MenuItem>
                <MenuItem value="reserved">Reserved</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={2}>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<Refresh />}
              onClick={() => {
                setSearchTerm("");
                setStatusFilter("all");
                setTypeFilter("all");
              }}
            >
              Reset
            </Button>
          </Grid>
        </Grid>
      </Paper>
      {/* Transactions Table */}
      <Paper>
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Transaction ID</TableCell>
                <TableCell>Book Title</TableCell>
                <TableCell>Copy ID</TableCell>
                <TableCell>Borrower</TableCell>
                <TableCell>Borrow Date</TableCell>
                <TableCell>Due Date</TableCell>
                <TableCell>Return Date</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Type</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {displayedTransactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} align="center">
                    <Typography variant="body2" color="text.secondary">
                      No transactions found
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                displayedTransactions.map((transaction) => (
                  <TableRow
                    key={
                      transaction._id ||
                      transaction.documentId ||
                      transaction.id ||
                      transaction.copyId
                    }
                  >
                    <TableCell sx={{ maxWidth: 200 }}>
                      <Typography
                        variant="body2"
                        sx={{ fontFamily: "monospace", wordBreak: "break-all" }}
                      >
                        {getDisplayTransactionId(transaction)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 220 }}>
                      <Typography
                        variant="body2"
                        fontWeight="medium"
                        sx={{ whiteSpace: "normal" }}
                      >
                        {transaction.bookTitle || "Unknown Book"}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        {transaction.author || ""}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {transaction.copyId || "-"}
                    </TableCell>
                    <TableCell sx={{ maxWidth: 200 }}>
                      <Typography variant="body2">
                        {transaction.borrowerName || "Unknown Borrower"}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {formatDate(transaction.borrowDate)}
                    </TableCell>
                    <TableCell>
                      <Box display="flex" alignItems="center">
                        {isOverdue(transaction) && (
                          <Warning color="error" sx={{ mr: 1, fontSize: 16 }} />
                        )}
                        {formatDate(resolveDueDateValue(transaction))}
                      </Box>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {formatDate(transaction.returnDate)}
                    </TableCell>
                    <TableCell>
                      <Chip
                        icon={getStatusIcon(transaction.status)}
                        label={transaction.status}
                        color={getStatusColor(transaction.status)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={transaction.type || "regular"}
                        variant="outlined"
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="center">
                      <IconButton
                        onClick={(e) => handleMenuClick(e, transaction)}
                        size="small"
                      >
                        <MoreVert />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={[5, 10, 25, 50]}
          component="div"
          count={totalCount}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={(event, newPage) => setPage(newPage)}
          onRowsPerPageChange={(event) => {
            setRowsPerPage(parseInt(event.target.value, 10));
            setPage(0);
          }}
        />
      </Paper>
      {/* Context Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={handleViewDetails}>
          <Visibility sx={{ mr: 1 }} />
          View Details
        </MenuItem>
        {canManageTransactions && selectedTransaction?.status === "active" && (
          <MenuItem onClick={handleReturnBook}>
            <AssignmentReturn sx={{ mr: 1 }} />
            Return Book
          </MenuItem>
        )}
        {canManageTransactions && selectedTransaction?.status === "active" && (
          <MenuItem onClick={handleRenewBook}>
            <Schedule sx={{ mr: 1 }} />
            Renew Book
          </MenuItem>
        )}
      </Menu>
      {/* Transaction Details Dialog */}
      <Dialog
        open={detailsDialog}
        onClose={() => setDetailsDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Transaction Details</DialogTitle>
        <DialogContent>
          {selectedTransaction && (
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="textSecondary">
                  Borrow ID
                </Typography>
                <Typography
                  variant="body1"
                  gutterBottom
                  sx={{ fontFamily: "monospace" }}
                >
                  {getDisplayTransactionId(selectedTransaction)}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" color="textSecondary">
                  Book Title
                </Typography>
                <Typography variant="body1" gutterBottom>
                  {selectedTransaction.bookTitle}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" color="textSecondary">
                  Copy ID
                </Typography>
                <Typography variant="body1" gutterBottom>
                  {selectedTransaction.copyId}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" color="textSecondary">
                  Borrower
                </Typography>
                <Typography variant="body1" gutterBottom>
                  {selectedTransaction.borrowerName}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" color="textSecondary">
                  Status
                </Typography>
                <Chip
                  icon={getStatusIcon(selectedTransaction.status)}
                  label={selectedTransaction.status}
                  color={getStatusColor(selectedTransaction.status)}
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" color="textSecondary">
                  Borrow Date
                </Typography>
                <Typography variant="body1" gutterBottom>
                  {formatDate(selectedTransaction.borrowDate)}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" color="textSecondary">
                  Due Date
                </Typography>
                <Typography variant="body1" gutterBottom>
                  {formatDate(resolveDueDateValue(selectedTransaction))}
                </Typography>
              </Grid>
              {selectedTransaction.returnDate && (
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="textSecondary">
                    Return Date
                  </Typography>
                  <Typography variant="body1" gutterBottom>
                    {formatDate(selectedTransaction.returnDate)}
                  </Typography>
                </Grid>
              )}
              {selectedTransaction.fine > 0 && (
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="textSecondary">
                    Fine Amount
                  </Typography>
                  <Typography variant="body1" gutterBottom color="error">
                    {formatCurrency(selectedTransaction.fine)}
                  </Typography>
                </Grid>
              )}
              {selectedTransaction.notes && (
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="textSecondary">
                    Notes
                  </Typography>
                  <Typography variant="body1">
                    {selectedTransaction.notes}
                  </Typography>
                </Grid>
              )}
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailsDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TransactionsList;
