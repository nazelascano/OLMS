import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
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

const ROLE_OPTIONS = [
  { value: "staff", label: "Staff" },
  { value: "librarian", label: "Librarian" },
  { value: "admin", label: "Administrator" },
];

const DEFAULT_FORM_DATA = {
  username: "",
  email: "",
  firstName: "",
  lastName: "",
  password: "",
  confirmPassword: "",
  role: "student",
  studentId: "",
  department: "",
  gradeLevel: "",
  phoneNumber: "",
  address: "",
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
          setUserAttributesError("Failed to load latest department and grade options. Using defaults.");
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

        setFormData({
          username: userData.username || "",
          email: userData.email || "",
          firstName: userData.firstName || "",
          lastName: userData.lastName || "",
          password: "",
          confirmPassword: "",
          phoneNumber: userData.phoneNumber || userData.profile?.phone || "",
          address: userData.address || userData.profile?.address || "",
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
      const allowedDepartments = userAttributes.departments || [];
      const allowedGradeLevels = userAttributes.gradeLevels || [];

      let nextDepartment = prev.department;
      let nextGradeLevel = prev.gradeLevel;

      if (
        nextDepartment &&
        allowedDepartments.length > 0 &&
        !allowedDepartments.includes(nextDepartment)
      ) {
        nextDepartment = "";
      }

      if (
        nextGradeLevel &&
        allowedGradeLevels.length > 0 &&
        !allowedGradeLevels.includes(nextGradeLevel)
      ) {
        nextGradeLevel = "";
      }

      if (
        nextDepartment !== prev.department ||
        nextGradeLevel !== prev.gradeLevel
      ) {
        return {
          ...prev,
          department: nextDepartment,
          gradeLevel: nextGradeLevel,
        };
      }

      return prev;
    });
  }, [userAttributes]);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;

    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));

    if (validationErrors[name]) {
      setValidationErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }
  };

  const validateForm = () => {
    const errors = {};

    if (!formData.username.trim()) errors.username = "Username is required";
    if (!formData.email.trim()) errors.email = "Email is required";
    if (!formData.firstName.trim()) errors.firstName = "First name is required";
    if (!formData.lastName.trim()) errors.lastName = "Last name is required";
    if (!formData.role) errors.role = "Role is required";

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (formData.email && !emailRegex.test(formData.email)) {
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
      delete payload.confirmPassword;

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
        <Typography variant="h4" gutterBottom sx={{ flexGrow: 1, mb: 0 }}>
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
                      helperText={validationErrors.email}
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
                      required
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
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Address"
                      name="address"
                      multiline
                      rows={3}
                      value={formData.address}
                      onChange={handleChange}
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
