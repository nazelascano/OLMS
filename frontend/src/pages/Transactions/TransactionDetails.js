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
  Refresh,
  Note,
} from "@mui/icons-material";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../utils/api";
import { formatCurrency } from "../../utils/currency";

const TransactionDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [transaction, setTransaction] = useState(null);
  const [book, setBook] = useState(null);
  const [borrower, setBorrower] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [renewDialog, setRenewDialog] = useState(false);
  const [returnDialog, setReturnDialog] = useState(false);
  const [editNotesDialog, setEditNotesDialog] = useState(false);
  const [newDueDate, setNewDueDate] = useState(null);
  const [returnDate, setReturnDate] = useState(new Date());
  const [notes, setNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

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

  const handleRenewTransaction = async () => {
    try {
      setActionLoading(true);
      await api.post(`/transactions/${id}/renew`, {
        newDueDate: newDueDate?.toISOString(),
      });
      setSuccess("Transaction renewed successfully");
      setRenewDialog(false);
      fetchTransactionDetails();
      fetchTransactionHistory();
      setTimeout(() => setSuccess(""), 3000);
    } catch (error) {
      setError(error.response?.data?.message || "Failed to renew transaction");
      console.error("Error renewing transaction:", error);
    } finally {
      setActionLoading(false);
    }
  };

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
            <Typography variant="body2">Returned items: {String(result.returnedItems)}</Typography>
          )}
          {result.fineAmount !== undefined && (
            <Typography variant="body2">Fine: {formatCurrency(result.fineAmount)}</Typography>
          )}
          {result.daysOverdue !== undefined && (
            <Typography variant="body2">Days overdue: {String(result.daysOverdue)}</Typography>
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
          {b.name && <Typography variant="body2">Borrower: {b.name}</Typography>}
          {borrowerIdValue && <Typography variant="body2">Borrower ID: {borrowerIdValue}</Typography>}
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
            <Typography variant="body2">Transaction: {transactionIdValue}</Typography>
          )}
          {Array.isArray(t.items) && t.items.length > 0 && (
            <Box>
              <Typography variant="body2">Items:</Typography>
              {t.items.map((it, i) => (
                <Typography variant="caption" key={i} display="block">
                  {`• ${it.copyId || it.copy || it.bookId || ''} ${it.isbn ? `(${it.isbn})` : ''}`}
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
          {data.bookId && <Typography variant="body2">Book ID: {data.bookId}</Typography>}
          {data.copyId && <Typography variant="body2">Copy ID: {data.copyId}</Typography>}
          {data.isbn && <Typography variant="body2">ISBN: {data.isbn}</Typography>}
        </Box>
      );
    }

    // Fallback: pretty JSON
    try {
      return (
        <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{JSON.stringify(data, null, 2)}</pre>
      );
    } catch (err) {
      return <Typography variant="body2">{String(data)}</Typography>;
    }
  };

  const canManageTransaction =
    user?.role === "admin" ||
    user?.role === "librarian" ||
    user?.role === "staff";

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
          <Typography variant="h4" gutterBottom sx={{ flexGrow: 1, mb: 0 }}>
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
            {canManageTransaction && transaction.status === "active" && (
              <>
                <Button
                  variant="outlined"
                  startIcon={<Schedule />}
                  onClick={() => {
                    setNewDueDate(
                      new Date(
                        new Date(transaction.dueDate).getTime() +
                          14 * 24 * 60 * 60 * 1000,
                      ),
                    );
                    setRenewDialog(true);
                  }}
                  sx={{ mr: 2 }}
                >
                  Renew{" "}
                </Button>{" "}
                <Button
                  variant="contained"
                  startIcon={<AssignmentReturn />}
                  onClick={() => setReturnDialog(true)}
                >
                  Return Book{" "}
                </Button>{" "}
              </>
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
                          {`Copy ID: ${firstItem?.copyId || transaction.copyId || ''}`}
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
                {daysOverdue > 0 && (
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
                        <TableCell>Staff</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {history.map((entry, index) => (
                        <TableRow key={index}>
                          <TableCell>{new Date(entry.timestamp).toLocaleString()}</TableCell>
                          <TableCell>
                            <Chip label={entry.action} size="small" variant="outlined" />
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
                  {transaction.renewalCount > 0 && (
                    <ListItem>
                      <ListItemIcon>
                        <Refresh />
                      </ListItemIcon>{" "}
                      <ListItemText
                        primary="Renewals"
                        secondary={`${transaction.renewalCount} times`}
                      />{" "}
                    </ListItem>
                  )}{" "}
                  {fine > 0 && (
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
                    {transaction.status === "active" && (
                      <>
                        <Button
                          fullWidth
                          variant="outlined"
                          startIcon={<Schedule />}
                          onClick={() => {
                            setNewDueDate(
                              new Date(
                                new Date(transaction.dueDate).getTime() +
                                  14 * 24 * 60 * 60 * 1000,
                              ),
                            );
                            setRenewDialog(true);
                          }}
                        >
                          Renew Transaction{" "}
                        </Button>{" "}
                        <Button
                          fullWidth
                          variant="contained"
                          startIcon={<AssignmentReturn />}
                          onClick={() => setReturnDialog(true)}
                        >
                          Process Return{" "}
                        </Button>{" "}
                      </>
                    )}{" "}
                  </Box>{" "}
                </CardContent>{" "}
              </Card>
            )}{" "}
          </Grid>{" "}
        </Grid>
        {/* Renew Dialog */}{" "}
        <Dialog open={renewDialog} onClose={() => setRenewDialog(false)}>
          <DialogTitle> Renew Transaction </DialogTitle>{" "}
          <DialogContent>
            <Typography gutterBottom>
              Current due date:{" "}
              {new Date(transaction.dueDate).toLocaleDateString()}{" "}
            </Typography>{" "}
            <DateTimePicker
              label="New Due Date"
              value={newDueDate}
              onChange={(newValue) => setNewDueDate(newValue)}
              renderInput={(params) => (
                <TextField {...params} fullWidth margin="normal" />
              )}
              minDate={new Date()}
            />{" "}
          </DialogContent>{" "}
          <DialogActions>
            <Button onClick={() => setRenewDialog(false)}> Cancel </Button>{" "}
            <Button
              onClick={handleRenewTransaction}
              variant="contained"
              disabled={actionLoading || !newDueDate}
            >
              {actionLoading ? "Renewing..." : "Renew"}{" "}
            </Button>{" "}
          </DialogActions>{" "}
        </Dialog>
        {/* Return Dialog */}{" "}
        <Dialog open={returnDialog} onClose={() => setReturnDialog(false)}>
          <DialogTitle> Return Book </DialogTitle>{" "}
          <DialogContent>
            <DateTimePicker
              label="Return Date"
              value={returnDate}
              onChange={(newValue) => setReturnDate(newValue)}
              renderInput={(params) => (
                <TextField {...params} fullWidth margin="normal" />
              )}
              maxDate={new Date()}
            />{" "}
            {fine > 0 && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                      Late return fine: {formatCurrency(fine)}{" "}
              </Alert>
            )}{" "}
          </DialogContent>{" "}
          <DialogActions>
            <Button onClick={() => setReturnDialog(false)}> Cancel </Button>{" "}
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
            <Button onClick={() => setEditNotesDialog(false)}> Cancel </Button>{" "}
            <Button
              onClick={handleUpdateNotes}
              variant="contained"
              disabled={actionLoading}
            >
              {actionLoading ? "Updating..." : "Update Notes"}{" "}
            </Button>{" "}
          </DialogActions>{" "}
        </Dialog>{" "}
      </Box>{" "}
    </LocalizationProvider>
  );
};

export default TransactionDetails;
