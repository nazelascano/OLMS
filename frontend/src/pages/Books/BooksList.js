import React, { useState, useEffect, useCallback } from "react";
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
  TablePagination,
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
  QrCode2,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { api, booksAPI, downloadFile } from "../../utils/api";
import toast from "react-hot-toast";
import BookImportDialog from "./BookImportDialog";
import { PageLoading } from "../../components/Loading";
import MobileScanButton from "../../components/MobileScanButton";
import MobileScanDialog from "../../components/MobileScanDialog";
import { addActionButtonSx, importActionButtonSx, floatingAddFabSx } from "../../theme/actionButtons";

const sanitizeFilename = (value, fallback) => {
  if (!value) {
    return fallback;
  }
  const cleaned = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "_");
  return cleaned.length > 0 ? cleaned : fallback;
};

const extractFilename = (disposition, fallback) => {
  if (!disposition) {
    return fallback;
  }

  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match && utf8Match[1]) {
    try {
      const decoded = decodeURIComponent(utf8Match[1]);
      return sanitizeFilename(decoded, fallback);
    } catch (error) {
      return fallback;
    }
  }

  const quotedMatch = disposition.match(/filename="?([^";]+)"?/i);
  if (quotedMatch && quotedMatch[1]) {
    return sanitizeFilename(quotedMatch[1], fallback);
  }

  return fallback;
};

