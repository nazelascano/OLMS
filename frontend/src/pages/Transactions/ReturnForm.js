import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Paper,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import {
  ArrowBack,
  AssignmentReturn,
  CurrencyExchange,
  Book,
  Search,
  Warning,
  QrCodeScanner,
} from "@mui/icons-material";
import MobileScanButton from "../../components/MobileScanButton";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { api, settingsAPI } from "../../utils/api";
import { formatCurrency } from "../../utils/currency";
import { generateTransactionReceipt, downloadPDF } from "../../utils/pdfGenerator";
import QRScanner from "../../components/QRScanner";
import { useSettings } from "../../contexts/SettingsContext";

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const ReturnForm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchInput, setSearchInput] = useState("");
  const [borrowedBooks, setBorrowedBooks] = useState([]);
  const [selectedReturns, setSelectedReturns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [returnDate, setReturnDate] = useState(new Date());
  const [notes, setNotes] = useState("");
  const [borrowingRules, setBorrowingRules] = useState({
    finePerDay: 0.5,
    gracePeriodDays: 0,
    enableFines: true,
  });
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [totalFine, setTotalFine] = useState(0);
  const [scannerOpen, setScannerOpen] = useState(false);
  const { finesEnabled } = useSettings();

  const scannerBufferRef = useRef("");
  const lastKeyTimeRef = useRef(0);

  const getRowId = (transaction) =>
    transaction?.rowId ||
    transaction?._id ||
    `${transaction?.transactionId || transaction?.id}_${transaction?.copyId}`;

  const resolveDueDate = (transaction) =>
    transaction?.dueDate || transaction?.metadata?.providedDueDate || null;

  const calculateFine = useCallback((dueDate, candidateReturnDate) => {
    if (!finesEnabled) {
      return 0;
    }
    if (!dueDate) return 0;

    const due = new Date(dueDate);
    const returned = new Date(candidateReturnDate);

    if (Number.isNaN(due.getTime()) || Number.isNaN(returned.getTime())) {
      return 0;
    }

    if (returned <= due) return 0;

    const overdueDays = Math.ceil((returned - due) / (1000 * 60 * 60 * 24));
    const graceDays = borrowingRules.gracePeriodDays || 0;
    const fineDays = Math.max(0, overdueDays - graceDays);

    return fineDays * borrowingRules.finePerDay;
  }, [borrowingRules.gracePeriodDays, borrowingRules.finePerDay, finesEnabled]);

  const handleBarcodeScan = useCallback(
    async (rawValue) => {
      const trimmedCopyId = String(rawValue || "").trim();
      if (!trimmedCopyId) {
        return;
      }

      try {
        const response = await api.get("/transactions/by-copy", {
          params: { copyId: trimmedCopyId },
        });

        if (response.data) {
          setBorrowedBooks([response.data]);
          setSelectedReturns([]);
          setSearchInput(trimmedCopyId);
          setError("");
          setSuccess("");
        } else {
          setError("No borrowed record found for this copy");
        }
      } catch (requestError) {
        setError("Failed to find borrowing record");
        console.error("Error processing scan:", requestError);
      }
    },
    []
  );

  const fetchBorrowingRules = async () => {
    try {
      const response = await api.get("/settings/borrowing-rules");
      const data = response.data || {};
      setBorrowingRules({
        finePerDay: toNumber(data.finePerDay, 0.5),
        gracePeriodDays: toNumber(data.gracePeriodDays, 0),
        enableFines: data.enableFines !== false,
      });
    } catch (fetchError) {
      console.error("Error fetching borrowing rules:", fetchError);
    }
  };

  useEffect(() => {
    fetchBorrowingRules();
  }, []);

  useEffect(() => {
    const SCAN_RESET_THRESHOLD = 80;
    const MIN_BARCODE_LENGTH = 4;

    const handleKeyDown = (event) => {
      const currentTime = Date.now();
      if (currentTime - lastKeyTimeRef.current > SCAN_RESET_THRESHOLD) {
        scannerBufferRef.current = "";
      }

      if (event.key === "Enter") {
        const barcode = scannerBufferRef.current;
        scannerBufferRef.current = "";
        lastKeyTimeRef.current = currentTime;
        if (barcode.length >= MIN_BARCODE_LENGTH) {
          event.preventDefault();
          handleBarcodeScan(barcode);
        }
        return;
      }

      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
        scannerBufferRef.current += event.key;
        lastKeyTimeRef.current = currentTime;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleBarcodeScan]);

  useEffect(() => {
    const total = selectedReturns.reduce((sum, transaction) => {
      return sum + calculateFine(transaction.dueDate, returnDate);
    }, 0);
    setTotalFine(total);
  }, [selectedReturns, returnDate, calculateFine]);

  const searchBorrowedBooks = async () => {
    const trimmedQuery = searchInput.trim();
    if (!trimmedQuery) {
      setError("Please enter a search term");
      return;
    }

    setLoading(true);
    try {
      const response = await api.get("/transactions/borrowed", {
        params: { search: trimmedQuery },
      });
      const results = response.data || [];
      setBorrowedBooks(results);
      setError(results.length === 0 ? "No borrowed books found for this search" : "");
    } catch (requestError) {
      setError("Failed to search borrowed books");
      console.error("Error searching borrowed books:", requestError);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectReturn = (transaction, isSelected) => {
    const rowId = getRowId(transaction);
    const dueDateValue = resolveDueDate(transaction);

    if (isSelected) {
      setSelectedReturns((previous) => {
        if (previous.some((entry) => entry.rowId === rowId)) {
          return previous;
        }
        const fine = calculateFine(dueDateValue, returnDate);
        return [...previous, { ...transaction, rowId, fine, dueDate: dueDateValue }];
      });
    } else {
      setSelectedReturns((previous) => previous.filter((entry) => entry.rowId !== rowId));
    }
  };

  const handleToggleSelectAll = (event) => {
    const { checked } = event.target;
    const visibleRowIds = new Set(borrowedBooks.map((transaction) => getRowId(transaction)));

    if (checked) {
      const updatedSelections = borrowedBooks.map((transaction) => {
        const rowId = getRowId(transaction);
        const dueDateValue = resolveDueDate(transaction);
        const fine = calculateFine(dueDateValue, returnDate);
        return { ...transaction, rowId, fine, dueDate: dueDateValue };
      });

      setSelectedReturns((previous) => {
        const merged = new Map(previous.map((entry) => [entry.rowId, entry]));
        updatedSelections.forEach((entry) => {
          merged.set(entry.rowId, entry);
        });
        return Array.from(merged.values());
      });
    } else {
      setSelectedReturns((previous) => previous.filter((entry) => !visibleRowIds.has(entry.rowId)));
    }
  };

  const handleReturnBooks = () => {
    if (selectedReturns.length === 0) {
      setError("Please select at least one book to return");
      return;
    }
    setConfirmDialog(true);
  };

  const confirmReturn = async () => {
    setLoading(true);
    try {
      const groupedTransactions = selectedReturns.reduce((acc, entry) => {
        const id = entry.transactionId || entry._id;
        if (!id) {
          return acc;
        }
        if (!acc[id]) {
          acc[id] = { transactionId: id, items: [] };
        }
        acc[id].items.push({ copyId: entry.copyId });
        return acc;
      }, {});

      const groupedValues = Object.values(groupedTransactions);
      if (groupedValues.length === 0) {
        setError("Unable to process the selected items. Please try again.");
        setLoading(false);
        return;
      }

      const payload = {
        transactions: groupedValues,
        returnDate: returnDate ? new Date(returnDate).toISOString() : undefined,
        notes,
      };

      const response = await api.post("/transactions/return", payload);
      setSuccess(response.data?.message || `Successfully returned ${selectedReturns.length} book(s)`);
      setError("");

      // Generate transaction receipts for each returned book
      try {
        const returnDateTime = returnDate || new Date();
        for (const returnItem of selectedReturns) {
          const transactionData = {
            id: returnItem.transactionId,
            type: 'Return',
            createdAt: returnDateTime,
            fineAmount: calculateFine(returnItem.dueDate, returnDateTime)
          };

          const studentData = {
            firstName: returnItem.borrowerName?.split(' ')[0] || '',
            lastName: returnItem.borrowerName?.split(' ').slice(1).join(' ') || '',
            studentId: returnItem.studentId || '',
            libraryCardNumber: returnItem.libraryCardNumber || ''
          };

          const booksData = [{
            title: returnItem.bookTitle,
            copyId: returnItem.copyId
          }];

          const libraryResponse = await settingsAPI.getByCategory('library');
          const librarySettings = libraryResponse.data || {};

          const receiptPDF = await generateTransactionReceipt(
            transactionData,
            studentData,
            booksData,
            librarySettings
          );
          downloadPDF(receiptPDF, `return_receipt_${returnItem.transactionId}_${Date.now()}.pdf`);
        }
      } catch (receiptError) {
        console.error("Error generating receipts:", receiptError);
        // Don't show error for receipt generation failure
      }

      // Reset form
      setBorrowedBooks([]);
      setSelectedReturns([]);
      setSearchInput("");
      setNotes("");
      setConfirmDialog(false);

      // Navigate back to referrer when possible, otherwise go to transactions list
      setTimeout(() => {
        navigate(location.state?.from || "/transactions");
      }, 2000);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Failed to process returns");
      console.error("Error processing returns:", requestError);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (dueDate) => {
    if (!dueDate) return "default";

    const due = new Date(dueDate);
    if (Number.isNaN(due.getTime())) {
      return "default";
    }

    const now = new Date();

    if (due < now) return "error";
    if (due - now < 3 * 24 * 60 * 60 * 1000) return "warning";
    return "success";
  };

  const getOverdueDays = (dueDate) => {
    if (!dueDate) return 0;

    const due = new Date(dueDate);
    if (Number.isNaN(due.getTime())) {
      return 0;
    }

    const now = new Date();
    return Math.max(0, Math.ceil((now - due) / (1000 * 60 * 60 * 24)));
  };

  const visibleRowIds = borrowedBooks.map((transaction) => getRowId(transaction));
  const selectedRowIds = new Set(selectedReturns.map((entry) => entry.rowId));
  const allVisibleSelected =
    borrowedBooks.length > 0 && visibleRowIds.every((rowId) => selectedRowIds.has(rowId));
  const someVisibleSelected =
    borrowedBooks.length > 0 &&
    visibleRowIds.some((rowId) => selectedRowIds.has(rowId)) &&
    !allVisibleSelected;

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box>
        <Box display="flex" alignItems="center" mb={3}>
          <IconButton
            onClick={() => {
              if (location.state?.from) navigate(location.state.from);
              else navigate(-1);
            }}
            sx={{ mr: 2 }}
          >
            <ArrowBack />
          </IconButton>
          <Typography variant="h4" gutterBottom sx={{ flexGrow: 1, mb: 0 }}>
            Return Books
          </Typography>
        </Box>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {success}
          </Alert>
        )}
        {/* Search Section */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Find Borrowed Books
          </Typography>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={8}>
              <TextField
                fullWidth
                label="Search by borrower name, reference ID, or book title"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                onKeyPress={(event) => event.key === "Enter" && searchBorrowedBooks()}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search sx={{ color: "text.secondary" }} />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label="scan barcode or QR code"
                        onClick={() => setScannerOpen(true)}
                        edge="end"
                      >
                        <QrCodeScanner />
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <Button
                fullWidth
                variant="contained"
                onClick={searchBorrowedBooks}
                disabled={loading}
                startIcon={<Search />}
              >
                {loading ? "Searching..." : "Search"}
              </Button>
            </Grid>
            <Grid item xs={12}>
              <MobileScanButton
                label="Open QR Scanner"
                onClick={() => setScannerOpen(true)}
              />
            </Grid>
          </Grid>
        </Paper>
        <Dialog open={scannerOpen} onClose={() => setScannerOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle>Scan Reference Code</DialogTitle>
          <DialogContent>
            <QRScanner
              elementId="return-qr-scanner"
              onDetected={(value) => {
                setScannerOpen(false);
                handleBarcodeScan(value);
              }}
              onClose={() => setScannerOpen(false)}
            />
          </DialogContent>
          <DialogActions>
            <Button variant="outlined" onClick={() => setScannerOpen(false)}>Cancel</Button>
          </DialogActions>
        </Dialog>
        {/* Borrowed Books Table */}
        {borrowedBooks.length > 0 && (
          <Paper sx={{ mb: 3 }}>
            <Box p={2}>
              <Typography variant="h6" gutterBottom>
                Borrowed Books Found
              </Typography>
            </Box>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        indeterminate={someVisibleSelected}
                        checked={allVisibleSelected}
                        onChange={handleToggleSelectAll}
                      />
                    </TableCell>
                    <TableCell>Book Details</TableCell>
                    <TableCell>Borrower</TableCell>
                    <TableCell>Reference ID</TableCell>
                    <TableCell>Borrow Date</TableCell>
                    <TableCell>Due Date</TableCell>
                    <TableCell>Status</TableCell>
                    {finesEnabled ? <TableCell>Fine</TableCell> : null}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {borrowedBooks.map((transaction) => {
                    const rowId = getRowId(transaction);
                    const dueDateValue = resolveDueDate(transaction);
                    const isSelected = selectedReturns.some((entry) => entry.rowId === rowId);
                    const fine = calculateFine(dueDateValue, returnDate);
                    const overdueDays = getOverdueDays(dueDateValue);

                    return (
                      <TableRow key={rowId}>
                        <TableCell padding="checkbox">
                          <Checkbox
                            checked={isSelected}
                            onChange={(event) =>
                              handleSelectReturn(transaction, event.target.checked)
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Box>
                            <Typography variant="body2" fontWeight="medium">
                              {transaction.bookTitle}
                            </Typography>
                            <Typography variant="caption" color="textSecondary">
                              by {transaction.author}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box display="flex" alignItems="center">
                            <Avatar sx={{ mr: 1, width: 32, height: 32 }}>
                              {transaction.borrowerName?.charAt(0)}
                            </Avatar>
                            <Box>
                              <Typography variant="body2">
                                {transaction.borrowerName}
                              </Typography>
                              <Typography variant="caption" color="textSecondary">
                                {transaction.borrowerEmail}
                              </Typography>
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell>{transaction.copyId}</TableCell>
                        <TableCell>
                          {transaction.borrowDate
                            ? new Date(transaction.borrowDate).toLocaleDateString()
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <Box display="flex" alignItems="center">
                            {overdueDays > 0 && <Warning color="error" sx={{ mr: 1, fontSize: 16 }} />}
                            {dueDateValue
                              ? new Date(dueDateValue).toLocaleDateString()
                              : "-"}
                            {overdueDays > 0 && (
                              <Typography variant="caption" color="error" sx={{ ml: 1 }}>
                                ({overdueDays} days overdue)
                              </Typography>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={overdueDays > 0 ? "Overdue" : "Active"}
                            color={getStatusColor(dueDateValue)}
                            size="small"
                          />
                        </TableCell>
                        {finesEnabled ? (
                          <TableCell>
                            <Box display="flex" alignItems="center">
                              {fine > 0 && (
                                <CurrencyExchange
                                  color="error"
                                  sx={{ mr: 1, fontSize: 16 }}
                                />
                              )}
                              <Typography
                                variant="body2"
                                color={fine > 0 ? "error" : "textSecondary"}
                                fontWeight={fine > 0 ? "medium" : "normal"}
                              >
                                  {formatCurrency(fine)}
                              </Typography>
                            </Box>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}
        {/* Return Details */}
        {selectedReturns.length > 0 && (
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Return Details
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <DateTimePicker
                  label="Return Date & Time"
                  value={returnDate}
                  onChange={(newValue) => setReturnDate(newValue || new Date())}
                  slotProps={{ textField: { fullWidth: true } }}
                  maxDate={new Date()}
                />
              </Grid>
              {finesEnabled ? (
                <Grid item xs={12} md={6}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="h6" color="error">
                        Total Fine: {formatCurrency(totalFine)}
                      </Typography>
                      <Typography variant="body2" color="textSecondary">
                        Fine rate: {formatCurrency(borrowingRules.finePerDay)}/day
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ) : null}
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Return Notes (Optional)"
                  multiline
                  rows={3}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Add any notes about the book condition or return..."
                />
              </Grid>
            </Grid>
            <Box display="flex" justifyContent="space-between" alignItems="center" mt={3}>
              <Typography variant="body1">
                Returning {selectedReturns.length} book(s)
              </Typography>
              <Box>
                <Button variant="outlined" onClick={() => setSelectedReturns([])} sx={{ mr: 2 }}>
                  Clear Selection
                </Button>
                <Button
                  variant="contained"
                  startIcon={<AssignmentReturn />}
                  onClick={handleReturnBooks}
                  disabled={loading}
                >
                  Return Books
                </Button>
              </Box>
            </Box>
          </Paper>
        )}
        {/* Confirmation Dialog */}
        <Dialog
          open={confirmDialog}
          onClose={() => setConfirmDialog(false)}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle>Confirm Book Return</DialogTitle>
          <DialogContent>
            <Alert severity="info" sx={{ mb: 2 }}>
              You are about to return {selectedReturns.length} book(s)
              {finesEnabled ? ` with a total fine of ${formatCurrency(totalFine)}` : ""}
            </Alert>
            <List>
              {selectedReturns.map((transaction) => {
                const fine = calculateFine(transaction.dueDate, returnDate);
                return (
                  <ListItem key={transaction.rowId} divider>
                    <ListItemIcon>
                      <Book />
                    </ListItemIcon>
                    <ListItemText
                      primary={`${transaction.bookTitle} (Reference ID: ${transaction.copyId})`}
                      secondary={
                        finesEnabled
                          ? `Borrower: ${transaction.borrowerName} | Fine: ${formatCurrency(fine)}`
                          : `Borrower: ${transaction.borrowerName}`
                      }
                    />
                  </ListItem>
                );
              })}
            </List>
          </DialogContent>
          <DialogActions>
            <Button variant="outlined" onClick={() => setConfirmDialog(false)}>Cancel</Button>
            <Button onClick={confirmReturn} variant="contained" disabled={loading}>
              {loading ? "Processing..." : "Confirm Return"}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </LocalizationProvider>
  );
};

export default ReturnForm;

