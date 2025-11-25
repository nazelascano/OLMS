import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  TablePagination,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Avatar,
  Alert,
  IconButton,
  Menu,
  ListItemIcon,
} from "@mui/material";
import {
  Search,
  PersonAdd,
  GetApp,
  Person,
  MoreVert,
  FilterList,
  Edit,
  Print,
  Delete as DeleteIcon,
  Payments,
} from "@mui/icons-material";
import { useNavigate, useLocation } from "react-router-dom";
import { studentsAPI, settingsAPI } from "../../utils/api";
import { resolveEntityAvatar } from "../../utils/media";
import toast from "react-hot-toast";
import StudentImportDialog from "./StudentImportDialog";
import {
  ensureUserAttributes,
  collectAllSections,
  getSectionsForGrade,
} from "../../utils/userAttributes";
import { PageLoading } from "../../components/Loading";
import { generateLibraryCard, downloadPDF } from "../../utils/pdfGenerator";
import MobileScanButton from "../../components/MobileScanButton";
import MobileScanDialog from "../../components/MobileScanDialog";

const StudentsList = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [totalStudents, setTotalStudents] = useState(0);
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [userAttributes, setUserAttributes] = useState(() =>
    ensureUserAttributes(),
  );
  const [attributeError, setAttributeError] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchScannerOpen, setSearchScannerOpen] = useState(false);
  const searchInputId = "students-search-input";

  // Menu state for per-row actions (three-dot vertical menu)
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);
  const [menuStudent, setMenuStudent] = useState(null);

  const handleOpenMenu = (event, student) => {
    setMenuAnchorEl(event.currentTarget);
    setMenuStudent(student);
  };

  const handleCloseMenu = () => {
    setMenuAnchorEl(null);
    setMenuStudent(null);
  };

  const gradeOptions = userAttributes.gradeLevels;
  const gradeStructure = userAttributes.gradeStructure || [];
  const allSections = collectAllSections(gradeStructure);
  const availableSections = gradeFilter
    ? (() => {
        const gradeSpecific = getSectionsForGrade(gradeStructure, gradeFilter);
        return gradeSpecific.length > 0 ? gradeSpecific : allSections;
      })()
    : allSections;
  const hasGradeOptions = gradeOptions.length > 0;
  // Filter menu state
  const [filterAnchorEl, setFilterAnchorEl] = useState(null);
  const filterOpen = Boolean(filterAnchorEl);

  const handleOpenFilters = (e) => setFilterAnchorEl(e.currentTarget);
  const handleCloseFilters = () => setFilterAnchorEl(null);

  useEffect(() => {
    setGradeFilter((previous) => {
      if (!previous) {
        return previous;
      }

      return gradeOptions.includes(previous) ? previous : "";
    });
  }, [gradeOptions]);

  useEffect(() => {
    setSectionFilter((previous) => {
      if (!previous) {
        return previous;
      }
      return availableSections.includes(previous) ? previous : "";
    });
  }, [availableSections]);

  useEffect(() => {
    let isMounted = true;

    const loadAttributes = async () => {
      try {
        const response = await settingsAPI.getUserAttributes();
        if (isMounted) {
          setUserAttributes(ensureUserAttributes(response.data));
          setAttributeError("");
        }
      } catch (error) {
        console.error("Failed to load user attribute options:", error);
        if (isMounted) {
          setUserAttributes(ensureUserAttributes());
          setAttributeError(
            "Failed to load curriculum and grade options. Using defaults.",
          );
        }
      }
    };

    loadAttributes();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchStudents = useCallback(
    async (override = {}) => {
      const pageToFetch = override.page ?? page;
  const limitToFetch = override.limit ?? rowsPerPage;
  const limitValue = typeof limitToFetch === "string" ? limitToFetch.toLowerCase() : limitToFetch;
  const isAllMode = limitValue === "all" || limitValue === -1;
      const gradeToFetch = override.grade ?? gradeFilter;
      const sectionToFetch = override.section ?? sectionFilter;
      const searchToFetch = override.search ?? debouncedSearchTerm;

      try {
        setLoading(true);
        const params = {
          page: isAllMode ? 1 : pageToFetch + 1,
          limit: isAllMode ? "all" : limitToFetch,
        };
        if (gradeToFetch) params.grade = gradeToFetch;
        if (sectionToFetch) params.section = sectionToFetch;
        if (searchToFetch) params.search = searchToFetch;

        const response = await studentsAPI.getAll(params);
        const payload = response.data || {};
        const studentList = payload.students || payload.data || [];
        const total = payload.total || payload.pagination?.total || studentList.length || 0;

        setStudents(studentList);
        setTotalStudents(total);
      } catch (error) {
        console.error("Failed to fetch students:", error);
        toast.error("Failed to load students");
      } finally {
        setLoading(false);
      }
    },
    [page, rowsPerPage, gradeFilter, sectionFilter, debouncedSearchTerm]
  );

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  useEffect(() => {
    if (location.state?.refresh) {
      fetchStudents({ page: 0 });
      window.history.replaceState({}, document.title);
    }
  }, [location.state?.refresh, fetchStudents]);

  const handleDeleteStudent = async () => {
    try {
      const studentId =
        selectedStudent._id || selectedStudent.id || selectedStudent.uid;
      await studentsAPI.delete(studentId);
      fetchStudents();
      toast.success("Student deleted successfully");
      setDeleteDialogOpen(false);
      setSelectedStudent(null);
    } catch (error) {
      console.error("Failed to delete student:", error);
      toast.error("Failed to delete student");
    }
  };

  const handlePayDues = async () => {
    try {
      const studentId =
        selectedStudent._id || selectedStudent.id || selectedStudent.uid;
      await studentsAPI.payDues(studentId, { amount: selectedStudent.dues });
      fetchStudents();
      toast.success("Dues paid successfully");
      setPaymentDialogOpen(false);
      setSelectedStudent(null);
    } catch (error) {
      console.error("Failed to pay dues:", error);
      toast.error("Failed to process payment");
    }
  };

  const getStudentEntityId = (studentRecord = {}) =>
    studentRecord._id ||
    studentRecord.id ||
    studentRecord.uid ||
    studentRecord.userId;

  const handleNavigateToProfile = (student) => {
    if (!student) {
      return;
    }

    const studentId = getStudentEntityId(student);
    if (!studentId) {
      console.warn("Missing student identifier for profile navigation", student);
      toast.error("Cannot open profile for this student");
      return;
    }

    navigate(`/students/${studentId}`);
  };

  const handlePrintCard = async (student) => {
    try {
      toast.loading("Generating library card...");
      const libraryCardPDF = await generateLibraryCard(student);
      downloadPDF(libraryCardPDF, `library_card_${student.libraryCardNumber}.pdf`);
      toast.dismiss();
      toast.success("Library card generated successfully!");
    } catch (error) {
      toast.dismiss();
      toast.error("Failed to generate library card");
      console.error("Error generating library card:", error);
    }
  };

  const handleImportComplete = () => {
    fetchStudents();
  };

  useEffect(() => {
    setPage(0);
  }, [debouncedSearchTerm, gradeFilter, sectionFilter]);

  useEffect(() => {
    if (!loading && students.length === 0 && totalStudents > 0 && page > 0) {
      setPage((prev) => Math.max(prev - 1, 0));
    }
  }, [loading, students.length, totalStudents, page]);

  const getDuesColor = (dues) => {
    if (dues === 0) return "success";
    if (dues > 0 && dues <= 100) return "warning";
    return "error";
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
    }).format(amount || 0);
  };

  if (loading) {
    return <PageLoading message="Loading students..." />;
  }

  return (
    <main>
      <Box>
      {/* Header */}
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={3}
      >
        <Typography
          variant="h4"
          component="h1"
          sx={{ fontWeight: 600, color: "#ffffffff" }}
        >
          Students Management{" "}
        </Typography>{" "}
        <Box display="flex" gap={2}>
          <Button
            variant="outlined"
            startIcon={<GetApp />}
            onClick={() => {
              setImportDialogOpen(true);
            }}
            sx={{
              borderColor: "#22C55E",
              color: "#22C55E",
              "&:hover": { backgroundColor: "#22C55E", color: "white" },
            }}
          >
            Import{" "}
          </Button>{" "}
          <Button
            variant="contained"
            startIcon={<PersonAdd />}
            onClick={() => {
              navigate("/students/new");
            }}
            sx={{
              backgroundColor: "#22C55E",
              "&:hover": { backgroundColor: "#16A34A" },
            }}
          >
            Add Student{" "}
          </Button>{" "}
        </Box>{" "}
      </Box>
  {/* Search and Filters */}
      <Box mb={3}>
        <Box display="flex" gap={2} flexWrap="wrap" alignItems="center">
          <TextField
            placeholder="Search Students"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            sx={{ flex: 1, minWidth: 300 }}
            inputProps={{ id: searchInputId }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search />
                </InputAdornment>
              ),
            }}
          />
          <MobileScanButton
            label="Scan to Search"
            onClick={() => setSearchScannerOpen(true)}
          />
          {/* Compact filter icon that opens a pop-up menu containing Grade and Section filters */}
          <IconButton
            aria-label="Open filters"
            onClick={handleOpenFilters}
            size="small"
            sx={{ border: "1px solid #E2E8F0", backgroundColor: "#F8FAFC" }}
          >
            <FilterList />
          </IconButton>

          <Menu
            anchorEl={filterAnchorEl}
            open={filterOpen}
            onClose={handleCloseFilters}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
            PaperProps={{ sx: { p: 2, minWidth: 220 } }}
          >
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <FormControl fullWidth size="small">
                <InputLabel> Grade </InputLabel>
                <Select
                  value={gradeFilter}
                  onChange={(e) => setGradeFilter(e.target.value)}
                  label="Grade"
                  disabled={!hasGradeOptions}
                >
                  <MenuItem value=""> All Grades </MenuItem>
                  {hasGradeOptions ? (
                    gradeOptions.map((grade) => (
                      <MenuItem key={grade} value={grade}>
                        {grade}
                      </MenuItem>
                    ))
                  ) : (
                    <MenuItem value="" disabled>
                      No grade options available
                    </MenuItem>
                  )}
                </Select>
              </FormControl>

              <FormControl fullWidth size="small">
                <InputLabel> Section </InputLabel>
                <Select
                  value={sectionFilter}
                  onChange={(e) => setSectionFilter(e.target.value)}
                  label="Section"
                  disabled={availableSections.length === 0}
                >
                  <MenuItem value=""> All Sections </MenuItem>
                  {availableSections.length === 0 ? (
                    <MenuItem value="" disabled>
                      No sections configured
                    </MenuItem>
                  ) : (
                    availableSections.map((section) => (
                      <MenuItem key={section} value={section}>
                        Section {section}
                      </MenuItem>
                    ))
                  )}
                </Select>
              </FormControl>

              <Box display="flex" justifyContent="flex-end" gap={1} mt={1}>
                <Button
                  size="small"
                  onClick={() => {
                    setGradeFilter("");
                    setSectionFilter("");
                    handleCloseFilters();
                  }}
                >
                  Clear
                </Button>
                <Button size="small" variant="contained" onClick={handleCloseFilters}>
                  Apply
                </Button>
              </Box>
            </Box>
          </Menu>
        </Box>
        {attributeError && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {attributeError}
          </Alert>
        )}
      </Box>
  {/* Students Table */}
      {!loading && totalStudents === 0 ? (
        <Box textAlign="center" py={8}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            {" "}
            {searchTerm || gradeFilter || sectionFilter
              ? "No students found matching your criteria"
              : "No students available"}{" "}
          </Typography>{" "}
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {" "}
            {!searchTerm &&
              !gradeFilter &&
              !sectionFilter &&
              "Start by adding your first student to the system"}{" "}
          </Typography>{" "}
          {!searchTerm && !gradeFilter && !sectionFilter && (
            <Button
              variant="contained"
              startIcon={<PersonAdd />}
              onClick={() => navigate("/students/new")}
              sx={{
                mt: 2,
                backgroundColor: "#22C55E",
                "&:hover": { backgroundColor: "#16A34A" },
              }}
            >
              Add First Student{" "}
            </Button>
          )}{" "}
        </Box>
      ) : (
        <TableContainer
          component={Paper}
          sx={{ boxShadow: "0 4px 20px rgba(0, 0, 0, 0.08)" }}
        >
          <Table>
            <caption>Students List</caption>
            <TableHead sx={{ backgroundColor: "#F8FAFC" }}>
              <TableRow>
                <TableCell scope="col" sx={{ fontWeight: 600, color: "#475569" }}>
                  Grade
                </TableCell>
                <TableCell scope="col" sx={{ fontWeight: 600, color: "#475569" }}>
                  Student
                </TableCell>
                <TableCell scope="col" sx={{ fontWeight: 600, color: "#475569" }}>
                  Section
                </TableCell>
                <TableCell scope="col" sx={{ fontWeight: 600, color: "#475569" }}>
                  Library Card
                </TableCell>
                <TableCell scope="col" sx={{ fontWeight: 600, color: "#475569" }}>
                  Contact
                </TableCell>
                <TableCell scope="col" sx={{ fontWeight: 600, color: "#475569" }}>
                  Dues
                </TableCell>
                <TableCell scope="col" align="right" sx={{ fontWeight: 600, color: "#475569" }}>
                  Action
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {students.map((student) => {
                const avatarSrc = resolveEntityAvatar(student);
                const fallbackInitial = [student.firstName, student.lastName, student.username, student.email]
                  .map((value) => (typeof value === "string" && value.trim() ? value.trim().charAt(0).toUpperCase() : ""))
                  .find(Boolean);
                const avatarAlt = student.fullName ||
                  [student.firstName, student.lastName]
                    .filter((value) => typeof value === "string" && value.trim())
                    .join(" ") ||
                  student.username ||
                  student.studentId ||
                  "Student avatar";

                return (
                  <TableRow
                    key={student._id || student.id || student.uid || student.studentId}
                    hover
                    onDoubleClick={() => handleNavigateToProfile(student)}
                    sx={{ cursor: "pointer" }}
                  >
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">
                        {student.grade}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={2}>
                        <Avatar
                          src={avatarSrc || undefined}
                          alt={avatarAlt}
                          sx={{
                            bgcolor: avatarSrc ? "transparent" : "primary.main",
                            color: avatarSrc ? "inherit" : "primary.contrastText",
                            width: 32,
                            height: 32,
                          }}
                        >
                          {fallbackInitial || <Person fontSize="small" />}
                        </Avatar>
                        <Box>
                          <Typography variant="body2" fontWeight="medium">
                            {student.fullName ||
                              `${student.firstName || ""} ${student.middleName ? student.middleName + " " : ""}${student.lastName || ""}`}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            ID: {student.studentId}
                          </Typography>
                          {student.email && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              display="block"
                            >
                              {student.email}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {student.section}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box>
                      <Typography
                        variant="body2"
                        fontWeight="bold"
                        sx={{
                          color: student.libraryCardNumber
                            ? "#1976d2"
                            : "#9e9e9e",
                          fontFamily: "monospace",
                          fontSize: "0.875rem",
                        }}
                      >
                        {student.libraryCardNumber || "Not assigned"}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box>
                      {student.phoneNumber && (
                        <Typography variant="body2" fontSize="0.75rem">
                          📱 {student.phoneNumber}
                        </Typography>
                      )}
                      {student.barangay && student.municipality && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          display="block"
                        >
                          📍 {student.barangay}, {student.municipality}
                        </Typography>
                      )}
                      {student.parentGuardianName && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          display="block"
                        >
                          👤 {student.parentGuardianName}
                        </Typography>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={formatCurrency(student.dues)}
                      size="small"
                      color={getDuesColor(student.dues)}
                      variant={student.dues === 0 ? "outlined" : "filled"}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Box display="flex" justifyContent="flex-end">
                      <IconButton
                        size="small"
                        onClick={(e) => handleOpenMenu(e, student)}
                        onDoubleClick={(event) => event.stopPropagation()}
                        aria-controls={menuAnchorEl ? "student-action-menu" : undefined}
                        aria-haspopup="true"
                        aria-expanded={Boolean(menuAnchorEl)}
                      >
                        <MoreVert />
                      </IconButton>

                      <Menu
                        anchorEl={menuAnchorEl}
                        open={
                          Boolean(menuAnchorEl) &&
                          (menuStudent
                            ? (menuStudent._id || menuStudent.id || menuStudent.uid || menuStudent.studentId) ===
                              (student._id || student.id || student.uid || student.studentId)
                            : false)
                        }
                        onClose={handleCloseMenu}
                        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                        transformOrigin={{ vertical: "top", horizontal: "right" }}
                      >
                        {student.dues > 0 && (
                          <MenuItem
                            onClick={() => {
                              setSelectedStudent(student);
                              setPaymentDialogOpen(true);
                              handleCloseMenu();
                            }}
                          >
                            <ListItemIcon>
                              <Payments fontSize="small" />
                            </ListItemIcon>
                            Pay Dues
                          </MenuItem>
                        )}

                        {student.libraryCardNumber && (
                          <MenuItem
                            onClick={() => {
                              handlePrintCard(student);
                              handleCloseMenu();
                            }}
                          >
                            <ListItemIcon>
                              <Print fontSize="small" />
                            </ListItemIcon>
                            Print Card
                          </MenuItem>
                        )}

                        <MenuItem
                          onClick={() => {
                            navigate(`/students/${student._id || student.id}/edit`);
                            handleCloseMenu();
                          }}
                        >
                          <ListItemIcon>
                            <Edit fontSize="small" />
                          </ListItemIcon>
                          Edit
                        </MenuItem>

                        <MenuItem
                          onClick={() => {
                            setSelectedStudent(student);
                            setDeleteDialogOpen(true);
                            handleCloseMenu();
                          }}
                        >
                          <ListItemIcon>
                            <DeleteIcon fontSize="small" />
                          </ListItemIcon>
                          Delete
                        </MenuItem>
                      </Menu>
                    </Box>
                  </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={totalStudents}
            page={page}
            onPageChange={(event, newPage) => {
              setPage(newPage);
            }}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(event) => {
              const value = parseInt(event.target.value, 10);
              const nextLimit = Number.isNaN(value) ? 10 : value;
              setRowsPerPage(nextLimit);
              setPage(0);
            }}
            rowsPerPageOptions={[10, 25, 50, 100, { label: "All", value: -1 }]}
            labelRowsPerPage="Rows per page"
            sx={{ borderTop: "1px solid", borderColor: "divider" }}
          />
        </TableContainer>
      )}
      <MobileScanDialog
        open={searchScannerOpen}
        onClose={() => setSearchScannerOpen(false)}
        onDetected={(value) => setSearchTerm(value || "")}
        title="Scan to Search Students"
        elementId="students-search-qr"
        targetSelector={`#${searchInputId}`}
      />
  {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle> Delete Student </DialogTitle>{" "}
        <DialogContent>
          <Typography>
            Are you sure you want to delete student "
            {selectedStudent?.firstName} {selectedStudent?.lastName}" ? This
            action cannot be undone and will remove all associated data.{" "}
          </Typography>{" "}
        </DialogContent>{" "}
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}> Cancel </Button>{" "}
          <Button
            onClick={handleDeleteStudent}
            color="error"
            variant="contained"
          >
            Delete{" "}
          </Button>{" "}
        </DialogActions>{" "}
      </Dialog>
  {/* Payment Confirmation Dialog */}
      <Dialog
        open={paymentDialogOpen}
        onClose={() => setPaymentDialogOpen(false)}
      >
        <DialogTitle> Pay Dues </DialogTitle>{" "}
        <DialogContent>
          <Typography>
            Confirm payment of {formatCurrency(selectedStudent?.dues)}
            for student "{selectedStudent?.firstName}{" "}
            {selectedStudent?.lastName}" ?
          </Typography>{" "}
        </DialogContent>{" "}
        <DialogActions>
          <Button onClick={() => setPaymentDialogOpen(false)}> Cancel </Button>{" "}
          <Button onClick={handlePayDues} color="success" variant="contained">
            Pay Dues{" "}
          </Button>{" "}
        </DialogActions>{" "}
      </Dialog>
  {/* Import Students Dialog */}
      <StudentImportDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        onImportComplete={handleImportComplete}
      />{" "}
    </Box>
    </main>
  );
};

export default StudentsList;