const BooksList = () => {
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();

  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(12);
  const [totalBooks, setTotalBooks] = useState(0);
  const [selectedBook, setSelectedBook] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [downloadingBookId, setDownloadingBookId] = useState(null);
  const [searchScannerOpen, setSearchScannerOpen] = useState(false);
  const searchInputId = "books-search-input";

  // Compact filter menu state
  const [filterAnchorEl, setFilterAnchorEl] = useState(null);
  const filtersOpen = Boolean(filterAnchorEl);
  const handleOpenFilters = (e) => setFilterAnchorEl(e.currentTarget);
  const handleCloseFilters = () => setFilterAnchorEl(null);

  const [categories, setCategories] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState("");

  const computeAvailableCopies = useCallback((book) => {
    if (Array.isArray(book?.copies) && book.copies.length > 0) {
      const availableCount = book.copies.filter((copy) => {
        if (!copy) return false;
        const status = typeof copy.status === "string" ? copy.status.trim().toLowerCase() : "";
        return status === "available";
      }).length;
      return availableCount;
    }

    if (typeof book?.availableCopies === "number") {
      return book.availableCopies;
    }

    return 0;
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchBooks = useCallback(
    async (override = {}) => {
      const pageToFetch = override.page ?? page;
  const limitToFetch = override.limit ?? rowsPerPage;
  const limitValue = typeof limitToFetch === "string" ? limitToFetch.toLowerCase() : limitToFetch;
  const isAllMode = limitValue === "all" || limitValue === -1;
      const categoryToFetch = override.category ?? categoryFilter;
      const searchToFetch = override.search ?? debouncedSearchTerm;

      try {
        setLoading(true);
        const params = {
          page: isAllMode ? 1 : pageToFetch + 1,
          limit: isAllMode ? "all" : limitToFetch,
        };
        if (categoryToFetch) params.category = categoryToFetch;
        if (searchToFetch) params.search = searchToFetch;

        const response = await booksAPI.getAll(params);
        const payload = response.data || {};
        const bookList = payload.books || payload.data || [];
        const total = payload.total || payload.pagination?.total || bookList.length || 0;

        setBooks(bookList);
        setTotalBooks(total);
      } catch (error) {
        console.error("Failed to fetch books:", error);
        toast.error("Failed to load books");
      } finally {
        setLoading(false);
      }
    },
    [page, rowsPerPage, categoryFilter, debouncedSearchTerm]
  );

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
  }, [fetchBooks]);

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleDeleteBook = async () => {
    if (!selectedBook?.id) {
      toast.error("No book selected for deletion");
      return;
    }

    try {
      await api.delete(`/books/${selectedBook.id}`);
      fetchBooks();
      toast.success("Book deleted successfully");
      setDeleteDialogOpen(false);
      setSelectedBook(null);
    } catch (error) {
      console.error("Failed to delete book:", error);
      const message = error.response?.data?.message || "Failed to delete book";
      toast.error(message);
    }
  };

  const handleMenuClick = (event, book) => {
    setMenuAnchor(event.currentTarget);
    setSelectedBook(book);
  };

  const handleMenuClose = ({ clearSelection = true } = {}) => {
    setMenuAnchor(null);
    if (clearSelection) {
      setSelectedBook(null);
    }
  };

  const downloadBarcodesForBook = async (book) => {
    if (!book) {
      return;
    }

    try {
      setDownloadingBookId(book.id);
      const response = await booksAPI.downloadBarcodes(book.id);

      const fallbackName = sanitizeFilename(
        `${book.title || "book"}_${book.isbn || book.id}_barcodes.pdf`,
        "book_barcodes.pdf",
      );
      const filename = extractFilename(
        response.headers?.["content-disposition"],
        fallbackName,
      );

      downloadFile(response.data, filename);
      toast.success(`Barcode labels downloaded for ${book.title || book.isbn || "book"}`);
    } catch (error) {
      console.error("Failed to download barcodes:", error);
      const message = error.response?.data?.message || "Failed to download barcode labels";
      toast.error(message);
    } finally {
      setDownloadingBookId(null);
    }
  };

  const handleBarcodesMenuClick = async () => {
    const bookToDownload = selectedBook;
    handleMenuClose();
    if (!bookToDownload) {
      return;
    }
    await downloadBarcodesForBook(bookToDownload);
  };

  useEffect(() => {
    setPage(0);
  }, [debouncedSearchTerm, categoryFilter]);

  useEffect(() => {
    if (!loading && books.length === 0 && totalBooks > 0 && page > 0) {
      setPage((prev) => Math.max(prev - 1, 0));
    }
  }, [loading, books.length, totalBooks, page]);

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
  if (loading && books.length === 0) return <PageLoading message="Loading books..." />;

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
              sx={importActionButtonSx}
            >
              Import Books
            </Button>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => navigate("/books/new")}
              sx={addActionButtonSx}
            >
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
            inputProps={{ id: searchInputId }}
            InputProps={{ startAdornment: (<InputAdornment position="start"><Search /></InputAdornment>) }}
          />

          <MobileScanButton
            label="Scan to Search"
            onClick={() => setSearchScannerOpen(true)}
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
      {!loading && totalBooks === 0 ? (
        <Box textAlign="center" py={8}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            {searchTerm ? "No books found matching your search" : "No books available"}
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {hasPermission("books.create") && "Start by adding your first book to the library"}
          </Typography>
          {hasPermission("books.create") && (
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => navigate("/books/new")}
              sx={{ ...addActionButtonSx, mt: 2 }}
            >
              Add First Book
            </Button>
          )}
        </Box>
      ) : (
        <Grid container spacing={3}>
          {books.map((book, index) => {
            const fallbackKey = `book-${index}`;
            const itemKey = book.id || book._id || book.isbn || fallbackKey;
            const availableCopies = computeAvailableCopies(book);
            return (
              <Grid
                item
                xs={12}
                sm={6}
                md={4}
                lg={3}
                key={`${itemKey}-${index}`}
              >
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
                      <Typography variant="caption" color="text.secondary">
                        {availableCopies} available
                      </Typography>
                    </Box>
                  </CardContent>
                  <CardActions>
                    <Button size="small" startIcon={<Visibility />} onClick={() => navigate(`/books/${book.id}`)}>View Details</Button>
                  </CardActions>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      {totalBooks > 0 && (
        <Box display="flex" justifyContent="flex-end" mt={3}>
          <TablePagination
            component="div"
            count={totalBooks}
            page={page}
            rowsPerPage={rowsPerPage}
            onPageChange={(event, newPage) => {
              setPage(newPage);
            }}
            onRowsPerPageChange={(event) => {
              const value = parseInt(event.target.value, 10);
              const nextLimit = Number.isNaN(value) ? rowsPerPage : value;
              setRowsPerPage(nextLimit);
              setPage(0);
            }}
            rowsPerPageOptions={[8, 12, 24, 48, { label: "All", value: -1 }]}
            labelRowsPerPage="Rows per page"
          />
        </Box>
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
            <MenuItem
              onClick={handleBarcodesMenuClick}
              disabled={Boolean(downloadingBookId)}
            >
              <QrCode2 sx={{ mr: 1 }} /> Print Tag
            </MenuItem>
            {hasPermission("books.delete") && (
              <MenuItem
                onClick={() => {
                  setDeleteDialogOpen(true);
                  handleMenuClose({ clearSelection: false });
                }}
              >
                <Delete sx={{ mr: 1 }} /> Delete Book
              </MenuItem>
            )}
          </Menu>

          {/* Delete Confirmation Dialog */}
          <Dialog
            open={deleteDialogOpen}
            onClose={() => {
              setDeleteDialogOpen(false);
              setSelectedBook(null);
            }}
          >
            <DialogTitle>Delete Book</DialogTitle>
            <DialogContent>
              <Typography>
                Are you sure you want to delete "{selectedBook?.title}" ? This action cannot be undone.
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button
                onClick={() => {
                  setDeleteDialogOpen(false);
                  setSelectedBook(null);
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleDeleteBook} color="error" variant="contained">
                Delete
              </Button>
            </DialogActions>
          </Dialog>
        </>
      ) : null}

      {/* Floating Add Button for Mobile */}
      {hasPermission("books.create") && (
        <Fab
          color="primary"
          aria-label="add book"
          sx={{ ...floatingAddFabSx, position: "fixed", bottom: 16, right: 16, display: { xs: "flex", sm: "none" } }}
          onClick={() => navigate("/books/new")}
        >
          <Add />
        </Fab>
      )}

      <MobileScanDialog
        open={searchScannerOpen}
        onClose={() => setSearchScannerOpen(false)}
        onDetected={(value) => setSearchTerm(value || "")}
        title="Scan to Search Books"
        elementId="books-search-qr"
        targetSelector={`#${searchInputId}`}
      />

      <BookImportDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        onImportComplete={() => {
          setPage(0);
          fetchBooks({ page: 0 });
        }}
      />
    </Box>
  );
};

export default BooksList;
