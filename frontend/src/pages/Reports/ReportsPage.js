import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  Tabs,
  Tab,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  CircularProgress,
  Chip,
} from "@mui/material";
import {
  TrendingUp,
  LibraryBooks,
  People,
  Assignment,
  Warning,
  Download,
  Refresh,
  Assessment,
  Book,
  Schedule,
  CurrencyExchange,
} from "@mui/icons-material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { reportsAPI } from "../../utils/api";
import { formatCurrency } from "../../utils/currency";

const initialDashboardStats = {
  totalBooks: 0,
  totalUsers: 0,
  activeTransactions: 0,
  overdueBooks: 0,
  monthlyBorrowings: 0,
  popularBooks: [],
  recentActivity: [],
};

const initialReportData = {
  circulationReport: [],
  popularBooksReport: [],
  userActivityReport: [],
  overdueReport: [],
  fineReport: [],
  inventoryReport: [],
};

const ReportsPage = () => {
  const [currentTab, setCurrentTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    endDate: new Date(),
  });

  const [dashboardStats, setDashboardStats] = useState(initialDashboardStats);
  const [reportData, setReportData] = useState(initialReportData);

  const toValidDate = (value) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const formatNumber = (value) => {
    const number = Number(value);
    if (Number.isNaN(number)) return "0";
    return number.toLocaleString();
  };

  const formatDate = (value) => {
    const date = toValidDate(value);
    return date ? date.toLocaleDateString() : "N/A";
  };

  const formatDateTime = (value) => {
    const date = toValidDate(value);
    return date ? date.toLocaleString() : "N/A";
  };

  const renderTableRows = (rows, renderRow, emptyMessage, colSpan) => {
    if (!rows || rows.length === 0) {
      return (
        <TableRow>
          <TableCell
            colSpan={colSpan}
            align="center"
            sx={{ py: 4, color: "text.secondary" }}
          >
            {emptyMessage}
          </TableCell>
        </TableRow>
      );
    }
    return rows.map(renderRow);
  };

  const tableContainerSx = {
    borderRadius: 2,
    border: (theme) => `1px solid ${theme.palette.divider}`,
    overflow: "hidden",
  };

  const tableHeadSx = {
    bgcolor: "grey.50",
    "& .MuiTableCell-root": {
      fontWeight: 600,
      fontSize: 12,
      letterSpacing: 0.4,
      color: "text.secondary",
      textTransform: "uppercase",
    },
  };

  const stripedRowSx = {
    "&:nth-of-type(odd)": {
      bgcolor: "grey.50",
    },
    "&:hover": {
      bgcolor: "action.hover",
    },
  };

  const overviewMetrics = [
    {
      key: "totalBooks",
      title: "Total Books",
      icon: LibraryBooks,
      color: "primary",
    },
    {
      key: "totalUsers",
      title: "Total Users",
      icon: People,
      color: "success",
    },
    {
      key: "activeTransactions",
      title: "Active Loans",
      icon: Assignment,
      color: "info",
    },
    {
      key: "overdueBooks",
      title: "Overdue Books",
      icon: Warning,
      color: "error",
    },
  ];

  const getRangeParams = useCallback(() => {
    const params = {};
    const start = toValidDate(dateRange.startDate);
    const end = toValidDate(dateRange.endDate);
    if (start) params.startDate = start.toISOString();
    if (end) params.endDate = end.toISOString();
    return params;
  }, [dateRange.startDate, dateRange.endDate]);

  const loadAllReports = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const params = getRangeParams();

      const [
        dashboardResponse,
        circulation,
        popular,
        userActivity,
        overdue,
        fine,
        inventory,
      ] = await Promise.all([
        reportsAPI.getDashboard(params),
        reportsAPI.getCirculation(params),
        reportsAPI.getPopularBooks(params),
        reportsAPI.getUserActivity(params),
        reportsAPI.getOverdue(params),
        reportsAPI.getFines(params),
        reportsAPI.getInventory(),
      ]);

      setDashboardStats({
        ...initialDashboardStats,
        ...(dashboardResponse?.data || {}),
      });

      setReportData({
        circulationReport: circulation?.data || [],
        popularBooksReport: popular?.data || [],
        userActivityReport: userActivity?.data || [],
        overdueReport: overdue?.data || [],
        fineReport: fine?.data || [],
        inventoryReport: inventory?.data || [],
      });
    } catch (loadError) {
      setError("Failed to load reports data");
      console.error("Error loading reports data:", loadError);
    } finally {
      setLoading(false);
    }
  }, [getRangeParams]);

  useEffect(() => {
    loadAllReports();
  }, [loadAllReports]);

  const handleExportReport = async (type) => {
    try {
      const params = { ...getRangeParams(), format: "csv" };
      const response = await reportsAPI.export(type, params);

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `${type}_report_${new Date().toISOString().split("T")[0]}.csv`,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(`Failed to export ${type} report`);
      console.error("Error exporting report:", exportError);
    }
  };

  const TabPanel = ({ children, value, index }) => {
    if (value !== index) {
      return null;
    }
    return <Box sx={{ py: 3 }}>{children}</Box>;
  };

  if (loading && currentTab === 0) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="400px"
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", md: "row" },
            alignItems: { xs: "flex-start", md: "center" },
            justifyContent: "space-between",
            gap: 2,
          }}
        >
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 600 }}>
              Reports & Analytics
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Track circulation, popular titles, user activity, and more in one
              place.
            </Typography>
          </Box>
          <Button
            variant="outlined"
            startIcon={<Refresh />}
            onClick={loadAllReports}
            sx={{ alignSelf: { xs: "stretch", md: "center" } }}
          >
            Refresh Data
          </Button>
        </Box>
        {error && (
          <Alert severity="error" sx={{ mb: 1 }}>
            {error}
          </Alert>
        )}
        <Paper
          elevation={0}
          sx={{
            p: 2,
            borderRadius: 2,
            border: (theme) => `1px solid ${theme.palette.divider}`,
          }}
        >
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={3} md={2.5}>
              <Typography variant="subtitle2" color="text.secondary">
                Date Range
              </Typography>
            </Grid>
            <Grid item xs={12} sm={4} md={3}>
              <DatePicker
                label="Start Date"
                value={dateRange.startDate}
                onChange={(newValue) =>
                  setDateRange({ ...dateRange, startDate: newValue })
                }
                slotProps={{ textField: { size: "small", fullWidth: true } }}
              />
            </Grid>
            <Grid item xs={12} sm={4} md={3}>
              <DatePicker
                label="End Date"
                value={dateRange.endDate}
                onChange={(newValue) =>
                  setDateRange({ ...dateRange, endDate: newValue })
                }
                slotProps={{ textField: { size: "small", fullWidth: true } }}
              />
            </Grid>
            <Grid
              item
              xs={12}
              sm={4}
              md={3}
              sx={{ display: "flex", justifyContent: { sm: "flex-end" } }}
            >
              <Button variant="contained" onClick={loadAllReports} fullWidth>
                Apply Filter
              </Button>
            </Grid>
          </Grid>
        </Paper>
        <Paper
          elevation={0}
          sx={{
            borderRadius: 2,
            border: (theme) => `1px solid ${theme.palette.divider}`,
          }}
        >
          <Tabs
            value={currentTab}
            onChange={(event, newValue) => setCurrentTab(newValue)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ px: 2, borderBottom: (theme) => `1px solid ${theme.palette.divider}` }}
          >
            <Tab label="Overview" icon={<Assessment />} disableRipple />
            <Tab label="Circulation" icon={<TrendingUp />} disableRipple />
            <Tab label="Popular Books" icon={<LibraryBooks />} disableRipple />
            <Tab label="User Activity" icon={<People />} disableRipple />
            <Tab label="Overdue Books" icon={<Warning />} disableRipple />
            <Tab label="Fines" icon={<CurrencyExchange />} disableRipple />
            <Tab label="Inventory" icon={<Book />} disableRipple />
          </Tabs>
          {/* Overview Tab */}{" "}
          <TabPanel value={currentTab} index={0}>
            <Grid container spacing={3}>
              {overviewMetrics.map((metric) => {
                const Icon = metric.icon;
                return (
                  <Grid key={metric.key} item xs={12} sm={6} md={3}>
                    <Card
                      elevation={0}
                      sx={{
                        borderRadius: 2,
                        border: (theme) => `1px solid ${theme.palette.divider}`,
                        height: "100%",
                      }}
                    >
                      <CardContent>
                        <Box display="flex" alignItems="center" gap={2}>
                          <Icon color={metric.color} sx={{ fontSize: 38 }} />
                          <Box>
                            <Typography variant="h4" sx={{ fontWeight: 600 }}>
                              {formatNumber(dashboardStats[metric.key])}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {metric.title}
                            </Typography>
                          </Box>
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                );
              })}
              {/* Popular Books */}{" "}
              <Grid item xs={12} md={6}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Most Popular Books
                    </Typography>
                    <List>
                      {dashboardStats.popularBooks.slice(0, 5).map((book, index) => (
                        <ListItem key={book.id || index}>
                          <ListItemIcon>
                            <Typography variant="h6" color="primary">
                              #{index + 1}
                            </Typography>
                          </ListItemIcon>
                          <ListItemText
                            primary={book.title || "Unknown Title"}
                            secondary={`${formatNumber(book.borrowCount)} borrowings`}
                          />
                        </ListItem>
                      ))}
                    </List>
                  </CardContent>{" "}
                </Card>{" "}
              </Grid>
              {/* Recent Activity */}{" "}
              <Grid item xs={12} md={6}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Recent Activity
                    </Typography>
                    <List>
                      {dashboardStats.recentActivity.slice(0, 5).map((activity, index) => (
                        <ListItem key={index}>
                          <ListItemIcon>
                            <Schedule color="primary" />
                          </ListItemIcon>
                          <ListItemText
                            primary={
                              activity.description ||
                              (activity.type
                                ? `Transaction ${activity.type}`
                                : "Activity update")
                            }
                            secondary={
                              [
                                formatDateTime(activity.timestamp || activity.date),
                                activity.bookCount
                                  ? `${formatNumber(activity.bookCount)} book${activity.bookCount === 1 ? "" : "s"}`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" • ")
                            }
                          />
                        </ListItem>
                      ))}
                    </List>
                  </CardContent>{" "}
                </Card>{" "}
              </Grid>{" "}
            </Grid>{" "}
          </TabPanel>
          {/* Circulation Report Tab */}{" "}
          <TabPanel value={currentTab} index={1}>
            <Box
              display="flex"
              justifyContent="space-between"
              alignItems="center"
              mb={2}
            >
              <Typography variant="h6"> Circulation Report </Typography>{" "}
              <Button
                variant="outlined"
                startIcon={<Download />}
                onClick={() => handleExportReport("circulation")}
              >
                Export CSV{" "}
              </Button>{" "}
            </Box>{" "}
            <TableContainer sx={tableContainerSx}>
              <Table size="small">
                <TableHead sx={tableHeadSx}>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Books Borrowed</TableCell>
                    <TableCell>Books Returned</TableCell>
                    <TableCell>New Registrations</TableCell>
                    <TableCell>Fines Collected</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {renderTableRows(
                    reportData.circulationReport,
                    (row, index) => (
                      <TableRow key={index} sx={stripedRowSx}>
                        <TableCell>{formatDate(row.date)}</TableCell>
                        <TableCell>{formatNumber(row.borrowed)}</TableCell>
                        <TableCell>{formatNumber(row.returned)}</TableCell>
                        <TableCell>{formatNumber(row.newUsers)}</TableCell>
                        <TableCell>{formatCurrency(row.finesCollected)}</TableCell>
                      </TableRow>
                    ),
                    "No circulation activity for this range.",
                    5,
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </TabPanel>
          {/* Popular Books Tab */}{" "}
          <TabPanel value={currentTab} index={2}>
            <Box
              display="flex"
              justifyContent="space-between"
              alignItems="center"
              mb={2}
            >
              <Typography variant="h6"> Popular Books Report </Typography>{" "}
              <Button
                variant="outlined"
                startIcon={<Download />}
                onClick={() => handleExportReport("popular-books")}
              >
                Export CSV{" "}
              </Button>{" "}
            </Box>{" "}
            <TableContainer sx={tableContainerSx}>
              <Table size="small">
                <TableHead sx={tableHeadSx}>
                  <TableRow>
                    <TableCell>Rank</TableCell>
                    <TableCell>Book Title</TableCell>
                    <TableCell>Author</TableCell>
                    <TableCell>Category</TableCell>
                    <TableCell>Times Borrowed</TableCell>
                    <TableCell>Average Rating</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {renderTableRows(
                    reportData.popularBooksReport,
                    (book, index) => (
                      <TableRow key={book.id || index} sx={stripedRowSx}>
                        <TableCell>{`#${index + 1}`}</TableCell>
                        <TableCell>{book.title || "Unknown Title"}</TableCell>
                        <TableCell>
                          {book.author || "Unknown Author"}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={book.category || "Uncategorized"}
                            size="small"
                            color={book.category ? "default" : "warning"}
                          />
                        </TableCell>
                        <TableCell>{formatNumber(book.borrowCount)}</TableCell>
                        <TableCell>{book.averageRating ?? "N/A"}</TableCell>
                      </TableRow>
                    ),
                    "No popular books data available.",
                    6,
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </TabPanel>
          {/* User Activity Tab */}{" "}
          <TabPanel value={currentTab} index={3}>
            <Box
              display="flex"
              justifyContent="space-between"
              alignItems="center"
              mb={2}
            >
              <Typography variant="h6"> User Activity Report </Typography>{" "}
              <Button
                variant="outlined"
                startIcon={<Download />}
                onClick={() => handleExportReport("user-activity")}
              >
                Export CSV{" "}
              </Button>{" "}
            </Box>{" "}
            <TableContainer sx={tableContainerSx}>
              <Table size="small">
                <TableHead sx={tableHeadSx}>
                  <TableRow>
                    <TableCell>User</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell>Books Borrowed</TableCell>
                    <TableCell>Books Returned</TableCell>
                    <TableCell>Total Fines</TableCell>
                    <TableCell>Last Activity</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {renderTableRows(
                    reportData.userActivityReport,
                    (user, index) => (
                      <TableRow key={user.id || user.userId || index} sx={stripedRowSx}>
                        <TableCell>
                          {user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Unknown User"}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={user.role || "Unknown"}
                            size="small"
                            color={user.role ? "default" : "warning"}
                          />
                        </TableCell>
                        <TableCell>{formatNumber(user.borrowed)}</TableCell>
                        <TableCell>{formatNumber(user.returned)}</TableCell>
                        <TableCell>{formatCurrency(user.totalFines)}</TableCell>
                        <TableCell>{formatDate(user.lastActivity)}</TableCell>
                      </TableRow>
                    ),
                    "No user activity recorded for this range.",
                    6,
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </TabPanel>
          {/* Overdue Books Tab */}{" "}
          <TabPanel value={currentTab} index={4}>
            <Box
              display="flex"
              justifyContent="space-between"
              alignItems="center"
              mb={2}
            >
              <Typography variant="h6"> Overdue Books Report </Typography>{" "}
              <Button
                variant="outlined"
                startIcon={<Download />}
                onClick={() => handleExportReport("overdue")}
              >
                Export CSV{" "}
              </Button>{" "}
            </Box>{" "}
            <TableContainer sx={tableContainerSx}>
              <Table size="small">
                <TableHead sx={tableHeadSx}>
                  <TableRow>
                    <TableCell>Book Title</TableCell>
                    <TableCell>Borrower</TableCell>
                    <TableCell>Due Date</TableCell>
                    <TableCell>Days Overdue</TableCell>
                    <TableCell>Accumulated Fine</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {renderTableRows(
                    reportData.overdueReport,
                    (item, index) => (
                      <TableRow key={item.id || item.transactionId || index} sx={stripedRowSx}>
                        <TableCell>{item.bookTitle || "Unknown Book"}</TableCell>
                        <TableCell>
                          {item.borrowerName || "Unknown Borrower"}
                        </TableCell>
                        <TableCell>{formatDate(item.dueDate)}</TableCell>
                        <TableCell>{formatNumber(item.daysOverdue)}</TableCell>
                        <TableCell>{formatCurrency(item.fine)}</TableCell>
                        <TableCell>
                          <Chip
                            label={item.status || "Overdue"}
                            color={
                              Number(item.daysOverdue) > 30 ? "error" : "warning"
                            }
                            size="small"
                          />
                        </TableCell>
                      </TableRow>
                    ),
                    "No overdue items at the moment.",
                    6,
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </TabPanel>
          {/* Fines Tab */}{" "}
          <TabPanel value={currentTab} index={5}>
            <Box
              display="flex"
              justifyContent="space-between"
              alignItems="center"
              mb={2}
            >
              <Typography variant="h6"> Fines Report </Typography>{" "}
              <Button
                variant="outlined"
                startIcon={<Download />}
                onClick={() => handleExportReport("fines")}
              >
                Export CSV{" "}
              </Button>{" "}
            </Box>{" "}
            <TableContainer sx={tableContainerSx}>
              <Table size="small">
                <TableHead sx={tableHeadSx}>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>User</TableCell>
                    <TableCell>Book</TableCell>
                    <TableCell>Fine Amount</TableCell>
                    <TableCell>Reason</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {renderTableRows(
                    reportData.fineReport,
                    (fine, index) => (
                      <TableRow key={fine.id || index} sx={stripedRowSx}>
                        <TableCell>{formatDate(fine.date)}</TableCell>
                        <TableCell>
                          {fine.userName || "Unknown User"}
                        </TableCell>
                        <TableCell>
                          {fine.bookTitle || "Unknown Book"}
                        </TableCell>
                        <TableCell>{formatCurrency(fine.amount)}</TableCell>
                        <TableCell>{fine.reason || "N/A"}</TableCell>
                        <TableCell>
                          <Chip
                            label={fine.status || "unpaid"}
                            color={
                              (fine.status || "").toLowerCase() === "paid"
                                ? "success"
                                : "warning"
                            }
                            size="small"
                          />
                        </TableCell>
                      </TableRow>
                    ),
                    "No fines recorded for this range.",
                    6,
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </TabPanel>
          {/* Inventory Tab */}{" "}
          <TabPanel value={currentTab} index={6}>
            <Box
              display="flex"
              justifyContent="space-between"
              alignItems="center"
              mb={2}
            >
              <Typography variant="h6"> Inventory Report </Typography>{" "}
              <Button
                variant="outlined"
                startIcon={<Download />}
                onClick={() => handleExportReport("inventory")}
              >
                Export CSV{" "}
              </Button>{" "}
            </Box>{" "}
            <TableContainer sx={tableContainerSx}>
              <Table size="small">
                <TableHead sx={tableHeadSx}>
                  <TableRow>
                    <TableCell>Book Title</TableCell>
                    <TableCell>Author</TableCell>
                    <TableCell>Category</TableCell>
                    <TableCell>Total Copies</TableCell>
                    <TableCell>Available</TableCell>
                    <TableCell>Borrowed</TableCell>
                    <TableCell>Lost / Damaged</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {renderTableRows(
                    reportData.inventoryReport,
                    (book, index) => (
                      <TableRow key={book.id || index} sx={stripedRowSx}>
                        <TableCell>{book.title || "Unknown Title"}</TableCell>
                        <TableCell>{book.author || "Unknown Author"}</TableCell>
                        <TableCell>
                          <Chip
                            label={book.category || "Uncategorized"}
                            size="small"
                            color={book.category ? "default" : "warning"}
                          />
                        </TableCell>
                        <TableCell>{formatNumber(book.totalCopies)}</TableCell>
                        <TableCell>{formatNumber(book.available)}</TableCell>
                        <TableCell>{formatNumber(book.borrowed)}</TableCell>
                        <TableCell>{formatNumber(book.lostDamaged)}</TableCell>
                      </TableRow>
                    ),
                    "Inventory looks good - no records found for this range.",
                    7,
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </TabPanel>{" "}
        </Paper>{" "}
      </Box>{" "}
    </LocalizationProvider>
  );
};

export default ReportsPage;
