/* eslint-disable unicode-bom */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
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
  Warning,
  CheckCircle,
  Schedule,
  Cancel,
  History,
  AutoStories,
  Print,
  FilterList,
} from "@mui/icons-material";
import QRScanner from "../../components/QRScanner";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../utils/api";
import { generateTransactionReceipt, downloadPDF } from "../../utils/pdfGenerator";
import toast from "react-hot-toast";

const TransactionsList = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const location = useLocation();
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
  // detailsDialog removed: use dedicated page at /transactions/:id instead
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    overdue: 0,
    returned: 0,
  });
  // Return confirmation dialog state
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returnCopyInput, setReturnCopyInput] = useState("");
  const [returnError, setReturnError] = useState("");
  // QR scanner dialog
  const [scannerOpen, setScannerOpen] = useState(false);
  const copyIdInputRef = useRef(null);
  // filters menu state
  const [filterAnchorEl, setFilterAnchorEl] = useState(null);
  const filtersOpen = Boolean(filterAnchorEl);
  const openFilters = (e) => setFilterAnchorEl(e.currentTarget);
  const closeFilters = () => setFilterAnchorEl(null);
  

  // Focus the Copy ID input when return dialog opens or when scanner closes
  useEffect(() => {
    if (returnDialogOpen) {
      // small timeout to wait for dialog animation/mount
      const t = setTimeout(() => {
        try {
          copyIdInputRef.current?.focus?.();
          if (copyIdInputRef.current?.select) copyIdInputRef.current.select();
        } catch (err) {
          // ignore
        }
      }, 100);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [returnDialogOpen]);

  useEffect(() => {
    if (!scannerOpen && returnDialogOpen) {
      // return from scanner — focus the input
      const t = setTimeout(() => {
        try {
          copyIdInputRef.current?.focus?.();
          if (copyIdInputRef.current?.select) copyIdInputRef.current.select();
        } catch (err) {}
      }, 100);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [scannerOpen, returnDialogOpen]);

  // Handle a scanned QR value: auto-validate and perform return when it matches
  const handleScannedCopy = async (value) => {
    const scanned = String(value || '').trim();
    setReturnCopyInput(scanned);
    setReturnError('');

    // Build expected copy id list (same logic as handleConfirmReturn)
    const items = Array.isArray(selectedTransaction?.items)
      ? selectedTransaction.items
      : [];
    const expectedCopyIds = items.length > 0
      ? items.map((it) => String(it.copyId || it.copyid || it.copyID || '').trim().toLowerCase()).filter(Boolean)
      : (selectedTransaction?.copyId ? [String(selectedTransaction.copyId).trim().toLowerCase()] : []);

    if (expectedCopyIds.length > 0) {
      if (!expectedCopyIds.includes(scanned.toLowerCase())) {
        setReturnError('Scanned Copy ID does not match the expected item(s).');
        toast.error('Scanned Copy ID does not match.');
        return; // don't proceed
      }
    }

    // If validation passed (or no expected ids), proceed to perform return
    toast.loading('Processing return...');
    try {
      await handleReturnBook();
      toast.dismiss();
      toast.success('Return processed successfully');
      setScannerOpen(false);
      setReturnDialogOpen(false);
      setReturnCopyInput('');
      setReturnError('');
    } catch (err) {
      toast.dismiss();
      setReturnError('Failed to process return.');
      toast.error('Failed to process return');
      console.error('Error processing scanned return:', err);
    }
  };

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
    // Navigate to the transaction details page instead of opening the inline dialog
    const transactionId = getTransactionIdentifier(selectedTransaction);
    handleMenuClose();
    if (transactionId) {
      navigate(`/transactions/${transactionId}`, { state: { from: location.pathname } });
    }
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

  

  // Print receipt for a specific transaction (works for any transaction status)
  const handlePrintReceiptFor = async (transaction) => {
    try {
      toast.loading("Generating Receipt...");
      const transactionId = getTransactionIdentifier(transaction);
      if (!transactionId) {
        setError("Transaction identifier is missing");
        toast.dismiss();
        return;
      }
      try {
        const response = await api.get(`/transactions/${transactionId.trim()}`);
        const transactionData = response.data || [];
        const responseStudent = await api.get(`/students/${transactionData.userId}`);
        const studentData = responseStudent.data || [];
        const booksData = [];
        for (let x = 0; transactionData.items.length > x; x++) {
          let book = transactionData.items[x];
          const responseBook = await api.get(`/books/${book.bookId}`);
          const bookData = responseBook.data || [];
          let newBookData = {
            title: bookData.title,
            isbn: book.isbn,
            copyId: book.copyId,
          };
          booksData.push(newBookData);
        }
        const transactionPDF = await generateTransactionReceipt(
          transactionData,
          studentData.student,
          booksData
        );

        downloadPDF(transactionPDF, `receipt_${transactionData.id}.pdf`);
        toast.dismiss();
        toast.success("Receipt generated successfully!");
      } catch (fallbackError) {
        console.error("Failed to fetch transaction data from transactions:", fallbackError);
        toast.error("Failed to load transaction");
      }
    } catch (error) {
      toast.dismiss();
      toast.error("Failed to generate receipt");
      console.error("Error generating receipt:", error);
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

  const handleApproveRequest = async () => {
    const transactionId = getTransactionIdentifier(selectedTransaction);
    if (!transactionId) {
      setError('Transaction identifier is missing');
      return;
    }

    try {
      await api.post(`/transactions/approve/${transactionId}`);
      await fetchTransactions();
      await fetchStats();
      handleMenuClose();
      toast.success('Request approved');
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to approve request';
      setError(message);
      console.error('Error approving request:', error);
    }
  };

  // Confirm and perform return — validates copy ID if available
  const handleConfirmReturn = async () => {
    // Collect expected copy IDs from transaction items (if any), fallback to single copyId
    const items = Array.isArray(selectedTransaction?.items)
      ? selectedTransaction.items
      : [];
    const expectedCopyIds = items.length > 0
      ? items.map((it) => String(it.copyId || it.copyid || it.copyID || '').trim().toLowerCase()).filter(Boolean)
      : (selectedTransaction?.copyId ? [String(selectedTransaction.copyId).trim().toLowerCase()] : []);

    // If we have expected copy IDs, require that the entered value matches any of them (case-insensitive)
    if (expectedCopyIds.length > 0) {
      if (!returnCopyInput || !expectedCopyIds.includes(returnCopyInput.trim().toLowerCase())) {
        setReturnError("Copy ID does not match. Please enter the correct Copy ID to confirm return.");
        return;
      }
    }

    // Proceed with return
    try {
      await handleReturnBook();
      setReturnDialogOpen(false);
      setReturnCopyInput("");
      setReturnError("");
    } catch (err) {
      setReturnError("Failed to return book. Try again.");
      console.error(err);
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
        <Typography variant="h4" sx={{ flexGrow: 1 }} color={"white"}>
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
      <Box mb={3}>
              <Box display="flex" gap={2} flexWrap="wrap" alignItems="center">
                <TextField
                  placeholder="Search books by title, author, or ISBN..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  sx={{ flex: 1, minWidth: 300 }}
                  InputProps={{
                    startAdornment: (
                  <Search sx={{ mr: 1, color: "text.secondary" }} />
                ),
              }}
            />
          <IconButton
                aria-label="Open filters"
                onClick={openFilters}
                size="small"
                sx={{ border: "1px solid #E2E8F0", backgroundColor: "#F8FAFC" }}
              >
                <FilterList />
              </IconButton>
            <Menu
              anchorEl={filterAnchorEl}
              open={filtersOpen}
              onClose={closeFilters}
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              transformOrigin={{ vertical: "top", horizontal: "right" }}
              PaperProps={{ sx: { p: 2, minWidth: 220 } }}
            >
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    label="Status"
                  >
                    <MenuItem value="all">All Status</MenuItem>
                    <MenuItem value="requested">Requested</MenuItem>
                    <MenuItem value="active">Active</MenuItem>
                    <MenuItem value="returned">Returned</MenuItem>
                    <MenuItem value="overdue">Overdue</MenuItem>
                    <MenuItem value="renewed">Renewed</MenuItem>
                    <MenuItem value="lost">Lost</MenuItem>
                  </Select>
                </FormControl>

                <FormControl fullWidth size="small">
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
                <Box display="flex" justifyContent="flex-end" gap={1} mt={1}>
                  <Button size="small" onClick={() => { setStatusFilter("all"); setTypeFilter("all"); closeFilters(); }}>
                    Clear
                  </Button>
                  <Button size="small" variant="contained" onClick={closeFilters}>
                    Apply
                  </Button>
                </Box>
              </Box>
            </Menu>
          </Box>
      </Box>
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
                    <TableCell sx={{ maxWidth: 220 }}>
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
                    <TableCell sx={{ whiteSpace: "nowrap", wordBreak: "break-all" }}>
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
                      <Box display="flex" justifyContent="center" gap={1}>
                        {canManageTransactions && (
                          <IconButton
                            size="small"
                            aria-label={`Print receipt for ${getDisplayTransactionId(transaction)}`}
                            onClick={() => handlePrintReceiptFor(transaction)}
                          >
                            <Print />
                          </IconButton>
                        )}
                        <IconButton
                          onClick={(e) => handleMenuClick(e, transaction)}
                          size="small"
                          aria-label={`Actions for transaction ${getDisplayTransactionId(transaction)}`}
                        >
                          <MoreVert />
                        </IconButton>
                      </Box>
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
          <MenuItem onClick={() => { handleMenuClose(false); setReturnCopyInput(""); setReturnError(""); setReturnDialogOpen(true); }}>
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
        {canManageTransactions && selectedTransaction?.status === "requested" && (
          <MenuItem onClick={() => { handleMenuClose(false); handleApproveRequest(); }}>
            <CheckCircle sx={{ mr: 1 }} />
            Approve Request
          </MenuItem>
        )}
      </Menu>
      {/* Inline Transaction Details dialog removed in favor of the dedicated /transactions/:id page */}
      {/* Return confirmation dialog */}
      <Dialog
        open={returnDialogOpen}
        onClose={() => setReturnDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Confirm Return</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>
            To confirm the return, please enter the Copy ID of the book being returned.
          </Typography>
          <Box display="flex" gap={1} alignItems="center">
            <TextField
              label="Copy ID"
              value={returnCopyInput}
              onChange={(e) => { setReturnCopyInput(e.target.value); setReturnError(""); }}
              fullWidth
              margin="dense"
              autoFocus
            />
            <Button
              variant="outlined"
              size="small"
              onClick={() => setScannerOpen(true)}
              sx={{ height: 40 }}
            >
              Scan QR
            </Button>
          </Box>
          {returnError && (
            <Typography color="error" variant="caption" display="block" sx={{ mt: 1 }}>
              {returnError}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReturnDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleConfirmReturn} variant="contained" color="primary">
            Confirm Return
          </Button>
        </DialogActions>
      </Dialog>
      {/* Scanner dialog */}
      <Dialog open={scannerOpen} onClose={() => setScannerOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Scan QR Code</DialogTitle>
        <DialogContent>
          <QRScanner
            elementId="transaction-qr-scanner"
            onDetected={(value) => {
              // auto-process the scanned value (validate and perform return)
              handleScannedCopy(value);
            }}
            onClose={() => setScannerOpen(false)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setScannerOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TransactionsList;
