import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Paper,
  Alert,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
  LinearProgress,
} from "@mui/material";
import {
  CloudUpload,
  GetApp,
  CheckCircle,
  ErrorOutline,
  WarningAmber,
} from "@mui/icons-material";
import toast from "react-hot-toast";
import { booksAPI, downloadFile } from "../../utils/api";

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

const normalizeHeader = (header) =>
  header.toLowerCase().replace(/[^a-z0-9]/g, "");

const csvToBooks = (text) => {
  const rows = text.split(/\r?\n/).filter((row) => row.trim().length > 0);
  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0].split(",").map((h) => normalizeHeader(h.trim()));

  return rows.slice(1).map((row, index) => {
    const values = row
      .split(",")
      .map((value) => value.trim().replace(/^"|"$/g, ""));

    const book = {
      rowIndex: index + 2,
      title: "",
      author: "",
      isbn: "",
      publisher: "",
      publishedYear: "",
      category: "",
      description: "",
      numberOfCopies: "",
      location: "",
    };

    headers.forEach((header, columnIndex) => {
      const value = values[columnIndex] || "";
      switch (header) {
        case "title":
          book.title = value;
          break;
        case "author":
          book.author = value;
          break;
        case "isbn":
          book.isbn = value;
          break;
        case "publisher":
          book.publisher = value;
          break;
        case "publishedyear":
          book.publishedYear = value;
          break;
        case "category":
          book.category = value;
          break;
        case "description":
          book.description = value;
          break;
        case "numberofcopies":
          book.numberOfCopies = value;
          break;
        case "location":
          book.location = value;
          break;
        default:
          break;
      }
    });

    return book;
  });
};

const validateBook = (book, existingBooksByIsbn, isbnCounts) => {
  const errors = [];
  const warnings = [];
  const normalizedIsbn = (book.isbn || "").trim().toLowerCase();
  const existingBook = normalizedIsbn ? existingBooksByIsbn[normalizedIsbn] : null;

  if (!book.isbn) {
    errors.push("ISBN required");
  }

  if (!existingBook) {
    if (!book.title) {
      errors.push("Title required");
    }
    if (!book.author) {
      errors.push("Author required");
    }
  } else {
    warnings.push("Existing ISBN – copies will be added");
  }

  if (isbnCounts[normalizedIsbn] > 1) {
    errors.push("Duplicate ISBN in CSV file");
  }

  if (book.publishedYear) {
    const year = parseInt(book.publishedYear, 10);
    if (Number.isNaN(year) || `${year}`.length !== 4) {
      errors.push("Invalid published year");
    }
  }
  if (book.numberOfCopies) {
    const copies = parseInt(book.numberOfCopies, 10);
    if (Number.isNaN(copies) || copies < 1) {
      errors.push("Invalid number of copies");
    }
  }

  return { errors, warnings };
};

const buildIsbnCounts = (books) => {
  const counts = {};
  books.forEach((book) => {
    const normalizedIsbn = (book.isbn || "").trim().toLowerCase();
    if (!normalizedIsbn) {
      return;
    }
    counts[normalizedIsbn] = (counts[normalizedIsbn] || 0) + 1;
  });
  return counts;
};

