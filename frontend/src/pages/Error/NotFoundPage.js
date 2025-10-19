import React from "react";
import { Box, Typography, Paper, Button } from "@mui/material";
import { useNavigate } from "react-router-dom";

const NotFoundPage = () => {
  const navigate = useNavigate();

  return (
    <Box
      display="flex"
      justifyContent="center"
      alignItems="center"
      minHeight="60vh"
    >
      <Paper sx={{ p: 4, textAlign: "center" }}>
        <Typography variant="h1" color="error" gutterBottom>
          404{" "}
        </Typography>{" "}
        <Typography variant="h5" gutterBottom>
          Page Not Found{" "}
        </Typography>{" "}
        <Typography variant="body1" color="text.secondary" gutterBottom>
          The page you 're looking for doesn' t exist.{" "}
        </Typography>{" "}
        <Button
          variant="contained"
          onClick={() => navigate("/")}
          sx={{ mt: 2 }}
        >
          Go Home{" "}
        </Button>{" "}
      </Paper>{" "}
    </Box>
  );
};

export default NotFoundPage;
