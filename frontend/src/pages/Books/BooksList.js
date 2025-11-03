import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Button,
  TextField,
  Card,
  CardContent,
  CardActions,
  Grid,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Fab,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
} from "@mui/material";
import {
  Add,
  Search,
  MoreVert,
  Edit,
  Delete,
  Visibility,
  FilterList,
  CloudUpload,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../utils/api";
import toast from "react-hot-toast";
import BookImportDialog from "./BookImportDialog";
import { PageLoading } from "../../components/Loading";

const BooksList = () => {
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();

  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBook, setSelectedBook] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  // Compact filter menu state
  const [filterAnchorEl, setFilterAnchorEl] = useState(null);
  const filtersOpen = Boolean(filterAnchorEl);
  const handleOpenFilters = (e) => setFilterAnchorEl(e.currentTarget);
  const handleCloseFilters = () => setFilterAnchorEl(null);

  const [categories, setCategories] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState("");

  const fetchBooks = async () => {
    try {
      setLoading(true);
      const response = await api.get("/books");
      setBooks(response.data.books || []);
    } catch (error) {
      console.error("Failed to fetch books:", error);
      toast.error("Failed to load books");
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await api.get("/books/meta/categories");
      if (Array.isArray(res.data)) setCategories(res.data);
    } catch (err) {
      console.error("Failed to fetch book categories:", err);
    }
  };

  useEffect(() => {
    fetchBooks();
    fetchCategories();
  }, []);

  const handleDeleteBook = async () => {
    try {
      await api.delete(`/books/${selectedBook.id}`);
      setBooks((prev) => prev.filter((book) => book.id !== selectedBook.id));
      toast.success("Book deleted successfully");
      setDeleteDialogOpen(false);
      setSelectedBook(null);
    } catch (error) {
      console.error("Failed to delete book:", error);
      toast.error("Failed to delete book");
    }
  };

  const handleMenuClick = (event, book) => {
    setMenuAnchor(event.currentTarget);
    setSelectedBook(book);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    setSelectedBook(null);
  };

  const filteredBooks = books.filter((book) => {
    const matchesText =
      book.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      book.author?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      book.isbn?.includes(searchTerm);
    const matchesCategory = !categoryFilter || (book.category || "") === categoryFilter;
    return matchesText && matchesCategory;
  });

  const getStatusColor = (status) => {
    switch (status) {
      case "available":
        return "success";
      case "borrowed":
        return "warning";
      case "lost":
      case "damaged":
        return "error";
      default:
        return "default";
    }
  };

  if (loading) return <PageLoading message="Loading books..." />;

  const isStudent = user?.role === "student";
  const canManageBooks = hasPermission("books.update") || hasPermission("books.delete");
  const headerTitle = isStudent ? "Browse Books" : "Books Management";

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1" color={"white"}>
          {headerTitle}
        </Typography>

        {hasPermission("books.create") && (
          <Box display="flex" gap={2}>
            <Button
              variant="outlined"
              startIcon={<CloudUpload />}
              onClick={() => setImportDialogOpen(true)}
              sx={{ borderColor: "#22C55E", color: "#22C55E", "&:hover": { backgroundColor: "#22C55E", color: "white" } }}
            >
              Import Books
            </Button>
            <Button variant="contained" startIcon={<Add />} onClick={() => navigate("/books/new")} sx={{ backgroundColor: "#22C55E", "&:hover": { backgroundColor: "#16A34A" } }}>
              Add New Book
            </Button>
          </Box>
        )}
      </Box>

      {/* Search and Filters */}
      <Box mb={3}>
        <Box display="flex" gap={2} flexWrap="wrap" alignItems="center">
          <TextField
            placeholder="Search books by title, author, or ISBN..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            sx={{ flex: 1, minWidth: 300 }}
            InputProps={{ startAdornment: (<InputAdornment position="start"><Search /></InputAdornment>) }}
          />

          <IconButton aria-label="Open filters" onClick={handleOpenFilters} size="small" sx={{ border: "1px solid #E2E8F0", backgroundColor: "#F8FAFC" }}>
            <FilterList />
          </IconButton>

          <Menu anchorEl={filterAnchorEl} open={filtersOpen} onClose={handleCloseFilters} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }} PaperProps={{ sx: { p: 2, minWidth: 220 } }}>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Category</InputLabel>
                <Select value={categoryFilter} label="Category" onChange={(e) => setCategoryFilter(e.target.value)}>
                  <MenuItem value="">All Categories</MenuItem>
                  {categories.map((cat) => (<MenuItem key={cat} value={cat}>{cat}</MenuItem>))}
                </Select>
              </FormControl>

              <Box display="flex" justifyContent="flex-end" gap={1} mt={1}>
                <Button size="small" onClick={() => { setCategoryFilter(""); handleCloseFilters(); }}>Clear</Button>
                <Button size="small" variant="contained" onClick={handleCloseFilters}>Apply</Button>
              </Box>
            </Box>
          </Menu>
        </Box>
      </Box>

      {/* Books Grid */}
      {filteredBooks.length === 0 ? (
        <Box textAlign="center" py={8}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            {searchTerm ? "No books found matching your search" : "No books available"}
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {hasPermission("books.create") && "Start by adding your first book to the library"}
          </Typography>
          {hasPermission("books.create") && (
            <Button variant="contained" startIcon={<Add />} onClick={() => navigate("/books/new")} sx={{ mt: 2 }}>
              Add First Book
            </Button>
          )}
        </Box>
      ) : (
        <Grid container spacing={3}>
          {filteredBooks.map((book) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={book.id}>
              <Card sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
                <CardContent sx={{ flexGrow: 1 }}>
                  <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
                    <Typography variant="h6" component="h2" noWrap>{book.title}</Typography>
                    {canManageBooks ? (
                      <IconButton
                        size="small"
                        onClick={(e) => handleMenuClick(e, book)}
                        aria-label={`Actions for ${book.title}`}
                      >
                        <MoreVert />
                      </IconButton>
                    ) : null}
                  </Box>
                  <Typography variant="body2" color="text.secondary" gutterBottom>by {book.author}</Typography>
                  <Typography variant="body2" gutterBottom>ISBN: {book.isbn}</Typography>
                  <Typography variant="body2" gutterBottom>Category: {book.category}</Typography>
                  <Box display="flex" justifyContent="space-between" alignItems="center" mt={2}>
                    <Chip label={book.status || "available"} size="small" color={getStatusColor(book.status)} />
                    <Typography variant="caption" color="text.secondary">{book.totalCopies || 0} copies</Typography>
                  </Box>
                </CardContent>
                <CardActions>
                  <Button size="small" startIcon={<Visibility />} onClick={() => navigate(`/books/${book.id}`)}>View Details</Button>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Action Menu */}
      {canManageBooks ? (
        <>
          <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={handleMenuClose}>
            {hasPermission("books.update") && (
              <MenuItem
                onClick={() => {
                  navigate(`/books/${selectedBook?.id}/edit`);
                  handleMenuClose();
                }}
              >
                <Edit sx={{ mr: 1 }} /> Edit Book
              </MenuItem>
            )}
            {hasPermission("books.delete") && (
              <MenuItem
                onClick={() => {
                  setDeleteDialogOpen(true);
                  handleMenuClose();
                }}
              >
                <Delete sx={{ mr: 1 }} /> Delete Book
              </MenuItem>
            )}
          </Menu>

          {/* Delete Confirmation Dialog */}
          <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
            <DialogTitle>Delete Book</DialogTitle>
            <DialogContent>
              <Typography>
                Are you sure you want to delete "{selectedBook?.title}" ? This action cannot be undone.
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleDeleteBook} color="error" variant="contained">
                Delete
              </Button>
            </DialogActions>
          </Dialog>
        </>
      ) : null}

      {/* Floating Add Button for Mobile */}
      {hasPermission("books.create") && (
        <Fab color="primary" aria-label="add book" sx={{ position: "fixed", bottom: 16, right: 16, display: { xs: "flex", sm: "none" } }} onClick={() => navigate("/books/new")}>
          <Add />
        </Fab>
      )}

      <BookImportDialog open={importDialogOpen} onClose={() => setImportDialogOpen(false)} onImportComplete={fetchBooks} />
    </Box>
  );
};

export default BooksList;
