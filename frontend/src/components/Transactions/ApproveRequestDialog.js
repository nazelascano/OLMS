import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  TextField,
  Typography,
} from "@mui/material";
import { QrCodeScanner } from "@mui/icons-material";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import QRScanner from "../QRScanner";
import { api } from "../../utils/api";

const buildApproveItemKey = (item, index) => {
  if (!item) return `item-${index}`;
  if (item.requestItemId) return String(item.requestItemId);
  const bookId = item.bookId ? String(item.bookId) : "book";
  return `${bookId}-${index}`;
};

const ApproveRequestDialog = ({
  open,
  transactionId,
  onClose,
  onApproved,
  onNavigateToRequests,
}) => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [books, setBooks] = useState({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [assignScanner, setAssignScanner] = useState({
    open: false,
    targetKey: null,
    label: "",
  });

  const resetDialogState = () => {
    setItems([]);
    setAssignments({});
    setBooks({});
    setLoading(false);
    setSubmitting(false);
    setError("");
    setAssignScanner({ open: false, targetKey: null, label: "" });
  };

  useEffect(() => {
    if (!open) {
      resetDialogState();
      return;
    }

    if (!transactionId) {
      setError("Transaction identifier is missing");
      return;
    }

    let cancelled = false;
    const loadTransactionItems = async () => {
      setLoading(true);
      setError("");
      setAssignments({});
      setBooks({});
      setItems([]);

      try {
        const { data } = await api.get(`/transactions/${transactionId}`);
        if (cancelled) return;
        const fetchedItems = Array.isArray(data?.items) ? data.items : [];
        setItems(fetchedItems);

        const collectItemBookIds = (item) => {
          const candidates = [
            item?.bookId,
            item?.book?.id,
            item?.book?._id,
            item?.book?.bookId,
          ];
          return candidates
            .map((candidate) =>
              candidate !== undefined && candidate !== null
                ? String(candidate).trim()
                : "",
            )
            .filter(Boolean);
        };

        const fallbackBookFromItems = (bookId) => {
          const match = fetchedItems.find((entry) =>
            collectItemBookIds(entry).includes(String(bookId)),
          );
          if (!match) {
            return null;
          }
          const resolved = match.book || {};
          return {
            id: String(bookId),
            title: resolved.title || match.title || "Unknown title",
            author: resolved.author || match.author || "",
            isbn: resolved.isbn || match.isbn || "",
            copies: Array.isArray(resolved.copies) ? resolved.copies : [],
          };
        };

        const uniqueBookIds = Array.from(
          new Set(fetchedItems.flatMap((item) => collectItemBookIds(item))),
        );

        const booksMap = {};
        if (uniqueBookIds.length > 0) {
          const responses = await Promise.all(
            uniqueBookIds.map(async (bookId) => {
              try {
                const resp = await api.get(`/books/${bookId}`);
                return { bookId, data: resp.data };
              } catch (err) {
                return { bookId, error: err };
              }
            }),
          );

          const failed = [];
          responses.forEach(({ bookId, data, error: bookError }) => {
            if (data) {
              const registerKeys = [bookId, data.id, data._id, data.bookId].filter(Boolean);
              registerKeys.forEach((key) => {
                booksMap[String(key)] = data;
              });
              return;
            }

            failed.push(bookId);
            const fallback =
              fallbackBookFromItems(bookId) || {
                id: String(bookId),
                title: "Unknown title",
                author: "",
                isbn: "",
                copies: [],
              };
            const registerKeys = [bookId, fallback.id].filter(Boolean);
            registerKeys.forEach((key) => {
              booksMap[String(key)] = fallback;
            });
            console.warn("Failed to load book details", bookId, bookError);
          });

          if (failed.length > 0) {
            setError(
              (prev) =>
                prev ||
                "Some book details were unavailable. Manual copy assignment may be required.",
            );
          }
        }

        const initialAssignments = {};
        fetchedItems.forEach((item, index) => {
          const key = buildApproveItemKey(item, index);
          initialAssignments[key] = item?.copyId ? String(item.copyId) : "";
        });

        if (!cancelled) {
          setBooks(booksMap);
          setAssignments(initialAssignments);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to prepare approval dialog", err);
          setError(err.response?.data?.message || "Failed to load transaction data");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadTransactionItems();

    return () => {
      cancelled = true;
    };
  }, [open, transactionId]);

  const dialogItems = useMemo(() => (Array.isArray(items) ? items : []), [items]);

  const takenCopyMap = useMemo(() => {
    const mapping = {};
    Object.entries(assignments || {}).forEach(([key, value]) => {
      if (!value) return;
      mapping[String(value).toLowerCase()] = key;
    });
    return mapping;
  }, [assignments]);

  const assignmentsReady = useMemo(() => {
    if (!open || loading) return false;
    return dialogItems.every((item, index) => {
      const key = buildApproveItemKey(item, index);
      const assigned = assignments[key] || item?.copyId;
      return Boolean((assigned || "").toString().trim());
    });
  }, [assignments, dialogItems, loading, open]);

  const handleAssignmentChange = (itemKey, value) => {
    const normalized = (value || "").toString().trim();
    setAssignments((prev) => ({ ...prev, [itemKey]: normalized }));
    setError("");
  };

  const openAssignScannerForItem = (itemKey, label) => {
    if (!itemKey) return;
    setAssignScanner({ open: true, targetKey: itemKey, label: label || "Copy ID" });
  };

  const closeAssignScannerDialog = () => {
    setAssignScanner({ open: false, targetKey: null, label: "" });
  };

  const handleAssignmentScanDetected = (value) => {
    const trimmed = String(value || "").trim();
    if (!trimmed) {
      toast.error("QR code did not contain a copy ID");
      return;
    }
    if (!assignScanner.targetKey) {
      toast.error("No target field selected for scanning");
      return;
    }
    setAssignments((prev) => ({ ...prev, [assignScanner.targetKey]: trimmed }));
    toast.success("Copy ID captured");
    closeAssignScannerDialog();
  };

  const handleSubmit = async () => {
    if (!transactionId) {
      setError("Missing transaction identifier.");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      const payloadItems = dialogItems.map((item, index) => {
        const key = buildApproveItemKey(item, index);
        const copyId = (assignments[key] || item?.copyId || "").toString().trim();
        const bookId = item?.bookId ? String(item.bookId) : undefined;
        return {
          requestItemId: item?.requestItemId,
          bookId,
          copyId,
        };
      });

      const missingAssignments = payloadItems.filter((entry) => !entry.copyId);
      if (missingAssignments.length > 0) {
        setError("Please assign a copy for each requested book.");
        setSubmitting(false);
        return;
      }

      await api.post(`/transactions/approve/${transactionId}`, { items: payloadItems });
      toast.success("Request approved");
      onApproved?.();
      onClose?.();
    } catch (err) {
      const message = err.response?.data?.message || "Failed to approve request";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (submitting) return;
    onClose?.();
  };

  const handleOpenRequestsPage = () => {
    if (submitting) return;
    if (onNavigateToRequests) {
      onNavigateToRequests();
      return;
    }
    navigate("/transactions/requests");
  };

  return (
    <>
      <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
        <DialogTitle>Assign Copies</DialogTitle>
        <DialogContent dividers>
          {error && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          {loading ? (
            <Box display="flex" alignItems="center" justifyContent="center" minHeight={200}>
              <CircularProgress />
            </Box>
          ) : dialogItems.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No items to assign for this request.
            </Typography>
          ) : (
            <Box>
              {dialogItems.map((item, index) => {
                const key = buildApproveItemKey(item, index);
                const assignedCopyId = assignments[key] || item?.copyId || "";
                const bookId = item?.bookId ? String(item.bookId) : "";
                const bookDetails =
                  books[bookId] ||
                  books[item?.book?._id || ""] ||
                  books[item?.book?.id || ""];
                const availableCopies = Array.isArray(bookDetails?.copies)
                  ? bookDetails.copies.filter(
                      (copy) => String(copy.status).toLowerCase() === "available",
                    )
                  : [];
                const hasBookDetails = Boolean(bookDetails);
                const title = bookDetails?.title || item?.title || "Unknown title";
                const author = bookDetails?.author || item?.author || "";
                const isbn = bookDetails?.isbn || item?.isbn || "";
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
                      border: "1px solid #e5e7eb",
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
                        .join(" • ")}
                    </Typography>

                    {item?.copyId ? (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        Copy already assigned: {item.copyId}
                      </Typography>
                    ) : hasBookDetails && copyOptions.length > 0 ? (
                      <Box sx={{ width: "100%", mt: 2 }}>
                        <Autocomplete
                          freeSolo
                          disableClearable
                          autoHighlight
                          options={copyOptions}
                          value={assignedCopyId || ""}
                          onChange={(event, newValue) =>
                            handleAssignmentChange(key, newValue || "")
                          }
                          onInputChange={(event, newInputValue, reason) => {
                            if (reason === "input") {
                              handleAssignmentChange(key, newInputValue || "");
                            }
                          }}
                          renderOption={(props, option) => {
                            const meta = availableCopies.find(
                              (copy) => copy.copyId === option,
                            );
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
                                      <IconButton
                                        size="small"
                                        onClick={() =>
                                          openAssignScannerForItem(key, title)
                                        }
                                        disabled={submitting}
                                      >
                                        <QrCodeScanner fontSize="small" />
                                      </IconButton>
                                    </InputAdornment>
                                    {params.InputProps.endAdornment}
                                  </>
                                ),
                              }}
                              helperText="Type to search available copies or scan a QR label"
                              size="small"
                            />
                          )}
                          disabled={submitting}
                        />
                      </Box>
                    ) : (
                      <Alert severity={hasBookDetails ? "warning" : "error"} sx={{ mt: 2 }}>
                        {hasBookDetails
                          ? "No available copies for this book."
                          : "Unable to load available copies for this book."}
                      </Alert>
                    )}
                  </Box>
                );
              })}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleOpenRequestsPage} disabled={submitting}>
            Open Requests Page
          </Button>
          <Button onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!assignmentsReady || submitting}
          >
            {submitting ? "Assigning…" : "Assign Copies"}
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
            Position the QR label for {assignScanner.label || "this item"} inside the frame.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeAssignScannerDialog}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default ApproveRequestDialog;
