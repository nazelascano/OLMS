/* eslint-disable unicode-bom */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import QRScanner from "../../components/QRScanner";
import { ArrowBack, Assignment, Book, Remove, Search } from "@mui/icons-material";
import { api } from "../../utils/api";
import { formatCurrency } from "../../utils/currency";
import { generateTransactionReceipt, downloadPDF } from "../../utils/pdfGenerator";
import toast from "react-hot-toast";

const normalizeNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeBoolean = (value, fallback) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes"].includes(normalized)) return true;
    if (["false", "0", "no"].includes(normalized)) return false;
  }
  return Boolean(value);
};

const getBorrowerLabel = (borrower) => {
  if (!borrower) return "";
  const name = [borrower.firstName, borrower.middleName, borrower.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return (
    name ||
    borrower.username ||
    borrower.email ||
    borrower.studentId ||
    borrower.libraryCardNumber ||
    "Unnamed borrower"
  );
};

const BorrowForm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isStudentRequestRoute = location.pathname && location.pathname.includes("/transactions/request");

  const [borrowerQuery, setBorrowerQuery] = useState("");
  const [borrowerOptions, setBorrowerOptions] = useState([]);
  const [borrowerLoading, setBorrowerLoading] = useState(false);
  const [borrowerSearchError, setBorrowerSearchError] = useState("");
  const [selectedBorrower, setSelectedBorrower] = useState(null);
  const [borrowerStatus, setBorrowerStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);

  const [bookQuery, setBookQuery] = useState("");
  const [bookOptions, setBookOptions] = useState([]);
  const [bookLoading, setBookLoading] = useState(false);
  const [bookSearchError, setBookSearchError] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);

  const [selectedBooks, setSelectedBooks] = useState([]);
  const [transactionType, setTransactionType] = useState("regular");
  const [notes, setNotes] = useState("");

  const [rules, setRules] = useState({
    maxBooksPerTransaction: 10,
    maxBorrowDays: 14,
    finePerDay: 5,
    enableFines: true,
  });

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const borrowerId = selectedBorrower?.id || selectedBorrower?._id || null;
  const maxBooksPerTransaction = normalizeNumber(
    rules.maxBooksPerTransaction,
    0,
  );
  const borrowLimitReached =
    maxBooksPerTransaction > 0 &&
    selectedBooks.length >= maxBooksPerTransaction;
  const remainingSlots = useMemo(() => {
    if (!maxBooksPerTransaction) return null;
    return Math.max(maxBooksPerTransaction - selectedBooks.length, 0);
  }, [maxBooksPerTransaction, selectedBooks.length]);
  const borrowDays = normalizeNumber(rules.maxBorrowDays, 14);
  const finePerDay = normalizeNumber(rules.finePerDay, 5);
  const finesEnabled = normalizeBoolean(rules.enableFines, true);

  useEffect(() => {
    let mounted = true;
    api
      .get("/settings/borrowing-rules")
      .then((response) => {
        if (!mounted) return;
        const data = response.data || {};
        setRules({
          maxBooksPerTransaction: normalizeNumber(
            data.maxBooksPerTransaction,
            10,
          ),
          maxBorrowDays: normalizeNumber(data.maxBorrowDays, 14),
          finePerDay: normalizeNumber(data.finePerDay, 5),
          enableFines: normalizeBoolean(data.enableFines, true),
        });
      })
      .catch((error) => {
        console.error("Error fetching borrowing rules:", error);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!borrowerQuery.trim()) {
      setBorrowerOptions([]);
      setBorrowerLoading(false);
      setBorrowerSearchError("");
      return;
    }

    let active = true;
    setBorrowerLoading(true);
    setBorrowerSearchError("");

    const timer = setTimeout(() => {
      api
        .get("/users/search", {
          params: { q: borrowerQuery.trim(), limit: 12 },
        })
        .then((response) => {
          if (!active) return;
          setBorrowerOptions(response.data || []);
        })
        .catch((error) => {
          if (!active) return;
          console.error("Error searching borrowers:", error);
          setBorrowerSearchError("Unable to search borrowers right now.");
        })
        .finally(() => {
          if (active) setBorrowerLoading(false);
        });
    }, 350);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [borrowerQuery]);

  useEffect(() => {
    if (!bookQuery.trim()) {
      setBookOptions([]);
      setBookLoading(false);
      setBookSearchError("");
      return;
    }

    let active = true;
    setBookLoading(true);
    setBookSearchError("");

    const timer = setTimeout(() => {
      api
        .get("/books/search", {
          params: { q: bookQuery.trim(), available: true, limit: 20 },
        })
        .then((response) => {
          if (!active) return;
          const selectedCopyIds = new Set(
            selectedBooks.map((book) => book.copyId),
          );
          const options =
            response.data?.flatMap((book) =>
              (book.copies || [])
                .filter((copy) => copy.status === "available")
                .filter((copy) => !selectedCopyIds.has(copy.copyId))
                .map((copy) => ({
                  copyId: copy.copyId,
                  bookId: book.id || book._id,
                  title: book.title || "Untitled",
                  author: book.author || "",
                  isbn: book.isbn || "",
                  location: copy.location || "Main Library",
                  category: book.category || "",
                  publisher: book.publisher || "",
                })),
            ) || [];
          setBookOptions(options);
        })
        .catch((error) => {
          if (!active) return;
          console.error("Error searching books:", error);
          setBookSearchError("Unable to search available books right now.");
        })
        .finally(() => {
          if (active) setBookLoading(false);
        });
    }, 350);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [bookQuery, selectedBooks]);

  useEffect(() => {
    if (!borrowerId) {
      setBorrowerStatus(null);
      return;
    }

    let active = true;
    setStatusLoading(true);

    api
      .get(`/users/${borrowerId}/borrowing-status`)
      .then((response) => {
        if (!active) return;
        setBorrowerStatus(response.data);
      })
      .catch((error) => {
        if (!active) return;
        console.error("Error fetching borrower status:", error);
        setBorrowerStatus(null);
      })
      .finally(() => {
        if (active) setStatusLoading(false);
      });

    return () => {
      active = false;
    };
  }, [borrowerId]);

  useEffect(() => {
    if (!successMessage) return;
    const timer = window.setTimeout(() => setSuccessMessage(""), 4000);
    return () => window.clearTimeout(timer);
  }, [successMessage]);

  const clearFeedback = useCallback(() => {
    setErrorMessage("");
    setSuccessMessage("");
  }, []);

  const resetForm = useCallback(() => {
    setSelectedBorrower(null);
    setBorrowerQuery("");
    setBorrowerStatus(null);
    setSelectedBooks([]);
    setBookQuery("");
    setTransactionType("regular");
    setNotes("");
    setBookSearchError("");
    setBorrowerSearchError("");
  }, []);

  const handleAddBook = (option) => {
    if (!option) return;
    clearFeedback();

    if (
      selectedBooks.some(
        (book) => book.copyId.toLowerCase() === option.copyId.toLowerCase(),
      )
    ) {
      setBookSearchError("This copy is already selected.");
      return;
    }

    if (borrowLimitReached) {
      setBookSearchError(
        "Borrow limit reached for this transaction. Remove a book to add another.",
      );
      return;
    }

    setSelectedBooks((prev) => [...prev, option]);
    setBookQuery("");
    setBookOptions([]);
  };

  // When a QR is scanned in Borrow form, attempt to find and add that copy automatically
  const handleBorrowScan = async (raw) => {
    const scanned = String(raw || "").trim();
    if (!scanned) return;
    // Try to find the copy in current bookOptions first
    const inOptions = bookOptions.find((o) => String(o.copyId).toLowerCase() === scanned.toLowerCase());
    if (inOptions) {
      handleAddBook(inOptions);
      setScannerOpen(false);
      toast.success(`Added copy ${scanned}`);
      return;
    }

    // Fallback: search server for the copy using books search
    try {
      const resp = await api.get('/books/search', { params: { q: scanned, limit: 20 } });
      const options = (resp.data || []).flatMap((book) => (book.copies || [])
        .filter((c) => c.status === 'available')
        .map((c) => ({ copyId: c.copyId, bookId: book.id || book._id, title: book.title || 'Untitled', author: book.author || '', isbn: book.isbn || '', location: c.location || 'Main Library' })));
      const match = options.find((o) => String(o.copyId).toLowerCase() === scanned.toLowerCase());
      if (match) {
        handleAddBook(match);
        setScannerOpen(false);
        toast.success(`Added copy ${scanned}`);
        return;
      }
      toast.error('Scanned copy not available');
    } catch (err) {
      console.error('Error searching copy by scanned value', err);
      toast.error('Failed to search scanned copy');
    }
  };

  const handleRemoveBook = (copyId) => {
    clearFeedback();
    setSelectedBooks((prev) =>
      prev.filter((book) => book.copyId !== copyId),
    );
  };

  const openConfirmation = () => {
    clearFeedback();

    if (!isStudentRequestRoute && !borrowerId) {
      setErrorMessage("Select a borrower before submitting the transaction.");
      return;
    }

    if (selectedBooks.length === 0) {
      setErrorMessage("Add at least one available book copy to proceed.");
      return;
    }

    if (borrowLimitReached) {
      setErrorMessage(
        "Borrow limit reached for this borrower. Remove a book to continue.",
      );
      return;
    }

    setConfirmOpen(true);
  };

  const handleConfirmBorrow = async () => {
    if (!borrowerId || submitting) return;

    setSubmitting(true);
    clearFeedback();

    try {
      const payload = {
        userId: borrowerId,
        type: transactionType,
        items: selectedBooks.map((book) => ({ copyId: book.copyId })),
        notes: notes.trim() || undefined,
      };
      // Choose endpoint depending on whether this is a student request route
      const endpoint = isStudentRequestRoute ? "/transactions/request" : "/transactions/borrow";

      // For student requests, omit userId so backend will use authenticated user
      if (isStudentRequestRoute) delete payload.userId;

      const response = await api.post(endpoint, payload);

      setSuccessMessage(response.data?.message || (isStudentRequestRoute ? 'Borrow request submitted successfully.' : 'Borrowing transaction submitted successfully.'));
      setConfirmOpen(false);

      // Generate transaction receipt
      try {
        // If the backend returned a concrete transaction, generate receipt for staff borrow flows
        const transactionData = response.data.transaction || {
          id: response.data.transactionId,
          type: transactionType,
          createdAt: new Date(),
          dueDate: new Date(Date.now() + (borrowDays * 24 * 60 * 60 * 1000)),
          fineAmount: 0,
        };

        if (!isStudentRequestRoute) {
          const receiptPDF = await generateTransactionReceipt(
            transactionData,
            selectedBorrower,
            selectedBooks
          );
          downloadPDF(receiptPDF, `receipt_${transactionData.id || Date.now()}.pdf`);
        }
      } catch (receiptError) {
        console.error("Error generating receipt:", receiptError);
        // Don't show error for receipt generation failure
      }

      resetForm();

      window.setTimeout(() => {
        // For students, prefer to send them back to their dashboard or transactions list
        if (isStudentRequestRoute) {
          navigate(location.state?.from || "/student/dashboard");
        } else {
          navigate(location.state?.from || "/transactions");
        }
      }, 1500);
    } catch (error) {
      const message =
        error.response?.data?.message ||
        "Failed to submit borrowing transaction.";
      setErrorMessage(message);
      console.error("Error creating borrowing transaction:", error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box>
      <Box display="flex" alignItems="center" mb={3}>
        <IconButton
          onClick={() => navigate(-1)}
          edge="start"
          sx={{ mr: 2, color: 'text.primary' }}
          aria-label="Go back"
        >
          <ArrowBack />
        </IconButton>
        <Typography variant="h4" sx={{ flexGrow: 1 }}>
          Borrow Books
        </Typography>
      </Box>

      {errorMessage && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {errorMessage}
        </Alert>
      )}

      {successMessage && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {successMessage}
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12} md={5}>
          <Paper elevation={1} sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Borrower Details
            </Typography>

            <Autocomplete
              value={selectedBorrower}
              onChange={(_, value) => {
                clearFeedback();
                setSelectedBorrower(value);
                setBorrowerQuery("");
                setBorrowerSearchError("");
              }}
              inputValue={borrowerQuery}
              onInputChange={(_, value) => setBorrowerQuery(value)}
              options={borrowerOptions}
              loading={borrowerLoading}
              getOptionLabel={getBorrowerLabel}
              isOptionEqualToValue={(option, value) =>
                (option.id || option._id) === (value.id || value._id)
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Search borrower"
                  placeholder="Type name, email, or ID"
                  error={Boolean(borrowerSearchError)}
                  helperText={
                    borrowerSearchError ||
                    "Borrowers must have an active account to borrow."
                  }
                  InputProps={{
                    ...params.InputProps,
                    startAdornment: (
                      <>
                        <InputAdornment position="start">
                          <Search fontSize="small" />
                        </InputAdornment>
                        {params.InputProps.startAdornment}
                      </>
                    ),
                    endAdornment: (
                      <>
                        {borrowerLoading ? (
                          <CircularProgress color="inherit" size={20} />
                        ) : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />

            {selectedBorrower && (
              <Box mt={2}>
                <Typography variant="subtitle2" color="text.secondary">
                  Selected Borrower
                </Typography>
                <Box mt={1}>
                  <Typography variant="body1" fontWeight={600}>
                    {getBorrowerLabel(selectedBorrower)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {[
                      selectedBorrower.email,
                      selectedBorrower.studentId,
                      selectedBorrower.libraryCardNumber,
                    ]
                      .filter(Boolean)
                      .join(" • ")}
                  </Typography>
                  <Box mt={1} display="flex" flexWrap="wrap" gap={1}>
                    {selectedBorrower.role && (
                      <Chip label={`Role: ${selectedBorrower.role}`} size="small" />
                    )}
                    {selectedBorrower.curriculum && (
                      <Chip
                        label={`Curriculum: ${selectedBorrower.curriculum}`}
                        size="small"
                      />
                    )}
                    {selectedBorrower.gradeLevel && (
                      <Chip
                        label={`Grade: ${selectedBorrower.gradeLevel}`}
                        size="small"
                      />
                    )}
                  </Box>
                </Box>

                <Divider sx={{ my: 2 }} />

                {statusLoading ? (
                  <Box display="flex" alignItems="center" gap={1}>
                    <CircularProgress size={18} />
                    <Typography variant="body2" color="text.secondary">
                      Fetching borrowing status…
                    </Typography>
                  </Box>
                ) : (
                  borrowerStatus && (
                    <Box>
                      <Typography variant="subtitle2" gutterBottom>
                        Borrowing Status
                      </Typography>
                      <Box display="flex" flexWrap="wrap" gap={1}>
                        <Chip
                          icon={<Assignment fontSize="small" />}
                          label={`Active: ${borrowerStatus.currentlyBorrowed || 0}`}
                          size="small"
                          color={
                            borrowerStatus.currentlyBorrowed > 0
                              ? "primary"
                              : "default"
                          }
                        />
                        <Chip
                          icon={<Book fontSize="small" />}
                          label={`Total: ${borrowerStatus.totalBorrowed || 0}`}
                          size="small"
                        />
                        <Chip
                          label={`Limit: ${(borrowerStatus.borrowingLimit ?? maxBooksPerTransaction) ?? "N/A"}`}
                          size="small"
                        />
                        {remainingSlots !== null && (
                          <Chip
                            label={`Remaining this transaction: ${remainingSlots}`}
                            size="small"
                            color={remainingSlots > 0 ? "success" : "warning"}
                          />
                        )}
                        {borrowerStatus.overdueBooks > 0 && (
                          <Chip
                            label={`Overdue: ${borrowerStatus.overdueBooks}`}
                            size="small"
                            color="warning"
                          />
                        )}
                        {borrowerStatus.fineBalance > 0 && (
                          <Chip
                            label={`Fines: ${formatCurrency(borrowerStatus.fineBalance)}`}
                            size="small"
                            color="error"
                          />
                        )}
                      </Box>
                    </Box>
                  )
                )}

                {borrowerStatus?.overdueBooks > 0 && (
                  <Alert severity="warning" sx={{ mt: 2 }}>
                    Borrower currently has {borrowerStatus.overdueBooks} overdue book
                    {borrowerStatus.overdueBooks > 1 ? "s" : ""}.
                  </Alert>
                )}
              </Box>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} md={7}>
          <Paper elevation={1} sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Add Available Book Copies
            </Typography>
            <Autocomplete
              value={null}
              onChange={(_, option) => handleAddBook(option)}
              inputValue={bookQuery}
              onInputChange={(_, value) => setBookQuery(value)}
              options={bookOptions}
              loading={bookLoading}
              getOptionLabel={(option) =>
                `${option.title} (${option.copyId})`
              }
              isOptionEqualToValue={(option, value) =>
                option.copyId === value.copyId
              }
              filterOptions={(options) => options}
              renderOption={(props, option) => (
                <li {...props} key={option.copyId}>
                  <Box>
                    <Typography variant="body2" fontWeight={600}>
                      {option.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Copy ID: {option.copyId}
                      {option.isbn ? ` • ISBN ${option.isbn}` : ""}
                      {option.author ? ` • ${option.author}` : ""}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Location: {option.location}
                    </Typography>
                  </Box>
                </li>
              )}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Search available books"
                  placeholder="Search by title, author, or ISBN"
                  error={Boolean(bookSearchError)}
                  helperText={
                    bookSearchError ||
                    (borrowLimitReached
                      ? "Borrow limit reached. Remove a book to add another."
                      : "Select copies to include in this transaction.")
                  }
                  InputProps={{
                    ...params.InputProps,
                      startAdornment: (
                        <>
                          <InputAdornment position="start">
                            <Search fontSize="small" />
                          </InputAdornment>
                          {params.InputProps.startAdornment}
                        </>
                      ),
                    endAdornment: (
                      <>
                        {bookLoading ? (
                          <CircularProgress color="inherit" size={20} />
                        ) : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />

            {/* Scanner dialog for BorrowForm (auto-add scanned copy) */}
            <Dialog open={scannerOpen} onClose={() => setScannerOpen(false)} maxWidth="xs" fullWidth>
              <DialogTitle>Scan Copy QR</DialogTitle>
              <DialogContent>
                <QRScanner elementId="borrow-qr-scanner" onDetected={(v) => handleBorrowScan(v)} onClose={() => setScannerOpen(false)} />
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setScannerOpen(false)}>Cancel</Button>
              </DialogActions>
            </Dialog>

            <Box mt={3}>
              <Typography variant="subtitle2" gutterBottom>
                Selected Copies ({selectedBooks.length})
              </Typography>
              {selectedBooks.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No book copies selected yet.
                </Typography>
              ) : (
                <List disablePadding>
                  {selectedBooks.map((book, index) => (
                    <React.Fragment key={book.copyId}>
                      <ListItem
                        disableGutters
                        secondaryAction={
                          <IconButton
                            edge="end"
                            aria-label={`Remove copy ${book.copyId}`}
                            onClick={() => handleRemoveBook(book.copyId)}
                          >
                            <Remove />
                          </IconButton>
                        }
                      >
                        <ListItemText
                          primary={
                            <Typography variant="body1" fontWeight={600}>
                              {book.title}
                            </Typography>
                          }
                          secondary={
                            <Typography
                              variant="body2"
                              color="text.secondary"
                            >
                              Copy ID: {book.copyId}
                              {book.isbn ? ` • ISBN ${book.isbn}` : ""}
                              {book.author ? ` • ${book.author}` : ""}
                              {book.location ? ` • ${book.location}` : ""}
                            </Typography>
                          }
                        />
                      </ListItem>
                      {index < selectedBooks.length - 1 && (
                        <Divider component="li" sx={{ my: 1 }} />
                      )}
                    </React.Fragment>
                  ))}
                </List>
              )}
            </Box>
          </Paper>

          <Paper elevation={1} sx={{ p: 3 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel id="transaction-type-label">
                    Transaction Type
                  </InputLabel>
                  <Select
                    labelId="transaction-type-label"
                    label="Transaction Type"
                    value={transactionType}
                    onChange={(event) => setTransactionType(event.target.value)}
                  >
                    <MenuItem value="regular">Regular</MenuItem>
                    <MenuItem value="overnight">Overnight</MenuItem>
                    <MenuItem value="reference">Reference</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={6}>
                <Box
                  display="flex"
                  flexDirection="column"
                  justifyContent="center"
                  height="100%"
                >
                  <Typography variant="subtitle2">
                    Borrowing Window
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Due in {borrowDays} day{borrowDays !== 1 ? "s" : ""}.
                    {finesEnabled
                      ? ` ${formatCurrency(finePerDay)} fine per day if overdue.`
                      : " Fines disabled."}
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Notes (optional)"
                  multiline
                  minRows={3}
                  fullWidth
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Add instructions or remarks for this borrowing transaction."
                />
              </Grid>
              <Grid item xs={12}>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<Book />}
                  onClick={openConfirmation}
                  disabled={(isStudentRequestRoute ? selectedBooks.length === 0 : (!selectedBorrower || selectedBooks.length === 0))}
                >
                  {isStudentRequestRoute ? 'Review Request' : 'Review Borrow Request'}
                </Button>
              </Grid>
            </Grid>
          </Paper>
        </Grid>
      </Grid>

      <Dialog
        open={confirmOpen}
        onClose={() => (!submitting ? setConfirmOpen(false) : null)}
        maxWidth="sm"
        fullWidth
      >
  <DialogTitle>{isStudentRequestRoute ? 'Confirm Borrow Request' : 'Confirm Borrow Request'}</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body1" gutterBottom>
            Borrower:{" "}
            <strong>{getBorrowerLabel(selectedBorrower) || 'You'}</strong>
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {selectedBooks.length} book
            {selectedBooks.length !== 1 ? "s" : ""} will be borrowed for{" "}
            {borrowDays} day{borrowDays !== 1 ? "s" : ""}.
          </Typography>

          <List dense disablePadding sx={{ mt: 2 }}>
            {selectedBooks.map((book) => (
              <React.Fragment key={book.copyId}>
                <ListItem disableGutters>
                  <ListItemText
                    primary={book.title}
                    secondary={`Copy ID: ${book.copyId}${
                      book.isbn ? ` • ISBN ${book.isbn}` : ""
                    }${book.location ? ` • ${book.location}` : ""}`}
                  />
                </ListItem>
                <Divider component="li" />
              </React.Fragment>
            ))}
          </List>

          {notes.trim() && (
            <>
              <Typography variant="subtitle2" sx={{ mt: 2 }}>
                Notes
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {notes.trim()}
              </Typography>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setConfirmOpen(false)}
            disabled={submitting}
            color="inherit"
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleConfirmBorrow}
            disabled={submitting}
          >
            {submitting ? "Submitting…" : (isStudentRequestRoute ? 'Confirm Request' : 'Confirm Borrow')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default BorrowForm;