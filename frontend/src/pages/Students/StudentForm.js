import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Box,
  Typography,
  Grid,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Card,
  CardContent,
  Alert,
  IconButton,
  InputAdornment,
  Divider,
} from "@mui/material";
import {
  Save,
  Cancel,
  Person,
  Email,
  Phone,
  School,
  ArrowBack,
} from "@mui/icons-material";
import { useAuth } from "../../contexts/AuthContext";
import { api, studentsAPI, settingsAPI } from "../../utils/api";
import { ensureUserAttributes } from "../../utils/userAttributes";
import { generateLibraryCard, downloadPDF } from "../../utils/pdfGenerator";
import toast from "react-hot-toast";

const StudentForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user } = useAuth();
  const isEditing = Boolean(id);

  const [formData, setFormData] = useState({
    // Library Card Number
    libraryCardNumber: "",

    // Basic Information
    firstName: "",
    lastName: "",
    middleName: "",
    email: "",
    phoneNumber: "",

    // Academic Information
    studentId: "",
    lrn: "", // Learner Reference Number
  grade: "",
  section: "",
  curriculum: "",

    // Address Information
    barangay: "",
    municipality: "",
    province: "",
    fullAddress: "",

    // Parent/Guardian Information
    parentGuardianName: "",
    parentOccupation: "",
    parentAddress: "",
    parentPhone: "",
    parentEmail: "",

    // System fields
    isActive: true,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [validationErrors, setValidationErrors] = useState({});
  const [nextLibraryCard, setNextLibraryCard] = useState("");
  const [userAttributes, setUserAttributes] = useState(() =>
    ensureUserAttributes(),
  );
  const [attributeError, setAttributeError] = useState("");

  const sections = ["A", "B", "C", "D", "E"];

  const gradeOptions = userAttributes.gradeLevels;
  const curriculumOptions = userAttributes.curriculum;
  const hasGradeOptions = gradeOptions.length > 0;
  const hasCurriculumOptions = curriculumOptions.length > 0;

  useEffect(() => {
    if (isEditing) {
      fetchStudent();
    } else {
      fetchNextLibraryCard();
      // Set the libraryCardNumber field for new students
      setFormData((prev) => ({
        ...prev,
        libraryCardNumber: nextLibraryCard,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isEditing, nextLibraryCard]);

  useEffect(() => {
    let isMounted = true;

    const loadAttributes = async () => {
      try {
        const response = await settingsAPI.getUserAttributes();
        if (isMounted) {
          setUserAttributes(ensureUserAttributes(response.data));
          setAttributeError("");
        }
      } catch (attributesError) {
        console.error("Failed to load user attribute options:", attributesError);
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
    setFormData((prev) => {
      const updates = {};

      if (
        prev.grade &&
        gradeOptions.length > 0 &&
        !gradeOptions.includes(prev.grade)
      ) {
        updates.grade = "";
      }

      if (
        prev.curriculum &&
        curriculumOptions.length > 0 &&
        !curriculumOptions.includes(prev.curriculum)
      ) {
        updates.curriculum = "";
      }

      return Object.keys(updates).length > 0 ? { ...prev, ...updates } : prev;
    });
  }, [gradeOptions, curriculumOptions]);

  const fetchNextLibraryCard = async () => {
    try {
      const response = await api.get("/students/next-library-card");
      setNextLibraryCard(response.data.nextCardNumber);
    } catch (error) {
      console.error("Failed to fetch next library card number:", error);
      // Don't show error to user, just use fallback
      setNextLibraryCard("LIB-25-XXXX");
    }
  };

  const fetchStudent = async () => {
    try {
      const response = await studentsAPI.getById(id);
      const studentData = response.data.student || response.data;

      // Populate form with existing student data
      setFormData({
        libraryCardNumber: studentData.libraryCardNumber || "",
        firstName: studentData.firstName || "",
        lastName: studentData.lastName || "",
        middleName: studentData.middleName || "",
        email: studentData.email || "",
        phoneNumber: studentData.phoneNumber || "",
        studentId: studentData.studentId || "",
        lrn: studentData.lrn || "",
  grade: studentData.grade || "",
  section: studentData.section || "",
  curriculum: studentData.curriculum || "",
        barangay: studentData.barangay || "",
        municipality: studentData.municipality || "",
        province: studentData.province || "",
        fullAddress: studentData.fullAddress || "",
        parentGuardianName: studentData.parentGuardianName || "",
        parentOccupation: studentData.parentOccupation || "",
        parentAddress: studentData.parentAddress || "",
        parentPhone: studentData.parentPhone || "",
        parentEmail: studentData.parentEmail || "",
        isActive:
          studentData.isActive !== undefined ? studentData.isActive : true,
      });
    } catch (error) {
      console.error("Failed to fetch student:", error);
      toast.error("Failed to load student data");
      navigate("/students");
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));

    // Clear validation error when user starts typing
    if (validationErrors[name]) {
      setValidationErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }
  };

  const validateForm = () => {
    const errors = {};

    if (!formData.firstName.trim()) errors.firstName = "First name is required";
    if (!formData.lastName.trim()) errors.lastName = "Last name is required";
    if (!formData.studentId.trim()) errors.studentId = "Student ID is required";
    if (!formData.lrn.trim())
      errors.lrn = "LRN (Learner Reference Number) is required";
    if (!formData.grade) errors.grade = "Grade is required";
    if (!formData.section) errors.section = "Section is required";

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (formData.email && !emailRegex.test(formData.email)) {
      errors.email = "Please enter a valid email address";
    }

    if (formData.parentEmail && !emailRegex.test(formData.parentEmail)) {
      errors.parentEmail = "Please enter a valid parent email address";
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!validateForm()) {
      setError("Please fix the validation errors below");
      return;
    }

    try {
      setLoading(true);

      const studentData = {
        ...formData,
        role: "student",
        username: (formData.firstName.charAt(0) + formData.lastName).toLowerCase(), // First letter of first name + surname
      };

      if (isEditing) {
        await studentsAPI.update(id, studentData);
        toast.success("Student updated successfully");
        setTimeout(() => {
          navigate("/students", { state: { refresh: true } });
        }, 1000);
      } else {
        const response = await studentsAPI.create(studentData);
        toast.success("Student created successfully");

        // Generate and download library card
        try {
          const libraryCardPDF = await generateLibraryCard(response.data.student || studentData);
          downloadPDF(libraryCardPDF, `library_card_${studentData.libraryCardNumber}.pdf`);
          toast.success("Library card generated and downloaded");
        } catch (cardError) {
          console.error("Error generating library card:", cardError);
          toast.error("Student created but failed to generate library card");
        }

        setTimeout(() => {
          navigate("/students", { state: { refresh: true } });
        }, 1000);
      }
    } catch (error) {
      setError(error.response?.data?.message || "Failed to save student");
      console.error("Error saving student:", error);
    } finally {
      setLoading(false);
    }
  };

  const canManageStudents =
    user?.role === "admin" ||
    user?.role === "librarian" ||
    user?.role === "staff";

  if (!canManageStudents) {
    return (
      <Box>
        <Alert severity="error">
          Access denied. You don't have permission to manage students.
        </Alert>
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" alignItems="center" mb={3}>
        <IconButton onClick={() => navigate("/students")} sx={{ mr: 2 }}>
          <ArrowBack />
        </IconButton>{" "}
        <Typography
          variant="h4"
          component="h1"
          sx={{ fontWeight: 600, color: "#1E293B" }}
        >
          {" "}
          {isEditing ? "Edit Student" : "Add New Student"}{" "}
        </Typography>{" "}
      </Box>
      {error && (
        <Box sx={{ mb: 3 }}>
          <div role="alert" aria-live="assertive">{error}</div>
        </Box>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 3 }}>
          {" "}
          {success}{" "}
        </Alert>
      )}
      {attributeError && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          {attributeError}
        </Alert>
      )}
      <form onSubmit={handleSubmit}>
        <Grid container spacing={3}>
          {" "}
          {/* Academic Information - At the top */}{" "}
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" mb={3}>
                  <School sx={{ mr: 1, color: "primary.main" }} />{" "}
                  <Typography variant="h6" fontWeight="medium">
                    Academic Information{" "}
                  </Typography>{" "}
                </Box>
                <Grid container spacing={2}>
                  {" "}
                  {/* Display Library Card Number */}{" "}
                  <Grid item xs={12}>
                    {" "}
                    {isEditing ? (
                      <Alert severity="info" sx={{ mb: 1 }}>
                        <Typography variant="body2" sx={{ mb: 0.5 }}>
                          Library Card Number:
                        </Typography>{" "}
                        <Typography
                          variant="h6"
                          sx={{
                            fontFamily: "monospace",
                            fontWeight: "bold",
                            color: "#0288d1",
                            letterSpacing: "1px",
                          }}
                        >
                          {formData.libraryCardNumber || "Not assigned"}{" "}
                        </Typography>{" "}
                      </Alert>
                    ) : (
                      <Alert severity="success" sx={{ mb: 1 }}>
                        <Typography variant="body2" sx={{ mb: 0.5 }}>
                          The following Library Card Number will be assigned:
                        </Typography>{" "}
                        <Typography
                          variant="h6"
                          sx={{
                            fontFamily: "monospace",
                            fontWeight: "bold",
                            color: "#2e7d32",
                            letterSpacing: "1px",
                          }}
                        >
                          {nextLibraryCard || "Loading..."}{" "}
                        </Typography>{" "}
                      </Alert>
                    )}{" "}
                  </Grid>
                  {/* Row 1: LRN and Grade */}{" "}
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="LRN (Learner Reference Number)"
                      name="lrn"
                      value={formData.lrn}
                      onChange={handleChange}
                      error={!!validationErrors.lrn}
                      helperText={
                        validationErrors.lrn ||
                        "This will be used as the student's password"
                      }
                      required
                    />
                  </Grid>{" "}
                  <Grid item xs={12} sm={6}>
                      {hasGradeOptions ? (
                        <TextField
                          fullWidth
                          label="Grade"
                          name="grade"
                          select
                          value={formData.grade}
                          onChange={handleChange}
                          error={!!validationErrors.grade}
                          helperText={validationErrors.grade}
                          required
                        >
                          {gradeOptions.map((grade) => (
                            <MenuItem key={grade} value={grade}>
                              {grade}
                            </MenuItem>
                          ))}
                        </TextField>
                      ) : (
                        <TextField
                          fullWidth
                          label="Grade"
                          name="grade"
                          value={formData.grade}
                          onChange={handleChange}
                          error={!!validationErrors.grade}
                          helperText={validationErrors.grade}
                          placeholder="Enter grade"
                          required
                        />
                      )}
                  </Grid>
                  {/* Row 2: Student ID and Section */}{" "}
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Student ID"
                      name="studentId"
                      value={formData.studentId}
                      onChange={handleChange}
                      error={!!validationErrors.studentId}
                      helperText={validationErrors.studentId}
                      required
                    />
                  </Grid>{" "}
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth error={!!validationErrors.section}>
                      <InputLabel required> Section </InputLabel>{" "}
                      <Select
                        name="section"
                        value={formData.section}
                        onChange={handleChange}
                        label="Section"
                      >
                        {sections.map((section) => (
                          <MenuItem key={section} value={section}>
                            Section {section}{" "}
                          </MenuItem>
                        ))}{" "}
                      </Select>{" "}
                      {validationErrors.section && (
                        <Typography
                          variant="caption"
                          color="error"
                          sx={{ ml: 2, mt: 0.5 }}
                        >
                          {" "}
                          {validationErrors.section}{" "}
                        </Typography>
                      )}{" "}
                    </FormControl>{" "}
                  </Grid>{" "}
                  <Grid item xs={12} sm={6}>
                    {hasCurriculumOptions ? (
                      <TextField
                        select
                        fullWidth
                        label="Curriculum"
                        name="curriculum"
                        value={formData.curriculum}
                        onChange={handleChange}
                        error={!!validationErrors.curriculum}
                        helperText={validationErrors.curriculum}
                      >
                        {curriculumOptions.map((curriculum) => (
                          <MenuItem key={curriculum} value={curriculum}>
                            {curriculum}
                          </MenuItem>
                        ))}
                      </TextField>
                    ) : (
                      <TextField
                        fullWidth
                        label="Curriculum"
                        name="curriculum"
                        value={formData.curriculum}
                        onChange={handleChange}
                        error={!!validationErrors.curriculum}
                        helperText={validationErrors.curriculum}
                        placeholder="Enter curriculum"
                      />
                    )}
                  </Grid>{" "}
                </Grid>{" "}
              </CardContent>{" "}
            </Card>{" "}
          </Grid>
          {/* Student Information */}{" "}
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" mb={3}>
                  <Person sx={{ mr: 1, color: "primary.main" }} />{" "}
                  <Typography variant="h6" fontWeight="medium">
                    Student Information{" "}
                  </Typography>{" "}
                </Box>
                <Grid container spacing={2}>
                  {" "}
                  {/* Name Section */}{" "}
                  <Grid item xs={12}>
                    <Divider sx={{ my: 1 }}>
                      <Typography variant="subtitle2" color="textSecondary">
                        Name{" "}
                      </Typography>{" "}
                    </Divider>{" "}
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      label="Family Name"
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleChange}
                      error={!!validationErrors.lastName}
                      helperText={validationErrors.lastName}
                      required
                    />
                  </Grid>{" "}
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      label="First Name"
                      name="firstName"
                      value={formData.firstName}
                      onChange={handleChange}
                      error={!!validationErrors.firstName}
                      helperText={validationErrors.firstName}
                      required
                    />
                  </Grid>{" "}
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      label="Middle Name"
                      name="middleName"
                      value={formData.middleName}
                      onChange={handleChange}
                    />{" "}
                  </Grid>
                  {/* Contact Information */}{" "}
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleChange}
                      error={!!validationErrors.email}
                      helperText={validationErrors.email}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Email />
                          </InputAdornment>
                        ),
                      }}
                    />{" "}
                  </Grid>{" "}
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Phone"
                      name="phoneNumber"
                      value={formData.phoneNumber}
                      onChange={handleChange}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Phone />
                          </InputAdornment>
                        ),
                      }}
                    />{" "}
                  </Grid>
                  {/* Address Section */}{" "}
                  <Grid item xs={12}>
                    <Divider sx={{ my: 2 }}>
                      <Typography variant="subtitle2" color="textSecondary">
                        Address{" "}
                      </Typography>{" "}
                    </Divider>{" "}
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      label="Barangay"
                      name="barangay"
                      value={formData.barangay}
                      onChange={handleChange}
                    />{" "}
                  </Grid>{" "}
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      label="Municipality"
                      name="municipality"
                      value={formData.municipality}
                      onChange={handleChange}
                    />{" "}
                  </Grid>{" "}
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      label="Province"
                      name="province"
                      value={formData.province}
                      onChange={handleChange}
                    />{" "}
                  </Grid>
                  {/* Parent/Guardian Section */}{" "}
                  <Grid item xs={12}>
                    <Divider sx={{ my: 2 }}>
                      <Typography variant="subtitle2" color="textSecondary">
                        Parent / Guardian Information{" "}
                      </Typography>{" "}
                    </Divider>{" "}
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Parent/Guardian Name"
                      name="parentGuardianName"
                      value={formData.parentGuardianName}
                      onChange={handleChange}
                    />{" "}
                  </Grid>{" "}
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Phone Number"
                      name="parentPhone"
                      value={formData.parentPhone}
                      onChange={handleChange}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Phone />
                          </InputAdornment>
                        ),
                      }}
                    />{" "}
                  </Grid>{" "}
                </Grid>{" "}
              </CardContent>{" "}
            </Card>{" "}
          </Grid>
          {/* Form Actions */}{" "}
          <Grid item xs={12}>
            <Box display="flex" gap={2} justifyContent="flex-end">
              <Button
                variant="outlined"
                onClick={() => navigate("/students")}
                startIcon={<Cancel />}
                disabled={loading}
              >
                Cancel{" "}
              </Button>{" "}
              <Button
                type="submit"
                variant="contained"
                startIcon={<Save />}
                loading={loading}
                disabled={loading}
                sx={{
                  backgroundColor:'#0f5132',
                  color:'#fff',
                  '&:hover':{backgroundColor:'#0c3f28'},
                }}
              >
                {loading
                  ? "Saving..."
                  : isEditing
                    ? "Update Student"
                    : "Create Student"}{" "}
              </Button>{" "}
            </Box>{" "}
          </Grid>{" "}
        </Grid>{" "}
      </form>{" "}
    </Box>
  );
};

export default StudentForm;
