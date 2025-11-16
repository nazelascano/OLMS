import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
  Menu,
} from "@mui/material";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import {
  Add as AddIcon,
  AddCircleOutline as AddCircleOutlineIcon,
  ArrowBack as ArrowBackIcon,
  DeleteOutline as DeleteOutlineIcon,
  Search as SearchIcon,
  Visibility as VisibilityIcon,
} from "@mui/icons-material";
import LibraryBooksIcon from "@mui/icons-material/LibraryBooks";
import { FilterList } from "@mui/icons-material";
import toast from "react-hot-toast";
import { annualSetsAPI, booksAPI } from "../../utils/api";

const defaultFilters = {
  academicYear: "",
  gradeLevel: "",
  section: "",
  curriculum: "",
};

const emptySetForm = {
  name: "",
  academicYear: "",
  gradeLevel: "",
  section: "",
  curriculum: "",
  description: "",
  books: [],
};

const buildFilterOptionsFromSets = (sets = []) => {
  const academicYears = new Set();
  const gradeLevels = new Set();
  const sections = new Set();
  const curricula = new Set();

  sets.forEach((set) => {
    if (!set) {
      return;
    }
    const addValue = (collection, value) => {
      if (value === null || value === undefined) {
        return;
      }
      const trimmed = String(value).trim();
      if (trimmed) {
        collection.add(trimmed);
      }
    };

    addValue(academicYears, set.academicYear);
    addValue(gradeLevels, set.gradeLevel);
    addValue(sections, set.section);
    addValue(curricula, set.curriculum);
  });

  const toSortedArray = (collection) =>
    Array.from(collection).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

  return {
    academicYears: toSortedArray(academicYears),
    gradeLevels: toSortedArray(gradeLevels),
    sections: toSortedArray(sections),
    curricula: toSortedArray(curricula),
  };
};

const sanitizeQuery = (query = {}) => {
  return Object.entries(query).reduce((accumulator, [key, value]) => {
    if (value === null || value === undefined) {
      return accumulator;
    }
    if (typeof value === "string" && value.trim() === "") {
      return accumulator;
    }
    accumulator[key] = value;
    return accumulator;
  }, {});
};

