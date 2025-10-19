import React from "react";
import { Box, Typography, Paper, Button } from "@mui/material";
import { useNavigate } from "react-router-dom";

const UnauthorizedPage = () => {
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
          403{" "}
        </Typography>{" "}
        <Typography variant="h5" gutterBottom>
          Access Denied{" "}
        </Typography>{" "}
        <Typography variant="body1" color="text.secondary" gutterBottom>
          You don 't have permission to access this page.{" "}
        </Typography>{" "}
        <Button
          variant="contained"
          onClick={() => navigate("/")}
          sx={{ mt: 2 }}
        >
          Go Back{" "}
        </Button>{" "}
      </Paper>{" "}
    </Box>
  );
};

export default UnauthorizedPage;
