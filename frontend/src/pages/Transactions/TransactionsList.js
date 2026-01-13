/* eslint-disable unicode-bom */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  LinearProgress,
  Menu,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
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
  ListAlt,
} from "@mui/icons-material";
import QRScanner from "../../components/QRScanner";
import MobileScanButton from "../../components/MobileScanButton";
import MobileScanDialog from "../../components/MobileScanDialog";
import ApproveRequestDialog from "../../components/Transactions/ApproveRequestDialog";
import { useAuth } from "../../contexts/AuthContext";
import { useSettings } from "../../contexts/SettingsContext";
import { api, settingsAPI } from "../../utils/api";
import { generateTransactionReceipt, downloadPDF } from "../../utils/pdfGenerator";
import toast from "react-hot-toast";
import { addActionButtonSx, importActionButtonSx } from "../../theme/actionButtons";

const RETURNABLE_STATUSES = new Set(["active", "borrowed", "overdue", "renewed", "missing"]);

const isReturnableStatus = (status) => {
  if (!status) {
    return false;
  }
  return RETURNABLE_STATUSES.has(String(status).toLowerCase());
};

const TransactionsList = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { finesEnabled } = useSettings();
  const location = useLocation();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchScannerOpen, setSearchScannerOpen] = useState(false);
  const searchInputId = "transactions-search-input";
  const [statusFilter, setStatusFilter] = useState(() => {
    const params = new URLSearchParams(location.search || "");
    const rawStatus = (params.get("status") || "").toLowerCase();
    const allowedStatuses = new Set(["requested", "active", "returned", "overdue", "lost", "missing"]);
    return allowedStatuses.has(rawStatus) ? rawStatus : "all";
  });
  const [typeFilter, setTypeFilter] = useState(() => {
    const params = new URLSearchParams(location.search || "");
    const rawType = (params.get("type") || "").toLowerCase();
    const allowedTypes = new Set(["regular", "annual"]);
    return allowedTypes.has(rawType) ? rawType : "all";
  });
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  // detailsDialog removed: use dedicated page at /transactions/:id instead
  const [stats, setStats] = useState({
    total: 0,
    borrowed: 0,
    overdue: 0,
    returned: 0,
  });
  // Borrowing settings state
  const [borrowingSettings, setBorrowingSettings] = useState({
    annualBorrowingEnabled: true,
    overnightBorrowingEnabled: false,
  });
  // Return confirmation dialog state
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returnCopyInput, setReturnCopyInput] = useState("");
  const [returnError, setReturnError] = useState("");
  // QR scanner dialog
  const [scannerOpen, setScannerOpen] = useState(false);
  // Approval dialog state
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [approveTransactionId, setApproveTransactionId] = useState(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectTransactionId, setRejectTransactionId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectSubmitting, setRejectSubmitting] = useState(false);
  const [rejectError, setRejectError] = useState("");
  const copyIdInputRef = useRef(null);
  const hasAppliedUrlFiltersRef = useRef(false);
  // filters menu state
  const [filterAnchorEl, setFilterAnchorEl] = useState(null);
  const filtersOpen = Boolean(filterAnchorEl);
  const openFilters = (e) => setFilterAnchorEl(e.currentTarget);
  const closeFilters = () => setFilterAnchorEl(null);
  

  // Focus the Reference ID input when return dialog opens or when scanner closes
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

  useEffect(() => {
    const params = new URLSearchParams(location.search || "");
    const rawStatus = (params.get("status") || "").toLowerCase();
    const allowedStatuses = new Set(["requested", "active", "returned", "overdue", "lost", "missing", "all"]);
    const nextStatus = allowedStatuses.has(rawStatus) ? rawStatus : "all";
    setStatusFilter((prev) => (prev === nextStatus ? prev : nextStatus));

    const rawType = (params.get("type") || "").toLowerCase();
    const allowedTypes = new Set(["regular", "annual", "all"]);
    const nextType = allowedTypes.has(rawType) ? rawType : "all";
    setTypeFilter((prev) => (prev === nextType ? prev : nextType));

    hasAppliedUrlFiltersRef.current = true;
  }, [location.search]);

  useEffect(() => {
    if (!hasAppliedUrlFiltersRef.current) {
      return;
    }

    const params = new URLSearchParams(location.search || "");
    let shouldUpdate = false;

    if (statusFilter === "all") {
      if (params.has("status")) {
        params.delete("status");
        shouldUpdate = true;
      }
    } else if (params.get("status") !== statusFilter) {
      params.set("status", statusFilter);
      shouldUpdate = true;
    }

    if (typeFilter === "all") {
      if (params.has("type")) {
        params.delete("type");
        shouldUpdate = true;
      }
    } else if (params.get("type") !== typeFilter) {
      params.set("type", typeFilter);
      shouldUpdate = true;
    }

    if (shouldUpdate) {
      const nextSearch = params.toString();
      navigate(
        {
          pathname: location.pathname,
          search: nextSearch ? `?${nextSearch}` : "",
        },
        { replace: true },
      );
    }
  }, [statusFilter, typeFilter, navigate, location.pathname, location.search]);

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
        setReturnError('Scanned Reference ID does not match the expected item(s).');
        toast.error('Scanned Reference ID does not match.');
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

  const fetchBorrowingSettings = useCallback(async () => {
    try {
      const response = await api.get("/settings/borrowing-rules");
      setBorrowingSettings(response.data);
    } catch (error) {
      console.error("Error fetching borrowing settings:", error);
    }
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchBorrowingSettings();
  }, [fetchBorrowingSettings]);

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

  const navigateToTransactionDetails = useCallback((transaction) => {
    if (!transaction) {
      setError("Transaction identifier is missing");
      return false;
    }
    const transactionId = getTransactionIdentifier(transaction);
    if (!transactionId) {
      setError("Transaction identifier is missing");
      return false;
    }
    navigate(`/transactions/${transactionId}`, { state: { from: location.pathname } });
    return true;
  }, [navigate, location.pathname]);

  const handleViewDetails = () => {
    // Navigate to the transaction details page instead of opening the inline dialog
    const success = navigateToTransactionDetails(selectedTransaction);
    handleMenuClose();
    if (!success) {
      return;
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
    const toastId = toast.loading("Generating receipt...");
    try {
      const transactionId = getTransactionIdentifier(transaction);
      if (!transactionId) {
        setError("Transaction identifier is missing");
        toast.error("Missing transaction identifier", { id: toastId });
        return;
      }

      const { data: transactionData } = await api.get(
        `/transactions/${transactionId.trim()}`
      );

      const normalizeBorrower = (profile, fallbackName = "") => {
        if (!profile) {
          return null;
        }

        const extractedName = (() => {
          const full = profile.fullName || fallbackName || profile.name || "";
          if (profile.firstName || profile.lastName) {
            return {
              firstName: profile.firstName || "",
              lastName: profile.lastName || "",
              fullName: `${profile.firstName || ""} ${profile.lastName || ""}`.trim() || full,
            };
          }
          if (!full) {
            return { firstName: "", lastName: "", fullName: "" };
          }

          const parts = full.split(" ").filter(Boolean);
          if (parts.length === 1) {
            return { firstName: parts[0], lastName: "", fullName: full };
          }
          const lastName = parts.pop();
          return { firstName: parts.join(" "), lastName, fullName: full };
        })();

        return {
          firstName: extractedName.firstName,
          lastName: extractedName.lastName,
          fullName: extractedName.fullName,
          studentId:
            profile.studentId ||
            profile.id ||
            profile.uid ||
            profile.userId ||
            transactionData?.userId ||
            "",
          libraryCardNumber:
            profile.libraryCardNumber ||
            profile.libraryCard ||
            profile.library?.cardNumber ||
            transaction.borrowerLibraryCardNumber ||
            "",
        };
      };

      let borrowerProfile = normalizeBorrower(
        transactionData?.user || transactionData?.student,
        transactionData?.borrowerName
      );

      if (!borrowerProfile && transactionData?.userId) {
        try {
          const { data: studentResponse } = await api.get(
            `/students/${transactionData.userId}`
          );
          borrowerProfile = normalizeBorrower(
            studentResponse?.student || studentResponse,
            transactionData?.borrowerName
          );
        } catch (studentError) {
          console.debug("Failed to load student profile", studentError);
        }
      }

      if (!borrowerProfile) {
        borrowerProfile = normalizeBorrower(
          {
            firstName: transaction.borrowerFirstName,
            lastName: transaction.borrowerLastName,
            fullName:
              transaction.borrowerName ||
              transactionData?.borrowerName ||
              transactionData?.userId ||
              "",
            studentId: transaction.borrowerStudentId,
            libraryCardNumber: transaction.borrowerLibraryCardNumber,
          },
          transaction.borrowerName || transactionData?.borrowerName || ""
        );
      }

      if (!borrowerProfile) {
        borrowerProfile = {
          firstName: transactionData?.userId || "",
          lastName: "",
          fullName: transactionData?.userId || "",
          studentId: transactionData?.userId || "",
          libraryCardNumber: "",
        };
      }

      const items = Array.isArray(transactionData?.items)
        ? transactionData.items
        : [];

      const booksData = items.length > 0
        ? items.map((item) => ({
            title: item?.book?.title || item?.title || transaction.bookTitle || "Unknown",
            isbn: item?.isbn || item?.book?.isbn || item?.bookId || "N/A",
            copyId: item?.copyId || "N/A",
          }))
        : [
            {
              title: transaction.bookTitle || "Unknown",
              isbn: transaction.isbn || "N/A",
              copyId: transaction.copyId || "N/A",
            },
          ];

      const libraryResponse = await settingsAPI.getByCategory('library');
      const librarySettings = libraryResponse.data || {};

      const transactionPDF = await generateTransactionReceipt(
        transactionData,
        borrowerProfile,
        booksData,
        librarySettings
      );

      const filenameId = transactionData?.id || transactionData?._id || transactionId;
      downloadPDF(transactionPDF, `receipt_${filenameId}.pdf`);
      setError("");
      toast.success("Receipt generated successfully!", { id: toastId });
    } catch (error) {
      console.error("Error generating receipt:", error);
      setError("Failed to generate receipt");
      toast.error("Failed to generate receipt", { id: toastId });
    }
  };

  const handleApproveRequest = () => {
    const transactionId = getTransactionIdentifier(selectedTransaction);
    if (!transactionId) {
      setError("Transaction identifier is missing");
      return;
    }
    setApproveTransactionId(transactionId);
    setApproveDialogOpen(true);
  };

  const handleApproveDialogClose = () => {
    setApproveDialogOpen(false);
    setApproveTransactionId(null);
  };

  const handleApproveDialogApproved = async () => {
    await fetchTransactions();
    await fetchStats();
    handleMenuClose();
  };

  const handleRejectRequest = () => {
    const transactionId = getTransactionIdentifier(selectedTransaction);
    if (!transactionId) {
      setError("Transaction identifier is missing");
      return;
    }
    setRejectTransactionId(transactionId);
    setRejectReason("");
    setRejectError("");
    setRejectDialogOpen(true);
  };

  const handleRejectDialogClose = () => {
    if (rejectSubmitting) {
      return;
    }
    setRejectDialogOpen(false);
    setRejectTransactionId(null);
    setRejectReason("");
    setRejectError("");
  };

  const handleRejectDialogConfirm = async () => {
    if (!rejectTransactionId) {
      setRejectError("Transaction identifier is missing");
      return;
    }

    setRejectSubmitting(true);
    setRejectError("");
    const toastId = toast.loading("Rejecting request...");
    try {
      await api.post(`/transactions/reject/${rejectTransactionId}`, {
        reason: rejectReason.trim() || undefined,
      });
      toast.success("Request rejected", { id: toastId });
      await fetchTransactions();
      await fetchStats();
      setRejectDialogOpen(false);
      setRejectTransactionId(null);
      setRejectReason("");
      setRejectError("");
      handleMenuClose();
    } catch (err) {
      const message = err.response?.data?.message || "Failed to reject request";
      setRejectError(message);
      toast.error(message, { id: toastId });
    } finally {
      setRejectSubmitting(false);
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
        setReturnError("Reference ID does not match. Please enter the correct Reference ID to confirm return.");
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
      case "missing":
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
      case "missing":
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
            {canManageAnnualBorrowing && borrowingSettings.annualBorrowingEnabled && (
              <Button
                variant="outlined"
                startIcon={<AutoStories />}
                onClick={() => navigate("/annual-borrowing")}
                sx={{ ...importActionButtonSx, minWidth: 160 }}
              >
                Annual Borrowing
              </Button>
            )}
            <Button
              variant="outlined"
              startIcon={<ListAlt />}
              onClick={() => navigate("/transactions/requests")}
              sx={{ ...importActionButtonSx, minWidth: 170 }}
            >
              Borrow Requests
            </Button>
            <Button
              variant="outlined"
              startIcon={<Assignment />}
              onClick={() => navigate("/transactions/borrow")}
              sx={{ ...importActionButtonSx, minWidth: 140 }}
            >
              New Borrow
            </Button>
            <Button
              variant="contained"
              startIcon={<AssignmentReturn />}
              onClick={() => navigate("/transactions/return")}
              sx={{ ...addActionButtonSx, minWidth: 150 }}
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
                  <Typography variant="h6">{stats.borrowed}</Typography>
                  <Typography variant="body2" color="textSecondary">
                    Borrowed Transactions
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        {finesEnabled ? (
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
        ) : null}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <AssignmentReturn color="success" sx={{ mr: 2 }} />
                <Box>
                  <Typography variant="h6">{stats.returned}</Typography>
                  <Typography variant="body2" color="textSecondary">
                    Total Returns
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
            inputProps={{ id: searchInputId }}
            InputProps={{
              startAdornment: (
                <Search sx={{ mr: 1, color: "text.secondary" }} />
              ),
            }}
          />
          <MobileScanButton
            label="Scan to Search"
            onClick={() => setSearchScannerOpen(true)}
          />
          <IconButton
            aria-label="Open filters"
            onClick={openFilters}
            size="small"
            sx={{ border: "1px solid #E2E8F0", backgroundColor: "#F8FAFC" }}
          >
            <FilterList />
          </IconButton>
        </Box>
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
                <MenuItem value="active">Borrowed</MenuItem>
                <MenuItem value="returned">Returned</MenuItem>
                <MenuItem value="overdue">Overdue</MenuItem>
                <MenuItem value="lost">Lost</MenuItem>
                <MenuItem value="missing">Missing</MenuItem>
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
      {/* Transactions Table */}
      <Paper>
        {loading && <LinearProgress />}
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Transaction ID</TableCell>
                <TableCell>Book Title</TableCell>
                <TableCell>Reference ID</TableCell>
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
              {loading ? (
                <TableRow>
                  <TableCell colSpan={10} align="center">
                    <Typography variant="body2" color="text.secondary">
                      Loading transactions...
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : displayedTransactions.length === 0 ? (
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
                    hover
                    key={
                      transaction._id ||
                      transaction.documentId ||
                      transaction.id ||
                      transaction.copyId
                    }
                    onDoubleClick={() => navigateToTransactionDetails(transaction)}
                    sx={{ cursor: 'pointer' }}
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
                        {finesEnabled && isOverdue(transaction) && (
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
        {canManageTransactions && isReturnableStatus(selectedTransaction?.status) && (
          <MenuItem onClick={() => { handleMenuClose(false); setReturnCopyInput(""); setReturnError(""); setReturnDialogOpen(true); }}>
            <AssignmentReturn sx={{ mr: 1 }} />
            Return Book
          </MenuItem>
        )}
        {canManageTransactions && selectedTransaction?.status === "requested" && (
          <>
            <MenuItem onClick={() => { handleMenuClose(false); handleApproveRequest(); }}>
              <CheckCircle sx={{ mr: 1 }} />
              Approve Request
            </MenuItem>
            <MenuItem onClick={() => { handleMenuClose(false); handleRejectRequest(); }}>
              <Cancel sx={{ mr: 1 }} />
              Reject Request
            </MenuItem>
          </>
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
            To confirm the return, please enter the Reference ID of the book being returned.
          </Typography>
          <Box display="flex" gap={1} alignItems="center">
            <TextField
              label="Reference ID"
              value={returnCopyInput}
              onChange={(e) => { setReturnCopyInput(e.target.value); setReturnError(""); }}
              fullWidth
              margin="dense"
              autoFocus
              inputRef={copyIdInputRef}
            />
            <Button
              variant="outlined"
              size="small"
              onClick={() => setScannerOpen(true)}
              sx={{ height: 40, display: { xs: "none", sm: "inline-flex" } }}
            >
              Scan QR
            </Button>
          </Box>
          <MobileScanButton
            label="Scan Reference QR"
            onClick={() => setScannerOpen(true)}
          />
          {returnError && (
            <Typography color="error" variant="caption" display="block" sx={{ mt: 1 }}>
              {returnError}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setReturnDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleConfirmReturn} variant="contained" color="primary">
            Confirm Return
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={rejectDialogOpen}
        onClose={handleRejectDialogClose}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Reject Request</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>
            Optionally include a note so the borrower knows why the request was rejected.
          </Typography>
          {rejectError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {rejectError}
            </Alert>
          )}
          <TextField
            label="Reason"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            multiline
            minRows={3}
            fullWidth
            placeholder="Optional"
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={handleRejectDialogClose} disabled={rejectSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleRejectDialogConfirm}
            variant="contained"
            color="error"
            disabled={rejectSubmitting}
          >
            {rejectSubmitting ? "Rejecting..." : "Reject Request"}
          </Button>
        </DialogActions>
      </Dialog>
      <ApproveRequestDialog
        open={approveDialogOpen}
        transactionId={approveTransactionId}
        onClose={handleApproveDialogClose}
        onApproved={handleApproveDialogApproved}
        onNavigateToRequests={() => {
          handleApproveDialogClose();
          handleMenuClose();
          navigate("/transactions/requests");
        }}
      />

        <MobileScanDialog
          open={searchScannerOpen}
          onClose={() => setSearchScannerOpen(false)}
          onDetected={(value) => setSearchTerm(value || "")}
          title="Scan to Search Transactions"
          elementId="transactions-search-qr"
          targetSelector={`#${searchInputId}`}
        />

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
          <Button variant="outlined" onClick={() => setScannerOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TransactionsList;
