/* eslint-disable unicode-bom */
import React, { useState, useEffect } from "react";
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import { reportsAPI } from "../../utils/api";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { PageLoading } from "../../components/Loading";

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [overdueBooks, setOverdueBooks] = useState([]);
  const [recentCheckouts, setRecentCheckouts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true);
        console.log('Starting dashboard data load...');
        
        // Load all data in parallel with error handling
        const [statsResponse, chartResponse, overdueResponse, checkoutsResponse] = await Promise.allSettled([
          reportsAPI.getStats(),
          reportsAPI.getDailyTrends(),
          reportsAPI.getRecentOverdue(),
          reportsAPI.getRecentCheckouts()
        ]);

        // Set all state at once, handling potential errors
        setStats(statsResponse.status === 'fulfilled' ? statsResponse.value.data : null);
        
        // Transform chart data
        const chartData = (chartResponse.status === 'fulfilled' && Array.isArray(chartResponse.value.data)) ? chartResponse.value.data : [];
        const transformedData = chartData.map(item => ({
          name: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          borrowed: item.borrows,
          returned: item.returns
        }));
        setChartData(transformedData);
        
        setOverdueBooks(overdueResponse.status === 'fulfilled' && Array.isArray(overdueResponse.value.data) ? overdueResponse.value.data : []);
        setRecentCheckouts(checkoutsResponse.status === 'fulfilled' && Array.isArray(checkoutsResponse.value.data) ? checkoutsResponse.value.data : []);
        
        console.log('All dashboard data loaded successfully');
        
      } catch (error) {
        console.error('Error loading dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  const StatCard = ({ title, value }) => (
    <Card
      sx={{
        backgroundColor: "#FFFFFF",
        border: "none",
        borderRadius: "6px",
        boxShadow: "0 1px 4px rgba(0, 0, 0, 0.08)",
        height: { xs: "auto", sm: "70px" },
        "&:hover": {
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.12)",
          transition: "all 0.2s ease",
        },
      }}
    >
      <CardContent
        sx={{
          p: 1.5,
          height: "100%",
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          justifyContent: { xs: "flex-start", sm: "space-between" },
          alignItems: { xs: "flex-start", sm: "center" },
          gap: 0.75,
        }}
      >
        <Typography
          variant="body2"
          sx={{
            color: "#6B7280",
            fontSize: "0.75rem",
            mb: 0.25,
            fontWeight: 500,
          }}
        >
          {title}
        </Typography>
        <Typography
          variant="h2"
          sx={{
            fontWeight: 700,
            color: "#111827",
            fontSize: { xs: "1.5rem", sm: "1.8rem" },
            lineHeight: 1,
          }}
        >
          {value || 0}
        </Typography>
      </CardContent>
    </Card>
  );

  if (loading) {
    return <PageLoading message="Loading dashboard data..." />;
  }

  return (
    <Box sx={{ p: { xs: 1.5, md: 2 } }}>
      <Typography variant="h1" sx={{ mb: 3, fontSize: "1.5rem", fontWeight: 600 }}>
        Admin Dashboard
      </Typography>
      
      {/* Statistics Cards in 2x3 Grid matching Figma */}
      <Grid container spacing={2} mb={3}>
        {/* First Row */}
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Borrowed Books" value={stats?.borrowedBooks} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Returned Books" value={stats?.returnedBooks} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Overdue Books" value={stats?.overdueBooks} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Missing Books" value={stats?.missingBooks} />
        </Grid>

        {/* Second Row */}
        <Grid item xs={12} sm={6} md={4}>
          <StatCard title="Total Books" value={stats?.totalBooks} />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard title="Visitors" value={stats?.visitors} />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard title="New Students this S.Y" value={stats?.newStudents} />
        </Grid>
      </Grid>
      {/* Charts and Tables Row */}{" "}
      <Grid container spacing={2}>
        {" "}
        {/* Check-out Statistics Chart */}{" "}
        <Grid item xs={12} lg={6}>
          <Card
            sx={{
              backgroundColor: "#FFFFFF",
              borderRadius: "6px",
              boxShadow: "0 1px 4px rgba(0, 0, 0, 0.08)",
            }}
          >
            <CardContent sx={{ p: 2 }}>
              <Typography
                variant="h2"
                sx={{
                  mb: 1.5,
                  fontWeight: 600,
                  color: "#111827",
                  fontSize: "0.875rem",
                }}
              >
                Check - out statistics{" "}
              </Typography>{" "}
              <Box sx={{ display: "flex", gap: 2, mb: 1.5 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Box
                    sx={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      backgroundColor: "#22C55E",
                    }}
                  />{" "}
                  <Typography
                    variant="body2"
                    sx={{ color: "#6B7280", fontSize: "0.75rem" }}
                  >
                    {" "}
                    Borrowed{" "}
                  </Typography>{" "}
                </Box>{" "}
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Box
                    sx={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      backgroundColor: "#EF4444",
                    }}
                  />{" "}
                  <Typography
                    variant="body2"
                    sx={{ color: "#6B7280", fontSize: "0.75rem" }}
                  >
                    {" "}
                    Returned{" "}
                  </Typography>{" "}
                </Box>{" "}
              </Box>{" "}
              <Box sx={{ height: { xs: 220, md: 180 } }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: "#6B7280" }}
                    />{" "}
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: "#6B7280" }}
                    />{" "}
                    <Line
                      type="monotone"
                      dataKey="borrowed"
                      stroke="#22C55E"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="returned"
                      stroke="#EF4444"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>{" "}
                </ResponsiveContainer>{" "}
              </Box>{" "}
            </CardContent>{" "}
          </Card>{" "}
        </Grid>
        {/* Overdue's History */}{" "}
        <Grid item xs={12} lg={6}>
          <Card
            sx={{
              backgroundColor: "#FFFFFF",
              borderRadius: "6px",
              boxShadow: "0 1px 4px rgba(0, 0, 0, 0.08)",
            }}
          >
            <CardContent sx={{ p: 2 }}>
              <Typography
                variant="h2"
                sx={{
                  mb: 1.5,
                  fontWeight: 600,
                  color: "#111827",
                  fontSize: "0.875rem",
                }}
              >
                Overdue 's History{" "}
              </Typography>{" "}
              <TableContainer sx={{ maxHeight: 220, overflowX: "auto" }}>
                <Table size="small" aria-label="Overdue books table">
                  <TableHead>
                    <TableRow>
                      <TableCell
                        scope="col"
                        id="overdue-student-id-header"
                        sx={{
                          fontWeight: 600,
                          color: "#6B7280",
                          fontSize: "0.75rem",
                          py: 0.75,
                          border: "none",
                        }}
                      >
                        Student Id
                      </TableCell>
                      <TableCell
                        scope="col"
                        id="overdue-title-header"
                        sx={{
                          fontWeight: 600,
                          color: "#6B7280",
                          fontSize: "0.75rem",
                          py: 0.75,
                          border: "none",
                        }}
                      >
                        Title
                      </TableCell>
                      <TableCell
                        scope="col"
                        id="overdue-due-date-header"
                        sx={{
                          fontWeight: 600,
                          color: "#6B7280",
                          fontSize: "0.75rem",
                          py: 0.75,
                          border: "none",
                        }}
                      >
                        Due Date
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {overdueBooks.length > 0 ? (
                      overdueBooks.map((book, index) => (
                        <TableRow key={index}>
                          <TableCell
                            scope="row"
                            headers="overdue-student-id-header"
                            sx={{
                              py: 1,
                              border: "none",
                              color: "#6B7280",
                              fontSize: "0.75rem",
                            }}
                          >
                            #{book.studentId}
                          </TableCell>
                          <TableCell
                            headers="overdue-title-header"
                            sx={{
                              py: 1,
                              border: "none",
                              color: "#111827",
                              fontSize: "0.75rem",
                              fontWeight: 500,
                            }}
                          >
                            {book.title}
                          </TableCell>
                          <TableCell
                            headers="overdue-due-date-header"
                            sx={{
                              py: 1,
                              border: "none",
                              color: "#6B7280",
                              fontSize: "0.75rem",
                            }}
                          >
                            {book.dueDate ? new Date(book.dueDate).toLocaleDateString() : 'N/A'}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell
                          colSpan={3}
                          sx={{
                            py: 3,
                            border: "none",
                            textAlign: "center",
                            color: "#9CA3AF",
                            fontSize: "0.875rem",
                          }}
                        >
                          No overdue books at this time
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>{" "}
          </Card>{" "}
        </Grid>
        {/* Recent Check-outs Table - Full Width */}{" "}
        <Grid item xs={12}>
          <Card
            sx={{
              backgroundColor: "#FFFFFF",
              borderRadius: "6px",
              boxShadow: "0 1px 4px rgba(0, 0, 0, 0.08)",
            }}
          >
            <CardContent sx={{ p: 2 }}>
              <Typography
                variant="h2"
                sx={{
                  mb: 1.5,
                  fontWeight: 600,
                  color: "#111827",
                  fontSize: "0.875rem",
                }}
              >
                Recent Check - outs{" "}
              </Typography>{" "}
              <TableContainer sx={{ overflowX: "auto" }}>
                <Table size="small" aria-label="Recent check-outs table">
                  <TableHead>
                    <TableRow>
                      <TableCell
                        scope="col"
                        id="checkout-student-id-header"
                        sx={{
                          fontWeight: 600,
                          color: "#6B7280",
                          fontSize: "0.75rem",
                          py: 0.75,
                          border: "none",
                        }}
                      >
                        Student Id
                      </TableCell>
                      <TableCell
                        scope="col"
                        id="checkout-title-header"
                        sx={{
                          fontWeight: 600,
                          color: "#6B7280",
                          fontSize: "0.75rem",
                          py: 0.75,
                          border: "none",
                        }}
                      >
                        Title
                      </TableCell>
                      <TableCell
                        scope="col"
                        id="checkout-author-header"
                        sx={{
                          fontWeight: 600,
                          color: "#6B7280",
                          fontSize: "0.75rem",
                          py: 0.75,
                          border: "none",
                        }}
                      >
                        Author
                      </TableCell>
                      <TableCell
                        scope="col"
                        id="checkout-student-header"
                        sx={{
                          fontWeight: 600,
                          color: "#6B7280",
                          fontSize: "0.75rem",
                          py: 0.75,
                          border: "none",
                        }}
                      >
                        Student
                      </TableCell>
                      <TableCell
                        scope="col"
                        id="checkout-issued-header"
                        sx={{
                          fontWeight: 600,
                          color: "#6B7280",
                          fontSize: "0.75rem",
                          py: 0.75,
                          border: "none",
                        }}
                      >
                        Issued Date
                      </TableCell>
                      <TableCell
                        scope="col"
                        id="checkout-returned-header"
                        sx={{
                          fontWeight: 600,
                          color: "#6B7280",
                          fontSize: "0.75rem",
                          py: 0.75,
                          border: "none",
                        }}
                      >
                        Returned Date
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {recentCheckouts.length > 0 ? (
                      recentCheckouts.map((checkout, index) => (
                        <TableRow key={index}>
                          <TableCell
                            headers="checkout-student-id-header"
                            sx={{
                              py: 1,
                              border: "none",
                              color: "#6B7280",
                              fontSize: "0.75rem",
                            }}
                          >
                            {checkout.studentId ? `#${checkout.studentId}` : 'N/A'}
                          </TableCell>
                          <TableCell
                            headers="checkout-title-header"
                            sx={{
                              py: 1,
                              border: "none",
                              color: "#111827",
                              fontSize: "0.75rem",
                              fontWeight: 500,
                            }}
                          >
                            {checkout.title}
                          </TableCell>
                          <TableCell
                            headers="checkout-author-header"
                            sx={{
                              py: 1,
                              border: "none",
                              color: "#6B7280",
                              fontSize: "0.75rem",
                            }}
                          >
                            {checkout.author}
                          </TableCell>
                          <TableCell
                            headers="checkout-student-header"
                            sx={{
                              py: 1,
                              border: "none",
                              color: "#6B7280",
                              fontSize: "0.75rem",
                            }}
                          >
                            {checkout.student}
                          </TableCell>
                          <TableCell
                            headers="checkout-issued-header"
                            sx={{
                              py: 1,
                              border: "none",
                              color: "#6B7280",
                              fontSize: "0.75rem",
                            }}
                          >
                            {checkout.recordDate ? new Date(checkout.recordDate).toLocaleDateString() : 'N/A'}
                          </TableCell>
                          <TableCell
                            headers="checkout-returned-header"
                            sx={{
                              py: 1,
                              border: "none",
                              color: "#6B7280",
                              fontSize: "0.75rem",
                            }}
                          >
                            {checkout.returnedDate ? new Date(checkout.returnedDate).toLocaleDateString() : "Not returned"}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          sx={{
                            py: 3,
                            border: "none",
                            textAlign: "center",
                            color: "#9CA3AF",
                            fontSize: "0.875rem",
                          }}
                        >
                          No recent transactions found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>{" "}
          </Card>{" "}
        </Grid>{" "}
      </Grid>{" "}
    </Box>
  );
};

export default AdminDashboard;
