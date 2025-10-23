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
            alt="School Logo"
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
              mt: { xs: 0, md: 0 },
              mb: { xs: 0, md: 0 },
              position: "relative",
              zIndex: 3,
            }}
          >
            <Box
              sx={{
                display: { xs: "flex", md: "none" },
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                color: "#FFFFFF",
                mb: 2.5,
                zIndex: 4,
              }}
            >
              <Box
                component="img"
                src={logo}
                alt="School Logo"
                sx={{
                  width: 115,
                  height: "auto",
                  mb: 1.5,
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
                <Typography
                  variant="body2"
                  sx={{
                    mb: 0.8,
                    fontWeight: 500,
                    color: "#333333",
                    fontSize: "0.9rem",
                  }}
                >
                  Username{" "}
                </Typography>{" "}
                <TextField
                  fullWidth
                  id="username"
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  required
                  autoComplete="username"
                  autoFocus
                  disabled={loading}
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
                />{" "}
              </Box>
              {/* Password Field */}{" "}
              <Box sx={{ mb: 3 }}>
                <Typography
                  variant="body2"
                  sx={{
                    mb: 0.8,
                    fontWeight: 500,
                    color: "#333333",
                    fontSize: "0.9rem",
                  }}
                >
                  Password{" "}
                </Typography>{" "}
                <TextField
                  fullWidth
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={handleChange}
                  required
                  autoComplete="current-password"
                  disabled={loading}
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
                />{" "}
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
