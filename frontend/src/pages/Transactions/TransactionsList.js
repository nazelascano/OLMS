/* eslint-disable unicode-bom */
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Alert,
  Autocomplete,
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
  InputAdornment,
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
  Tooltip,
  Typography,
} from "@mui/material";
import CircularProgress from "@mui/material/CircularProgress";
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
  QrCodeScanner,
} from "@mui/icons-material";
import QRScanner from "../../components/QRScanner";
import MobileScanButton from "../../components/MobileScanButton";
import MobileScanDialog from "../../components/MobileScanDialog";
import { useAuth } from "../../contexts/AuthContext";
import { api, settingsAPI } from "../../utils/api";
import { generateTransactionReceipt, downloadPDF } from "../../utils/pdfGenerator";
import toast from "react-hot-toast";
import { addActionButtonSx, importActionButtonSx } from "../../theme/actionButtons";

const TransactionsList = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const location = useLocation();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchScannerOpen, setSearchScannerOpen] = useState(false);
  const searchInputId = "transactions-search-input";
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
  // Approval assignment dialog state
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [approveAssignments, setApproveAssignments] = useState({});
  const [approveBooks, setApproveBooks] = useState({});
  const [approveItems, setApproveItems] = useState([]);
  const [approveTransactionId, setApproveTransactionId] = useState(null);
  const [approveLoading, setApproveLoading] = useState(false);
  const [approveSubmitting, setApproveSubmitting] = useState(false);
  const [approveError, setApproveError] = useState("");
  const [assignScanner, setAssignScanner] = useState({ open: false, targetKey: null, label: "" });
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

  const buildApproveItemKey = (item, index) => {
    if (!item) return `item-${index}`;
    if (item.requestItemId) return String(item.requestItemId);
    const bookId = item.bookId ? String(item.bookId) : "book";
    return `${bookId}-${index}`;
  };

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
      const { data } = await api.get(`/transactions/${transactionId}`);
      const items = Array.isArray(data?.items) ? data.items : [];
      await prepareApproveDialog(transactionId, items);
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

  const prepareApproveDialog = async (transactionId, items = []) => {
    setApproveDialogOpen(true);
    setApproveTransactionId(transactionId);
    setApproveItems(items);
    setApproveAssignments({});
    setApproveBooks({});
    setApproveError('');
    setApproveSubmitting(false);
    setApproveLoading(true);

    try {
      const collectItemBookIds = (item) => {
        const candidates = [
          item?.bookId,
          item?.book?.id,
          item?.book?._id,
          item?.book?.bookId,
        ];
        return candidates
          .map((candidate) => (candidate !== undefined && candidate !== null ? String(candidate).trim() : ''))
          .filter(Boolean);
      };

      const fallbackBookFromItems = (bookId) => {
        const match = items.find((entry) => collectItemBookIds(entry).includes(String(bookId)));
        if (!match) {
          return null;
        }
        const resolved = match.book || {};
        return {
          id: String(bookId),
          title: resolved.title || match.title || 'Unknown title',
          author: resolved.author || match.author || '',
          isbn: resolved.isbn || match.isbn || '',
          copies: Array.isArray(resolved.copies) ? resolved.copies : [],
        };
      };

      const uniqueBookIds = Array.from(
        new Set(items.flatMap((item) => collectItemBookIds(item)))
      );

      const booksMap = {};
      if (uniqueBookIds.length > 0) {
        const responses = await Promise.all(
          uniqueBookIds.map(async (bookId) => {
            try {
              const resp = await api.get(`/books/${bookId}`);
              return { bookId, data: resp.data };
            } catch (err) {
              console.warn('Failed to load book details', bookId, err?.response?.status || err.message);
              return { bookId, error: err };
            }
          })
        );

        const failed = [];
        responses.forEach(({ bookId, data, error }) => {
          if (data) {
            const registerKeys = [bookId, data.id, data._id, data.bookId].filter(Boolean);
            registerKeys.forEach((key) => {
              booksMap[String(key)] = data;
            });
            return;
          }

          failed.push(bookId);
          const fallback = fallbackBookFromItems(bookId) || {
            id: String(bookId),
            title: 'Unknown title',
            author: '',
            isbn: '',
            copies: [],
          };
          const registerKeys = [bookId, fallback.id].filter(Boolean);
          registerKeys.forEach((key) => {
            booksMap[String(key)] = fallback;
          });
        });

        if (failed.length > 0) {
          setApproveError((prev) =>
            prev || 'Some book details were unavailable. Manual copy assignment may be required.'
          );
        }
      }

      const initialAssignments = {};
      items.forEach((item, index) => {
        const key = buildApproveItemKey(item, index);
        initialAssignments[key] = item?.copyId ? String(item.copyId) : '';
      });

      setApproveBooks(booksMap);
      setApproveAssignments(initialAssignments);
    } catch (err) {
      console.error('Failed to prepare approval dialog', err);
      setApproveError(err.response?.data?.message || 'Failed to load book details');
    } finally {
      setApproveLoading(false);
    }
  };

  const closeApproveDialog = () => {
    if (approveSubmitting) {
      return;
    }
    setApproveDialogOpen(false);
    setApproveTransactionId(null);
    setApproveItems([]);
    setApproveAssignments({});
    setApproveBooks({});
    setApproveError('');
  };

  const handleOpenRequestsPage = () => {
    closeApproveDialog();
    navigate('/transactions/requests');
  };

  const handleAssignmentChange = (itemKey, value) => {
    const normalized = (value || '').toString().trim();
    setApproveAssignments((prev) => ({ ...prev, [itemKey]: normalized }));
    setApproveError('');
  };

  const openAssignScannerForItem = (itemKey, label) => {
    if (!itemKey) return;
    setAssignScanner({ open: true, targetKey: itemKey, label: label || 'Copy ID' });
  };

  const closeAssignScannerDialog = () => {
    setAssignScanner({ open: false, targetKey: null, label: '' });
  };

  const handleAssignmentScanDetected = (value) => {
    const trimmed = String(value || '').trim();
    if (!trimmed) {
      toast.error('QR code did not contain a copy ID');
      return;
    }
    if (!assignScanner.targetKey) {
      toast.error('No target field selected for scanning');
      return;
    }
    setApproveAssignments((prev) => ({ ...prev, [assignScanner.targetKey]: trimmed }));
    toast.success('Copy ID captured');
    closeAssignScannerDialog();
  };

  const approveDialogItems = useMemo(
    () => (Array.isArray(approveItems) ? approveItems : []),
    [approveItems],
  );

  const takenCopyMap = useMemo(() => {
    const mapping = {};
    Object.entries(approveAssignments || {}).forEach(([key, value]) => {
      if (!value) return;
      mapping[String(value).toLowerCase()] = key;
    });
    return mapping;
  }, [approveAssignments]);

  const assignmentsReady = useMemo(() => {
    if (!approveDialogOpen || approveLoading) return false;
    return approveDialogItems.every((item, index) => {
      const key = buildApproveItemKey(item, index);
      const assigned = approveAssignments[key] || item?.copyId;
      return Boolean((assigned || '').toString().trim());
    });
  }, [approveAssignments, approveDialogItems, approveDialogOpen, approveLoading]);

  const handleSubmitApproveAssignments = async () => {
    if (!approveTransactionId) {
      setApproveError('Missing transaction identifier.');
      return;
    }
    setApproveSubmitting(true);
    setApproveError('');

    try {
      const payloadItems = approveDialogItems.map((item, index) => {
        const key = buildApproveItemKey(item, index);
        const copyId = (approveAssignments[key] || item?.copyId || '').toString().trim();
        const bookId = item?.bookId ? String(item.bookId) : undefined;
        return {
          requestItemId: item?.requestItemId,
          bookId,
          copyId,
        };
      });

      const missingAssignments = payloadItems.filter((entry) => !entry.copyId);
      if (missingAssignments.length > 0) {
        setApproveError('Please assign a copy for each requested book.');
        setApproveSubmitting(false);
        return;
      }

      await api.post(`/transactions/approve/${approveTransactionId}`, { items: payloadItems });
      toast.success('Request approved');
      closeApproveDialog();
      await fetchTransactions();
      await fetchStats();
      handleMenuClose();
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to approve request';
      setApproveError(message);
    } finally {
      setApproveSubmitting(false);
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
      {/* Transactions Table */}
      <Paper>
        {loading && <LinearProgress />}
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
            label="Scan Copy QR"
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
          open={approveDialogOpen}
          onClose={closeApproveDialog}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle>Assign Copies</DialogTitle>
          <DialogContent dividers>
            {approveError && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                {approveError}
              </Alert>
            )}
            {approveLoading ? (
              <Box display="flex" alignItems="center" justifyContent="center" minHeight={200}>
                <CircularProgress />
              </Box>
            ) : approveDialogItems.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No items to assign for this request.
              </Typography>
            ) : (
              <Box>
                {approveDialogItems.map((item, index) => {
                  const key = buildApproveItemKey(item, index);
                  const assignedCopyId = approveAssignments[key] || item?.copyId || '';
                  const bookId = item?.bookId ? String(item.bookId) : '';
                  const bookDetails =
                    approveBooks[bookId] ||
                    approveBooks[item?.book?._id || ''] ||
                    approveBooks[item?.book?.id || ''];
                  const availableCopies = Array.isArray(bookDetails?.copies)
                    ? bookDetails.copies.filter(
                        (copy) => String(copy.status).toLowerCase() === 'available'
                      )
                    : [];
                  const hasBookDetails = Boolean(bookDetails);
                  const title = bookDetails?.title || item?.title || 'Unknown title';
                  const author = bookDetails?.author || item?.author || '';
                  const isbn = bookDetails?.isbn || item?.isbn || '';
                  const copyOptions = availableCopies
                    .filter((copy) => {
                      const owner = takenCopyMap[String(copy.copyId).toLowerCase()];
                      return !owner || owner === key;
                    })
                    .map((copy) => copy.copyId)
                    .filter(Boolean);

                  return (
                    <Box
                      key={key}
                      sx={{
                        border: '1px solid #e5e7eb',
                        borderRadius: 1,
                        p: 2,
                        mb: 2,
                      }}
                    >
                      <Typography variant="subtitle1" fontWeight="600">
                        {title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {[author && `Author: ${author}`, isbn && `ISBN: ${isbn}`]
                          .filter(Boolean)
                          .join(' • ')}
                      </Typography>

                      {item?.copyId ? (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                          Copy already assigned: {item.copyId}
                        </Typography>
                      ) : hasBookDetails && copyOptions.length > 0 ? (
                        <Box sx={{ width: '100%', mt: 2 }}>
                          <Autocomplete
                            freeSolo
                            disableClearable
                            autoHighlight
                            options={copyOptions}
                            value={assignedCopyId || ''}
                            onChange={(event, newValue) => handleAssignmentChange(key, newValue || '')}
                            onInputChange={(event, newInputValue, reason) => {
                              if (reason === 'input') {
                                handleAssignmentChange(key, newInputValue || '');
                              }
                            }}
                            renderOption={(props, option) => {
                              const meta = availableCopies.find((copy) => copy.copyId === option);
                              return (
                                <li {...props} key={option}>
                                  <Box display="flex" flexDirection="column">
                                    <Typography variant="body2">{option}</Typography>
                                    {meta?.location && (
                                      <Typography variant="caption" color="text.secondary">
                                        Location: {meta.location}
                                      </Typography>
                                    )}
                                    {meta?.condition && (
                                      <Typography variant="caption" color="text.secondary">
                                        Condition: {meta.condition}
                                      </Typography>
                                    )}
                                  </Box>
                                </li>
                              );
                            }}
                            renderInput={(params) => (
                              <TextField
                                {...params}
                                label="Copy ID"
                                placeholder="Search or scan copy ID"
                                InputProps={{
                                  ...params.InputProps,
                                  endAdornment: (
                                    <>
                                      <InputAdornment position="end">
                                        <Tooltip title="Scan QR code">
                                          <span>
                                            <IconButton
                                              size="small"
                                              onClick={() => openAssignScannerForItem(key, title)}
                                              disabled={approveSubmitting}
                                            >
                                              <QrCodeScanner fontSize="small" />
                                            </IconButton>
                                          </span>
                                        </Tooltip>
                                      </InputAdornment>
                                      {params.InputProps.endAdornment}
                                    </>
                                  ),
                                }}
                                helperText="Type to search available copies or scan a QR label"
                                size="small"
                              />
                            )}
                            disabled={approveSubmitting}
                          />
                        </Box>
                      ) : (
                        <Alert severity={hasBookDetails ? 'warning' : 'error'} sx={{ mt: 2 }}>
                          {hasBookDetails
                            ? 'No available copies for this book.'
                            : 'Unable to load available copies for this book.'}
                        </Alert>
                      )}
                    </Box>
                  );
                })}
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={closeApproveDialog} disabled={approveSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleOpenRequestsPage} disabled={approveSubmitting}>
              Open Requests Page
            </Button>
            <Button
              variant="contained"
              onClick={handleSubmitApproveAssignments}
              disabled={!assignmentsReady || approveSubmitting}
            >
              {approveSubmitting ? 'Assigning…' : 'Assign Copies'}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={assignScanner.open}
          onClose={closeAssignScannerDialog}
          maxWidth="xs"
          fullWidth
        >
          <DialogTitle>Scan Copy ID</DialogTitle>
          <DialogContent>
            {assignScanner.open && (
              <QRScanner
                elementId="transaction-assign-qr"
                onDetected={handleAssignmentScanDetected}
                onClose={closeAssignScannerDialog}
              />
            )}
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Position the QR label for {assignScanner.label || 'this item'} inside the frame.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={closeAssignScannerDialog}>Close</Button>
          </DialogActions>
        </Dialog>

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
