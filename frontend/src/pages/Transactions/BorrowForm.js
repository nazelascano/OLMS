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
import MobileScanButton from "../../components/MobileScanButton";
import { ArrowBack, Assignment, Book, Remove, Search, QrCodeScanner } from "@mui/icons-material";
import { api } from "../../utils/api";
import { formatCurrency } from "../../utils/currency";
import { generateTransactionReceipt, downloadPDF } from "../../utils/pdfGenerator";
import toast from "react-hot-toast";
import { useAuth } from "../../contexts/AuthContext";
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
  return fallback;
};

const getBorrowerLabel = (borrower) => {
  if (!borrower) return "";
  const name = [
    borrower.firstName,
    borrower.middleName,
    borrower.lastName,
  ]
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
  const { user: authUser } = useAuth();
  const isStudentRequestRoute =
    location.pathname && location.pathname.includes("/transactions/request");
  const isStudentMode = Boolean(
    isStudentRequestRoute && authUser && authUser.role === "student",
  );

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

  const borrowerId = useMemo(() => {
    if (isStudentMode) {
      return (
        authUser?.id ||
        authUser?._id ||
        authUser?.userId ||
        authUser?.studentId ||
        null
      );
    }
    return selectedBorrower?.id || selectedBorrower?._id || null;
  }, [authUser, isStudentMode, selectedBorrower]);

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
    if (isStudentMode) {
      // Students reuse default client-side rules if they cannot access settings.
      return;
    }

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
  }, [isStudentMode]);

  useEffect(() => {
    if (isStudentMode) {
      setBorrowerOptions([]);
      setBorrowerLoading(false);
      setBorrowerSearchError("");
      return;
    }

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
  }, [borrowerQuery, isStudentMode]);

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
          params: {
            q: bookQuery.trim(),
            available: !isStudentMode,
            limit: 20,
          },
        })
        .then((response) => {
          if (!active) return;

          if (isStudentMode) {
            const uniqueBooks = new Map();
            (response.data || []).forEach((book) => {
              const bookId = book.id || book._id;
              if (!bookId || uniqueBooks.has(bookId)) return;
              uniqueBooks.set(bookId, {
                bookId,
                title: book.title || "Untitled",
                author: book.author || "",
                isbn: book.isbn || "",
                category: book.category || "",
                publisher: book.publisher || "",
                availableCopies: Array.isArray(book.copies)
                  ? book.copies.filter((copy) => copy.status === "available").length
                  : book.availableCopies ?? 0,
              });
            });
            setBookOptions(Array.from(uniqueBooks.values()));
            return;
          }

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
  }, [bookQuery, selectedBooks, isStudentMode]);

  useEffect(() => {
    if (isStudentMode) {
      setBorrowerStatus(null);
      setStatusLoading(false);
      return;
    }

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
  }, [borrowerId, isStudentMode]);

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
    if (!isStudentMode) {
      setSelectedBorrower(null);
      setBorrowerQuery("");
      setBorrowerStatus(null);
    }
    setSelectedBooks([]);
    setBookQuery("");
    setBookOptions([]);
    setBookSearchError("");
    setTransactionType("regular");
    setNotes("");
    setBorrowerSearchError("");
  }, [isStudentMode]);

  const handleAddBook = (option) => {
    if (!option) return;
    clearFeedback();

    if (borrowLimitReached) {
      setBookSearchError(
        "Borrow limit reached for this transaction. Remove a book to add another.",
      );
      return;
    }

    if (isStudentMode) {
      const bookId = option.bookId || option.id || option._id;
      if (!bookId) {
        setBookSearchError("Unable to determine selected book.");
        return;
      }

      if (
        selectedBooks.some(
          (book) => (book.bookId || book.id || book._id) === bookId,
        )
      ) {
        setBookSearchError("You already added this book to your request.");
        return;
      }

      setSelectedBooks((prev) => [
        ...prev,
        {
          bookId,
          title: option.title || "Untitled",
          author: option.author || "",
          isbn: option.isbn || "",
          category: option.category || "",
          publisher: option.publisher || "",
          availableCopies: option.availableCopies ?? null,
        },
      ]);
      setBookQuery("");
      setBookOptions([]);
      return;
    }

    if (
      selectedBooks.some(
        (book) =>
          book.copyId &&
          option.copyId &&
          book.copyId.toLowerCase() === option.copyId.toLowerCase(),
      )
    ) {
      setBookSearchError("This copy is already selected.");
      return;
    }

    setSelectedBooks((prev) => [...prev, option]);
    setBookQuery("");
    setBookOptions([]);
  };

  const handleBorrowScan = async (raw) => {
    const scanned = String(raw || "").trim();
    if (!scanned) return;
    const inOptions = bookOptions.find(
      (o) => String(o.copyId).toLowerCase() === scanned.toLowerCase(),
    );
    if (inOptions) {
      handleAddBook(inOptions);
      setScannerOpen(false);
      toast.success(`Added copy ${scanned}`);
      return;
    }

    try {
      const resp = await api.get("/books/search", {
        params: { q: scanned, limit: 20 },
      });
      const options = (resp.data || [])
        .flatMap((book) =>
          (book.copies || [])
            .filter((c) => c.status === "available")
            .map((c) => ({
              copyId: c.copyId,
              bookId: book.id || book._id,
              title: book.title || "Untitled",
              author: book.author || "",
              isbn: book.isbn || "",
              location: c.location || "Main Library",
            })),
        );
      const match = options.find(
        (o) => String(o.copyId).toLowerCase() === scanned.toLowerCase(),
      );
      if (match) {
        handleAddBook(match);
        setScannerOpen(false);
        toast.success(`Added copy ${scanned}`);
        return;
      }
      toast.error("Scanned copy not available");
    } catch (err) {
      console.error("Error searching copy by scanned value", err);
      toast.error("Failed to search scanned copy");
    }
  };

  const handleRemoveBook = (identifier) => {
    clearFeedback();
    if (isStudentMode) {
      const targetId =
        identifier && typeof identifier === "object"
          ? identifier.bookId || identifier.id || identifier._id
          : identifier;
      setSelectedBooks((prev) =>
        prev.filter(
          (book) => (book.bookId || book.id || book._id) !== targetId,
        ),
      );
      return;
    }

    setSelectedBooks((prev) =>
      prev.filter((book) => book.copyId !== identifier),
    );
  };

  const openConfirmation = () => {
    clearFeedback();

    if (!isStudentMode && !borrowerId) {
      setErrorMessage("Select a borrower before submitting the transaction.");
      return;
    }

    if (selectedBooks.length === 0) {
      setErrorMessage(
        isStudentMode
          ? "Add at least one book to request."
          : "Add at least one available book copy to proceed.",
      );
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
    if (submitting) return;
    if (!isStudentMode && !borrowerId) return;

    setSubmitting(true);
    clearFeedback();

    try {
      const payload = {
        type: transactionType,
        items: selectedBooks.map((book) =>
          isStudentMode
            ? { bookId: book.bookId || book.id || book._id }
            : { copyId: book.copyId },
        ),
        notes: notes.trim() || undefined,
      };

      const endpoint = isStudentMode
        ? "/transactions/request"
        : "/transactions/borrow";
      if (!isStudentMode) {
        payload.userId = borrowerId;
      }

      const response = await api.post(endpoint, payload);

      setSuccessMessage(
        response.data?.message ||
          (isStudentMode
            ? "Borrow request submitted successfully."
            : "Borrowing transaction submitted successfully."),
      );

      setConfirmOpen(false);

      if (!isStudentMode) {
        try {
          const transactionData = response.data.transaction || {
            id: response.data.transactionId,
            type: transactionType,
            createdAt: new Date(),
            dueDate: new Date(
              Date.now() + borrowDays * 24 * 60 * 60 * 1000,
            ),
            fineAmount: 0,
          };

          const receiptPDF = await generateTransactionReceipt(
            transactionData,
            selectedBorrower,
            selectedBooks,
          );
          downloadPDF(
            receiptPDF,
            `receipt_${transactionData.id || Date.now()}.pdf`,
          );
        } catch (receiptError) {
          console.error("Error generating receipt:", receiptError);
        }
      }

      resetForm();

      window.setTimeout(() => {
        if (isStudentMode) {
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
          sx={{ mr: 2, color: "text.primary" }}
          aria-label="Go back"
        >
          <ArrowBack />
        </IconButton>
        <Typography variant="h4" sx={{ flexGrow: 1, color:"white" }}>
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

            {isStudentMode ? (
              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  You are requesting on your own behalf.
                </Typography>
                <Box mt={1}>
                  <Typography variant="body1" fontWeight={600}>
                    {getBorrowerLabel(authUser) || "You"}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {[
                      authUser?.email,
                      authUser?.studentId,
                      authUser?.libraryCardNumber,
                    ]
                      .filter(Boolean)
                      .join(" • ")}
                  </Typography>
                  <Box mt={1} display="flex" flexWrap="wrap" gap={1}>
                    {authUser?.curriculum && (
                      <Chip
                        label={`Curriculum: ${authUser.curriculum}`}
                        size="small"
                      />
                    )}
                    {authUser?.grade && (
                      <Chip label={`Grade: ${authUser.grade}`} size="small" />
                    )}
                    {authUser?.section && (
                      <Chip
                        label={`Section: ${authUser.section}`}
                        size="small"
                      />
                    )}
                  </Box>
                </Box>

                {authUser?.borrowingStats && (
                  <Box mt={2}>
                    <Divider sx={{ my: 1 }} />
                    <Typography variant="subtitle2" gutterBottom>
                      Your Borrowing Summary
                    </Typography>
                    <Box display="flex" flexWrap="wrap" gap={1}>
                      <Chip
                        icon={<Assignment fontSize="small" />}
                        label={`Active: ${
                          authUser.borrowingStats.currentlyBorrowed || 0
                        }`}
                        size="small"
                        color={
                          (authUser.borrowingStats.currentlyBorrowed || 0) > 0
                            ? "primary"
                            : "default"
                        }
                      />
                      <Chip
                        icon={<Book fontSize="small" />}
                        label={`Total: ${
                          authUser.borrowingStats.totalBorrowed || 0
                        }`}
                        size="small"
                      />
                      <Chip
                        label={`Returned: ${
                          authUser.borrowingStats.totalReturned || 0
                        }`}
                        size="small"
                      />
                    </Box>
                  </Box>
                )}
              </Box>
            ) : (
              <>
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
                          <Chip
                            label={`Role: ${selectedBorrower.role}`}
                            size="small"
                          />
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
                              label={`Active: ${
                                borrowerStatus.currentlyBorrowed || 0
                              }`}
                              size="small"
                              color={
                                borrowerStatus.currentlyBorrowed > 0
                                  ? "primary"
                                  : "default"
                              }
                            />
                            <Chip
                              icon={<Book fontSize="small" />}
                              label={`Total: ${
                                borrowerStatus.totalBorrowed || 0
                              }`}
                              size="small"
                            />
                            <Chip
                              label={`Limit: ${
                                borrowerStatus.borrowingLimit ??
                                  maxBooksPerTransaction ??
                                  "N/A"
                              }`}
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
                                label={`Fines: ${formatCurrency(
                                  borrowerStatus.fineBalance,
                                )}`}
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
                        Borrower currently has {borrowerStatus.overdueBooks} overdue
                        book
                        {borrowerStatus.overdueBooks > 1 ? "s" : ""}.
                      </Alert>
                    )}
                  </Box>
                )}
              </>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} md={7}>
          <Paper elevation={1} sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              {isStudentMode
                ? "Select Books to Request"
                : "Add Available Book Copies"}
            </Typography>
            <Autocomplete
              value={null}
              onChange={(_, option) => handleAddBook(option)}
              inputValue={bookQuery}
              onInputChange={(_, value) => setBookQuery(value)}
              options={bookOptions}
              loading={bookLoading}
              getOptionLabel={(option) =>
                isStudentMode
                  ? option.title || "Untitled"
                  : `${option.title} (${option.copyId})`
              }
              isOptionEqualToValue={(option, value) =>
                isStudentMode
                  ? (option.bookId || option.id || option._id) ===
                    (value.bookId || value.id || value._id)
                  : option.copyId === value.copyId
              }
              filterOptions={(options) => options}
              renderOption={(props, option) => {
                if (isStudentMode) {
                  const key = option.bookId || option.id || option._id;
                  const available =
                    typeof option.availableCopies === "number"
                      ? option.availableCopies
                      : undefined;
                  return (
                    <li {...props} key={key || option.title}>
                      <Box>
                        <Typography variant="body2" fontWeight={600}>
                          {option.title}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {[option.author, option.isbn]
                            .filter(Boolean)
                            .join(" • ")}
                        </Typography>
                        {available !== undefined && (
                          <Typography variant="caption" color="text.secondary">
                            {available} {available === 1 ? "copy" : "copies"} available
                          </Typography>
                        )}
                      </Box>
                    </li>
                  );
                }

                return (
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
                );
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={
                    isStudentMode
                      ? "Search library books"
                      : "Search available books"
                  }
                  placeholder="Search by title, author, or ISBN"
                  error={Boolean(bookSearchError)}
                  helperText={
                    bookSearchError ||
                    (borrowLimitReached
                      ? "Borrow limit reached. Remove a book to add another."
                      : isStudentMode
                        ? "Select books you want to request."
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

            {!isStudentMode && (
              <>
                <Box
                  mt={2}
                  display={{ xs: "none", sm: "flex" }}
                  justifyContent="flex-end"
                >
                  <Button
                    variant="outlined"
                    startIcon={<QrCodeScanner />}
                    onClick={() => setScannerOpen(true)}
                  >
                    Scan Copy QR
                  </Button>
                </Box>
                <MobileScanButton
                  label="Scan Copy QR"
                  onClick={() => setScannerOpen(true)}
                />
              </>
            )}

            {!isStudentMode && (
              <Dialog
                open={scannerOpen}
                onClose={() => setScannerOpen(false)}
                maxWidth="xs"
                fullWidth
              >
                <DialogTitle>Scan Copy QR</DialogTitle>
                <DialogContent>
                  <QRScanner
                    elementId="borrow-qr-scanner"
                    onDetected={(v) => handleBorrowScan(v)}
                    onClose={() => setScannerOpen(false)}
                  />
                </DialogContent>
                <DialogActions>
                  <Button onClick={() => setScannerOpen(false)}>Cancel</Button>
                </DialogActions>
              </Dialog>
            )}

            <Box mt={3}>
              <Typography variant="subtitle2" gutterBottom>
                {isStudentMode
                  ? `Requested Books (${selectedBooks.length})`
                  : `Selected Copies (${selectedBooks.length})`}
              </Typography>
              {selectedBooks.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {isStudentMode
                    ? "No books requested yet."
                    : "No book copies selected yet."}
                </Typography>
              ) : (
                <List disablePadding>
                  {selectedBooks.map((book, index) => {
                    const key = isStudentMode
                      ? book.bookId || book.id || book._id || book.title || index
                      : book.copyId;
                    const details = [];
                    if (isStudentMode) {
                      if (book.author) details.push(`Author: ${book.author}`);
                      if (book.isbn) details.push(`ISBN: ${book.isbn}`);
                      if (typeof book.availableCopies === "number") {
                        details.push(
                          `${book.availableCopies} ${
                            book.availableCopies === 1 ? "copy" : "copies"
                          } available`,
                        );
                      }
                    }

                    return (
                      <React.Fragment key={key}>
                        <ListItem
                          disableGutters
                          secondaryAction={
                            <IconButton
                              edge="end"
                              aria-label={
                                isStudentMode
                                  ? `Remove book ${book.title}`
                                  : `Remove copy ${book.copyId}`
                              }
                              onClick={() =>
                                handleRemoveBook(
                                  isStudentMode
                                    ? book.bookId || book.id || book._id
                                    : book.copyId,
                                )
                              }
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
                              isStudentMode ? (
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                >
                                  {details.join(" • ")}
                                </Typography>
                              ) : (
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                >
                                  Copy ID: {book.copyId}
                                  {book.isbn ? ` • ISBN ${book.isbn}` : ""}
                                  {book.author ? ` • ${book.author}` : ""}
                                  {book.location ? ` • ${book.location}` : ""}
                                </Typography>
                              )
                            }
                          />
                        </ListItem>
                        {index < selectedBooks.length - 1 && (
                          <Divider component="li" sx={{ my: 1 }} />
                        )}
                      </React.Fragment>
                    );
                  })}
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
                      ? ` ${formatCurrency(
                          finePerDay,
                        )} fine per day if overdue.`
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
                  disabled={
                    isStudentMode
                      ? selectedBooks.length === 0
                      : !selectedBorrower || selectedBooks.length === 0
                  }
                >
                  {isStudentMode ? "Review Request" : "Review Borrow Request"}
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
        <DialogTitle>
          {isStudentMode ? "Confirm Borrow Request" : "Confirm Borrow Request"}
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body1" gutterBottom>
            Borrower:{" "}
            <strong>
              {getBorrowerLabel(isStudentMode ? authUser : selectedBorrower) ||
                "You"}
            </strong>
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {selectedBooks.length} book
            {selectedBooks.length !== 1 ? "s" : ""} will be borrowed for{" "}
            {borrowDays} day{borrowDays !== 1 ? "s" : ""}.
          </Typography>

          <List dense disablePadding sx={{ mt: 2 }}>
            {selectedBooks.map((book, index) => {
              const key = isStudentMode
                ? book.bookId || book.id || book._id || `${book.title}-${index}`
                : book.copyId;
              const details = [];

              if (isStudentMode) {
                if (book.author) details.push(`Author: ${book.author}`);
                if (book.isbn) details.push(`ISBN: ${book.isbn}`);
                if (typeof book.availableCopies === "number") {
                  details.push(
                    `${book.availableCopies} ${
                      book.availableCopies === 1 ? "copy" : "copies"
                    } available`,
                  );
                }
              } else {
                details.push(`Copy ID: ${book.copyId}`);
                if (book.isbn) details.push(`ISBN ${book.isbn}`);
                if (book.author) details.push(book.author);
                if (book.location) details.push(book.location);
              }

              return (
                <React.Fragment key={key}>
                  <ListItem disableGutters>
                    <ListItemText
                      primary={book.title}
                      secondary={details.join(" • ")}
                    />
                  </ListItem>
                  <Divider component="li" />
                </React.Fragment>
              );
            })}
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
            {submitting
              ? "Submitting…"
              : isStudentMode
                ? "Confirm Request"
                : "Confirm Borrow"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default BorrowForm;
