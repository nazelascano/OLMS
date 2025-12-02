import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Paper,
  Grid,
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
} from "@mui/material";
import {
  ArrowBack,
  Edit,
  Add,
  Delete,
  Book,
  LocalLibrary,
  History,
  CheckCircle,
  Print,
} from "@mui/icons-material";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../utils/api";

const BookDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [book, setBook] = useState(null);
  const [copies, setCopies] = useState([]);
  const [borrowingHistory, setBorrowingHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copyDialog, setCopyDialog] = useState(false);
  const [newCopy, setNewCopy] = useState({
    copyId: "",
    condition: "good",
    notes: "",
  });

  const fetchBookDetails = useCallback(async () => {
    try {
      const response = await api.get(`/books/${id}`);
      setBook(response.data);
    } catch (error) {
      setError("Failed to fetch book details");
      console.error("Error fetching book details:", error);
    }
  }, [id]);

  const fetchBookCopies = useCallback(async () => {
    try {
      const response = await api.get(`/books/${id}/copies`);
      setCopies(response.data);
    } catch (error) {
      console.error("Error fetching book copies:", error);
    }
  }, [id]);

  const fetchBorrowingHistory = useCallback(async () => {
    try {
  const response = await api.get(`/books/${id}/history`);
  setBorrowingHistory(response.data || []);
    } catch (error) {
      console.error("Error fetching borrowing history:", error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchBookDetails();
    fetchBookCopies();
    fetchBorrowingHistory();
  }, [fetchBookDetails, fetchBookCopies, fetchBorrowingHistory]);

  const handleAddCopy = async () => {
    try {
      await api.post(`/books/${id}/copies`, newCopy);
      setNewCopy({ copyId: "", condition: "good", notes: "" });
      setCopyDialog(false);
      fetchBookCopies();
    } catch (error) {
      setError("Failed to add book copy");
      console.error("Error adding copy:", error);
    }
  };

  const handleDeleteCopy = async (copyId) => {
    if (window.confirm("Are you sure you want to delete this copy?")) {
      try {
        await api.delete(`/books/${id}/copies/${copyId}`);
        fetchBookCopies();
      } catch (error) {
        setError("Failed to delete book copy");
        console.error("Error deleting copy:", error);
      }
    }
  };

  const handlePrintCopy = async (copyId) => {
    if (!copyId) {
      return;
    }

    try {
      setError("");
      const response = await api.get(`/books/${id}/copies/barcodes`, {
        params: { copyIds: copyId },
        responseType: "blob",
      });

      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${copyId}_barcode.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => window.URL.revokeObjectURL(url), 2000);
    } catch (error) {
      setError("Failed to generate barcode for this copy");
      console.error("Error generating barcode:", error);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "available":
        return "success";
      case "borrowed":
        return "warning";
      case "lost":
        return "error";
      case "damaged":
        return "error";
      default:
        return "default";
    }
  };

  const getConditionColor = (condition) => {
    switch (condition) {
      case "excellent":
        return "success";
      case "good":
        return "info";
      case "fair":
        return "warning";
      case "poor":
        return "error";
      default:
        return "default";
    }
  };

  const canManageCopies = user?.role === "admin" || user?.role === "librarian";

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

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
        <Typography>Loading book details...</Typography>
      </Box>
    );
  }

  if (!book) {
    return (
      <Box>
        <Alert severity="error">Book not found</Alert>
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" alignItems="center" mb={3}>
        <IconButton onClick={() => navigate("/books")} sx={{ mr: 2 }}>
          <ArrowBack />
        </IconButton>
        <Typography variant="h4" gutterBottom sx={{ flexGrow: 1, mb: 0 }}>
          {book.title}
        </Typography>
        {canManageCopies && (
          <Button
            variant="outlined"
            startIcon={<Edit />}
            onClick={() => navigate(`/books/${id}/edit`)}
            sx={{ mr: 2 }}
          >
            Edit Book
          </Button>
        )}
      </Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Book Information
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" color="textSecondary">
                  Author
                </Typography>
                <Typography variant="body1" gutterBottom>
                  {book.author}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" color="textSecondary">
                  ISBN
                </Typography>
                <Typography variant="body1" gutterBottom>
                  {book.isbn}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" color="textSecondary">
                  Category
                </Typography>
                <Typography variant="body1" gutterBottom>
                  {book.category}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" color="textSecondary">
                  Publication Year
                </Typography>
                <Typography variant="body1" gutterBottom>
                  {book.publicationYear}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" color="textSecondary">
                  Publisher
                </Typography>
                <Typography variant="body1" gutterBottom>
                  {book.publisher || "Not specified"}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" color="textSecondary">
                  Language
                </Typography>
                <Typography variant="body1" gutterBottom>
                  {book.language || "English"}
                </Typography>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="textSecondary">
                  Description
                </Typography>
                <Typography variant="body1">
                  {book.description || "No description available"}
                </Typography>
              </Grid>
            </Grid>
          </Paper>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Borrowing History
            </Typography>
            {borrowingHistory.length > 0 ? (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Copy ID</TableCell>
                      <TableCell>Borrower</TableCell>
                      <TableCell>Borrowed Date</TableCell>
                      <TableCell>Due Date</TableCell>
                      <TableCell>Returned Date</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {borrowingHistory.map((transaction) => (
                      <TableRow key={transaction._id}>
                        <TableCell>{transaction.copyId}</TableCell>
                        <TableCell>{transaction.borrowerName}</TableCell>
                        <TableCell>{formatDate(transaction.borrowDate)}</TableCell>
                        <TableCell>{formatDate(transaction.dueDate)}</TableCell>
                        <TableCell>{formatDate(transaction.returnDate)}</TableCell>
                        <TableCell>
                          <Chip
                            label={transaction.status}
                            color={getStatusColor(transaction.status)}
                            size="small"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Typography color="textSecondary">
                No borrowing history available
              </Typography>
            )}
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6">Book Copies</Typography>
              {canManageCopies && (
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<Add />}
                  onClick={() => setCopyDialog(true)}
                >
                  Add Copy
                </Button>
              )}
            </Box>
            <List>
              {copies.map((copy) => (
                <ListItem
                  key={copy.copyId}
                  secondaryAction={
                    canManageCopies && (
                      <Box display="flex" alignItems="center" gap={1}>
                        <IconButton edge="end" onClick={() => handlePrintCopy(copy.copyId)} aria-label="Print barcode">
                          <Print fontSize="small" />
                        </IconButton>
                        <IconButton edge="end" onClick={() => handleDeleteCopy(copy.copyId)} color="error" aria-label="Delete copy">
                          <Delete />
                        </IconButton>
                      </Box>
                    )
                  }
                >
                  <ListItemIcon>
                    <Book />
                  </ListItemIcon>
                  <ListItemText
                    primary={`Copy ${copy.copyId}`}
                    secondaryTypographyProps={{ component: "div" }}
                    secondary={
                      <Box display="flex" flexWrap="wrap" gap={1} mt={1}>
                        <Chip
                          label={copy.status}
                          color={getStatusColor(copy.status)}
                          size="small"
                        />
                        <Chip
                          label={copy.condition}
                          color={getConditionColor(copy.condition)}
                          size="small"
                        />
                        {copy.notes && (
                          <Typography variant="caption" component="span">
                            {copy.notes}
                          </Typography>
                        )}
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
            {copies.length === 0 && (
              <Typography color="textSecondary" textAlign="center">
                No copies available
              </Typography>
            )}
          </Paper>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Statistics
            </Typography>
            <List>
              <ListItem>
                <ListItemIcon>
                  <Book />
                </ListItemIcon>
                <ListItemText primary="Total Copies" secondary={copies.length} />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <CheckCircle color="success" />
                </ListItemIcon>
                <ListItemText
                  primary="Available"
                  secondary={copies.filter((c) => c.status === "available").length}
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <LocalLibrary color="warning" />
                </ListItemIcon>
                <ListItemText
                  primary="Borrowed"
                  secondary={copies.filter((c) => c.status === "borrowed").length}
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <History />
                </ListItemIcon>
                <ListItemText primary="Total Transactions" secondary={borrowingHistory.length} />
              </ListItem>
            </List>
          </Paper>
        </Grid>
      </Grid>
      <Dialog open={copyDialog} onClose={() => setCopyDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add New Copy</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Copy ID"
            fullWidth
            variant="outlined"
            value={newCopy.copyId}
            onChange={(e) => setNewCopy({ ...newCopy, copyId: e.target.value })}
            sx={{ mb: 2 }}
          />
          <TextField
            select
            margin="dense"
            label="Condition"
            fullWidth
            variant="outlined"
            value={newCopy.condition}
            onChange={(e) => setNewCopy({ ...newCopy, condition: e.target.value })}
            SelectProps={{ native: true }}
            sx={{ mb: 2 }}
          >
            <option value="excellent">Excellent</option>
            <option value="good">Good</option>
            <option value="fair">Fair</option>
            <option value="poor">Poor</option>
          </TextField>
          <TextField
            margin="dense"
            label="Notes (Optional)"
            fullWidth
            multiline
            rows={3}
            variant="outlined"
            value={newCopy.notes}
            onChange={(e) => setNewCopy({ ...newCopy, notes: e.target.value })}
          />
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setCopyDialog(false)}>Cancel</Button>
          <Button onClick={handleAddCopy} variant="contained" disabled={!newCopy.copyId}>
            Add Copy
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default BookDetails;
