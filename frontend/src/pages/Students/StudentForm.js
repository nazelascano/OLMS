import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import {
  Box,
  Typography,
  Grid,
  TextField,
  Button,
  MenuItem,
  Card,
  CardContent,
  Alert,
  IconButton,
  InputAdornment,
  Divider,
  Autocomplete,
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
import {
  ensureUserAttributes,
  getSectionsForGrade,
  collectAllSections,
} from "../../utils/userAttributes";
import { generateLibraryCard, downloadPDF } from "../../utils/pdfGenerator";
import toast from "react-hot-toast";
import {
  getProvinces,
  getMunicipalities,
  getBarangays,
} from "../../utils/addressService";

const PHONE_FIELD_NAMES = new Set(["phoneNumber", "parentPhone"]);
const LRN_MAX_LENGTH = 12;

const sanitizePhoneInput = (value = "") =>
  String(value ?? "").replace(/\D/g, "").slice(0, 11);

const sanitizeLrnInput = (value = "") =>
  String(value ?? "")
    .replace(/\D/g, "")
    .slice(0, LRN_MAX_LENGTH);

const StudentForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();
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
    lrn: "", // Learner Reference Number
  grade: "",
  section: "",
  curriculum: "",

    // Address Information
    streetAddress: "",
    barangay: "",
    barangayCode: "",
    municipality: "",
    municipalityCode: "",
    province: "",
    provinceCode: "",
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

  const gradeOptions = userAttributes.gradeLevels;
  const gradeStructure = useMemo(
    () => userAttributes.gradeStructure || [],
    [userAttributes.gradeStructure],
  );
  const curriculumOptions = userAttributes.curriculum;
  const hasGradeOptions = gradeOptions.length > 0;
  const hasCurriculumOptions = curriculumOptions.length > 0;
  const allSectionOptions = useMemo(
    () => collectAllSections(gradeStructure),
    [gradeStructure],
  );
  const sectionOptions = useMemo(() => {
    const gradeSpecific = getSectionsForGrade(gradeStructure, formData.grade);
    if (gradeSpecific.length > 0) {
      return gradeSpecific;
    }
    return allSectionOptions;
  }, [gradeStructure, formData.grade, allSectionOptions]);
  const hasSectionOptions = sectionOptions.length > 0;
  const [provinceOptions, setProvinceOptions] = useState([]);
  const [municipalityOptions, setMunicipalityOptions] = useState([]);
  const [barangayOptions, setBarangayOptions] = useState([]);
  const [addressLoading, setAddressLoading] = useState({
    provinces: false,
    municipalities: false,
    barangays: false,
  });
  const [addressError, setAddressError] = useState("");

  const selectedProvinceOption = useMemo(
    () =>
      provinceOptions.find((option) => option.code === formData.provinceCode) ||
      null,
    [provinceOptions, formData.provinceCode],
  );

  const selectedMunicipalityOption = useMemo(
    () =>
      municipalityOptions.find(
        (option) => option.code === formData.municipalityCode,
      ) || null,
    [municipalityOptions, formData.municipalityCode],
  );

  const selectedBarangayOption = useMemo(
    () =>
      barangayOptions.find((option) => option.code === formData.barangayCode) ||
      null,
    [barangayOptions, formData.barangayCode],
  );

  const composeFullAddress = ({ street, barangay, municipality, province }) =>
    [street, barangay, municipality, province].filter(Boolean).join(", ");

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

      const activeGrade =
        updates.grade !== undefined ? updates.grade : prev.grade;
      const gradeSpecificSections = getSectionsForGrade(
        gradeStructure,
        activeGrade,
      );
      const allowedSections =
        gradeSpecificSections.length > 0
          ? gradeSpecificSections
          : allSectionOptions;
      if (
        prev.section &&
        allowedSections.length > 0 &&
        !allowedSections.includes(prev.section)
      ) {
        updates.section = "";
      }

      return Object.keys(updates).length > 0 ? { ...prev, ...updates } : prev;
    });
  }, [gradeOptions, curriculumOptions, gradeStructure, allSectionOptions]);

  useEffect(() => {
    let isMounted = true;
    const loadProvinces = async () => {
      setAddressLoading((prev) => ({ ...prev, provinces: true }));
      setAddressError("");
      try {
        const provinces = await getProvinces();
        if (isMounted) {
          setProvinceOptions(provinces);
        }
      } catch (error) {
        console.error("Failed to load provinces:", error);
        if (isMounted) {
          setAddressError("Unable to load provinces from PSGC.");
        }
      } finally {
        if (isMounted) {
          setAddressLoading((prev) => ({ ...prev, provinces: false }));
        }
      }
    };

    loadProvinces();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!formData.provinceCode) {
      setMunicipalityOptions([]);
      return;
    }

    let isMounted = true;
    setAddressLoading((prev) => ({ ...prev, municipalities: true }));
    const loadMunicipalities = async () => {
      try {
        const municipalities = await getMunicipalities(formData.provinceCode);
        if (isMounted) {
          setMunicipalityOptions(municipalities);
        }
      } catch (error) {
        console.error("Failed to load municipalities:", error);
        if (isMounted) {
          setAddressError("Unable to load municipalities for the province.");
        }
      } finally {
        if (isMounted) {
          setAddressLoading((prev) => ({ ...prev, municipalities: false }));
        }
      }
    };

    loadMunicipalities();
    return () => {
      isMounted = false;
    };
  }, [formData.provinceCode]);

  useEffect(() => {
    if (!formData.municipalityCode) {
      setBarangayOptions([]);
      return;
    }

    let isMounted = true;
    setAddressLoading((prev) => ({ ...prev, barangays: true }));
    const loadBarangays = async () => {
      try {
        const barangays = await getBarangays(formData.municipalityCode);
        if (isMounted) {
          setBarangayOptions(barangays);
        }
      } catch (error) {
        console.error("Failed to load barangays:", error);
        if (isMounted) {
          setAddressError("Unable to load barangays for the municipality.");
        }
      } finally {
        if (isMounted) {
          setAddressLoading((prev) => ({ ...prev, barangays: false }));
        }
      }
    };

    loadBarangays();
    return () => {
      isMounted = false;
    };
  }, [formData.municipalityCode]);

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
  phoneNumber: sanitizePhoneInput(studentData.phoneNumber),
        lrn: sanitizeLrnInput(studentData.lrn),
  grade: studentData.grade || "",
  section: studentData.section || "",
  curriculum: studentData.curriculum || "",
        streetAddress:
          studentData.streetAddress ||
          studentData.street ||
          studentData.address ||
          "",
        barangay: studentData.barangay || "",
        barangayCode: studentData.barangayCode || "",
        municipality: studentData.municipality || "",
        municipalityCode: studentData.municipalityCode || "",
        province: studentData.province || "",
        provinceCode: studentData.provinceCode || "",
        fullAddress: studentData.fullAddress || "",
        parentGuardianName: studentData.parentGuardianName || "",
        parentOccupation: studentData.parentOccupation || "",
        parentAddress: studentData.parentAddress || "",
  parentPhone: sanitizePhoneInput(studentData.parentPhone),
        parentEmail: studentData.parentEmail || "",
        isActive:
          studentData.isActive !== undefined ? studentData.isActive : true,
      });
    } catch (error) {
      console.error("Failed to fetch student:", error);
      toast.error("Failed to load student data");
      // Return to referrer if available, otherwise go to students list
      navigate(location.state?.from || "/students");
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const isCheckbox = type === "checkbox";
    let sanitizedValue = value;

    if (!isCheckbox) {
      if (PHONE_FIELD_NAMES.has(name)) {
        sanitizedValue = sanitizePhoneInput(value);
      } else if (name === "lrn") {
        sanitizedValue = sanitizeLrnInput(value);
      }
    }

    const nextValue = isCheckbox ? checked : sanitizedValue;

    setFormData((prev) => {
      if (name === "grade" && prev.grade !== nextValue) {
        return {
          ...prev,
          grade: nextValue,
          section: "",
        };
      }
      return {
        ...prev,
        [name]: nextValue,
      };
    });

    // Clear validation error when user starts typing
    if (validationErrors[name]) {
      setValidationErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }
  };

  const resetMunicipalityFields = () => ({
    municipality: "",
    municipalityCode: "",
    barangay: "",
    barangayCode: "",
  });

  const resetBarangayFields = () => ({
    barangay: "",
    barangayCode: "",
  });

  const handleProvinceSelect = (_, option) => {
    if (!option) {
      setFormData((prev) => ({
        ...prev,
        province: "",
        provinceCode: "",
        ...resetMunicipalityFields(),
      }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      province: option.name,
      provinceCode: option.code,
      ...resetMunicipalityFields(),
    }));
  };

  const handleProvinceInput = (_, value, reason) => {
    if (reason === "input") {
      setFormData((prev) => ({
        ...prev,
        province: value,
        provinceCode: "",
        ...resetMunicipalityFields(),
      }));
    }
    if (reason === "clear") {
      setFormData((prev) => ({
        ...prev,
        province: "",
        provinceCode: "",
        ...resetMunicipalityFields(),
      }));
    }
  };

  const handleMunicipalitySelect = (_, option) => {
    if (!option) {
      setFormData((prev) => ({
        ...prev,
        municipality: "",
        municipalityCode: "",
        ...resetBarangayFields(),
      }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      municipality: option.name,
      municipalityCode: option.code,
      ...resetBarangayFields(),
    }));
  };

  const handleMunicipalityInput = (_, value, reason) => {
    if (reason === "input") {
      setFormData((prev) => ({
        ...prev,
        municipality: value,
        municipalityCode: "",
        ...resetBarangayFields(),
      }));
    }
    if (reason === "clear") {
      setFormData((prev) => ({
        ...prev,
        municipality: "",
        municipalityCode: "",
        ...resetBarangayFields(),
      }));
    }
  };

  const handleBarangaySelect = (_, option) => {
    if (!option) {
      setFormData((prev) => ({
        ...prev,
        barangay: "",
        barangayCode: "",
      }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      barangay: option.name,
      barangayCode: option.code,
    }));
  };

  const handleBarangayInput = (_, value, reason) => {
    if (reason === "input") {
      setFormData((prev) => ({
        ...prev,
        barangay: value,
        barangayCode: "",
      }));
    }
    if (reason === "clear") {
      setFormData((prev) => ({
        ...prev,
        barangay: "",
        barangayCode: "",
      }));
    }
  };

  useEffect(() => {
    if (
      !formData.province ||
      formData.provinceCode ||
      provinceOptions.length === 0
    ) {
      return;
    }
    const match = provinceOptions.find(
      (option) => option.name.toLowerCase() === formData.province.toLowerCase(),
    );
    if (match) {
      setFormData((prev) => ({
        ...prev,
        provinceCode: match.code,
      }));
    }
  }, [formData.province, formData.provinceCode, provinceOptions]);

  useEffect(() => {
    if (
      !formData.municipality ||
      formData.municipalityCode ||
      municipalityOptions.length === 0
    ) {
      return;
    }
    const match = municipalityOptions.find(
      (option) => option.name.toLowerCase() === formData.municipality.toLowerCase(),
    );
    if (match) {
      setFormData((prev) => ({
        ...prev,
        municipalityCode: match.code,
      }));
    }
  }, [
    formData.municipality,
    formData.municipalityCode,
    municipalityOptions,
  ]);

  useEffect(() => {
    if (!formData.barangay || formData.barangayCode || barangayOptions.length === 0) {
      return;
    }
    const match = barangayOptions.find(
      (option) => option.name.toLowerCase() === formData.barangay.toLowerCase(),
    );
    if (match) {
      setFormData((prev) => ({
        ...prev,
        barangayCode: match.code,
      }));
    }
  }, [formData.barangay, formData.barangayCode, barangayOptions]);

  const validateForm = () => {
    const errors = {};

    if (!formData.firstName.trim()) errors.firstName = "First name is required";
    if (!formData.lastName.trim()) errors.lastName = "Last name is required";
    const normalizedLrn = formData.lrn.trim();
    if (!normalizedLrn)
      errors.lrn = "LRN (Learner Reference Number) is required";
    else if (!/^\d{12}$/.test(normalizedLrn)) {
      errors.lrn = "LRN must be exactly 12 digits";
    }
    if (!formData.grade) errors.grade = "Grade is required";
    if (!formData.section) errors.section = "Section is required";
    const validationSections = (() => {
      const gradeSpecific = getSectionsForGrade(gradeStructure, formData.grade);
      return gradeSpecific.length > 0 ? gradeSpecific : allSectionOptions;
    })();
    if (
      formData.section &&
      validationSections.length > 0 &&
      !validationSections.includes(formData.section)
    ) {
      errors.section = "Section must match the configured list";
    }

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
        username: (formData.lrn || "").toString().trim(),
      };

      studentData.phoneNumber = sanitizePhoneInput(studentData.phoneNumber);
      studentData.parentPhone = sanitizePhoneInput(studentData.parentPhone);

      if (isEditing) {
        await studentsAPI.update(id, studentData);
        toast.success("Student updated successfully");
        setTimeout(() => {
          // After saving, return to the page that opened the form when possible
          navigate(location.state?.from || "/students", { state: { refresh: true } });
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
          // After creating, return to referrer when provided, otherwise go to students list
          navigate(location.state?.from || "/students", { state: { refresh: true } });
        }, 1000);
      }
    } catch (error) {
      setError(error.response?.data?.message || "Failed to save student");
      console.error("Error saving student:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setFormData((prev) => {
      const combinedAddress = composeFullAddress({
        street: prev.streetAddress,
        barangay: prev.barangay,
        municipality: prev.municipality,
        province: prev.province,
      });
      if (combinedAddress === (prev.fullAddress || "")) {
        return prev;
      }
      return {
        ...prev,
        fullAddress: combinedAddress,
      };
    });
  }, [formData.streetAddress, formData.barangay, formData.municipality, formData.province]);

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
        <IconButton onClick={() => {
          // Prefer explicit referrer, otherwise go back in history
          if (location.state?.from) navigate(location.state.from);
          else navigate(-1);
        }} sx={{ mr: 2 }}>
          <ArrowBack />
        </IconButton>{" "}
        <Typography
          variant="h4"
          component="h1"
          sx={{ fontWeight: 600, color: "white" }}
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
      {addressError && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          {addressError}
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
                  {/* Row 1: LRN and Curriculum */}{" " }
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="LRN (Learner Reference Number)"
                      name="lrn"
                      value={formData.lrn}
                      onChange={handleChange}
                      error={!!validationErrors.lrn}
                      helperText={
                        validationErrors.lrn ||""
                      }
                      required
                    />
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
                  </Grid>
                  {/* Row 2: Grade and Section inputs */}{" " }
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
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      select
                      label="Section"
                      name="section"
                      value={formData.section}
                      onChange={handleChange}
                      error={!!validationErrors.section}
                      helperText={
                        validationErrors.section ||
                        (hasSectionOptions
                          ? ""
                          : "No sections configured in settings")
                      }
                      required
                      disabled={!hasSectionOptions}
                    >
                      {hasSectionOptions ? (
                        sectionOptions.map((section) => (
                          <MenuItem key={section} value={section}>
                            {section}
                          </MenuItem>
                        ))
                      ) : (
                        <MenuItem value="" disabled>
                          No sections available
                        </MenuItem>
                      )}
                    </TextField>{" " }
                  </Grid>{" " }
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
                      inputProps={{ inputMode: "numeric", pattern: "[0-9]*", maxLength: 11 }}
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
                    <Autocomplete
                      freeSolo
                      loading={addressLoading.provinces}
                      options={provinceOptions}
                      getOptionLabel={(option) =>
                        typeof option === "string" ? option : option.name
                      }
                      value={selectedProvinceOption}
                      inputValue={formData.province}
                      onChange={handleProvinceSelect}
                      onInputChange={handleProvinceInput}
                      loadingText="Loading provinces..."
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Province"
                          placeholder="Select or type province"
                        />
                      )}
                    />{" "}
                  </Grid>{" "}
                  <Grid item xs={12} sm={4}>
                    <Autocomplete
                      freeSolo
                      loading={addressLoading.municipalities}
                      options={municipalityOptions}
                      getOptionLabel={(option) =>
                        typeof option === "string" ? option : option.name
                      }
                      value={selectedMunicipalityOption}
                      inputValue={formData.municipality}
                      onChange={handleMunicipalitySelect}
                      onInputChange={handleMunicipalityInput}
                      loadingText="Loading municipalities..."
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Municipality"
                          placeholder="Select or type municipality"
                        />
                      )}
                    />{" "}
                  </Grid>{" "}
                  <Grid item xs={12} sm={4}>
                    <Autocomplete
                      freeSolo
                      loading={addressLoading.barangays}
                      options={barangayOptions}
                      getOptionLabel={(option) =>
                        typeof option === "string" ? option : option.name
                      }
                      value={selectedBarangayOption}
                      inputValue={formData.barangay}
                      onChange={handleBarangaySelect}
                      onInputChange={handleBarangayInput}
                      loadingText="Loading barangays..."
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Barangay"
                          placeholder="Select or type barangay"
                        />
                      )}
                    />{" "}
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="House No. / Street"
                      name="streetAddress"
                      value={formData.streetAddress}
                      onChange={handleChange}
                      placeholder="e.g., 123 Library Street"
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
                      inputProps={{ inputMode: "numeric", pattern: "[0-9]*", maxLength: 11 }}
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
                onClick={() => {
                  if (location.state?.from) navigate(location.state.from);
                  else navigate(-1);
                }}
                startIcon={<Cancel />}
                disabled={loading}
              >
                Cancel{" "}
              </Button>{" "}
              <Button
                type="submit"
                variant="contained"
                startIcon={<Save />}
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
