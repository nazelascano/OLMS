import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Box,
  Typography,
  Button,
  TextField,
  Card,
  CardContent,
  Grid,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  Chip,
  IconButton,
  Paper,
  Alert,
  CircularProgress,
  InputAdornment,
  FormHelperText,
} from "@mui/material";
import {
  Save,
  Cancel,
  Add,
  Remove,
  ArrowBack,
  WarningAmber,
} from "@mui/icons-material";
import { useNavigate, useParams } from "react-router-dom";
import { api, booksAPI, downloadFile } from "../../utils/api";
import toast from "react-hot-toast";

const BASE_CATEGORIES = [
  "Fiction",
  "Non-Fiction",
  "Science",
  "Mathematics",
  "History",
  "Literature",
  "Technology",
  "Arts",
  "Religion",
  "Philosophy",
  "Biography",
  "Self-Help",
  "Children",
  "Reference",
  "Textbook",
];

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

const sanitizeCategoryValue = (value) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
};

const BookForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = Boolean(id);

  const [formData, setFormData] = useState({
    title: "",
    author: "",
    isbn: "",
    category: "",
    publisher: "",
    publicationDate: "",
    description: "",
    language: "English",
    pages: "",
    deweyDecimal: "",
    copies: [{ copyId: "", status: "available", location: "" }],
  });

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [duplicateBook, setDuplicateBook] = useState(null);
  const [checkingIsbn, setCheckingIsbn] = useState(false);
  const [prefilledIsbn, setPrefilledIsbn] = useState(null);

  const [categories, setCategories] = useState(() => [...BASE_CATEGORIES]);

  const appendCategoryOption = useCallback((value) => {
    const normalized = sanitizeCategoryValue(value);
    if (!normalized) {
      return;
    }

    setCategories((prev) =>
      prev.includes(normalized) ? prev : [...prev, normalized],
    );
  }, []);

  const categoryOptions = useMemo(() => {
    const seen = new Set();
    return categories.reduce((list, entry) => {
      const normalized = sanitizeCategoryValue(entry);
      if (!normalized || seen.has(normalized)) {
        return list;
      }
      seen.add(normalized);
      list.push(normalized);
      return list;
    }, []);
  }, [categories]);

  const copyStatuses = [
    "available",
    "borrowed",
    "lost",
    "damaged",
    "maintenance",
  ];

  const fetchBook = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get(`/books/${id}`);
      const book = response.data?.book || response.data;
      if (!book) {
        throw new Error("Book payload missing in response");
      }
      setFormData({
        ...book,
        publicationDate: book.publicationDate
          ? book.publicationDate.split("T")[0]
          : "",
        copies:
          book.copies && book.copies.length > 0
            ? book.copies
            : [{ copyId: "", status: "available", location: "" }],
      });
      appendCategoryOption(book.category);
    } catch (error) {
      console.error("Failed to fetch book:", error);
      toast.error("Failed to load book details");
      navigate("/books");
    } finally {
      setLoading(false);
    }
  }, [id, navigate, appendCategoryOption]);

  useEffect(() => {
    if (isEditing) {
      fetchBook();
    }
  }, [isEditing, fetchBook]);

  useEffect(() => {
    if (isEditing) {
      setDuplicateBook(null);
      setPrefilledIsbn(null);
      setCheckingIsbn(false);
      return;
    }

    const trimmedIsbn = formData.isbn.trim();
    if (!trimmedIsbn) {
      setDuplicateBook(null);
      setPrefilledIsbn(null);
      setCheckingIsbn(false);
      return;
    }

    let isActive = true;
    setCheckingIsbn(true);

    const timeoutId = setTimeout(async () => {
      try {
        const response = await booksAPI.getAll({ search: trimmedIsbn, limit: 10 });
        if (!isActive) {
          return;
        }
        const match = (response.data?.books || []).find(
          (book) => (book.isbn || "").toLowerCase() === trimmedIsbn.toLowerCase(),
        );
        setDuplicateBook(match || null);
      } catch (error) {
        if (isActive) {
          setDuplicateBook(null);
        }
      } finally {
        if (isActive) {
          setCheckingIsbn(false);
        }
      }
    }, 400);

    return () => {
      isActive = false;
      clearTimeout(timeoutId);
    };
  }, [formData.isbn, isEditing]);

  useEffect(() => {
    if (!duplicateBook) {
      setPrefilledIsbn(null);
      return;
    }

    if (isEditing || prefilledIsbn === duplicateBook.isbn) {
      return;
    }

    appendCategoryOption(duplicateBook.category);

    setFormData((prev) => ({
      ...prev,
      title: prev.title || duplicateBook.title || "",
      author: prev.author || duplicateBook.author || "",
      category: prev.category || duplicateBook.category || "",
      publisher: prev.publisher || duplicateBook.publisher || "",
      description: prev.description || duplicateBook.description || "",
    }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next.title;
      delete next.author;
      delete next.category;
      return next;
    });
    setPrefilledIsbn(duplicateBook.isbn);
  }, [duplicateBook, isEditing, prefilledIsbn, appendCategoryOption]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }
  };

  const handleCopyChange = (index, field, value) => {
    setFormData((prev) => ({
      ...prev,
      copies: prev.copies.map((copy, i) =>
        i === index ? { ...copy, [field]: value } : copy,
      ),
    }));
  };

  const addCopy = () => {
    setFormData((prev) => ({
      ...prev,
      copies: [
        ...prev.copies,
        { copyId: "", status: "available", location: "" },
      ],
    }));
  };

  const removeCopy = (index) => {
    if (formData.copies.length > 1) {
      setFormData((prev) => ({
        ...prev,
        copies: prev.copies.filter((_, i) => i !== index),
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    const isDuplicateIsbn = Boolean(!isEditing && duplicateBook);

    if (!formData.isbn.trim()) {
      newErrors.isbn = "ISBN is required";
    }

    if (!isDuplicateIsbn) {
      if (!formData.title.trim()) newErrors.title = "Title is required";
      if (!formData.author.trim()) newErrors.author = "Author is required";
      if (!formData.category) newErrors.category = "Category is required";
    }

    if (formData.pages) {
      const parsedPages = parseInt(formData.pages, 10);
      if (Number.isNaN(parsedPages) || parsedPages <= 0) {
        newErrors.pages = "Invalid page count";
      }
    }

    if (formData.copies.length === 0) {
      newErrors.copies = "At least one copy is required";
    }

    const seenCopyIds = new Set();
    formData.copies.forEach((copy, index) => {
      const trimmedCopyId = (copy.copyId || "").trim();
      if (!trimmedCopyId) {
        newErrors[`copy_${index}_id`] = "Copy ID is required";
        return;
      }

      const normalizedCopyId = trimmedCopyId.toUpperCase();
      if (seenCopyIds.has(normalizedCopyId)) {
        newErrors[`copy_${index}_id`] = "Duplicate copy ID";
        return;
      }

      seenCopyIds.add(normalizedCopyId);
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error("Please fix the errors before submitting");
      return;
    }

    setLoading(true);
    try {
      const sanitizedCopies = formData.copies.map((copy) => ({
        copyId: copy.copyId.trim(),
        status: copy.status,
        location: copy.location,
      }));

      const parsedPages = formData.pages ? parseInt(formData.pages, 10) : undefined;

      const requestPayload = {
        title: formData.title.trim(),
        author: formData.author.trim(),
        isbn: formData.isbn.trim(),
        category: formData.category,
        publisher: formData.publisher,
        publicationDate: formData.publicationDate || null,
        description: formData.description,
        language: formData.language,
        pages: Number.isNaN(parsedPages) ? undefined : parsedPages,
        deweyDecimal: formData.deweyDecimal,
        copies: sanitizedCopies,
        numberOfCopies: sanitizedCopies.length,
        location: sanitizedCopies[0]?.location || "main-library",
      };

      if (!requestPayload.title && duplicateBook) {
        requestPayload.title = duplicateBook.title;
      }
      if (!requestPayload.author && duplicateBook) {
        requestPayload.author = duplicateBook.author;
      }
      if (!requestPayload.category && duplicateBook) {
        requestPayload.category = duplicateBook.category;
      }
      if (!requestPayload.publisher && duplicateBook) {
        requestPayload.publisher = duplicateBook.publisher;
      }
      if (!requestPayload.description && duplicateBook) {
        requestPayload.description = duplicateBook.description;
      }

      let barcodeDownloadContext = null;

      if (isEditing) {
        await api.put(`/books/${id}`, requestPayload);
        toast.success("Book updated successfully");
      } else {
        const response = await booksAPI.create(requestPayload);
        const duplicateUpdate = response.data?.duplicate;
        const successMessage =
          response.data?.message ||
          (duplicateUpdate
            ? "Existing book found. Added copies successfully."
            : "Book created successfully");
        toast.success(successMessage);

        const responseCopyIds = Array.isArray(response.data?.copyIds)
          ? response.data.copyIds
          : Array.isArray(response.data?.addedCopyIds)
            ? response.data.addedCopyIds
            : [];

        if (response.data?.bookId && responseCopyIds.length > 0) {
          barcodeDownloadContext = {
            bookId: response.data.bookId,
            copyIds: responseCopyIds,
            title:
              requestPayload.title ||
              duplicateBook?.title ||
              formData.title ||
              "book",
          };
        }
      }

      if (barcodeDownloadContext) {
        try {
          const barcodeResponse = await booksAPI.downloadBarcodes(
            barcodeDownloadContext.bookId,
            { copyIds: barcodeDownloadContext.copyIds },
          );

          const fallbackName = sanitizeFilename(
            `${barcodeDownloadContext.title}_${barcodeDownloadContext.copyIds.length}_barcodes.pdf`,
            "book_barcodes.pdf",
          );
          const filename = extractFilename(
            barcodeResponse.headers?.["content-disposition"],
            fallbackName,
          );
          downloadFile(barcodeResponse.data, filename);
          toast.success("Barcode labels downloaded");
        } catch (downloadError) {
          console.error("Barcode download failed:", downloadError);
          toast.error("Book saved, but barcode download failed");
        }
      }

      navigate("/books");
    } catch (error) {
      console.error("Failed to save book:", error);
      toast.error(error.response?.data?.message || "Failed to save book");
    } finally {
      setLoading(false);
    }
  };

  const isbnHelperText =
    errors.isbn ||
    (duplicateBook && !isEditing
      ? "Existing book detected. Saving will add new copies."
      : checkingIsbn
        ? "Checking ISBN..."
        : "");

  if (isEditing && loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="60vh"
      >
        <Typography> Loading book details... </Typography>{" "}
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
          {isEditing ? "Edit Book" : "Add New Book"}
        </Typography>
      </Box>

      {duplicateBook && !isEditing && (
        <Alert
          severity="warning"
          icon={<WarningAmber fontSize="inherit" />}
          sx={{ mb: 3 }}
        >
          A book with ISBN <strong>{duplicateBook.isbn}</strong> already exists.
          Saving will append {formData.copies.length} additional {formData.copies.length === 1 ? "copy" : "copies"} to "{duplicateBook.title || "existing book"}".
        </Alert>
      )}

      <form onSubmit={handleSubmit}>
        <Grid container spacing={3}>
          {" "}
          {/* Basic Information */}{" "}
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Basic Information{" "}
                </Typography>{" "}
                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Title"
                      name="title"
                      value={formData.title}
                      onChange={handleChange}
                      error={Boolean(errors.title)}
                      helperText={errors.title}
                      required={!duplicateBook || isEditing}
                    />
                  </Grid>{" "}
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Author"
                      name="author"
                      value={formData.author}
                      onChange={handleChange}
                      error={Boolean(errors.author)}
                      helperText={errors.author}
                      required={!duplicateBook || isEditing}
                    />
                  </Grid>{" "}
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="ISBN"
                      name="isbn"
                      value={formData.isbn}
                      onChange={handleChange}
                      error={Boolean(errors.isbn)}
                      helperText={isbnHelperText}
                      InputProps={{
                        endAdornment: checkingIsbn ? (
                          <InputAdornment position="end">
                            <CircularProgress size={18} />
                          </InputAdornment>
                        ) : undefined,
                      }}
                      required
                    />
                  </Grid>{" "}
                  <Grid item xs={12} md={6}>
                    <FormControl
                      fullWidth
                      required={!duplicateBook || isEditing}
                      error={Boolean(errors.category)}
                    >
                      <InputLabel> Category </InputLabel>{" "}
                      <Select
                        name="category"
                        value={formData.category}
                        onChange={handleChange}
                        label="Category"
                      >
                        {categoryOptions.map((category) => (
                          <MenuItem key={category} value={category}>
                            {category}
                          </MenuItem>
                        ))}
                      </Select>
                      {errors.category && (
                        <FormHelperText error>
                          {errors.category}
                        </FormHelperText>
                      )}
                    </FormControl>{" "}
                  </Grid>{" "}
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Publisher"
                      name="publisher"
                      value={formData.publisher}
                      onChange={handleChange}
                    />{" "}
                  </Grid>{" "}
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Publication Date"
                      name="publicationDate"
                      type="date"
                      value={formData.publicationDate}
                      onChange={handleChange}
                      InputLabelProps={{ shrink: true }}
                    />{" "}
                  </Grid>{" "}
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Language"
                      name="language"
                      value={formData.language}
                      onChange={handleChange}
                    />{" "}
                  </Grid>{" "}
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Number of Pages"
                      name="pages"
                      type="number"
                      value={formData.pages}
                      onChange={handleChange}
                      error={Boolean(errors.pages)}
                      helperText={errors.pages}
                    />{" "}
                  </Grid>{" "}
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Description"
                      name="description"
                      multiline
                      rows={3}
                      value={formData.description}
                      onChange={handleChange}
                    />{" "}
                  </Grid>{" "}
                </Grid>{" "}
              </CardContent>{" "}
            </Card>{" "}
          </Grid>
          {/* Copy Management */}{" "}
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Box
                  display="flex"
                  justifyContent="space-between"
                  alignItems="center"
                  mb={2}
                >
                  <Typography variant="h6">
                    Book Copies({formData.copies.length}){" "}
                  </Typography>{" "}
                  <Button
                    startIcon={<Add />}
                    onClick={addCopy}
                    variant="outlined"
                    size="small"
                  >
                    Add Copy{" "}
                  </Button>{" "}
                </Box>
                {errors.copies && (
                  <Typography
                    variant="caption"
                    color="error"
                    sx={{ display: "block", mb: 2 }}
                  >
                    {errors.copies}
                  </Typography>
                )}
                {formData.copies.map((copy, index) => (
                  <Paper key={index} sx={{ p: 2, mb: 2 }}>
                    <Grid container spacing={2} alignItems="center">
                      <Grid item xs={12} md={4}>
                        <TextField
                          fullWidth
                          label="Copy ID"
                          value={copy.copyId}
                          onChange={(e) =>
                            handleCopyChange(index, "copyId", e.target.value)
                          }
                          error={Boolean(errors[`copy_${index}_id`])}
                          helperText={errors[`copy_${index}_id`]}
                          required
                          size="small"
                        />
                      </Grid>{" "}
                      <Grid item xs={12} md={3}>
                        <FormControl fullWidth size="small">
                          <InputLabel> Status </InputLabel>{" "}
                          <Select
                            value={copy.status}
                            onChange={(e) =>
                              handleCopyChange(index, "status", e.target.value)
                            }
                            label="Status"
                          >
                            {copyStatuses.map((status) => (
                              <MenuItem key={status} value={status}>
                                <Chip
                                  label={status}
                                  size="small"
                                  color={
                                    status === "available"
                                      ? "success"
                                      : "default"
                                  }
                                />{" "}
                              </MenuItem>
                            ))}{" "}
                          </Select>{" "}
                        </FormControl>{" "}
                      </Grid>{" "}
                      <Grid item xs={12} md={4}>
                        <TextField
                          fullWidth
                          label="Location/Shelf"
                          value={copy.location}
                          onChange={(e) =>
                            handleCopyChange(index, "location", e.target.value)
                          }
                          size="small"
                        />
                      </Grid>{" "}
                      <Grid item xs={12} md={1}>
                        {" "}
                        {formData.copies.length > 1 && (
                          <IconButton
                            onClick={() => removeCopy(index)}
                            color="error"
                            size="small"
                          >
                            <Remove />
                          </IconButton>
                        )}{" "}
                      </Grid>{" "}
                    </Grid>{" "}
                  </Paper>
                ))}{" "}
              </CardContent>{" "}
            </Card>{" "}
          </Grid>
          {/* Action Buttons */}{" "}
          <Grid item xs={12}>
            <Box display="flex" gap={2} justifyContent="flex-end">
              <Button
                onClick={() => navigate("/books")}
                disabled={loading}
                startIcon={<Cancel />}
              >
                Cancel{" "}
              </Button>{" "}
              <Button
                type="submit"
                variant="contained"
                disabled={loading}
                startIcon={<Save />}
              >
                {loading
                  ? "Saving..."
                  : isEditing
                    ? "Update Book"
                    : "Create Book"}{" "}
              </Button>{" "}
            </Box>{" "}
          </Grid>{" "}
        </Grid>{" "}
      </form>{" "}
    </Box>
  );
};

export default BookForm;
