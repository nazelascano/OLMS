import React from "react";
import { Box, Typography, Paper } from "@mui/material";

const StudentDashboard = () => {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Student Dashboard{" "}
      </Typography>{" "}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6">Welcome to your library portal!</Typography>{" "}
        <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
          View your borrowed books, due dates, and borrowing history.{" "}
        </Typography>{" "}
      </Paper>{" "}
    </Box>
  );
};

export default StudentDashboard;
