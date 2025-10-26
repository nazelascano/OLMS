import React, { useState, useEffect } from "react";
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  InputAdornment,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Avatar,
  Alert,
} from "@mui/material";
import { Search, PersonAdd, GetApp, Person } from "@mui/icons-material";
import { useNavigate, useLocation } from "react-router-dom";
import { api, studentsAPI, settingsAPI } from "../../utils/api";
import toast from "react-hot-toast";
import StudentImportDialog from "./StudentImportDialog";
import { ensureUserAttributes } from "../../utils/userAttributes";

const StudentsList = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [userAttributes, setUserAttributes] = useState(() =>
    ensureUserAttributes(),
  );
  const [attributeError, setAttributeError] = useState("");

  const sections = ["A", "B", "C", "D", "E"];
  const gradeOptions = userAttributes.gradeLevels;
  const hasGradeOptions = gradeOptions.length > 0;

  useEffect(() => {
    fetchStudents();
    // Clear the refresh state after fetching
    if (location.state?.refresh) {
      window.history.replaceState({}, document.title);
    }
  }, [location.state?.refresh]);

  useEffect(() => {
    setGradeFilter((previous) => {
      if (!previous) {
        return previous;
      }

      return gradeOptions.includes(previous) ? previous : "";
    });
  }, [gradeOptions]);

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

  const fetchStudents = async () => {
    try {
      setLoading(true);
      const response = await studentsAPI.getAll();
      setStudents(response.data.students || []);
    } catch (error) {
      console.error("Failed to fetch students:", error);
      // Fallback to users API with student filter
      try {
        const response = await api.get("/users", {
          params: { role: "student" },
        });
        const studentsData =
          response.data.users?.map((user) => ({
            ...user,
            grade: user.gradeLevel || "N/A",
            section: user.section || "N/A",
            dues: user.borrowingStats?.totalFines || 0,
            studentId: user.studentNumber || user.studentId || "N/A",
            curriculum: user.curriculum || "N/A",
          })) || [];
        setStudents(studentsData);
      } catch (fallbackError) {
        console.error("Failed to fetch students from users:", fallbackError);
        toast.error("Failed to load students");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStudent = async () => {
    try {
      const studentId =
        selectedStudent._id || selectedStudent.id || selectedStudent.uid;
      await studentsAPI.delete(studentId);
      setStudents(
        students.filter(
          (student) => (student._id || student.id || student.uid) !== studentId,
        ),
      );
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
      setStudents(
        students.map((student) => {
          const currentId = student._id || student.id || student.uid;
          return currentId === studentId ? { ...student, dues: 0 } : student;
        }),
      );
      toast.success("Dues paid successfully");
      setPaymentDialogOpen(false);
      setSelectedStudent(null);
    } catch (error) {
      console.error("Failed to pay dues:", error);
      toast.error("Failed to process payment");
    }
  };

  const handleImportComplete = () => {
    fetchStudents(); // Refresh the student list after import
  };

  const filteredStudents = students.filter((student) => {
    const matchesSearch =
      student.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.studentId?.toString().includes(searchTerm) ||
      student.curriculum?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesGrade = !gradeFilter || student.grade === gradeFilter;
    const matchesSection = !sectionFilter || student.section === sectionFilter;

    return matchesSearch && matchesGrade && matchesSection;
  });

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
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="60vh"
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
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
          sx={{ fontWeight: 600, color: "#1E293B" }}
        >
          Students{" "}
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
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search />
                </InputAdornment>
              ),
            }}
          />{" "}
          <FormControl sx={{ minWidth: 120 }}>
            <InputLabel> Grade </InputLabel>{" "}
            <Select
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              label="Grade"
              disabled={!hasGradeOptions}
            >
              <MenuItem value=""> All Grades </MenuItem>{" "}
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
              )}{" "}
            </Select>{" "}
          </FormControl>{" "}
          <FormControl sx={{ minWidth: 120 }}>
            <InputLabel> Section </InputLabel>{" "}
            <Select
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
              label="Section"
            >
              <MenuItem value=""> All Sections </MenuItem>{" "}
              {sections.map((section) => (
                <MenuItem key={section} value={section}>
                  Section {section}{" "}
                </MenuItem>
              ))}{" "}
            </Select>{" "}
          </FormControl>{" "}
        </Box>{" "}
        {attributeError && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {attributeError}
          </Alert>
        )}
      </Box>
  {/* Students Table */}
      {filteredStudents.length === 0 ? (
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
            <TableHead sx={{ backgroundColor: "#F8FAFC" }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: "#475569" }}>
                  {" "}
                  Grade{" "}
                </TableCell>{" "}
                <TableCell sx={{ fontWeight: 600, color: "#475569" }}>
                  {" "}
                  Student{" "}
                </TableCell>{" "}
                <TableCell sx={{ fontWeight: 600, color: "#475569" }}>
                  {" "}
                  Section{" "}
                </TableCell>{" "}
                <TableCell sx={{ fontWeight: 600, color: "#475569" }}>
                  {" "}
                  Library Card{" "}
                </TableCell>{" "}
                <TableCell sx={{ fontWeight: 600, color: "#475569" }}>
                  {" "}
                  Contact{" "}
                </TableCell>{" "}
                <TableCell sx={{ fontWeight: 600, color: "#475569" }}>
                  {" "}
                  Dues{" "}
                </TableCell>{" "}
                <TableCell
                  align="right"
                  sx={{ fontWeight: 600, color: "#475569" }}
                >
                  {" "}
                  Action{" "}
                </TableCell>{" "}
              </TableRow>{" "}
            </TableHead>{" "}
            <TableBody>
              {" "}
              {filteredStudents.map((student) => (
                <TableRow key={student.uid} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {" "}
                      {student.grade}{" "}
                    </Typography>{" "}
                  </TableCell>{" "}
                  <TableCell>
                    <Box display="flex" alignItems="center" gap={2}>
                      <Avatar
                        sx={{ bgcolor: "primary.main", width: 32, height: 32 }}
                      >
                        {" "}
                        {student.firstName?.[0] || <Person />}{" "}
                      </Avatar>{" "}
                      <Box>
                        <Typography variant="body2" fontWeight="medium">
                          {" "}
                          {student.fullName ||
                            `${student.firstName || ""} ${student.middleName ? student.middleName + " " : ""}${student.lastName || ""}`}{" "}
                        </Typography>{" "}
                        <Typography variant="caption" color="text.secondary">
                          ID: {student.studentId}{" "}
                        </Typography>{" "}
                        {student.email && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            display="block"
                          >
                            {" "}
                            {student.email}{" "}
                          </Typography>
                        )}{" "}
                      </Box>{" "}
                    </Box>{" "}
                  </TableCell>{" "}
                  <TableCell>
                    <Typography variant="body2">
                      {" "}
                      {student.section}{" "}
                    </Typography>{" "}
                  </TableCell>{" "}
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
                        {" "}
                        {student.libraryCardNumber || "Not assigned"}{" "}
                      </Typography>{" "}
                    </Box>{" "}
                  </TableCell>{" "}
                  <TableCell>
                    <Box>
                      {" "}
                      {student.phoneNumber && (
                        <Typography variant="body2" fontSize="0.75rem">
                          {" "}
                          📱 {student.phoneNumber}{" "}
                        </Typography>
                      )}{" "}
                      {student.barangay && student.municipality && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          display="block"
                        >
                          {" "}
                          📍 {student.barangay}, {student.municipality}{" "}
                        </Typography>
                      )}{" "}
                      {student.parentGuardianName && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          display="block"
                        >
                          {" "}
                          👤 {student.parentGuardianName}{" "}
                        </Typography>
                      )}{" "}
                    </Box>{" "}
                  </TableCell>{" "}
                  <TableCell>
                    <Chip
                      label={formatCurrency(student.dues)}
                      size="small"
                      color={getDuesColor(student.dues)}
                      variant={student.dues === 0 ? "outlined" : "filled"}
                    />{" "}
                  </TableCell>{" "}
                  <TableCell align="right">
                    <Box display="flex" gap={1} justifyContent="flex-end">
                      {" "}
                      {student.dues > 0 && (
                        <Button
                          size="small"
                          variant="contained"
                          color="success"
                          onClick={() => {
                            setSelectedStudent(student);
                            setPaymentDialogOpen(true);
                          }}
                          sx={{ fontSize: "0.75rem", px: 2 }}
                        >
                          Pay{" "}
                        </Button>
                      )}{" "}
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() =>
                          navigate(
                            `/students/${student._id || student.id}/edit`,
                          )
                        }
                        sx={{ fontSize: "0.75rem", px: 2 }}
                      >
                        Edit{" "}
                      </Button>{" "}
                      <Button
                        size="small"
                        variant="contained"
                        color="error"
                        onClick={() => {
                          setSelectedStudent(student);
                          setDeleteDialogOpen(true);
                        }}
                        sx={{ fontSize: "0.75rem", px: 2 }}
                      >
                        Delete{" "}
                      </Button>{" "}
                    </Box>{" "}
                  </TableCell>{" "}
                </TableRow>
              ))}{" "}
            </TableBody>{" "}
          </Table>{" "}
        </TableContainer>
      )}
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
  );
};

export default StudentsList;