const AnnualBorrowing = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [sets, setSets] = useState([]);
  const [filters, setFilters] = useState(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState(defaultFilters);
  const [filterOptions, setFilterOptions] = useState({
    academicYears: [],
    gradeLevels: [],
    sections: [],
    curricula: [],
  });
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [bookOptions, setBookOptions] = useState([]);
  const [isCreateDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptySetForm);
  const [previewInfo, setPreviewInfo] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [issueDialogOpen, setIssueDialogOpen] = useState(false);
  const [issueTargetSet, setIssueTargetSet] = useState(null);
  const [issueContext, setIssueContext] = useState(null);
  const [issueSelections, setIssueSelections] = useState({});
  const [issueStudent, setIssueStudent] = useState(null);
  const [issueNotes, setIssueNotes] = useState("");
  const [issueLoading, setIssueLoading] = useState(false);
  const [issueSubmitting, setIssueSubmitting] = useState(false);
  const [issueStudentInput, setIssueStudentInput] = useState("");
  const [issueStudentQuery, setIssueStudentQuery] = useState("");
  const [scanValue, setScanValue] = useState("");
  const [scanFeedback, setScanFeedback] = useState(null);
  const scanFieldRef = useRef(null);
  const searchDebounceRef = useRef(null);
  const issueContextRef = useRef(null);

  const loadFilterOptions = useCallback(async () => {
    try {
      const { data } = await annualSetsAPI.getAll();
      const setsList = Array.isArray(data) ? data : [];
      setFilterOptions(buildFilterOptionsFromSets(setsList));
    } catch (error) {
      console.error("Failed to load annual set filters", error);
    }
  }, []);

  const fetchSets = useCallback(async (query = {}) => {
    setLoading(true);
    try {
      const sanitizedQuery = sanitizeQuery(query);
      const { data } = await annualSetsAPI.getAll(sanitizedQuery);
      setSets(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to fetch annual sets", error);
      toast.error("Failed to fetch annual borrowing sets");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBooks = async () => {
    try {
      const { data } = await booksAPI.getAll();
      setBookOptions(Array.isArray(data) ? data : data?.books || []);
    } catch (error) {
      console.error("Failed to load books", error);
      toast.error("Failed to load books catalogue");
    }
  };

  useEffect(() => {
    loadBooks();
  }, []);

  useEffect(() => {
    loadFilterOptions();
  }, [loadFilterOptions]);

  useEffect(() => {
    fetchSets({ ...appliedFilters, search: appliedSearch });
  }, [fetchSets, appliedFilters, appliedSearch]);

  const [filterAnchorEl, setFilterAnchorEl] = useState(null);
  const filterMenuOpen = Boolean(filterAnchorEl);
  const openFilterMenu = (event) => setFilterAnchorEl(event.currentTarget);
  const closeFilterMenu = () => setFilterAnchorEl(null);

  useEffect(() => {
    issueContextRef.current = issueContext;
  }, [issueContext]);

  useEffect(() => {
    if (!issueDialogOpen) {
      return;
    }

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    const trimmed = issueStudentInput.trim();
    searchDebounceRef.current = setTimeout(() => {
      setIssueStudentQuery((previous) => (previous === trimmed ? previous : trimmed));
    }, 300);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = null;
      }
    };
  }, [issueStudentInput, issueDialogOpen]);

  useEffect(() => {
    if (!issueDialogOpen || !issueTargetSet) {
      return;
    }

    const preserveSelections = Boolean(issueContextRef.current);
    loadIssueContextData(issueTargetSet.id, issueStudentQuery, { preserveSelections });
  }, [issueDialogOpen, issueTargetSet, issueStudentQuery]);

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const handleResetFilters = () => {
    setFilters({ ...defaultFilters });
    setAppliedFilters({ ...defaultFilters });
  };

  const handleApplyFilters = () => {
    setAppliedFilters({ ...filters });
  };

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    const trimmed = searchInput.trim();
    if (trimmed !== searchInput) {
      setSearchInput(trimmed);
    }
    if (trimmed === appliedSearch) {
      return;
    }
    setAppliedSearch(trimmed);
  };

  const openCreateDialog = () => {
    setCreateForm({ ...emptySetForm });
    setCreateDialogOpen(true);
  };

  const closeCreateDialog = () => {
    setCreateDialogOpen(false);
  };

  const handleCreateFieldChange = (field, value) => {
    setCreateForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddBookEntry = () => {
    setCreateForm((prev) => ({
      ...prev,
      books: [
        ...prev.books,
        {
          bookId: "",
          quantity: 1,
          required: true,
          notes: "",
        },
      ],
    }));
  };

  const handleUpdateBookEntry = (index, field, value) => {
    setCreateForm((prev) => {
      const nextBooks = prev.books.map((entry, idx) =>
        idx === index ? { ...entry, [field]: value } : entry,
      );
      return { ...prev, books: nextBooks };
    });
  };

  const handleRemoveBookEntry = (index) => {
    setCreateForm((prev) => ({
      ...prev,
      books: prev.books.filter((_, idx) => idx !== index),
    }));
  };

  const handleSubmitCreate = async () => {
    if (!createForm.gradeLevel) {
      toast.error("Grade level is required");
      return;
    }
    if (!createForm.academicYear) {
      toast.error("Academic year is required");
      return;
    }
    if (!Array.isArray(createForm.books) || createForm.books.length === 0) {
      toast.error("Add at least one book to the set");
      return;
    }
    if (createForm.books.some((entry) => !entry.bookId)) {
      toast.error("Each entry must reference a book");
      return;
    }

    try {
      const payload = {
        ...createForm,
        books: createForm.books.map((entry) => ({
          ...entry,
          quantity: Number(entry.quantity) || 1,
          required: Boolean(entry.required),
        })),
      };

      await annualSetsAPI.create(payload);
      toast.success("Annual borrowing set created");
      setCreateDialogOpen(false);
      setCreateForm({ ...emptySetForm });
      await Promise.all([
        loadFilterOptions(),
        fetchSets({ ...appliedFilters, search: appliedSearch }),
      ]);
    } catch (error) {
      console.error("Failed to create annual set", error);
      toast.error(error?.response?.data?.message || "Failed to create set");
    }
  };

  const handlePreview = async (set) => {
    setPreviewLoading(true);
    try {
      const { data } = await annualSetsAPI.preview({ setId: set.id });
      setPreviewInfo(data);
    } catch (error) {
      console.error("Failed to preview annual plan", error);
      toast.error("Failed to load preview");
    } finally {
      setPreviewLoading(false);
    }
  };

  const loadIssueContextData = async (setId, query = "", options = {}) => {
    const { preserveSelections = false } = options;

    setIssueLoading(true);

    if (!preserveSelections) {
      setIssueContext(null);
      setIssueSelections({});
      setScanFeedback(null);
      setScanValue("");
    }

    try {
      const params = query ? { q: query } : {};
      const { data } = await annualSetsAPI.getIssueContext(setId, params);

      setIssueContext(data);

      if (preserveSelections) {
        setIssueSelections((previous) => {
          const nextSelections = {};

          (data.entries || []).forEach((entry) => {
            const quantity = Math.max(entry.quantity || 1, 1);
            const existing = Array.isArray(previous?.[entry.entryKey])
              ? [...previous[entry.entryKey]]
              : [];
            const trimmed = existing.slice(0, quantity);

            while (trimmed.length < quantity) {
              const suggestion = (entry.suggestedCopies || []).find((copyId) => !trimmed.includes(copyId));
              trimmed.push(suggestion || "");
            }

            nextSelections[entry.entryKey] = trimmed;
          });

          return nextSelections;
        });
      } else {
        const defaults = {};
        (data.entries || []).forEach((entry) => {
          const quantity = Math.max(entry.quantity || 1, 1);
          const selections = Array.from({ length: quantity }).map((_, index) => entry.suggestedCopies?.[index] || "");
          defaults[entry.entryKey] = selections;
        });
        setIssueSelections(defaults);
      }
    } catch (error) {
      console.error("Failed to load annual set issuance data", error);
      toast.error("Failed to load issuance details");
      if (!preserveSelections) {
        setIssueContext(null);
      }
    } finally {
      setIssueLoading(false);
    }
  };

  const openIssueDialogForSet = (targetSet) => {
    if (!targetSet) {
      return;
    }
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
    setIssueTargetSet(targetSet);
    setIssueDialogOpen(true);
    setIssueStudent(null);
    setIssueStudentInput("");
    setIssueStudentQuery("");
    setIssueNotes("");
    setIssueContext(null);
    setIssueSelections({});
    setScanValue("");
    setScanFeedback(null);
  };

  const closeIssueDialog = () => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
    setIssueDialogOpen(false);
    setIssueTargetSet(null);
    setIssueContext(null);
    setIssueSelections({});
    setIssueStudent(null);
    setIssueStudentInput("");
    setIssueStudentQuery("");
    setIssueNotes("");
    setScanValue("");
    setScanFeedback(null);
    setIssueLoading(false);
    setIssueSubmitting(false);
  };

  const handleCopySelectionChange = (entryKey, slotIndex, value) => {
    const quantity = (issueContext?.entries || []).find((entry) => entry.entryKey === entryKey)?.quantity || 1;

    setIssueSelections((prev) => {
      const current = prev[entryKey] ? [...prev[entryKey]] : [];
      const next = [...current];
      while (next.length < quantity) {
        next.push("");
      }
      next[slotIndex] = value;
      return { ...prev, [entryKey]: next.slice(0, quantity) };
    });
  };

  const getSlotOptions = (entryKey, slotIndex) => {
    const entry = (issueContext?.entries || []).find((item) => item.entryKey === entryKey);
    if (!entry) {
      return [];
    }

    const currentValue = issueSelections[entryKey]?.[slotIndex] || "";
    const used = new Set();
    Object.entries(issueSelections).forEach(([key, values]) => {
      values.forEach((copyId, idx) => {
        if (!copyId) {
          return;
        }
        if (key === entryKey && idx === slotIndex) {
          return;
        }
        used.add(copyId);
      });
    });

    return (entry.availableCopies || []).filter((option) => {
      if (option.copyId === currentValue) {
        return true;
      }
      return !used.has(option.copyId);
    });
  };

  const assignScannedCopy = (rawCopyId) => {
    const trimmed = String(rawCopyId || "").trim();
    if (!trimmed) {
      setScanFeedback({ type: "warning", message: "Scan a copy barcode before assigning." });
      return;
    }

    if (!issueContext || !Array.isArray(issueContext.entries) || issueContext.entries.length === 0) {
      setScanFeedback({ type: "error", message: "Issuance details are not ready yet." });
      return;
    }

    const lowerValue = trimmed.toLowerCase();

    let existingEntryKey = null;
    Object.entries(issueSelections).forEach(([key, values]) => {
      (values || []).forEach((value) => {
        if (value && String(value).toLowerCase() === lowerValue) {
          existingEntryKey = key;
        }
      });
    });

    if (existingEntryKey) {
      const existingEntry = (issueContext.entries || []).find(
        (entry) => entry.entryKey === existingEntryKey,
      );
      setScanFeedback({
        type: "info",
        message: `Copy ${trimmed} is already assigned to ${existingEntry?.book?.title || existingEntry?.bookId || "this annual set"}.`,
      });
      setScanValue("");
      if (scanFieldRef.current) {
        scanFieldRef.current.focus();
      }
      return;
    }

    let matchedEntry = null;
    let matchedCopyId = null;

    for (const entry of issueContext.entries) {
      for (const option of entry.availableCopies || []) {
        if (String(option.copyId).toLowerCase() === lowerValue) {
          matchedEntry = entry;
          matchedCopyId = option.copyId;
          break;
        }
      }
      if (matchedEntry) {
        break;
      }
    }

    if (!matchedEntry) {
      setScanFeedback({ type: "error", message: `Copy ${trimmed} is not available for this annual set.` });
      setScanValue("");
      if (scanFieldRef.current) {
        scanFieldRef.current.focus();
      }
      return;
    }

    const quantity = Math.max(matchedEntry.quantity || 1, 1);
    const currentSelections = issueSelections[matchedEntry.entryKey] || [];

    let slotIndex = currentSelections.findIndex((value) => !value);
    if (slotIndex === -1 && currentSelections.length < quantity) {
      slotIndex = currentSelections.length;
    }

    let replacedCopy = null;

    if (slotIndex === -1 || slotIndex >= quantity) {
      const existingIndex = currentSelections.findIndex(
        (value) => value && String(value).toLowerCase() === lowerValue,
      );
      if (existingIndex !== -1) {
        setScanFeedback({
          type: "info",
          message: `Copy ${matchedCopyId} is already set for ${matchedEntry.book?.title || matchedEntry.bookId}.`,
        });
        setScanValue("");
        if (scanFieldRef.current) {
          scanFieldRef.current.focus();
        }
        return;
      }

      slotIndex = 0;
      replacedCopy = currentSelections[slotIndex] || null;
    }

    handleCopySelectionChange(matchedEntry.entryKey, slotIndex, matchedCopyId);
    setScanFeedback({
      type: replacedCopy ? "info" : "success",
      message: replacedCopy
        ? `Replaced copy ${replacedCopy} with ${matchedCopyId} for ${matchedEntry.book?.title || matchedEntry.bookId}.`
        : `Assigned copy ${matchedCopyId} to ${matchedEntry.book?.title || matchedEntry.bookId}.`,
    });
    setScanValue("");
    if (scanFieldRef.current) {
      scanFieldRef.current.focus();
    }
  };

  const handleScanInputSubmit = (event) => {
    event.preventDefault();
    assignScannedCopy(scanValue);
  };

  const missingRequiredSelections = useMemo(() => {
    if (!issueContext) {
      return false;
    }
    return (issueContext.entries || []).some((entry) => {
      if (entry.required === false) {
        return false;
      }
      const picks = issueSelections[entry.entryKey] || [];
      const filled = picks.filter(Boolean).length;
      return filled < entry.quantity;
    });
  }, [issueContext, issueSelections]);

  const selectedCopyCount = useMemo(() => {
    return Object.values(issueSelections).reduce((total, picks) => {
      if (!Array.isArray(picks)) {
        return total;
      }
      return total + picks.filter(Boolean).length;
    }, 0);
  }, [issueSelections]);

  const handleIssueSubmit = async () => {
    if (!issueTargetSet || !issueContext) {
      return;
    }

    if (!issueStudent?.id) {
      toast.error("Select a student before issuing the set");
      return;
    }

    if (missingRequiredSelections) {
      toast.error("Assign copies for all required books");
      return;
    }

    const payloadItems = [];
    (issueContext.entries || []).forEach((entry) => {
      const picks = issueSelections[entry.entryKey] || [];
      picks.slice(0, entry.quantity).forEach((copyId) => {
        if (copyId) {
          payloadItems.push({ bookId: entry.bookId, copyId });
        }
      });
    });

    if (payloadItems.length === 0) {
      toast.error("Select at least one copy to issue");
      return;
    }

    setIssueSubmitting(true);
    try {
      const { data } = await annualSetsAPI.issue(issueTargetSet.id, {
        studentId: issueStudent.id,
        items: payloadItems,
        notes: issueNotes,
      });

      const dueDateText = data?.transaction?.dueDate
        ? new Date(data.transaction.dueDate).toLocaleDateString()
        : null;
      toast.success(
        `Issued annual set to ${issueStudent.name || "student"}${dueDateText ? ` · Due ${dueDateText}` : ""}`,
      );

      await loadIssueContextData(issueTargetSet.id, issueStudentQuery, {
        preserveSelections: false,
      });
      setIssueStudent(null);
      setIssueNotes("");
      await fetchSets({ ...appliedFilters, search: appliedSearch });
    } catch (error) {
      console.error("Failed to issue annual set", error);
      toast.error(error?.response?.data?.message || "Failed to issue annual set");
    } finally {
      setIssueSubmitting(false);
    }
  };

  const bookOptionsMap = useMemo(() => {
    const map = new Map();
    (bookOptions || []).forEach((book) => {
      const key = book.id || book._id || book.bookId || book.isbn;
      if (key) {
        map.set(String(key), book);
      }
    });
    return map;
  }, [bookOptions]);

  return (
  <Box>
      <Stack spacing={0.5} mb={2}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
          <Stack direction="row" alignItems="center" spacing={2}>
            <IconButton
              aria-label="Go back"
              onClick={() => navigate(-1)}
              sx={{ color: "#0F172A" }}
            >
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="h4" color="white">
              Annual Borrowing Plan
            </Typography>
          </Stack>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={openCreateDialog}
            sx={{ backgroundColor: "#22C55E", "&:hover": { backgroundColor: "#16A34A" } }}
          >
            New Annual Set
          </Button>
        </Stack>
        
        <Typography color="white">
          Define and manage annual book allocations by grade and section.
        </Typography>
      </Stack>
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ flexWrap: "wrap", justifyContent: "space-between", gap: 1, mb: 3 }}
      >
        <Box
          component="form"
          onSubmit={handleSearchSubmit}
          sx={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 2,
            width: "100%",
            flexGrow: 1,
          }}
        >
          <TextField
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search annual sets by name, grade, or year..."
            sx={{ flex: 1, minWidth: 300 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" sx={{ color: "text.secondary" }} />
                </InputAdornment>
              ),
            }}
          />
          <IconButton
            aria-label="Open filters"
            onClick={openFilterMenu}
            size="small"
            sx={{ border: "1px solid #E2E8F0", backgroundColor: "#F8FAFC" }}
          >
            <FilterList />
          </IconButton>
          <Menu
            anchorEl={filterAnchorEl}
            open={filterMenuOpen}
            onClose={closeFilterMenu}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
            PaperProps={{ sx: { p: 2, minWidth: 300 } }}
          >
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <TextField
                label="Academic Year"
                value={filters.academicYear}
                onChange={(event) =>
                  handleFilterChange("academicYear", event.target.value)
                }
                select
                fullWidth
                helperText="Select an academic year"
              >
                <MenuItem value="">
                  <em>All</em>
                </MenuItem>
                {filterOptions.academicYears.map((year) => (
                  <MenuItem key={year} value={year}>
                    {year}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                label="Grade Level"
                value={filters.gradeLevel}
                onChange={(event) =>
                  handleFilterChange("gradeLevel", event.target.value)
                }
                select
                fullWidth
                helperText="Select a grade level"
              >
                <MenuItem value="">
                  <em>All</em>
                </MenuItem>
                {filterOptions.gradeLevels.map((grade) => (
                  <MenuItem key={grade} value={grade}>
                    {grade}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                label="Section"
                value={filters.section}
                onChange={(event) =>
                  handleFilterChange("section", event.target.value)
                }
                select
                fullWidth
                helperText="Select a section"
              >
                <MenuItem value="">
                  <em>All</em>
                </MenuItem>
                {filterOptions.sections.map((section) => (
                  <MenuItem key={section} value={section}>
                    {section}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                label="Curriculum"
                value={filters.curriculum}
                onChange={(event) =>
                  handleFilterChange("curriculum", event.target.value)
                }
                select
                fullWidth
                helperText="Select a curriculum"
              >
                <MenuItem value="">
                  <em>All</em>
                </MenuItem>
                {filterOptions.curricula.map((curriculum) => (
                  <MenuItem key={curriculum} value={curriculum}>
                    {curriculum}
                  </MenuItem>
                ))}
              </TextField>

              <Box display="flex" justifyContent="flex-end" gap={1} mt={1}>
                <Button size="small" onClick={() => { handleResetFilters(); closeFilterMenu(); }}>
                  Clear
                </Button>
                <Button size="small" variant="contained" onClick={() => { handleApplyFilters(); closeFilterMenu(); }}>
                  Apply
                </Button>
              </Box>
            </Box>
          </Menu>
          <Box component="input" type="submit" sx={{ display: "none" }} />
        </Box>
      </Stack>

      {loading ? (
        <Stack
          direction="row"
          justifyContent="center"
          alignItems="center"
          mt={4}
        >
          <CircularProgress />
        </Stack>
      ) : sets.length === 0 ? (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6">No annual sets found</Typography>
            <Typography color="text.secondary" mt={1}>
              Create a new annual borrowing set to plan book allocations for
              each class.
            </Typography>
            <Button
              variant="contained"
              sx={{ mt: 2 }}
              startIcon={<AddIcon />}
              onClick={openCreateDialog}
            >
              Create First Annual Set
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Grid container spacing={2}>
          {sets.map((set) => (
            <Grid item xs={12} sm={6} md={4} key={set.id}>
              <Card
                variant="outlined"
                sx={{ height: "100%", display: "flex", flexDirection: "column" }}
              >
                <CardHeader
                  title={
                    set.name ||
                    `${set.gradeLevel || ""} ${set.section || ""}`.trim() ||
                      "Annual Set"
                  }
                  subheader={`${set.academicYear || ""}  ${
                    set.gradeLevel || "Unassigned"
                  }${set.section ? ` - Section ${set.section}` : ""}`}
                />
                <CardContent sx={{ flexGrow: 1 }}>
                  <Stack spacing={1}>
                    <Typography variant="body2" color="text.secondary">
                      Curriculum: {set.curriculum || "N/A"}
                    </Typography>
                    {set.description && (
                      <Typography variant="body2" color="text.secondary">
                        {set.description}
                      </Typography>
                    )}
                  </Stack>

                  <Divider sx={{ my: 2 }} />

                  <Typography variant="subtitle2" gutterBottom>
                    Planned Titles
                  </Typography>
                  <Stack spacing={0.5}>
                    {(set.books || []).slice(0, 5).map((entry) => {
                      const book =
                        entry.book || bookOptionsMap.get(entry.bookId);
                      return (
                        <Stack
                          direction="row"
                          spacing={1}
                          alignItems="center"
                          key={`${set.id}_${entry.bookId}`}
                        >
                          <Typography variant="body2" sx={{ flexGrow: 1 }}>
                            {book?.title || entry.bookId}
                          </Typography>
                          <Chip size="small" label={`x${entry.quantity || 1}`} />
                          {entry.required !== false ? (
                            <Chip size="small" color="primary" label="Required" />
                          ) : (
                            <Chip size="small" label="Optional" />
                          )}
                        </Stack>
                      );
                    })}
                    {(set.books || []).length > 5 && (
                      <Typography variant="caption" color="text.secondary">
                        +{(set.books || []).length - 5} more title(s)
                      </Typography>
                    )}
                  </Stack>

                  {set.stats && (
                    <Stack direction="row" spacing={1} mt={2}>
                      <Chip label={`Titles: ${set.stats.totalTitles || 0}`} />
                      <Chip
                        label={`Required: ${set.stats.totalRequired || 0}`}
                        color="primary"
                        variant="outlined"
                      />
                      <Chip
                        label={`Copies: ${
                          set.stats.totalQuantity || set.stats.totalCopiesPlanned || 0
                        }`}
                      />
                      <Chip
                        label={`Issued: ${set.issuedCount || 0}`}
                        color="primary"
                        variant="outlined"
                      />
                      <Chip
                        label={`Active: ${set.activeIssues || 0}`}
                        variant="outlined"
                      />
                    </Stack>
                  )}
                </CardContent>
                <CardActions sx={{ justifyContent: "space-between", px: 2, pb: 2 }}>
                  <Button
                    size="small"
                    startIcon={<VisibilityIcon />}
                    onClick={() => handlePreview(set)}
                  >
                    Preview
                  </Button>
                  <Tooltip
                    title={
                      (set.books || []).length > 0
                        ? "Issue this set to a student"
                        : "Add books to this set before issuing"
                    }
                  >
                    <span>
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<LibraryBooksIcon />}
                        onClick={() => openIssueDialogForSet(set)}
                        disabled={(set.books || []).length === 0}
                      >
                        Issue Set
                      </Button>
                    </span>
                  </Tooltip>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      <Dialog
        open={issueDialogOpen}
        onClose={closeIssueDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Issue Annual Set</DialogTitle>
        <DialogContent dividers>
          {issueLoading && !issueContext ? (
            <Stack direction="row" justifyContent="center" alignItems="center" minHeight={160}>
              <CircularProgress />
            </Stack>
          ) : issueContext ? (
            <Stack spacing={3}>
              <Box>
                <Typography variant="h6">
                  {issueContext.set?.name || issueTargetSet?.name || "Annual Set"}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {issueContext.set?.academicYear || issueTargetSet?.academicYear || ""}
                  {issueContext.set?.gradeLevel
                    ? ` · ${issueContext.set.gradeLevel}${issueContext.set.section ? ` - Section ${issueContext.set.section}` : ""}`
                    : ""}
                </Typography>
                {issueContext.set?.description && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {issueContext.set.description}
                  </Typography>
                )}
              </Box>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="flex-start">
                <Box sx={{ flex: 1, width: "100%" }}>
                  <Autocomplete
                    options={issueContext.students || []}
                    value={issueStudent}
                    onChange={(_, newValue) => setIssueStudent(newValue)}
                    inputValue={issueStudentInput}
                    onInputChange={(_, newInputValue = "", reason) => {
                      if (reason === "reset") {
                        setIssueStudentInput(newInputValue || "");
                        return;
                      }
                      setIssueStudentInput(newInputValue);
                    }}
                    loading={issueLoading && Boolean(issueContext)}
                    loadingText="Searching students..."
                    getOptionLabel={(option) =>
                      option?.name
                        ? `${option.name}${option.grade ? ` · ${option.grade}` : ""}${
                            option.section ? ` - ${option.section}` : ""
                          }`
                        : ""
                    }
                    isOptionEqualToValue={(option, value) => option?.id === value?.id}
                    getOptionDisabled={(option) => option.hasActiveBorrowing || option.isActive === false}
                    renderOption={(props, option) => (
                      <li {...props} key={option.id}>
                        <Stack spacing={0.5} sx={{ width: "100%" }}>
                          <Typography variant="body2">
                            {option.name}
                            {option.hasActiveBorrowing ? " (Active)" : ""}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {option.grade || ""} {option.section || ""}
                            {option.libraryCardNumber
                              ? ` · Card ${option.libraryCardNumber}`
                              : ""}
                          </Typography>
                        </Stack>
                      </li>
                    )}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Student"
                        placeholder="Search by name or ID"
                      />
                    )}
                  />
                  {issueLoading && issueContext && (
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }}>
                      <CircularProgress size={16} />
                      <Typography variant="caption" color="text.secondary">
                        Searching students…
                      </Typography>
                    </Stack>
                  )}
                  {(issueContext.students || []).length === 0 && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                      No matching students found for this set.
                    </Typography>
                  )}
                  {issueStudent?.hasActiveBorrowing && (
                    <Alert sx={{ mt: 1 }} severity="warning">
                      This student already has an active issuance for this set.
                    </Alert>
                  )}
                </Box>
                <TextField
                  label="Notes"
                  value={issueNotes}
                  onChange={(event) => setIssueNotes(event.target.value)}
                  placeholder="Optional notes for this issuance"
                  multiline
                  minRows={2}
                  sx={{ flex: 1, width: "100%" }}
                />
              </Stack>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems="flex-start">
                <Chip label={`Copies selected: ${selectedCopyCount}`} />
                <Chip
                  label={`Issued total: ${issueContext.metrics?.issuedCount || 0}`}
                  variant="outlined"
                />
                <Chip
                  label={`Active outstanding: ${issueContext.metrics?.activeIssues || 0}`}
                  color="primary"
                  variant="outlined"
                />
              </Stack>

              <Box
                component="form"
                onSubmit={handleScanInputSubmit}
                sx={{
                  display: "flex",
                  gap: 1,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <TextField
                  label="Scan Copy Barcode"
                  value={scanValue}
                  onChange={(event) => setScanValue(event.target.value)}
                  placeholder="Focus here and scan a copy barcode"
                  inputRef={scanFieldRef}
                  autoComplete="off"
                  sx={{ flexGrow: 1, minWidth: 260 }}
                />
                <Button
                  type="submit"
                  variant="outlined"
                  disabled={!scanValue.trim() || !issueContext}
                >
                  Assign
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setScanValue("");
                    setScanFeedback(null);
                    if (scanFieldRef.current) {
                      scanFieldRef.current.focus();
                    }
                  }}
                >
                  Clear
                </Button>
              </Box>

              <Typography variant="caption" color="text.secondary">
                Barcode scanners act like keyboards: ensure the field above is focused, then scan each
                copy to assign it automatically to the matching title.
              </Typography>

              {scanFeedback && (
                <Alert
                  severity={
                    scanFeedback.type === "success"
                      ? "success"
                      : scanFeedback.type === "warning"
                        ? "warning"
                        : scanFeedback.type === "info"
                          ? "info"
                          : "error"
                  }
                  onClose={() => setScanFeedback(null)}
                >
                  {scanFeedback.message}
                </Alert>
              )}

              {missingRequiredSelections && (
                <Alert severity="warning">
                  Add copies for all required books before issuing this set.
                </Alert>
              )}

              <Stack spacing={2}>
                {(issueContext.entries || []).length === 0 && (
                  <Typography variant="body2" color="text.secondary">
                    This annual set does not have any books configured yet.
                  </Typography>
                )}
                {(issueContext.entries || []).map((entry) => {
                  const selections = issueSelections[entry.entryKey] || [];
                  return (
                    <Card key={entry.entryKey} variant="outlined">
                      <CardContent>
                        <Stack spacing={1.5}>
                          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                            <Box>
                              <Typography variant="subtitle1">
                                {entry.book?.title || entry.bookId}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                {entry.book?.author || entry.book?.isbn || ""}
                              </Typography>
                            </Box>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Chip
                                size="small"
                                label={`${entry.availableCopies.length} available`}
                                color={entry.availableCopies.length > 0 ? "success" : "default"}
                              />
                              {entry.required === false ? (
                                <Chip size="small" label="Optional" />
                              ) : (
                                <Chip size="small" color="primary" variant="outlined" label="Required" />
                              )}
                            </Stack>
                          </Stack>

                          {entry.shortage > 0 && (
                            <Alert severity={entry.required !== false ? "warning" : "info"}>
                              {entry.required !== false
                                ? "Not enough copies available for this title."
                                : "No copies available right now."}
                            </Alert>
                          )}

                          {entry.notes && (
                            <Typography variant="body2" color="text.secondary">
                              {entry.notes}
                            </Typography>
                          )}

                          {Array.from({ length: entry.quantity }).map((_, slotIndex) => {
                            const options = getSlotOptions(entry.entryKey, slotIndex);
                            const currentValue = selections[slotIndex] || "";
                            return (
                              <TextField
                                key={`${entry.entryKey}_${slotIndex}`}
                                label={`Copy ${slotIndex + 1}`}
                                select
                                value={currentValue}
                                onChange={(event) =>
                                  handleCopySelectionChange(entry.entryKey, slotIndex, event.target.value)
                                }
                                disabled={options.length === 0}
                              >
                                <MenuItem value="">
                                  <em>Select copy</em>
                                </MenuItem>
                                {options.map((option) => (
                                  <MenuItem key={option.copyId} value={option.copyId}>
                                    {option.copyId}
                                    {option.location ? ` · ${option.location}` : ""}
                                    {option.condition ? ` (${option.condition})` : ""}
                                  </MenuItem>
                                ))}
                              </TextField>
                            );
                          })}
                        </Stack>
                      </CardContent>
                    </Card>
                  );
                })}
              </Stack>
            </Stack>
          ) : (
            <Typography color="text.secondary">No issuance data available for this set.</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeIssueDialog}>Close</Button>
          <Button
            variant="contained"
            onClick={handleIssueSubmit}
            disabled={
              issueSubmitting ||
              issueLoading ||
              !issueContext ||
              !issueStudent?.id ||
              issueStudent?.hasActiveBorrowing ||
              missingRequiredSelections ||
              selectedCopyCount === 0
            }
          >
            {issueSubmitting ? "Issuing..." : "Issue Set"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={isCreateDialogOpen}
        onClose={closeCreateDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Create Annual Borrowing Set</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField
              label="Set Name"
              value={createForm.name}
              onChange={(event) => handleCreateFieldChange("name", event.target.value)}
              placeholder="e.g. Grade 7 Section A 2025"
              fullWidth
            />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label="Academic Year"
                value={createForm.academicYear}
                onChange={(event) => handleCreateFieldChange("academicYear", event.target.value)}
                placeholder="YYYY-YYYY"
                fullWidth
              />
              <TextField
                label="Grade Level"
                value={createForm.gradeLevel}
                onChange={(event) => handleCreateFieldChange("gradeLevel", event.target.value)}
                placeholder="e.g. Grade 7"
                fullWidth
              />
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label="Section"
                value={createForm.section}
                onChange={(event) => handleCreateFieldChange("section", event.target.value)}
                placeholder="e.g. A"
                fullWidth
              />
              <TextField
                label="Curriculum"
                value={createForm.curriculum}
                onChange={(event) => handleCreateFieldChange("curriculum", event.target.value)}
                placeholder="e.g. Junior High"
                fullWidth
              />
            </Stack>
            <TextField
              label="Description"
              value={createForm.description}
              onChange={(event) => handleCreateFieldChange("description", event.target.value)}
              placeholder="Notes for this annual allocation"
              fullWidth
              multiline
              minRows={2}
            />

            <Stack direction="row" justifyContent="space-between" alignItems="center" mt={1}>
              <Typography variant="h6">Books</Typography>
              <Button startIcon={<AddCircleOutlineIcon />} onClick={handleAddBookEntry}>
                Add Book
              </Button>
            </Stack>

            {createForm.books.length === 0 ? (
              <Typography color="text.secondary">
                No books added yet. Use "Add Book" to get started.
              </Typography>
            ) : (
              <Stack spacing={2}>
                {createForm.books.map((entry, index) => {
                  const selectedBook = bookOptionsMap.get(entry.bookId);
                  return (
                    <Card key={`book-entry-${index}`} variant="outlined">
                      <CardContent>
                        <Stack spacing={2}>
                          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="flex-start">
                            <TextField
                              label="Book"
                              value={entry.bookId}
                              onChange={(event) => handleUpdateBookEntry(index, "bookId", event.target.value)}
                              select
                              fullWidth
                            >
                              <MenuItem value="">
                                <em>Select a book</em>
                              </MenuItem>
                              {bookOptions.map((book) => {
                                const key =
                                  book.id || book._id || book.bookId || book.isbn;
                                return (
                                  <MenuItem key={key} value={String(key)}>
                                    {book.title}
                                  </MenuItem>
                                );
                              })}
                            </TextField>
                            <TextField
                              label="Quantity"
                              type="number"
                              value={entry.quantity}
                              onChange={(event) => handleUpdateBookEntry(index, "quantity", event.target.value)}
                              inputProps={{ min: 1 }}
                              sx={{ width: { xs: "100%", sm: 140 } }}
                            />
                          </Stack>
                          {selectedBook && (
                            <Typography variant="body2" color="text.secondary">
                              Available copies: {Array.isArray(selectedBook.copies)
                                ? selectedBook.copies.filter((copy) => copy.status === "available").length
                                : 0}
                            </Typography>
                          )}
                          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                            <TextField
                              label="Required"
                              value={entry.required ? "required" : "optional"}
                              onChange={(event) =>
                                handleUpdateBookEntry(
                                  index,
                                  "required",
                                  event.target.value === "required",
                                )
                              }
                              select
                              sx={{ width: { xs: "100%", sm: 200 } }}
                            >
                              <MenuItem value="required">Required</MenuItem>
                              <MenuItem value="optional">Optional</MenuItem>
                            </TextField>
                            <TextField
                              label="Notes"
                              value={entry.notes || ""}
                              onChange={(event) => handleUpdateBookEntry(index, "notes", event.target.value)}
                              placeholder="Special instructions"
                              fullWidth
                            />
                            <Tooltip title="Remove book">
                              <IconButton color="error" onClick={() => handleRemoveBookEntry(index)}>
                                <DeleteOutlineIcon />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        </Stack>
                      </CardContent>
                    </Card>
                  );
                })}
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeCreateDialog}>Cancel</Button>
          <Button variant="contained" onClick={handleSubmitCreate}>
            Save Annual Set
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(previewInfo)}
        onClose={() => setPreviewInfo(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Annual Plan Preview</DialogTitle>
        <DialogContent dividers>
          {previewLoading ? (
            <Stack direction="row" justifyContent="center" alignItems="center" minHeight={120}>
              <CircularProgress />
            </Stack>
          ) : previewInfo ? (
            <Stack spacing={2}>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  Academic Year
                </Typography>
                <Typography variant="h6">{previewInfo.academicYear}</Typography>
              </Box>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    Grade Level
                  </Typography>
                  <Typography variant="body1">{previewInfo.gradeLevel || "N/A"}</Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    Section
                  </Typography>
                  <Typography variant="body1">{previewInfo.section || "N/A"}</Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    Curriculum
                  </Typography>
                  <Typography variant="body1">{previewInfo.curriculum || "N/A"}</Typography>
                </Box>
              </Stack>
              <Divider />
              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  Target Set
                </Typography>
                <Typography variant="h6">{previewInfo.targetSet?.name || "Unnamed Set"}</Typography>
                <Typography variant="body2" color="text.secondary" mt={1}>
                  Titles planned: {previewInfo.targetSet?.stats?.totalTitles ||
                    previewInfo.targetSet?.books?.length ||
                    0}
                </Typography>
              </Box>
              <Divider />
              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  Students matched
                </Typography>
                <Typography variant="h5">{previewInfo.studentCount || 0}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Showing up to 10 sample students
                </Typography>
                <Stack spacing={1} mt={2}>
                  {(previewInfo.studentSample || []).map((student) => (
                    <Card key={student.id} variant="outlined">
                      <CardContent>
                        <Typography variant="subtitle1">
                          {student.name || "Unnamed"}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Grade {student.grade || ""}  Section {student.section || ""}
                        </Typography>
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
              </Box>
            </Stack>
          ) : (
            <Typography color="text.secondary">No preview data available.</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewInfo(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AnnualBorrowing;
