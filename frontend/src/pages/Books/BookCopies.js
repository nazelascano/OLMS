import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Paper,
  Grid,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Card,
  CardContent,
  Menu,
  ListItemIcon,
  ListItemText,
  Divider,
} from "@mui/material";
import {
  Add,
  Edit,
  Delete,
  QrCode,
  MoreVert,
  ArrowBack,
  Visibility,
  Assignment,
  Warning,
  CheckCircle,
  Book,
  Print,
  Download,
} from "@mui/icons-material";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../utils/api";

const BookCopies = () => {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [book, setBook] = useState(null);
  const [copies, setCopies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [copyDialog, setCopyDialog] = useState(false);
  const [editingCopy, setEditingCopy] = useState(null);
  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedCopy, setSelectedCopy] = useState(null);
  const [copyForm, setCopyForm] = useState({
    copyId: "",
    condition: "good",
    location: "",
    notes: "",
    price: "",
    acquisitionDate: new Date().toISOString().split("T")[0],
  });

  const conditions = [
    { value: "excellent", label: "Excellent", color: "success" },
    { value: "good", label: "Good", color: "info" },
    { value: "fair", label: "Fair", color: "warning" },
    { value: "poor", label: "Poor", color: "error" },
  ];

  const statuses = [
    { value: "available", label: "Available", color: "success" },
    { value: "borrowed", label: "Borrowed", color: "warning" },
    { value: "reserved", label: "Reserved", color: "info" },
    { value: "lost", label: "Lost", color: "error" },
    { value: "damaged", label: "Damaged", color: "error" },
    { value: "maintenance", label: "Maintenance", color: "default" },
  ];

  useEffect(() => {
    fetchBookDetails();
    fetchCopies();
  }, [bookId]);

  const fetchBookDetails = async () => {
    try {
      const response = await api.get(`/books/${bookId}`);
      setBook(response.data);
    } catch (error) {
      setError("Failed to fetch book details");
      console.error("Error fetching book details:", error);
    }
  };

  const fetchCopies = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/books/${bookId}/copies`);
      setCopies(response.data);
    } catch (error) {
      setError("Failed to fetch book copies");
      console.error("Error fetching copies:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCopy = async () => {
    try {
      await api.post(`/books/${bookId}/copies`, copyForm);
      setSuccess("Copy added successfully");
      setCopyDialog(false);
      resetForm();
      fetchCopies();
      setTimeout(() => setSuccess(""), 3000);
    } catch (error) {
      setError(error.response?.data?.message || "Failed to add copy");
      console.error("Error adding copy:", error);
    }
  };

  const handleUpdateCopy = async () => {
    try {
      await api.put(`/books/${bookId}/copies/${editingCopy._id}`, copyForm);
      setSuccess("Copy updated successfully");
      setCopyDialog(false);
      setEditingCopy(null);
      resetForm();
      fetchCopies();
      setTimeout(() => setSuccess(""), 3000);
    } catch (error) {
      setError(error.response?.data?.message || "Failed to update copy");
      console.error("Error updating copy:", error);
    }
  };

  const handleDeleteCopy = async (copyId) => {
    if (!window.confirm("Are you sure you want to delete this copy?")) return;

    try {
      await api.delete(`/books/${bookId}/copies/${copyId}`);
      setSuccess("Copy deleted successfully");
      fetchCopies();
      setTimeout(() => setSuccess(""), 3000);
    } catch (error) {
      setError(error.response?.data?.message || "Failed to delete copy");
      console.error("Error deleting copy:", error);
    }
  };

  const handleMenuClick = (event, copy) => {
    setAnchorEl(event.currentTarget);
    setSelectedCopy(copy);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedCopy(null);
  };

  const handleEditCopy = () => {
    setEditingCopy(selectedCopy);
    setCopyForm({
      copyId: selectedCopy.copyId,
      condition: selectedCopy.condition,
      location: selectedCopy.location || "",
      notes: selectedCopy.notes || "",
      price: selectedCopy.price || "",
      acquisitionDate: selectedCopy.acquisitionDate
        ? selectedCopy.acquisitionDate.split("T")[0]
        : new Date().toISOString().split("T")[0],
    });
    setCopyDialog(true);
    handleMenuClose();
  };

  const resetForm = () => {
    setCopyForm({
      copyId: "",
      condition: "good",
      location: "",
      notes: "",
      price: "",
      acquisitionDate: new Date().toISOString().split("T")[0],
    });
  };

  const generateBarcodes = async () => {
    try {
      const response = await api.get(`/books/${bookId}/copies/barcodes`, {
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${book.title}_barcodes.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      setError("Failed to generate barcodes");
      console.error("Error generating barcodes:", error);
    }
  };

  const getStatusColor = (status) => {
    const statusObj = statuses.find((s) => s.value === status);
    return statusObj ? statusObj.color : "default";
  };

  const getConditionColor = (condition) => {
    const conditionObj = conditions.find((c) => c.value === condition);
    return conditionObj ? conditionObj.color : "default";
  };

  const canManageCopies = user?.role === "admin" || user?.role === "librarian";

  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="200px"
      >
        <Typography> Loading copies... </Typography>{" "}
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" alignItems="center" mb={3}>
        <IconButton onClick={() => navigate("/books")} sx={{ mr: 2 }}>
          <ArrowBack />
        </IconButton>{" "}
        <Typography variant="h4" gutterBottom sx={{ flexGrow: 1, mb: 0 }}>
          Book Copies - {book?.title}{" "}
        </Typography>{" "}
        {canManageCopies && (
          <Box>
            <Button
              variant="outlined"
              startIcon={<Print />}
              onClick={generateBarcodes}
              sx={{ mr: 2 }}
              disabled={copies.length === 0}
            >
              Print Barcodes{" "}
            </Button>{" "}
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => {
                resetForm();
                setEditingCopy(null);
                setCopyDialog(true);
              }}
            >
              Add Copy{" "}
            </Button>{" "}
          </Box>
        )}{" "}
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
      {/* Summary Cards */}{" "}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <Book color="primary" sx={{ mr: 2 }} />{" "}
                <Box>
                  <Typography variant="h6"> {copies.length} </Typography>{" "}
                  <Typography variant="body2" color="textSecondary">
                    Total Copies{" "}
                  </Typography>{" "}
                </Box>{" "}
              </Box>{" "}
            </CardContent>{" "}
          </Card>{" "}
        </Grid>{" "}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <CheckCircle color="success" sx={{ mr: 2 }} />{" "}
                <Box>
                  <Typography variant="h6">
                    {" "}
                    {copies.filter((c) => c.status === "available").length}{" "}
                  </Typography>{" "}
                  <Typography variant="body2" color="textSecondary">
                    Available{" "}
                  </Typography>{" "}
                </Box>{" "}
              </Box>{" "}
            </CardContent>{" "}
          </Card>{" "}
        </Grid>{" "}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <Assignment color="warning" sx={{ mr: 2 }} />{" "}
                <Box>
                  <Typography variant="h6">
                    {" "}
                    {copies.filter((c) => c.status === "borrowed").length}{" "}
                  </Typography>{" "}
                  <Typography variant="body2" color="textSecondary">
                    Borrowed{" "}
                  </Typography>{" "}
                </Box>{" "}
              </Box>{" "}
            </CardContent>{" "}
          </Card>{" "}
        </Grid>{" "}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <Warning color="error" sx={{ mr: 2 }} />{" "}
                <Box>
                  <Typography variant="h6">
                    {" "}
                    {
                      copies.filter((c) =>
                        ["lost", "damaged"].includes(c.status),
                      ).length
                    }{" "}
                  </Typography>{" "}
                  <Typography variant="body2" color="textSecondary">
                    Lost / Damaged{" "}
                  </Typography>{" "}
                </Box>{" "}
              </Box>{" "}
            </CardContent>{" "}
          </Card>{" "}
        </Grid>{" "}
      </Grid>
      {/* Copies Table */}{" "}
      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell> Copy ID </TableCell> <TableCell> Status </TableCell>{" "}
                <TableCell> Condition </TableCell>{" "}
                <TableCell> Location </TableCell>{" "}
                <TableCell> Acquisition Date </TableCell>{" "}
                <TableCell> Current Borrower </TableCell>{" "}
                <TableCell> Notes </TableCell>{" "}
                {canManageCopies && (
                  <TableCell align="center"> Actions </TableCell>
                )}{" "}
              </TableRow>{" "}
            </TableHead>{" "}
            <TableBody>
              {" "}
              {copies.map((copy) => (
                <TableRow key={copy._id}>
                  <TableCell>
                    <Box display="flex" alignItems="center">
                      <QrCode sx={{ mr: 1, color: "text.secondary" }} />{" "}
                      <Typography variant="body2" fontWeight="medium">
                        {" "}
                        {copy.copyId}{" "}
                      </Typography>{" "}
                    </Box>{" "}
                  </TableCell>{" "}
                  <TableCell>
                    <Chip
                      label={copy.status}
                      color={getStatusColor(copy.status)}
                      size="small"
                    />
                  </TableCell>{" "}
                  <TableCell>
                    <Chip
                      label={copy.condition}
                      color={getConditionColor(copy.condition)}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>{" "}
                  <TableCell> {copy.location || "-"} </TableCell>{" "}
                  <TableCell>
                    {" "}
                    {copy.acquisitionDate
                      ? new Date(copy.acquisitionDate).toLocaleDateString()
                      : "-"}{" "}
                  </TableCell>{" "}
                  <TableCell>
                    {" "}
                    {copy.currentBorrower ? (
                      <Box>
                        <Typography variant="body2">
                          {" "}
                          {copy.currentBorrower.name}{" "}
                        </Typography>{" "}
                        <Typography variant="caption" color="textSecondary">
                          Due:{" "}
                          {new Date(copy.dueDate).toLocaleDateString()}{" "}
                        </Typography>{" "}
                      </Box>
                    ) : (
                      "-"
                    )}{" "}
                  </TableCell>{" "}
                  <TableCell>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 150 }}>
                      {" "}
                      {copy.notes || "-"}{" "}
                    </Typography>{" "}
                  </TableCell>{" "}
                  {canManageCopies && (
                    <TableCell align="center">
                      <IconButton
                        onClick={(e) => handleMenuClick(e, copy)}
                        size="small"
                      >
                        <MoreVert />
                      </IconButton>{" "}
                    </TableCell>
                  )}{" "}
                </TableRow>
              ))}{" "}
            </TableBody>{" "}
          </Table>{" "}
        </TableContainer>
        {copies.length === 0 && (
          <Box p={3} textAlign="center">
            <Typography color="textSecondary">
              No copies found for this book{" "}
            </Typography>{" "}
          </Box>
        )}{" "}
      </Paper>
      {/* Context Menu */}{" "}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={handleEditCopy}>
          <ListItemIcon>
            <Edit />
          </ListItemIcon>{" "}
          <ListItemText> Edit Copy </ListItemText>{" "}
        </MenuItem>{" "}
        <MenuItem
          onClick={() => {
            navigate(`/books/${bookId}/copies/${selectedCopy._id}/history`);
            handleMenuClose();
          }}
        >
          <ListItemIcon>
            <Visibility />
          </ListItemIcon>{" "}
          <ListItemText> View History </ListItemText>{" "}
        </MenuItem>{" "}
        <Divider />
        <MenuItem
          onClick={() => {
            handleDeleteCopy(selectedCopy._id);
            handleMenuClose();
          }}
          sx={{ color: "error.main" }}
        >
          <ListItemIcon>
            <Delete color="error" />
          </ListItemIcon>{" "}
          <ListItemText> Delete Copy </ListItemText>{" "}
        </MenuItem>{" "}
      </Menu>
      {/* Add/Edit Copy Dialog */}{" "}
      <Dialog
        open={copyDialog}
        onClose={() => setCopyDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {" "}
          {editingCopy ? "Edit Copy" : "Add New Copy"}{" "}
        </DialogTitle>{" "}
        <DialogContent>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Copy ID"
                value={copyForm.copyId}
                onChange={(e) =>
                  setCopyForm({ ...copyForm, copyId: e.target.value })
                }
                margin="normal"
                required
                disabled={editingCopy} // Can't change copy ID when editing
              />{" "}
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth margin="normal">
                <InputLabel> Condition </InputLabel>{" "}
                <Select
                  value={copyForm.condition}
                  onChange={(e) =>
                    setCopyForm({ ...copyForm, condition: e.target.value })
                  }
                  label="Condition"
                >
                  {conditions.map((condition) => (
                    <MenuItem key={condition.value} value={condition.value}>
                      {" "}
                      {condition.label}{" "}
                    </MenuItem>
                  ))}{" "}
                </Select>{" "}
              </FormControl>{" "}
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Location"
                value={copyForm.location}
                onChange={(e) =>
                  setCopyForm({ ...copyForm, location: e.target.value })
                }
                margin="normal"
                placeholder="e.g., Shelf A-1, Section B"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Price"
                type="number"
                step="0.01"
                value={copyForm.price}
                onChange={(e) =>
                  setCopyForm({ ...copyForm, price: e.target.value })
                }
                margin="normal"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Acquisition Date"
                type="date"
                value={copyForm.acquisitionDate}
                onChange={(e) =>
                  setCopyForm({ ...copyForm, acquisitionDate: e.target.value })
                }
                margin="normal"
                InputLabelProps={{ shrink: true }}
              />{" "}
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Notes"
                multiline
                rows={3}
                value={copyForm.notes}
                onChange={(e) =>
                  setCopyForm({ ...copyForm, notes: e.target.value })
                }
                margin="normal"
                placeholder="Any additional notes about this copy..."
              />
            </Grid>{" "}
          </Grid>{" "}
        </DialogContent>{" "}
        <DialogActions>
          <Button onClick={() => setCopyDialog(false)}> Cancel </Button>{" "}
          <Button
            onClick={editingCopy ? handleUpdateCopy : handleAddCopy}
            variant="contained"
            disabled={!copyForm.copyId}
          >
            {editingCopy ? "Update Copy" : "Add Copy"}{" "}
          </Button>{" "}
        </DialogActions>{" "}
      </Dialog>{" "}
    </Box>
  );
};

export default BookCopies;
