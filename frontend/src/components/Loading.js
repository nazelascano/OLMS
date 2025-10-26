import React from "react";
import {
  Box,
  CircularProgress,
  LinearProgress,
  Typography,
  Paper,
} from "@mui/material";

const Loading = ({
  type = "spinner", // "spinner", "linear", "fullscreen"
  size = 40,
  message = "Loading...",
  showMessage = true,
  color = "primary",
  thickness = 3.6,
  sx = {},
  ...props
}) => {
  const renderSpinner = () => (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      gap={2}
      sx={sx}
      {...props}
    >
      <CircularProgress
        size={size}
        color={color}
        thickness={thickness}
        aria-hidden="true"
      />
      {showMessage && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ textAlign: "center" }}
        >
          {message}
        </Typography>
      )}
    </Box>
  );

  const renderLinear = () => (
    <Box sx={sx} {...props}>
      <LinearProgress color={color} />
      {showMessage && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mt: 1, textAlign: "center" }}
        >
          {message}
        </Typography>
      )}
    </Box>
  );

  const renderFullscreen = () => (
    <Box
      sx={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        backgroundColor: "rgba(255, 255, 255, 0.8)",
        backdropFilter: "blur(4px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        zIndex: 9999,
        ...sx,
      }}
      {...props}
    >
      <CircularProgress size={size} color={color} thickness={thickness} />
      {showMessage && (
        <Typography variant="body1" color="text.secondary">
          {message}
        </Typography>
      )}
    </Box>
  );

  switch (type) {
    case "linear":
      return renderLinear();
    case "fullscreen":
      return renderFullscreen();
    case "spinner":
    default:
      return renderSpinner();
  }
};

// Specialized loading components
export const PageLoading = ({ message = "Loading page...", ...props }) => (
  <Box
    display="flex"
    justifyContent="center"
    alignItems="center"
    minHeight="60vh"
    role="status"
    aria-live="polite"
    aria-label={message}
  >
    <Loading message={message} {...props} />
  </Box>
);

export const ButtonLoading = ({ size = 20, ...props }) => (
  <CircularProgress size={size} {...props} />
);

export const InlineLoading = ({ message = "Loading...", ...props }) => (
  <Box display="flex" alignItems="center" gap={1}>
    <CircularProgress size={16} />
    <Typography variant="body2" color="text.secondary">
      {message}
    </Typography>
  </Box>
);

export const CardLoading = ({ message = "Loading...", height = 200, ...props }) => (
  <Paper
    sx={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height,
      ...props.sx,
    }}
    {...props}
  >
    <Loading message={message} />
  </Paper>
);

export default Loading;