const BookImportDialog = ({ open, onClose, onImportComplete }) => {
  const [file, setFile] = useState(null);
  const [csvBooks, setCsvBooks] = useState([]);
  const [existingBooks, setExistingBooks] = useState([]);
  const [step, setStep] = useState(1);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [importSuccessful, setImportSuccessful] = useState(false);
  const [downloadingBookId, setDownloadingBookId] = useState(null);
  const [isBatchDownloading, setIsBatchDownloading] = useState(false);

  const resetState = () => {
    setFile(null);
    setCsvBooks([]);
    setExistingBooks([]);
    setStep(1);
    setImporting(false);
    setImportResults(null);
    setImportSuccessful(false);
    setDownloadingBookId(null);
    setIsBatchDownloading(false);
  };

  const downloadTemplate = () => {
    const template = `title,author,isbn,publisher,publishedYear,category,description,numberOfCopies,location\nThe Pragmatic Programmer,Andrew Hunt,978-0201616224,Addison-Wesley,1999,Software Development,"Classic developer book",3,main-library`;
    const blob = new Blob([template], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "book_import_template.csv");
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleFileUpload = async (event) => {
    const uploadedFile = event.target.files[0];
    if (!uploadedFile) {
      return;
    }

    if (!uploadedFile.name.endsWith(".csv")) {
      toast.error("Please select a CSV file");
      return;
    }

    setFile(uploadedFile);

    try {
      const existingResponse = await booksAPI.getAll({ limit: 5000 });
      const existing = existingResponse.data.books || [];
      setExistingBooks(existing);

      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        const text = loadEvent.target.result;
        const parsed = csvToBooks(text);
        if (parsed.length === 0) {
          toast.error("No books found in CSV file");
          return;
        }
        setCsvBooks(parsed);
        setStep(2);
      };
      reader.readAsText(uploadedFile);
    } catch (error) {
      console.error("Failed to load books:", error);
      toast.error("Failed to read import file");
    }
  };

  const isbnCounts = buildIsbnCounts(csvBooks);
  const existingBooksByIsbn = existingBooks.reduce((acc, book) => {
    const key = (book.isbn || "").toLowerCase();
    if (key) {
      acc[key] = book;
    }
    return acc;
  }, {});

  const handleImport = async () => {
    setImporting(true);

    try {
      const validBooks = [];
      const invalidBooks = [];
      const warningBooks = [];

      csvBooks.forEach((book) => {
        const { errors, warnings } = validateBook(
          book,
          existingBooksByIsbn,
          isbnCounts,
        );
        if (errors.length > 0) {
          invalidBooks.push({ ...book, errors });
          return;
        }

        const copies = parseInt(book.numberOfCopies, 10);
        const normalizedIsbn = (book.isbn || "").trim().toLowerCase();
        const existingBook = normalizedIsbn
          ? existingBooksByIsbn[normalizedIsbn]
          : null;
        const payload = {
          title: book.title || existingBook?.title || "",
          author: book.author || existingBook?.author || "",
          isbn: book.isbn,
          publisher: book.publisher || existingBook?.publisher || "",
          publishedYear: book.publishedYear || existingBook?.publishedYear || null,
          category: book.category || existingBook?.category || "General",
          description: book.description || existingBook?.description || "",
          numberOfCopies: Number.isNaN(copies) ? 1 : Math.max(copies, 1),
          location: book.location || existingBook?.location || "main-library",
        };

        if (payload.publishedYear) {
          payload.publishedYear = parseInt(payload.publishedYear, 10);
        }

        validBooks.push(payload);

        if (warnings.length > 0) {
          warningBooks.push({
            isbn: payload.isbn,
            title: payload.title,
            warnings,
          });
        }
      });

      if (validBooks.length === 0) {
        toast.error("No valid books to import");
        setImporting(false);
        setImportResults({
          success: 0,
          errors: csvBooks.length,
          invalidBooks,
          warnings: warningBooks,
        });
        setStep(3);
        return;
      }

      const response = await booksAPI.bulkImport(validBooks);
      const importDetails = response.data.results?.details || [];

      setImportResults({
        success: response.data.results?.success || 0,
        errors: response.data.results?.errors || 0,
        details: importDetails,
        invalidBooks,
        warnings: warningBooks,
      });

      autoDownloadBarcodes(importDetails);

      if ((response.data.results?.success || 0) > 0) {
        toast.success(
          `Imported ${response.data.results.success} books successfully`,
        );
        setImportSuccessful(true);
      }

      if (invalidBooks.length > 0 || (response.data.results?.errors || 0) > 0) {
        toast.error("Some books failed to import");
      }

      setStep(3);
    } catch (error) {
      console.error("Failed to import books:", error);
      toast.error("Failed to import books");
    } finally {
      setImporting(false);
    }
  };

  const handleDialogClose = () => {
    const shouldRefresh = importSuccessful;
    resetState();
    onClose();
    if (shouldRefresh && onImportComplete) {
      onImportComplete();
    }
  };

  const handleDownloadBarcodes = async (detail, options = {}) => {
    const { silent = false, skipBusyCheck = false } = options;

    if (!detail?.bookId || !Array.isArray(detail?.copyIds) || detail.copyIds.length === 0) {
      if (!silent) {
        toast.error("No barcode data available");
      }
      return false;
    }

    if (!skipBusyCheck && (isBatchDownloading || downloadingBookId)) {
      if (!silent) {
        toast.error("Another barcode download is in progress");
      }
      return false;
    }

    try {
      setDownloadingBookId(detail.bookId);
      const response = await booksAPI.downloadBarcodes(detail.bookId, {
        copyIds: detail.copyIds,
      });

      const fallbackName = sanitizeFilename(
        `${detail.title || detail.bookId}_${detail.copyIds.length}_barcodes.pdf`,
        "book_barcodes.pdf",
      );
      const filename = extractFilename(
        response.headers?.["content-disposition"],
        fallbackName,
      );
      downloadFile(response.data, filename);
      if (!silent) {
        toast.success(`Barcodes downloaded for ${detail.title || detail.bookId}`);
      }
      return true;
    } catch (error) {
      console.error("Failed to download barcodes:", error);
      if (!silent) {
        toast.error("Failed to download barcode labels");
      }
      return false;
    } finally {
      setDownloadingBookId(null);
    }
  };

  const autoDownloadBarcodes = async (details) => {
    const printable = (details || []).filter(
      (detail) => detail.status === "success" && Array.isArray(detail.copyIds) && detail.copyIds.length > 0,
    );

    if (printable.length === 0) {
      return;
    }

    setIsBatchDownloading(true);
    let successCount = 0;
    let failureCount = 0;

    for (const detail of printable) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await handleDownloadBarcodes(detail, { silent: true, skipBusyCheck: true });
      if (ok) {
        successCount += 1;
      } else {
        failureCount += 1;
      }
    }

    setIsBatchDownloading(false);
    setDownloadingBookId(null);

    if (successCount > 0) {
      const message = successCount === 1
        ? "Barcode labels downloaded automatically"
        : `${successCount} barcode label sets downloaded automatically`;
      toast.success(message);
    }

    if (failureCount > 0) {
      toast.error("Some barcode downloads failed. You can retry from the table below.");
    }
  };

  const renderUploadStep = () => (
    <Box>
      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="body2">
          Upload a CSV file containing your book catalogue. Download the
          template to view the supported columns.
        </Typography>
      </Alert>
      <Box display="flex" gap={2} mb={3}>
        <Button variant="outlined" startIcon={<GetApp />} onClick={downloadTemplate}>
          Download Template
        </Button>
      </Box>
      <Paper
        sx={{
          border: "2px dashed #ccc",
          borderRadius: 2,
          p: 4,
          textAlign: "center",
          cursor: "pointer",
          "&:hover": { borderColor: "#2563EB" },
        }}
        role="button"
        tabIndex={0}
        onClick={() => document.getElementById("book-import-input").click()}
      >
        <CloudUpload aria-hidden="true" sx={{ fontSize: 48, color: "#666", mb: 2 }} />
        <Typography variant="h6" gutterBottom>
          Click or press Enter to upload CSV file
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Only .csv files are supported for bulk import
        </Typography>
        <input
          id="book-import-input"
          type="file"
          accept=".csv"
          aria-label="Upload books CSV"
          style={{ display: "none" }}
          onChange={handleFileUpload}
        />
      </Paper>
      {file && (
        <Typography variant="body2" sx={{ mt: 2 }}>
          Selected file: <strong>{file.name}</strong>
        </Typography>
      )}
    </Box>
  );

  const renderPreviewStep = () => (
      <Box>
        <Alert severity="success" sx={{ mb: 3 }}>
          <Typography variant="body2">
            Found {csvBooks.length} books in the CSV file. Review the data
            before importing.
          </Typography>
        </Alert>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Title</TableCell>
              <TableCell>Author</TableCell>
              <TableCell>ISBN</TableCell>
              <TableCell>Copies</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {csvBooks.map((book, index) => {
              const { errors, warnings } = validateBook(
                book,
                existingBooksByIsbn,
                isbnCounts,
              );
              const isValid = errors.length === 0;
              const hasWarnings = warnings.length > 0;
              const chipProps = isValid
                ? {
                    icon: hasWarnings ? <WarningAmber /> : <CheckCircle />,
                    label: hasWarnings
                      ? warnings.join(", ")
                      : "Ready",
                    color: hasWarnings ? "warning" : "success",
                  }
                : {
                    icon: <ErrorOutline />,
                    label: errors.join(", "),
                    color: "error",
                  };
              return (
                <TableRow key={`${book.isbn}-${index}`}>
                  <TableCell>{book.title}</TableCell>
                  <TableCell>{book.author}</TableCell>
                  <TableCell>{book.isbn}</TableCell>
                  <TableCell>{book.numberOfCopies || 1}</TableCell>
                  <TableCell>
                    <Chip
                      icon={chipProps.icon}
                      label={chipProps.label}
                      color={chipProps.color}
                      size="small"
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <Box display="flex" justifyContent="space-between" mt={3}>
          <Button onClick={() => setStep(1)}>Choose Another File</Button>
          <Button
            variant="contained"
            onClick={handleImport}
            disabled={importing}
          >
            {importing ? "Importing..." : "Import Books"}
          </Button>
        </Box>
        {importing && <LinearProgress sx={{ mt: 2 }} />}
      </Box>
  );

  const renderResultsStep = () => (
    <Box>
      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="body2">
          Import finished. {importResults?.success || 0} success,
          {" "}
          {importResults?.errors || 0} failed.
        </Typography>
      </Alert>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>ISBN</TableCell>
            <TableCell>Title</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Message</TableCell>
            <TableCell align="right">Barcodes</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {(importResults?.details || []).map((detail, index) => (
            <TableRow key={`${detail.isbn || index}-${index}`}>
              <TableCell>{detail.isbn || "N/A"}</TableCell>
              <TableCell>{detail.title || ""}</TableCell>
              <TableCell>
                <Chip
                  label={detail.status === "success" ? "Imported" : "Failed"}
                  color={detail.status === "success" ? "success" : "error"}
                  size="small"
                />
              </TableCell>
              <TableCell>
                <Box display="flex" flexDirection="column" gap={0.5}>
                  <Typography variant="body2">{detail.message}</Typography>
                  {detail.status === "success" && detail.copyIds?.length > 0 && (
                    <Box display="flex" flexWrap="wrap" gap={0.5}>
                      {detail.copyIds.slice(0, 3).map((copyId) => (
                        <Chip key={copyId} label={copyId} size="small" variant="outlined" />
                      ))}
                      {detail.copyIds.length > 3 && (
                        <Chip
                          label={`+${detail.copyIds.length - 3} more`}
                          size="small"
                          variant="outlined"
                        />
                      )}
                    </Box>
                  )}
                </Box>
              </TableCell>
              <TableCell align="right">
                {detail.status === "success" && detail.copyIds?.length > 0 ? (
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<GetApp fontSize="small" />}
                    onClick={() => handleDownloadBarcodes(detail)}
                    disabled={Boolean(downloadingBookId) || isBatchDownloading}
                  >
                    {downloadingBookId === detail.bookId
                      ? "Preparing..."
                      : isBatchDownloading
                        ? "Queued"
                        : "Barcodes"}
                  </Button>
                ) : (
                  <Typography variant="caption" color="text.secondary">
                    -
                  </Typography>
                )}
              </TableCell>
            </TableRow>
          ))}
          {(importResults?.invalidBooks || []).map((book, index) => (
            <TableRow key={`invalid-${book.isbn || index}`}>
              <TableCell>{book.isbn || "N/A"}</TableCell>
              <TableCell>{book.title || ""}</TableCell>
              <TableCell>
                <Chip label="Invalid" color="error" size="small" />
              </TableCell>
              <TableCell>{book.errors?.join(", ")}</TableCell>
              <TableCell align="right">
                <Typography variant="caption" color="text.secondary">
                  -
                </Typography>
              </TableCell>
            </TableRow>
          ))}
          {(importResults?.warnings || []).map((book, index) => (
            <TableRow key={`warning-${book.isbn || index}`}>
              <TableCell>{book.isbn || "N/A"}</TableCell>
              <TableCell>{book.title || ""}</TableCell>
              <TableCell>
                <Chip label="Updated" color="warning" size="small" />
              </TableCell>
              <TableCell>{book.warnings?.join(", ")}</TableCell>
              <TableCell align="right">
                <Typography variant="caption" color="text.secondary">
                  -
                </Typography>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Box mt={3}>
        <Button
          variant="contained"
          onClick={handleDialogClose}
          disabled={isBatchDownloading || Boolean(downloadingBookId)}
        >
          Done
        </Button>
      </Box>
    </Box>
  );

  return (
    <Dialog
      open={open}
      onClose={handleDialogClose}
      fullWidth
      maxWidth="md"
    >
      <DialogTitle>Import Books</DialogTitle>
      <DialogContent dividers>
        {step === 1 && renderUploadStep()}
        {step === 2 && renderPreviewStep()}
        {step === 3 && renderResultsStep()}
      </DialogContent>
      <DialogActions>
        {step !== 3 && (
          <Button onClick={handleDialogClose} disabled={importing}>
            Cancel
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default BookImportDialog;
