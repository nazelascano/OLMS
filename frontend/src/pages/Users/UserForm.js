import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Autocomplete,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import {
  ArrowBack,
  Cancel,
  Email,
  Person,
  Phone,
  Save,
  Visibility,
  VisibilityOff,
} from "@mui/icons-material";
import { useAuth } from "../../contexts/AuthContext";
import { api, settingsAPI } from "../../utils/api";
import { ensureUserAttributes } from "../../utils/userAttributes";
import {
  getProvinces,
  getMunicipalities,
  getBarangays,
} from "../../utils/addressService";

const ROLE_OPTIONS = [
  { value: "staff", label: "Staff" },
  { value: "librarian", label: "Librarian" },
  { value: "admin", label: "Administrator" },
];

const PHONE_FIELD_NAMES = new Set(["phoneNumber"]);

const sanitizePhoneInput = (value = "") =>
  String(value ?? "").replace(/\D/g, "").slice(0, 11);

const composeFullAddress = ({ street = "", barangay = "", municipality = "", province = "" }) =>
  [street, barangay, municipality, province]
    .map((segment) => segment?.trim())
    .filter(Boolean)
    .join(", ");

const resolveAddressComponents = (raw = "") => {
  if (!raw) {
    return {
      street: "",
      barangay: "",
      municipality: "",
      province: "",
    };
  }

  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return {
      street: raw,
      barangay: "",
      municipality: "",
      province: "",
    };
  }

  const province = parts.pop() || "";
  const municipality = parts.pop() || "";
  const barangay = parts.pop() || "";
  const street = parts.join(", ");

  return { street, barangay, municipality, province };
};

const DEFAULT_FORM_DATA = {
  username: "",
  email: "",
  firstName: "",
  lastName: "",
  password: "",
  confirmPassword: "",
  role: "student",
  studentId: "",
  curriculum: "",
  gradeLevel: "",
  phoneNumber: "",
  address: "",
  province: "",
  provinceCode: "",
  municipality: "",
  municipalityCode: "",
  barangay: "",
  barangayCode: "",
  isActive: true,
};

const UserForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user } = useAuth();
  const isEditing = Boolean(id);

  const [formData, setFormData] = useState({ ...DEFAULT_FORM_DATA });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [userAttributes, setUserAttributes] = useState(() =>
    ensureUserAttributes(),
  );
  const [userAttributesError, setUserAttributesError] = useState("");
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

  useEffect(() => {
    let isMounted = true;

    const loadAttributes = async () => {
      try {
        const response = await settingsAPI.getUserAttributes();
        if (isMounted) {
          setUserAttributes(ensureUserAttributes(response.data));
          setUserAttributesError("");
        }
      } catch (attributesError) {
        console.error("Failed to load user attribute options:", attributesError);
        if (isMounted) {
          setUserAttributes(ensureUserAttributes());
          setUserAttributesError("Failed to load latest curriculum and grade options. Using defaults.");
        }
      }
    };

    loadAttributes();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isEditing) {
      return;
    }

    const loadUser = async () => {
      try {
        setLoading(true);
        const response = await api.get(`/users/${id}`);
        const userData = response.data || {};
        const resolvedAddress = resolveAddressComponents(
          userData.address || userData.profile?.address || userData.fullAddress || "",
        );

        setFormData({
          username: userData.username || "",
          email: userData.email || "",
          firstName: userData.firstName || "",
          lastName: userData.lastName || "",
          password: "",
          confirmPassword: "",
          curriculum: userData.curriculum || "",
          phoneNumber: sanitizePhoneInput(
            userData.phoneNumber || userData.profile?.phone,
          ),
          address:
            resolvedAddress.street ||
            userData.address ||
            userData.profile?.address ||
            "",
          province:
            userData.province ||
            resolvedAddress.province ||
            userData.profile?.province ||
            "",
          provinceCode: userData.provinceCode || "",
          municipality:
            userData.municipality ||
            resolvedAddress.municipality ||
            userData.profile?.municipality ||
            "",
          municipalityCode: userData.municipalityCode || "",
          barangay:
            userData.barangay ||
            resolvedAddress.barangay ||
            userData.profile?.barangay ||
            "",
          barangayCode: userData.barangayCode || "",
          isActive:
            typeof userData.isActive === "boolean" ? userData.isActive : true,
        });
        setError("");
        setSuccess("");
      } catch (loadError) {
        setError("Failed to fetch user details");
        console.error("Error fetching user:", loadError);
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, [id, isEditing]);

  useEffect(() => {
  }, [formData.role]);

  useEffect(() => {
    setFormData((prev) => {
      const allowedCurriculum = userAttributes.curriculum || [];
      const allowedGradeLevels = userAttributes.gradeLevels || [];

      let nextCurriculum = prev.curriculum;
      let nextGradeLevel = prev.gradeLevel;

      if (
        nextCurriculum &&
        allowedCurriculum.length > 0 &&
        !allowedCurriculum.includes(nextCurriculum)
      ) {
        nextCurriculum = "";
      }

      if (
        nextGradeLevel &&
        allowedGradeLevels.length > 0 &&
        !allowedGradeLevels.includes(nextGradeLevel)
      ) {
        nextGradeLevel = "";
      }

      if (
        nextCurriculum !== prev.curriculum ||
        nextGradeLevel !== prev.gradeLevel
      ) {
        return {
          ...prev,
          curriculum: nextCurriculum,
          gradeLevel: nextGradeLevel,
        };
      }

      return prev;
    });
  }, [userAttributes]);

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
      } catch (provinceError) {
        console.error("Failed to load provinces:", provinceError);
        if (isMounted) {
          setAddressError("Unable to load provinces from PSGC API.");
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
      } catch (municipalityError) {
        console.error("Failed to load municipalities:", municipalityError);
        if (isMounted) {
          setAddressError("Unable to load municipalities for the selected province.");
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
      } catch (barangayError) {
        console.error("Failed to load barangays:", barangayError);
        if (isMounted) {
          setAddressError("Unable to load barangays for the selected municipality.");
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

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    const isCheckbox = type === "checkbox";
    const sanitizedValue =
      !isCheckbox && PHONE_FIELD_NAMES.has(name)
        ? sanitizePhoneInput(value)
        : value;

    setFormData((prev) => ({
      ...prev,
      [name]: isCheckbox ? checked : sanitizedValue,
    }));

    if (validationErrors[name]) {
      setValidationErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }
  };

  const clearMunicipalityFields = () => ({
    municipality: "",
    municipalityCode: "",
    barangay: "",
    barangayCode: "",
  });

  const clearBarangayFields = () => ({
    barangay: "",
    barangayCode: "",
  });

  const handleProvinceSelect = (_, option) => {
    if (!option) {
      setFormData((prev) => ({
        ...prev,
        province: "",
        provinceCode: "",
        ...clearMunicipalityFields(),
      }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      province: option.name,
      provinceCode: option.code,
      ...clearMunicipalityFields(),
    }));
  };

  const handleProvinceInput = (_, value, reason) => {
    if (reason === "input") {
      setFormData((prev) => ({
        ...prev,
        province: value,
        provinceCode: "",
        ...clearMunicipalityFields(),
      }));
    }
    if (reason === "clear") {
      setFormData((prev) => ({
        ...prev,
        province: "",
        provinceCode: "",
        ...clearMunicipalityFields(),
      }));
    }
  };

  const handleMunicipalitySelect = (_, option) => {
    if (!option) {
      setFormData((prev) => ({
        ...prev,
        municipality: "",
        municipalityCode: "",
        ...clearBarangayFields(),
      }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      municipality: option.name,
      municipalityCode: option.code,
      ...clearBarangayFields(),
    }));
  };

  const handleMunicipalityInput = (_, value, reason) => {
    if (reason === "input") {
      setFormData((prev) => ({
        ...prev,
        municipality: value,
        municipalityCode: "",
        ...clearBarangayFields(),
      }));
    }
    if (reason === "clear") {
      setFormData((prev) => ({
        ...prev,
        municipality: "",
        municipalityCode: "",
        ...clearBarangayFields(),
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

  const previewAddress = useMemo(
    () =>
      composeFullAddress({
        street: formData.address,
        barangay: formData.barangay,
        municipality: formData.municipality,
        province: formData.province,
      }),
    [
      formData.address,
      formData.barangay,
      formData.municipality,
      formData.province,
    ],
  );

  const validateForm = () => {
    const errors = {};

    if (!formData.username.trim()) errors.username = "Username is required";
    if (!formData.firstName.trim()) errors.firstName = "First name is required";
    if (!formData.lastName.trim()) errors.lastName = "Last name is required";

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const trimmedEmail = formData.email.trim();
    if (trimmedEmail && !emailRegex.test(trimmedEmail)) {
      errors.email = "Please enter a valid email address";
    }
    if (!isEditing || formData.password) {
      if (!formData.password) {
        errors.password = "Password is required";
      } else if (formData.password.length < 6) {
        errors.password = "Password must be at least 6 characters";
      }

      if (formData.password !== formData.confirmPassword) {
        errors.confirmPassword = "Passwords do not match";
      }
    }

    if (formData.username && formData.username.length < 3) {
      errors.username = "Username must be at least 3 characters";
    }

    if (formData.role === "student" && !formData.studentId) {
      errors.studentId = "Student ID is required for students";
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!validateForm()) {
      setError("Please fix the validation errors");
      return;
    }

    setLoading(true);
    try {
      setError("");
      setSuccess("");

      const payload = { ...formData };
      payload.phoneNumber = sanitizePhoneInput(payload.phoneNumber);
      delete payload.confirmPassword;

      payload.address = composeFullAddress({
        street: payload.address,
        barangay: payload.barangay,
        municipality: payload.municipality,
        province: payload.province,
      });

      payload.email = (payload.email || "").trim();
      if (!payload.email) {
        delete payload.email;
      }

      if (isEditing && !payload.password) {
        delete payload.password;
      }

      if (isEditing) {
        await api.put(`/users/${id}`, payload);
        setSuccess("User updated successfully");
      } else {
        await api.post("/users", payload);
        setSuccess("User created successfully");
      }

      setTimeout(() => {
        navigate("/users");
      }, 2000);
    } catch (submitError) {
      setError(submitError.response?.data?.message || "Failed to save user");
      console.error("Error saving user:", submitError);
    } finally {
      setLoading(false);
    }
  };

  const canManageUsers = user?.role === "admin" || user?.role === "librarian";
  
  if (!canManageUsers) {
    return (
      <Box>
        <Alert severity="error">
          Access denied. You do not have permission to manage users.
        </Alert>
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" alignItems="center" mb={3}>
        <IconButton onClick={() => navigate("/users")} sx={{ mr: 2 }}>
          <ArrowBack />
        </IconButton>
        <Typography variant="h4" gutterBottom sx={{ flexGrow: 1, mb: 0, color: "white" }}>
          {isEditing ? "Edit User" : "Add New User"}
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {userAttributesError && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {userAttributesError}
        </Alert>
      )}
      {addressError && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {addressError}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}

      <form onSubmit={handleSubmit}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Basic Information
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} display="flex" mb={2}>
                    <Avatar
                      sx={{
                        width: 80,
                        height: 80,
                        bgcolor: "primary.main",
                        fontSize: "2rem",
                      }}
                    >
                      {formData.firstName?.[0] || formData.username?.[0] || (
                        <Person />
                      )}
                    </Avatar>
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Username"
                      name="username"
                      value={formData.username}
                      onChange={handleChange}
                      error={Boolean(validationErrors.username)}
                      helperText={validationErrors.username}
                      required
                      disabled={isEditing}
                      FormHelperTextProps={{ id: "username-error" }}
                      aria-describedby={validationErrors.username ? "username-error" : undefined}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Person />
                          </InputAdornment>
                        ),
                      }}
                    />
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleChange}
                      error={Boolean(validationErrors.email)}
                      helperText={
                        validationErrors.email || "Optional; leave blank if unavailable"
                      }
                      FormHelperTextProps={{ id: "email-error" }}
                      aria-describedby={validationErrors.email ? "email-error" : undefined}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Email />
                          </InputAdornment>
                        ),
                      }}
                    />
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="First Name"
                      name="firstName"
                      value={formData.firstName}
                      onChange={handleChange}
                      error={Boolean(validationErrors.firstName)}
                      helperText={validationErrors.firstName}
                      required
                    />
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Last Name"
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleChange}
                      error={Boolean(validationErrors.lastName)}
                      helperText={validationErrors.lastName}
                      required
                    />
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <FormControl
                      fullWidth
                      error={Boolean(validationErrors.role)}
                    >
                      <InputLabel>Role</InputLabel>
                      <Select
                        name="role"
                        value={formData.role}
                        onChange={handleChange}
                        label="Role"
                      >
                        {ROLE_OPTIONS.map((role) => (
                          <MenuItem key={role.value} value={role.value}>
                            {role.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Phone Number"
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
                    />
                  </Grid>

                  <Grid item xs={12}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={formData.isActive}
                          onChange={handleChange}
                          name="isActive"
                        />
                      }
                      label="Active User"
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  {isEditing
                    ? "Change Password (leave blank to keep current)"
                    : "Password"}
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={handleChange}
                      error={Boolean(validationErrors.password)}
                      helperText={validationErrors.password}
                      required={!isEditing}
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              onClick={() => setShowPassword((prev) => !prev)}
                              edge="end"
                            >
                              {showPassword ? <VisibilityOff /> : <Visibility />}
                            </IconButton>
                          </InputAdornment>
                        ),
                      }}
                    />
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Confirm Password"
                      name="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      error={Boolean(validationErrors.confirmPassword)}
                      helperText={validationErrors.confirmPassword}
                      required={!isEditing || formData.password}
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              onClick={() =>
                                setShowConfirmPassword((prev) => !prev)
                              }
                              edge="end"
                            >
                              {showConfirmPassword ? (
                                <VisibilityOff />
                              ) : (
                                <Visibility />
                              )}
                            </IconButton>
                          </InputAdornment>
                        ),
                      }}
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Additional Information
                </Typography>
                <Grid container spacing={2}>
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
                    />
                  </Grid>
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
                    />
                  </Grid>
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
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="House No. / Street"
                      name="address"
                      multiline
                      rows={2}
                      value={formData.address}
                      onChange={handleChange}
                      placeholder="e.g., 123 Library Street"
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Full Address (auto-generated)"
                      value={previewAddress}
                      InputProps={{ readOnly: true }}
                      helperText="This is what will be saved with the user account"
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12}>
            <Box display="flex" gap={2} justifyContent="flex-end">
              <Button
                onClick={() => navigate("/users")}
                disabled={loading}
                startIcon={<Cancel />}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="contained"
                disabled={loading}
                startIcon={<Save />}
              >
                {loading
                  ? "Saving..."
                  : isEditing
                  ? "Update User"
                  : "Create User"}
              </Button>
            </Box>
          </Grid>
        </Grid>
      </form>
    </Box>
  );
};

export default UserForm;
