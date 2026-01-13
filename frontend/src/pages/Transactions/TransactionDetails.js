import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Chip,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
} from "@mui/material";
import {
  ArrowBack,
  Assignment,
  AssignmentReturn,
  Person,
  Book,
  CalendarToday,
  Schedule,
  CurrencyExchange,
  Edit,
  Print,
  QrCode,
  Warning,
  CheckCircle,
  Cancel,
  Note,
} from "@mui/icons-material";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { useAuth } from "../../contexts/AuthContext";
import { useSettings } from "../../contexts/SettingsContext";
import { api } from "../../utils/api";
import { formatCurrency } from "../../utils/currency";
import ApproveRequestDialog from "../../components/Transactions/ApproveRequestDialog";

const TransactionDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { finesEnabled } = useSettings();
  const [transaction, setTransaction] = useState(null);
  const [book, setBook] = useState(null);
  const [borrower, setBorrower] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [returnDialog, setReturnDialog] = useState(false);
  const [editNotesDialog, setEditNotesDialog] = useState(false);
  const [returnDate, setReturnDate] = useState(new Date());
  const [notes, setNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [markMissingDialogOpen, setMarkMissingDialogOpen] = useState(false);
  const [missingReason, setMissingReason] = useState("");
  const [markMissingLoading, setMarkMissingLoading] = useState(false);

  const fetchTransactionDetails = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get(`/transactions/${id}`);
      setTransaction(response.data);
      setNotes(response.data.notes || "");
    } catch (error) {
      setError("Failed to fetch transaction details");
      console.error("Error fetching transaction details:", error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchTransactionHistory = useCallback(async () => {
    try {
      const response = await api.get(`/transactions/${id}/history`);
      setHistory(response.data || []);
    } catch (error) {
      console.error("Error fetching transaction history:", error);
      setHistory([]);
    }
  }, [id]);

  useEffect(() => {
    fetchTransactionDetails();
    fetchTransactionHistory();
  }, [fetchTransactionDetails, fetchTransactionHistory]);

  // When transaction is loaded, try to resolve book and borrower details
  useEffect(() => {
    if (!transaction) return;

    const firstItem = Array.isArray(transaction.items) && transaction.items.length > 0
      ? transaction.items[0]
      : null;

    const fetchBook = async (bookId) => {
      try {
        if (!bookId) return;
        const res = await api.get(`/books/${bookId}`);
        setBook(res.data || null);
      } catch (err) {
        // fallback: leave book null
        console.debug('Could not fetch book', bookId, err?.message || err);
      }
    };

    const fetchBorrower = async (userId) => {
      try {
        if (!userId) return;
        const res = await api.get(`/users/${userId}`);
        setBorrower(res.data || null);
      } catch (err) {
        console.debug('Could not fetch user', userId, err?.message || err);
      }
    };

    if (firstItem && firstItem.bookId) {
      fetchBook(firstItem.bookId);
    }

    if (transaction.userId) {
      fetchBorrower(transaction.userId);
    }
  }, [transaction]);

  const handleReturnBook = async () => {
    try {
      setActionLoading(true);
      await api.post(`/transactions/${id}/return`, {
        returnDate: returnDate.toISOString(),
      });
      setSuccess("Book returned successfully");
      setReturnDialog(false);
      fetchTransactionDetails();
      fetchTransactionHistory();
      setTimeout(() => setSuccess(""), 3000);
    } catch (error) {
      setError(error.response?.data?.message || "Failed to return book");
      console.error("Error returning book:", error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateNotes = async () => {
    try {
      setActionLoading(true);
      await api.put(`/transactions/${id}/notes`, { notes });
      setSuccess("Notes updated successfully");
      setEditNotesDialog(false);
      fetchTransactionDetails();
      setTimeout(() => setSuccess(""), 3000);
    } catch (error) {
      setError("Failed to update notes");
      console.error("Error updating notes:", error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveSuccess = () => {
    setSuccess("Request approved successfully");
    setApproveDialogOpen(false);
    fetchTransactionDetails();
    fetchTransactionHistory();
    setTimeout(() => setSuccess(""), 3000);
  };

  const handleApproveClose = () => {
    setApproveDialogOpen(false);
  };

  const handleMarkMissing = async () => {
    try {
      setMarkMissingLoading(true);
      setError("");
      await api.post(`/transactions/${id}/missing`, {
        reason: missingReason.trim() || undefined,
      });
      setSuccess("Transaction flagged as missing");
      setMarkMissingDialogOpen(false);
      setMissingReason("");
      fetchTransactionDetails();
      fetchTransactionHistory();
      setTimeout(() => setSuccess(""), 3000);
    } catch (error) {
      const message = error.response?.data?.message || "Failed to mark transaction as missing";
      setError(message);
      console.error("Error marking missing:", error);
    } finally {
      setMarkMissingLoading(false);
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
        return <Assignment />;
    }
  };

  const calculateDaysOverdue = () => {
    if (!transaction || transaction.status !== "active") return 0;
    const now = new Date();
    const dueDate = new Date(transaction.dueDate);
    return Math.max(0, Math.ceil((now - dueDate) / (1000 * 60 * 60 * 24)));
  };

  const calculateFine = () => {
    if (!finesEnabled) {
      return 0;
    }
    const daysOverdue = calculateDaysOverdue();
    return daysOverdue * (transaction?.finePerDay || 0.5);
  };

  // Render human-friendly history details
  const renderDetails = (entry) => {
    const data = entry.details || entry.metadata;
    if (!data) return null;

    // If it's a plain string, show as text
    if (typeof data === "string") {
      return <Typography variant="body2">{data}</Typography>;
    }

    // If it contains a 'result' object (common for returns)
    if (data.result || data.returnedItems !== undefined || data.returnedItems === 0) {
      const result = data.result || data;
      return (
        <Box>
          {result.returnedItems !== undefined && (
            <Typography variant="body2">{`Returned ${result.returnedItems} item${result.returnedItems === 1 ? '' : 's'}.`}</Typography>
          )}
          {result.fineAmount !== undefined && (
            <Typography variant="body2">{`A fine of ${formatCurrency(result.fineAmount)} was applied.`}</Typography>
          )}
          {result.daysOverdue !== undefined && (
            <Typography variant="body2">{`The item was overdue by ${result.daysOverdue} day${result.daysOverdue === 1 ? '' : 's'}.`}</Typography>
          )}
        </Box>
      );
    }

    // If it has borrower info — deduplicate id fields
    if (data.borrower || data.borrowerId) {
      const b = data.borrower || {};
      const borrowerIdValue = b.id || data.borrowerId || null;
      return (
        <Box>
          {b.name && <Typography variant="body2">{`Borrower: ${b.name}`}</Typography>}
          {borrowerIdValue && <Typography variant="body2">{`Borrower ID: ${borrowerIdValue}`}</Typography>}
        </Box>
      );
    }

    // If it contains a transaction payload
    if (data.transaction || data.transactionId || data.id) {
      const t = data.transaction || data;
      const transactionIdValue = data.transactionId || t.transactionId || t.id || data.id || null;
      return (
        <Box>
          {transactionIdValue && (
            <Typography variant="body2">{`Related Transaction: #${transactionIdValue}`}</Typography>
          )}
          {Array.isArray(t.items) && t.items.length > 0 && (
            <Box>
              <Typography variant="body2">Involved Items:</Typography>
              {t.items.map((it, i) => (
                <Typography variant="caption" key={i} display="block">
                  {`• Copy/Book: ${it.copyId || it.copy || it.bookId || ''}${it.isbn ? ` (ISBN: ${it.isbn})` : ''}`}
                </Typography>
              ))}
            </Box>
          )}
        </Box>
      );
    }

    // If it includes copy/book ids at top-level
    if (data.copyId || data.bookId || data.isbn) {
      return (
        <Box>
          {data.bookId && <Typography variant="body2">{`Book ID: ${data.bookId}`}</Typography>}
          {data.copyId && <Typography variant="body2">{`Reference ID: ${data.copyId}`}</Typography>}
          {data.isbn && <Typography variant="body2">{`ISBN: ${data.isbn}`}</Typography>}
        </Box>
      );
    }

    // Fallback: show the raw data as a clean key-value list
    return (
      <Box sx={{ background: '#f6f8fa', borderRadius: 2, p: 1 }}>
        <Typography variant="body2" color="textSecondary" sx={{ fontStyle: 'italic', mb: 0.5 }}>
          Details:
        </Typography>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {Object.entries(data).map(([key, value]) => (
            <li key={key} style={{ marginBottom: 2 }}>
              <strong style={{ textTransform: 'capitalize' }}>{key.replace(/([A-Z])/g, ' $1')}</strong>: {formatDetailValue(value)}
            </li>
          ))}
        </ul>
      </Box>
    );
  // Helper to format values for display in details list
  function formatDetailValue(value) {
    if (value === null || value === undefined) return 'N/A';
    if (typeof value === 'object') {
      if (Array.isArray(value)) {
        return value.length === 0
          ? 'None'
          : value.map((v, i) => <span key={i}>{formatDetailValue(v)}{i < value.length - 1 ? ', ' : ''}</span>);
      }
      // For objects, show as a nested list if not empty
      const entries = Object.entries(value);
      if (entries.length === 0) return 'None';
      return (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {entries.map(([k, v]) => (
            <li key={k} style={{ marginBottom: 2 }}>
              <strong style={{ textTransform: 'capitalize' }}>{k.replace(/([A-Z])/g, ' $1')}</strong>: {formatDetailValue(v)}
            </li>
          ))}
        </ul>
      );
    }
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value);
  }
  };

  const canManageTransaction =
    user?.role === "admin" ||
    user?.role === "librarian" ||
    user?.role === "staff";

  const normalizedStatus = (transaction?.status || "").toLowerCase();
  const returnableStatuses = ["active", "borrowed", "overdue", "renewed", "missing"];
  const canProcessReturn = returnableStatuses.includes(normalizedStatus);
  const canMarkMissing = ["active", "borrowed", "overdue", "renewed"].includes(normalizedStatus);

  const printReceipt = () => {
    window.print();
  };

  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="200px"
      >
        <Typography> Loading transaction details... </Typography>{" "}
      </Box>
    );
  }

  if (!transaction) {
    return (
      <Box>
        <Alert severity="error"> Transaction not found </Alert>{" "}
      </Box>
    );
  }

  const daysOverdue = calculateDaysOverdue();
  const fine = calculateFine();

  const firstItem = Array.isArray(transaction?.items) && transaction.items.length > 0 ? transaction.items[0] : null;

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
          </IconButton>{" "}
          <Typography variant="h4" gutterBottom sx={{ flexGrow: 1, mb: 0, color:'white'}}>
            Transaction Details{" "}
          </Typography>{" "}
          <Box>
            <Button
              variant="outlined"
              startIcon={<Print />}
              onClick={printReceipt}
              sx={{ mr: 2 }}
            >
              Print Receipt{" "}
            </Button>{" "}
            {canManageTransaction && canProcessReturn && (
              <Button
                variant="contained"
                startIcon={<AssignmentReturn />}
                onClick={() => setReturnDialog(true)}
              >
                Return Book{" "}
              </Button>
            )}{" "}
          </Box>{" "}
        </Box>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {" "}
            {error}{" "}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {" "}
            {success}{" "}
          </Alert>
        )}

        {/* If the transaction was rejected, show the reason and metadata */}
        {transaction && transaction.status === 'rejected' && (
          <Alert severity="error" sx={{ mb: 2 }}>
            <Typography variant="body2">
              This request was rejected{transaction.rejectReason ? `: ${transaction.rejectReason}` : ''}
            </Typography>
            {transaction.rejectedBy && (
              <Typography variant="caption" display="block">Rejected by: {transaction.rejectedBy}</Typography>
            )}
            {transaction.rejectedAt && (
              <Typography variant="caption" display="block">At: {new Date(transaction.rejectedAt).toLocaleString()}</Typography>
            )}
          </Alert>
        )}
        <Grid container spacing={3}>
          {" "}
          {/* Transaction Overview */}{" "}
          <Grid item xs={12} lg={8}>
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Box
                  display="flex"
                  justifyContent="space-between"
                  alignItems="center"
                  mb={2}
                >
                  <Typography variant="h6">Transaction Overview </Typography>{" "}
                  <Chip
                    icon={getStatusIcon(transaction.status)}
                    label={transaction.status.toUpperCase()}
                    color={getStatusColor(transaction.status)}
                    size="large"
                  />
                </Box>
                <Grid container spacing={3}>
                  <Grid item xs={12} md={6}>
                    <Box display="flex" alignItems="center" mb={2}>
                      <Book sx={{ mr: 2, color: "primary.main" }} />{" "}
                      <Box>
                        <Typography variant="subtitle2" color="textSecondary">
                          Book{" "}
                        </Typography>{" "}
                        <Typography variant="h6">
                          {book?.title || transaction.bookTitle || firstItem?.bookId || firstItem?.copyId || ''}
                        </Typography>
                        <Typography variant="body2" color="textSecondary">
                          {`by ${book?.author || transaction.author || ''}`}
                        </Typography>
                        <Typography variant="body2" color="textSecondary">
                          {`Reference ID: ${firstItem?.copyId || transaction.copyId || ''}`}
                        </Typography>
                      </Box>{" "}
                    </Box>{" "}
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Box display="flex" alignItems="center" mb={2}>
                      <Person sx={{ mr: 2, color: "primary.main" }} />{" "}
                      <Box>
                        <Typography variant="subtitle2" color="textSecondary">
                          Borrower{" "}
                        </Typography>{" "}
                        <Typography variant="h6">
                          {borrower
                            ? `${borrower.firstName || ''} ${borrower.lastName || ''}`.trim()
                            : transaction.borrowerName || transaction.userId || ''}
                        </Typography>
                        <Typography variant="body2" color="textSecondary">
                          {borrower?.email || transaction.borrowerEmail || ''}
                        </Typography>
                        {(borrower?.studentId || transaction.borrowerStudentId || borrower?.library?.cardNumber) && (
                          <Typography variant="body2" color="textSecondary">
                            {`Student ID: ${borrower?.studentId || transaction.borrowerStudentId || borrower?.library?.cardNumber || ''}`}
                          </Typography>
                        )}
                      </Box>{" "}
                    </Box>{" "}
                  </Grid>{" "}
                </Grid>
                <Divider sx={{ my: 2 }} />
                <Grid container spacing={2}>
                  <Grid item xs={6} md={3}>
                    <Typography variant="subtitle2" color="textSecondary">
                      Borrow Date{" "}
                    </Typography>{" "}
                    <Typography variant="body1">
                      {" "}
                      {new Date(
                        transaction.borrowDate,
                      ).toLocaleDateString()}{" "}
                    </Typography>{" "}
                  </Grid>{" "}
                  <Grid item xs={6} md={3}>
                    <Typography variant="subtitle2" color="textSecondary">
                      Due Date{" "}
                    </Typography>{" "}
                    <Typography variant="body1">
                      {" "}
                      {new Date(transaction.dueDate).toLocaleDateString()}{" "}
                    </Typography>{" "}
                  </Grid>{" "}
                  <Grid item xs={6} md={3}>
                    <Typography variant="subtitle2" color="textSecondary">
                      Return Date{" "}
                    </Typography>{" "}
                    <Typography variant="body1">
                      {" "}
                      {transaction.returnDate
                        ? new Date(transaction.returnDate).toLocaleDateString()
                        : "Not returned"}{" "}
                    </Typography>{" "}
                  </Grid>{" "}
                  <Grid item xs={6} md={3}>
                    <Typography variant="subtitle2" color="textSecondary">
                      Transaction Type{" "}
                    </Typography>{" "}
                    <Typography
                      variant="body1"
                      sx={{ textTransform: "capitalize" }}
                    >
                      {" "}
                      {transaction.type || "Regular"}{" "}
                    </Typography>{" "}
                  </Grid>{" "}
                </Grid>
                {finesEnabled && daysOverdue > 0 && (
                  <Alert severity="warning" sx={{ mt: 2 }}>
                    <Typography variant="body2">
                      This book is{" "}
                      <strong>
                        {" "}
                        {daysOverdue}
                        days overdue{" "}
                      </strong>
                        . {fine > 0 && ` Current fine: ${formatCurrency(fine)}`}{" "}
                    </Typography>{" "}
                  </Alert>
                )}
                {transaction.notes && (
                  <Box mt={2}>
                    <Box
                      display="flex"
                      justifyContent="space-between"
                      alignItems="center"
                    >
                      <Typography variant="subtitle2" color="textSecondary">
                        Notes{" "}
                      </Typography>{" "}
                      {canManageTransaction && (
                        <IconButton
                          size="small"
                          onClick={() => setEditNotesDialog(true)}
                        >
                          <Edit />
                        </IconButton>
                      )}{" "}
                    </Box>{" "}
                    <Typography variant="body2">
                      {" "}
                      {transaction.notes}{" "}
                    </Typography>{" "}
                  </Box>
                )}{" "}
              </CardContent>{" "}
            </Card>
            {/* Transaction History */}{" "}
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Transaction History{" "}
                </Typography>{" "}
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Date</TableCell>
                        <TableCell>Action</TableCell>
                        <TableCell>Details</TableCell>
                        <TableCell>Processed By</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {history.map((entry, index) => (
                        <TableRow key={index}>
                          <TableCell>{new Date(entry.timestamp).toLocaleString()}</TableCell>
                          <TableCell>
                            <Chip label={formatActionLabel(entry.action)} size="small" variant="outlined" />
                          </TableCell>
                          <TableCell>{renderDetails(entry)}</TableCell>
                          <TableCell>{entry.staffName || 'System'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>{" "}
            </Card>{" "}
          </Grid>
          {/* Sidebar Information */}{" "}
          <Grid item xs={12} lg={4}>
            {" "}
            {/* Transaction Summary */}{" "}
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Summary{" "}
                </Typography>{" "}
                <List>
                  <ListItem>
                    <ListItemIcon>
                      <Assignment />
                    </ListItemIcon>{" "}
                    <ListItemText
                      primary="Transaction ID"
                      secondary={transaction.id || transaction._id}
                    />
                  </ListItem>{" "}
                  <ListItem>
                    <ListItemIcon>
                      <QrCode />
                    </ListItemIcon>
                    <ListItemText
                      primary="Copy Barcode"
                      secondary={firstItem?.copyId || transaction.copyId}
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon>
                      <CalendarToday />
                    </ListItemIcon>{" "}
                    <ListItemText
                      primary="Days Borrowed"
                      secondary={
                        transaction.returnDate
                          ? Math.ceil(
                              (new Date(transaction.returnDate) -
                                new Date(transaction.borrowDate)) /
                                (1000 * 60 * 60 * 24),
                            )
                          : Math.ceil(
                              (new Date() - new Date(transaction.borrowDate)) /
                                (1000 * 60 * 60 * 24),
                            )
                      }
                    />{" "}
                  </ListItem>{" "}
                  {finesEnabled && fine > 0 && (
                    <ListItem>
                      <ListItemIcon>
                        <CurrencyExchange />
                      </ListItemIcon>{" "}
                      <ListItemText
                        primary="Fine Amount"
                          secondary={formatCurrency(fine)}
                      />{" "}
                    </ListItem>
                  )}{" "}
                </List>{" "}
              </CardContent>{" "}
            </Card>
            {/* Quick Actions */}{" "}
            {canManageTransaction && (
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Quick Actions{" "}
                  </Typography>{" "}
                  <Box display="flex" flexDirection="column" gap={1}>
                    <Button
                      fullWidth
                      variant="outlined"
                      startIcon={<Note />}
                      onClick={() => setEditNotesDialog(true)}
                    >
                      Edit Notes{" "}
                    </Button>{" "}
                    {transaction.status === "requested" && (
                      <Button
                        fullWidth
                        variant="contained"
                        startIcon={<CheckCircle />}
                        onClick={() => setApproveDialogOpen(true)}
                      >
                        Approve Request
                      </Button>
                    )}
                    {canProcessReturn && (
                      <Button
                        fullWidth
                        variant="contained"
                        startIcon={<AssignmentReturn />}
                        onClick={() => setReturnDialog(true)}
                      >
                        Process Return{" "}
                      </Button>
                    )}{" "}
                    {canMarkMissing && (
                      <Button
                        fullWidth
                        color="error"
                        variant="outlined"
                        startIcon={<Warning />}
                        onClick={() => setMarkMissingDialogOpen(true)}
                      >
                        Mark Missing{" "}
                      </Button>
                    )}{" "}
                  </Box>{" "}
                </CardContent>{" "}
              </Card>
            )}{" "}
          </Grid>{" "}
        </Grid>
        {/* Return Dialog */}{" "}
        <Dialog open={returnDialog} onClose={() => setReturnDialog(false)}>
          <DialogTitle> Return Book </DialogTitle>{" "}
          <DialogContent>
            <DateTimePicker
              label="Return Date"
              value={returnDate}
              onChange={(newValue) => setReturnDate(newValue)}
              slotProps={{
                textField: {
                  fullWidth: true,
                  margin: "normal",
                },
              }}
              maxDate={new Date()}
            />{" "}
                {finesEnabled && fine > 0 && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                      Late return fine: {formatCurrency(fine)}{" "}
              </Alert>
            )}{" "}
          </DialogContent>{" "}
          <DialogActions>
            <Button variant="outlined" onClick={() => setReturnDialog(false)}> Cancel </Button>{" "}
            <Button
              onClick={handleReturnBook}
              variant="contained"
              disabled={actionLoading}
            >
              {actionLoading ? "Processing..." : "Return Book"}{" "}
            </Button>{" "}
          </DialogActions>{" "}
        </Dialog>
        {/* Edit Notes Dialog */}{" "}
        <Dialog
          open={editNotesDialog}
          onClose={() => setEditNotesDialog(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle> Edit Transaction Notes </DialogTitle>{" "}
          <DialogContent>
            <TextField
              fullWidth
              multiline
              rows={4}
              label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              margin="normal"
              placeholder="Add any notes about this transaction..."
            />
          </DialogContent>{" "}
          <DialogActions>
            <Button variant="outlined" onClick={() => setEditNotesDialog(false)}> Cancel </Button>{" "}
            <Button
              onClick={handleUpdateNotes}
              variant="contained"
              disabled={actionLoading}
            >
              {actionLoading ? "Updating..." : "Update Notes"}{" "}
            </Button>{" "}
          </DialogActions>{" "}
        </Dialog>{" "}
        <ApproveRequestDialog
          open={approveDialogOpen}
          transactionId={id}
          onClose={handleApproveClose}
          onApproved={handleApproveSuccess}
          onNavigateToRequests={() => {
            setApproveDialogOpen(false);
            navigate("/transactions/requests");
          }}
        />
        <Dialog
          open={markMissingDialogOpen}
          onClose={() => {
            if (!markMissingLoading) {
              setMarkMissingDialogOpen(false);
            }
          }}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>Mark Transaction as Missing</DialogTitle>{" "}
          <DialogContent>
            <Typography variant="body2" color="textSecondary" gutterBottom>
              Flag all outstanding items on this transaction as missing. This action notifies the borrower and updates reports.
            </Typography>
            <TextField
              fullWidth
              multiline
              rows={3}
              margin="normal"
              label="Reason (optional)"
              value={missingReason}
              onChange={(e) => setMissingReason(e.target.value)}
              placeholder="Provide additional context for the borrower"
            />
          </DialogContent>{" "}
          <DialogActions>
            <Button
              variant="outlined"
              onClick={() => {
                if (!markMissingLoading) {
                  setMarkMissingDialogOpen(false);
                  setMissingReason("");
                }
              }}
              disabled={markMissingLoading}
            >
              Cancel
            </Button>{" "}
            <Button
              color="error"
              variant="contained"
              onClick={handleMarkMissing}
              disabled={markMissingLoading}
            >
              {markMissingLoading ? "Marking..." : "Confirm Missing"}
            </Button>{" "}
          </DialogActions>{" "}
        </Dialog>
      </Box>{" "}
    </LocalizationProvider>
  );
};


// Helper to format action labels more formally
function formatActionLabel(action) {
  if (!action) return '';
  switch (action) {
    case 'create':
      return 'Transaction Created';
    case 'approve':
      return 'Approved';
    case 'reject':
      return 'Rejected';
    case 'return':
      return 'Returned';
    case 'renew':
      return 'Renewed';
    case 'update':
      return 'Updated';
    case 'fine':
      return 'Fine Issued';
    default:
      // Capitalize first letter
      return action.charAt(0).toUpperCase() + action.slice(1);
  }
}

export default TransactionDetails;
