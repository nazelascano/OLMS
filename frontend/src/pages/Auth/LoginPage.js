import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  TextField,
  Button,
  Typography,
  InputAdornment,
  IconButton,
  CircularProgress,
  Grid,
} from "@mui/material";
import { Visibility, VisibilityOff, Person, Lock } from "@mui/icons-material";
import { useAuth } from "../../contexts/AuthContext";
import logo from "../../assets/images/logo.png";
import loginBg from "../../assets/images/login_bg.jpg";

const LoginPage = () => {
  const navigate = useNavigate();
  const { login, loginLoading } = useAuth();

  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsOpen(true), 500);
    return () => clearTimeout(timer);
  }, []);

  const [formData, setFormData] = useState({
    username: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
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
    }
  };

  const handleTogglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        minWidth: "100vw",
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "stretch",
        justifyContent: "stretch",
        backgroundColor: { xs: "#305FB7", md: "#f5f5f5" },
        position: "relative",
        overflow: "hidden",
        perspective: '2000px',
      }}
    >
      <Grid
        container
        sx={{
          minHeight: "100vh",
          minWidth: "100vw",
          width: "100vw",
          height: "100vh",
          position: "relative",
          flexDirection: { xs: "column", md: "row" },
          zIndex: 1,
          transformStyle: 'preserve-3d',
        }}
      >
        {" "}
        {/* Left Side - Blue Background with Logo */}{" "}
        <Grid
          item
          xs={12}
          md={6}
          sx={{
            background: "linear-gradient(90deg, #305FB7 0%, #305FB7 80%, #022a75ff 100%)",
            display: { xs: "none", md: "flex" },
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 4,
            color: "white",
            position: "relative",
            zIndex: 1,
            borderRadius: '10px 0 0 10px',
            boxShadow: '0 0 20px rgba(0,0,0,0.5)',
            transformOrigin: 'right center',
            transform: { xs: 'none', md: isOpen ? 'rotateY(0deg)' : 'rotateY(90deg)' },
            transition: { xs: 'none', md: 'transform 3.2s cubic-bezier(0.77,0,0.175,1)' },
            transformStyle: 'preserve-3d',
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
            backgroundColor: { xs: "transparent", md: "#FFFFFF00" },
            backgroundImage: {
              xs: 'none',
              md: `linear-gradient(90deg, rgba(53, 53, 53, 1) 0%, rgba(236, 236, 236, 0) 20%, rgba(255, 255, 255, 0) 100%), url(${loginBg})`
            },
            backgroundSize: { xs: 'auto', md: 'cover' },
            backgroundPosition: { xs: 'center', md: 'center' },
            backgroundRepeat: 'no-repeat',
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: { xs: 3, sm: 4, md: 6 },
            position: "relative",
            flexDirection: "column",
            gap: { xs: 2.5, md: 0 },
            borderRadius: '0 10px 10px 0',
            transformOrigin: 'left center',
            transform: { xs: 'none', md: isOpen ? 'rotateY(0deg)' : 'rotateY(-90deg)' },
            transition: { xs: 'none', md: 'transform 3.2s cubic-bezier(0.77,0,0.175,1)' },
            transformStyle: 'preserve-3d',
            overflow: 'hidden',
            "&::before": {
              content: '""',
              position: "absolute",
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              /* Removed blur */
              background: 'rgba(255,255,255,0.25)',
              zIndex: 1,
              pointerEvents: 'none',
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
              width: { xs: '100%', md: '370px' },
              maxWidth: { xs: '100%', md: '370px' },
              padding: { xs: 3, sm: 3, md: 4 },
              background: `white`,
              boxShadow: '0 8px 32px 0 rgba(31,38,135,0.18), 0 0 24px 0 rgba(180,180,180,0.10) inset',
              borderRadius: '16px',
              border: '1.5px solid rgba(48,95,183,0.18)',
              mx: { xs: 0, md: 0 },
              position: "relative",
              zIndex: 2,
              /* Move form down on md+ screens */
              mt: { xs: 0, md: 20 },
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
                <Box sx={{ mb: 3 }}>
                  <div role="alert" aria-live="assertive">{error}</div>
                </Box>
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
                  disabled={loginLoading}
                  error={Boolean(error && !formData.username)}
                  aria-describedby={error && !formData.username ? "username-error" : undefined}
                  aria-invalid={Boolean(error && !formData.username)}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      backgroundColor: "transparent !important",
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
                    "& input": {
                      backgroundColor: "transparent !important",
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
                  disabled={loginLoading}
                  error={Boolean(error && !formData.password)}
                  aria-describedby={error && !formData.password ? "password-error" : undefined}
                  aria-invalid={Boolean(error && !formData.password)}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      backgroundColor: "transparent !important",
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
                    "& input": {
                      backgroundColor: "transparent !important",
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
                          disabled={loginLoading}
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
                    backgroundColor: "white",
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
                  disabled={loginLoading}
                  startIcon={
                    loginLoading && <CircularProgress size={20} color="inherit" />
                  }
                >
                  {loginLoading ? "Signing In..." : "LOGIN"}{" "}
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
