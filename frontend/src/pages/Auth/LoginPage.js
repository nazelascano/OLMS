import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  TextField,
  Button,
  Typography,
  Alert,
  InputAdornment,
  IconButton,
  CircularProgress,
  Grid,
} from "@mui/material";
import { Visibility, VisibilityOff, Person, Lock } from "@mui/icons-material";
import { useAuth } from "../../contexts/AuthContext";
import logo from "../../assets/images/logo.png";

const LoginPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [formData, setFormData] = useState({
    username: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    if (error) setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.username || !formData.password) {
      setError("Please fill in all fields");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await login(formData.username, formData.password);

      if (result.success) {
        // Navigate based on user role
        switch (result.user.role) {
          case "admin":
            navigate("/admin/dashboard");
            break;
          case "librarian":
            navigate("/librarian/dashboard");
            break;
          case "staff":
            navigate("/staff/dashboard");
            break;
          case "student":
            navigate("/student/dashboard");
            break;
          default:
            navigate("/");
        }
      } else {
        setError(result.error || "Login failed. Please try again.");
      }
    } catch (error) {
      console.error("Login error:", error);
      setError("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "stretch",
        backgroundColor: { xs: "#305FB7", md: "#FFFFFF" },
        position: "relative",
        overflow: "hidden",
      }}
    >
      <Grid
        container
        sx={{
          minHeight: "100vh",
          position: "relative",
          flexDirection: { xs: "column", md: "row" },
          zIndex: 1,
        }}
      >
        {" "}
        {/* Left Side - Blue Background with Logo */}{" "}
        <Grid
          item
          xs={12}
          md={6}
          sx={{
            background: "linear-gradient(135deg, #305FB7 0%, #4F7BC9 100%)",
            display: { xs: "none", md: "flex" },
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 4,
            color: "white",
            position: "relative",
            zIndex: 1,
          }}
        >
          {/* School Logo */}{" "}
          <Box
            component="img"
            src={logo}
            alt="ONHS School Library Management System Logo"
            sx={{
              width: { md: 280, lg: 320 },
              height: "auto",
              mb: 3,
              display: "block",
            }}
          />
          <Typography
            variant="h5"
            sx={{
              fontFamily: "Inknut Antiqua, serif",
              fontWeight: 400,
              textAlign: "center",
              color: "white",
              textShadow: "0 2px 4px rgba(0,0,0,0.1)",
              fontSize: { md: "1.5rem", lg: "1.8rem" },
            }}
          >
            The School of Choice{" "}
          </Typography>{" "}
        </Grid>
        {/* Right Side - White Background with Login Form */}{" "}
        <Grid
          item
          xs={12}
          md={6}
          sx={{
            backgroundColor: { xs: "transparent", md: "#FFFFFF" },
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: { xs: 3, sm: 4, md: 6 },
            position: "relative",
            flexDirection: "column",
            gap: { xs: 2.5, md: 0 },
            "&::before": {
              content: '""',
              position: "absolute",
              top: 0,
              left: "-50px",
              width: "100px",
              height: "100%",
              background: "#FFFFFF",
              borderTopLeftRadius: "50px",
              borderBottomLeftRadius: "50px",
              zIndex: 2,
              display: { xs: "none", md: "block" },
            },
          }}
        >
          <Box
            sx={{
              display: { xs: "flex", md: "none" },
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              color: "#FFFFFF",
              zIndex: 3,
              gap: 1.25,
            }}
          >
            <Box
              component="img"
              src={logo}
              alt="ONHS Library Management System Logo"
              sx={{
                width: 115,
                height: "auto",
              }}
            />
            <Typography
              variant="subtitle1"
              sx={{
                fontFamily: "Inknut Antiqua, serif",
                letterSpacing: "0.02em",
              }}
            >
              The School of Choice
            </Typography>
          </Box>
          <Box
            sx={{
              width: "100%",
              maxWidth: { xs: 360, sm: 400 },
              padding: { xs: 3, sm: 3, md: 2 },
              backgroundColor: { xs: "#FFFFFF", md: "transparent" },
              borderRadius: { xs: 3, md: 0 },
              boxShadow: {
                xs: "0 12px 24px rgba(15, 23, 42, 0.16)",
                md: "none",
              },
              mx: { xs: "auto", md: 0 },
              position: "relative",
              zIndex: 3,
            }}
          >
            {/* Header */}{" "}
            <Typography
              variant="h4"
              sx={{
                mb: 4,
                fontFamily: "Inria Serif, serif",
                fontWeight: 700,
                color: "#333333",
                textAlign: "center",
                fontSize: { xs: "1.4rem", sm: "1.6rem", md: "2rem" },
              }}
            >
              Online Library Management{" "}
            </Typography>
            {/* Login Form */}{" "}
            <Box component="form" onSubmit={handleSubmit} noValidate>
              {" "}
              {error && (
                <Alert severity="error" sx={{ mb: 3 }}>
                  {" "}
                  {error}{" "}
                </Alert>
              )}
              {/* Username Field */}{" "}
              <Box sx={{ mb: 2.5 }}>
                <TextField
                  fullWidth
                  id="username"
                  name="username"
                  label="Username"
                  value={formData.username}
                  onChange={handleChange}
                  required
                  autoComplete="username"
                  disabled={loading}
                  error={Boolean(error && !formData.username)}
                  aria-describedby={error && !formData.username ? "username-error" : undefined}
                  aria-invalid={Boolean(error && !formData.username)}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      backgroundColor: "#E8EAF0",
                      borderRadius: "8px",
                      height: "42px",
                      "& fieldset": {
                        borderColor: "#CCCCCC",
                        borderWidth: "1px",
                      },
                      "&:hover fieldset": {
                        borderColor: "#305FB7",
                      },
                      "&.Mui-focused fieldset": {
                        borderColor: "#305FB7",
                        borderWidth: "2px",
                      },
                    },
                    "& .MuiInputLabel-root": {
                      color: "#333333",
                      fontSize: "0.9rem",
                      fontWeight: 500,
                    },
                  }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Person
                          sx={{ color: "#000000", fontSize: "18px" }}
                        />{" "}
                      </InputAdornment>
                    ),
                  }}
                />
                {error && !formData.username && (
                  <Typography
                    id="username-error"
                    variant="caption"
                    color="error"
                    sx={{ mt: 0.5, display: "block" }}
                  >
                    Username is required
                  </Typography>
                )}
              </Box>
              {/* Password Field */}{" "}
              <Box sx={{ mb: 3 }}>
                <TextField
                  fullWidth
                  id="password"
                  name="password"
                  label="Password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={handleChange}
                  required
                  autoComplete="current-password"
                  disabled={loading}
                  error={Boolean(error && !formData.password)}
                  aria-describedby={error && !formData.password ? "password-error" : undefined}
                  aria-invalid={Boolean(error && !formData.password)}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      backgroundColor: "#E8EAF0",
                      borderRadius: "8px",
                      height: "42px",
                      "& fieldset": {
                        borderColor: "#CCCCCC",
                        borderWidth: "1px",
                      },
                      "&:hover fieldset": {
                        borderColor: "#305FB7",
                      },
                      "&.Mui-focused fieldset": {
                        borderColor: "#305FB7",
                        borderWidth: "2px",
                      },
                    },
                    "& .MuiInputLabel-root": {
                      color: "#333333",
                      fontSize: "0.9rem",
                      fontWeight: 500,
                    },
                  }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Lock
                          sx={{ color: "#000000", fontSize: "18px" }}
                        />{" "}
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          aria-label="toggle password visibility"
                          onClick={handleTogglePasswordVisibility}
                          edge="end"
                          disabled={loading}
                        >
                          {showPassword ? (
                            <VisibilityOff />
                          ) : (
                            <Visibility />
                          )}{" "}
                        </IconButton>{" "}
                      </InputAdornment>
                    ),
                  }}
                />
                {error && !formData.password && (
                  <Typography
                    id="password-error"
                    variant="caption"
                    color="error"
                    sx={{ mt: 0.5, display: "block" }}
                  >
                    Password is required
                  </Typography>
                )}
              </Box>
              {/* Login Button */}{" "}
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "center",
                  mt: { xs: 2, sm: 3 },
                }}
              >
                <Button
                  type="submit"
                  variant="outlined"
                  sx={{
                    px: 5,
                    py: 1.2,
                    borderRadius: "25px",
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    color: "#22C55E",
                    borderColor: "#22C55E",
                    borderWidth: "2px",
                    backgroundColor: "transparent",
                    minWidth: "100px",
                    "&:hover": {
                      backgroundColor: "rgba(34, 197, 94, 0.04)",
                      borderColor: "#22C55E",
                      borderWidth: "2px",
                    },
                    "&:disabled": {
                      color: "#9CA3AF",
                      borderColor: "#9CA3AF",
                    },
                  }}
                  disabled={loading}
                  startIcon={
                    loading && <CircularProgress size={20} color="inherit" />
                  }
                >
                  {loading ? "Signing In..." : "LOGIN"}{" "}
                </Button>{" "}
              </Box>{" "}
            </Box>{" "}
          </Box>{" "}
        </Grid>{" "}
      </Grid>{" "}
    </Box>
  );
};

export default LoginPage;
