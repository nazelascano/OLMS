import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Paper,
  Grid,
  TextField,
  Button,
  Switch,
  FormControlLabel,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Card,
  CardContent,
  CardHeader,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Tab,
  Tabs,
  InputAdornment,
  Stack,
} from "@mui/material";
import {
  Save,
  Restore,
  LibraryBooks,
  Notifications,
  Backup,
  Computer,
  Edit,
  Delete,
  Add,
  Schedule,
} from "@mui/icons-material";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../utils/api";

const TabPanel = ({ children, value, index }) => {
  if (value !== index) {
    return null;
  }
  return <Box sx={{ py: 3 }}>{children}</Box>;
};

const normalizeNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeBoolean = (value, fallback) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes"].includes(normalized)) return true;
    if (["false", "0", "no"].includes(normalized)) return false;
  }
  if (typeof value === "number") return value !== 0;
  return fallback;
};

const createDefaultOperatingHours = () => ({
  monday: { open: "08:00", close: "18:00", closed: false },
  tuesday: { open: "08:00", close: "18:00", closed: false },
  wednesday: { open: "08:00", close: "18:00", closed: false },
  thursday: { open: "08:00", close: "18:00", closed: false },
  friday: { open: "08:00", close: "18:00", closed: false },
  saturday: { open: "09:00", close: "17:00", closed: false },
  sunday: { open: "10:00", close: "16:00", closed: true },
});

const mergeOperatingHours = (input = {}) => {
  const defaults = createDefaultOperatingHours();
  return Object.keys(defaults).reduce((result, day) => {
    const entry = input[day] || {};
    result[day] = {
      open: typeof entry.open === "string" ? entry.open : defaults[day].open,
      close: typeof entry.close === "string" ? entry.close : defaults[day].close,
      closed: typeof entry.closed === "boolean" ? entry.closed : defaults[day].closed,
    };
    return result;
  }, {});
};

const createDefaultLibrarySettings = () => ({
  libraryName: "",
  libraryAddress: "",
  libraryPhone: "",
  libraryEmail: "",
  website: "",
  description: "",
  operatingHours: createDefaultOperatingHours(),
});

const mergeLibrarySettings = (data = {}) => ({
  libraryName: data.libraryName || "",
  libraryAddress: data.libraryAddress || "",
  libraryPhone: data.libraryPhone || "",
  libraryEmail: data.libraryEmail || "",
  website: data.website || "",
  description: data.description || "",
  operatingHours: mergeOperatingHours(data.operatingHours),
});

const createDefaultBorrowingRules = () => ({
  maxBooksPerTransaction: 10,
  maxBorrowDays: 14,
  maxRenewals: 2,
  finePerDay: 5,
  gracePeriodDays: 0,
  maxFineAmount: 0,
  reservationPeriodDays: 3,
  enableFines: true,
  annualBorrowingEnabled: true,
  overnightBorrowingEnabled: false,
  allowRenewalsWithOverdue: false,
});

const mergeBorrowingRules = (data = {}) => {
  const base = createDefaultBorrowingRules();
  return {
    ...base,
    maxBooksPerTransaction: normalizeNumber(
      data.maxBooksPerTransaction,
      base.maxBooksPerTransaction,
    ),
    maxBorrowDays: normalizeNumber(data.maxBorrowDays, base.maxBorrowDays),
    maxRenewals: normalizeNumber(data.maxRenewals, base.maxRenewals),
    finePerDay: normalizeNumber(data.finePerDay, base.finePerDay),
    gracePeriodDays: normalizeNumber(
      data.gracePeriodDays,
      base.gracePeriodDays,
    ),
    maxFineAmount: normalizeNumber(data.maxFineAmount, base.maxFineAmount),
    reservationPeriodDays: normalizeNumber(
      data.reservationPeriodDays,
      base.reservationPeriodDays,
    ),
    enableFines: normalizeBoolean(data.enableFines, base.enableFines),
    annualBorrowingEnabled: normalizeBoolean(
      data.annualBorrowingEnabled,
      base.annualBorrowingEnabled,
    ),
    overnightBorrowingEnabled: normalizeBoolean(
      data.overnightBorrowingEnabled,
      base.overnightBorrowingEnabled,
    ),
    allowRenewalsWithOverdue: normalizeBoolean(
      data.allowRenewalsWithOverdue,
      base.allowRenewalsWithOverdue,
    ),
  };
};

const createDefaultNotificationSettings = () => ({
  emailNotifications: true,
  smsNotifications: false,
  dueDateReminders: true,
  overdueNotifications: true,
  reservationNotifications: true,
  reminderDaysBefore: 3,
  maxReminders: 3,
  emailTemplate: {
    dueDate: "",
    overdue: "",
    reservation: "",
  },
});

const mergeNotificationSettings = (data = {}) => {
  const base = createDefaultNotificationSettings();
  return {
    emailNotifications: normalizeBoolean(
      data.emailNotifications,
      base.emailNotifications,
    ),
    smsNotifications: normalizeBoolean(data.smsNotifications, base.smsNotifications),
    dueDateReminders: normalizeBoolean(
      data.dueDateReminders,
      base.dueDateReminders,
    ),
    overdueNotifications: normalizeBoolean(
      data.overdueNotifications,
      base.overdueNotifications,
    ),
    reservationNotifications: normalizeBoolean(
      data.reservationNotifications,
      base.reservationNotifications,
    ),
    reminderDaysBefore: normalizeNumber(
      data.reminderDaysBefore,
      base.reminderDaysBefore,
    ),
    maxReminders: normalizeNumber(data.maxReminders, base.maxReminders),
    emailTemplate: {
      ...base.emailTemplate,
      ...(data.emailTemplate || {}),
    },
  };
};

const createDefaultSystemSettings = () => ({
  maintenanceMode: false,
  allowRegistration: true,
  requireEmailVerification: true,
  sessionTimeoutMinutes: 60,
  maxLoginAttempts: 5,
  passwordPolicy: {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: false,
  },
  backupFrequency: "daily",
  logRetentionDays: 90,
  auditLogging: true,
  schoolYearStart: "2024-08-01",
  schoolYearEnd: "2025-05-31",
});

const mergeSystemSettings = (data = {}) => {
  const base = createDefaultSystemSettings();
  return {
    ...base,
    passwordPolicy: {
      ...base.passwordPolicy,
      ...(data.passwordPolicy || {}),
    },
    maintenanceMode: normalizeBoolean(data.maintenanceMode, base.maintenanceMode),
    allowRegistration: normalizeBoolean(
      data.allowRegistration,
      base.allowRegistration,
    ),
    requireEmailVerification: normalizeBoolean(
      data.requireEmailVerification,
      base.requireEmailVerification,
    ),
    sessionTimeoutMinutes: normalizeNumber(
      data.sessionTimeoutMinutes,
      base.sessionTimeoutMinutes,
    ),
    maxLoginAttempts: normalizeNumber(
      data.maxLoginAttempts,
      base.maxLoginAttempts,
    ),
    backupFrequency: data.backupFrequency || base.backupFrequency,
    logRetentionDays: normalizeNumber(data.logRetentionDays, base.logRetentionDays),
    auditLogging: normalizeBoolean(data.auditLogging, base.auditLogging),
    schoolYearStart: data.schoolYearStart || base.schoolYearStart,
    schoolYearEnd: data.schoolYearEnd || base.schoolYearEnd,
  };
};

const SettingsPage = () => {
  const { user } = useAuth();
  const [currentTab, setCurrentTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Settings state
  const [librarySettings, setLibrarySettings] = useState(() =>
    createDefaultLibrarySettings(),
  );

  const [borrowingRules, setBorrowingRules] = useState(() =>
    createDefaultBorrowingRules(),
  );

  const [notificationSettings, setNotificationSettings] = useState(() =>
    mergeNotificationSettings(),
  );

  const [systemSettings, setSystemSettings] = useState(() =>
    mergeSystemSettings(),
  );

  const [categories, setCategories] = useState([]);
  const [newCategory, setNewCategory] = useState("");

  useEffect(() => {
    fetchAllSettings();
    fetchCategories();
  }, []);

  const fetchAllSettings = async () => {
    try {
      setLoading(true);
      const [library, borrowing, notifications, system] = await Promise.all([
        api.get("/settings/library"),
        api.get("/settings/borrowing-rules"),
        api.get("/settings/notifications"),
        api.get("/settings/system"),
      ]);
      setLibrarySettings(mergeLibrarySettings(library.data));
      setBorrowingRules(mergeBorrowingRules(borrowing.data));
      setNotificationSettings(mergeNotificationSettings(notifications.data));
      setSystemSettings(mergeSystemSettings(system.data));
    } catch (error) {
      setError("Failed to fetch settings");
      console.error("Error fetching settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await api.get("/books/categories");
      setCategories(response.data);
    } catch (error) {
      console.error("Error fetching categories:", error);
    }
  };

  const saveSettings = async (settingType, data) => {
    try {
      setLoading(true);
      await api.put(`/settings/${settingType}`, data);
      setSuccess("Settings saved successfully");
      setTimeout(() => setSuccess(""), 3000);
    } catch (error) {
      setError("Failed to save settings");
      console.error("Error saving settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLibrarySettingsSave = () => {
    saveSettings("library", mergeLibrarySettings(librarySettings));
  };

  const handleBorrowingRulesSave = () => {
    saveSettings("borrowing-rules", mergeBorrowingRules(borrowingRules));
  };

  const handleNotificationSettingsSave = () => {
    saveSettings("notifications", mergeNotificationSettings(notificationSettings));
  };

  const handleSystemSettingsSave = () => {
    saveSettings("system", mergeSystemSettings(systemSettings));
  };

  const handleAddCategory = async () => {
    if (!newCategory.trim()) return;

    try {
      await api.post("/books/categories", { name: newCategory });
      setNewCategory("");
      fetchCategories();
      setSuccess("Category added successfully");
    } catch (error) {
      setError("Failed to add category");
      console.error("Error adding category:", error);
    }
  };

  const handleDeleteCategory = async (categoryId) => {
    if (!window.confirm("Are you sure you want to delete this category?")) {
      return;
    }

    try {
      await api.delete(`/books/categories/${categoryId}`);
      fetchCategories();
      setSuccess("Category deleted successfully");
    } catch (error) {
      setError("Failed to delete category");
      console.error("Error deleting category:", error);
    }
  };

  const handleBackup = async () => {
    try {
      await api.post("/settings/backup");
      setSuccess("Backup created successfully");
    } catch (error) {
      setError("Failed to create backup");
      console.error("Error creating backup:", error);
    }
  };

  const handleRestore = async () => {
    if (
      !window.confirm(
        "Are you sure you want to restore from backup? This will overwrite current data.",
      )
    ) {
      return;
    }

    try {
      await api.post("/settings/restore");
      setSuccess("System restored successfully");
      fetchAllSettings();
    } catch (error) {
      setError("Failed to restore from backup");
      console.error("Error restoring backup:", error);
    }
  };

  const isAdmin = user?.role === "admin";

  if (!isAdmin) {
    return (
      <Box>
        <Alert severity="error">
          Access denied. Only administrators can access system settings.
        </Alert>
      </Box>
    );
  }

  return (
    <Box>
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={3}
      >
        <Typography variant="h4">System Settings</Typography>
        <Box>
          <Button
            variant="outlined"
            startIcon={<Backup />}
            onClick={handleBackup}
            sx={{ mr: 2 }}
            disabled={loading}
          >
            Create Backup
          </Button>
          <Button
            variant="outlined"
            startIcon={<Restore />}
            onClick={handleRestore}
            color="warning"
            disabled={loading}
          >
            Restore Backup
          </Button>
        </Box>
      </Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}
      <Paper sx={{ borderRadius: 2 }}>
        <Tabs
          value={currentTab}
          onChange={(event, newValue) => setCurrentTab(newValue)}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label="Library Info" icon={<LibraryBooks />} />
          <Tab label="Borrowing Rules" icon={<Schedule />} />
          <Tab label="Notifications" icon={<Notifications />} />
          <Tab label="System" icon={<Computer />} />
          <Tab label="Categories" icon={<Edit />} />
        </Tabs>

        <TabPanel value={currentTab} index={0}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Card elevation={1}>
                <CardHeader
                  title="Library Profile"
                  subheader="Information shown to patrons and on notices"
                />
                <CardContent>
                  <Stack spacing={2}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Library Name"
                      value={librarySettings.libraryName}
                      onChange={(e) =>
                        setLibrarySettings({
                          ...librarySettings,
                          libraryName: e.target.value,
                        })
                      }
                    />
                    <TextField
                      fullWidth
                      size="small"
                      label="Website"
                      placeholder="https://"
                      value={librarySettings.website}
                      onChange={(e) =>
                        setLibrarySettings({
                          ...librarySettings,
                          website: e.target.value,
                        })
                      }
                    />
                    <TextField
                      fullWidth
                      size="small"
                      label="Description"
                      multiline
                      minRows={4}
                      value={librarySettings.description}
                      onChange={(e) =>
                        setLibrarySettings({
                          ...librarySettings,
                          description: e.target.value,
                        })
                      }
                    />
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={6}>
              <Card elevation={1}>
                <CardHeader
                  title="Contact Details"
                  subheader="Helps patrons reach the library quickly"
                />
                <CardContent>
                  <Stack spacing={2}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Phone Number"
                      value={librarySettings.libraryPhone}
                      onChange={(e) =>
                        setLibrarySettings({
                          ...librarySettings,
                          libraryPhone: e.target.value,
                        })
                      }
                    />
                    <TextField
                      fullWidth
                      size="small"
                      label="Email Address"
                      type="email"
                      value={librarySettings.libraryEmail}
                      onChange={(e) =>
                        setLibrarySettings({
                          ...librarySettings,
                          libraryEmail: e.target.value,
                        })
                      }
                    />
                    <TextField
                      fullWidth
                      size="small"
                      label="Address"
                      multiline
                      minRows={3}
                      value={librarySettings.libraryAddress}
                      onChange={(e) =>
                        setLibrarySettings({
                          ...librarySettings,
                          libraryAddress: e.target.value,
                        })
                      }
                    />
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12}>
              <Card elevation={1}>
                <CardHeader
                  title="Operating Hours"
                  subheader="Toggle availability and adjust daily hours"
                />
                <CardContent>
                  <Stack spacing={2}>
                    {Object.entries(librarySettings.operatingHours).map(
                      ([day, hours]) => (
                        <Paper
                          key={day}
                          variant="outlined"
                          sx={{ p: 2, borderRadius: 2 }}
                        >
                          <Stack
                            direction={{ xs: "column", sm: "row" }}
                            spacing={2}
                            alignItems={{ xs: "flex-start", sm: "center" }}
                          >
                            <Typography
                              variant="subtitle1"
                              sx={{ textTransform: "capitalize", minWidth: 96 }}
                            >
                              {day}
                            </Typography>
                            <FormControlLabel
                              control={
                                <Switch
                                  checked={!hours.closed}
                                  onChange={(e) =>
                                    setLibrarySettings({
                                      ...librarySettings,
                                      operatingHours: {
                                        ...librarySettings.operatingHours,
                                        [day]: {
                                          ...hours,
                                          closed: !e.target.checked,
                                        },
                                      },
                                    })
                                  }
                                />
                              }
                              label="Open"
                              sx={{ mr: { sm: 2 } }}
                            />
                            {!hours.closed && (
                              <Stack
                                direction={{ xs: "column", sm: "row" }}
                                spacing={2}
                                sx={{ width: "100%" }}
                              >
                                <TextField
                                  type="time"
                                  size="small"
                                  fullWidth
                                  label="Opens"
                                  value={hours.open}
                                  onChange={(e) =>
                                    setLibrarySettings({
                                      ...librarySettings,
                                      operatingHours: {
                                        ...librarySettings.operatingHours,
                                        [day]: { ...hours, open: e.target.value },
                                      },
                                    })
                                  }
                                />
                                <TextField
                                  type="time"
                                  size="small"
                                  fullWidth
                                  label="Closes"
                                  value={hours.close}
                                  onChange={(e) =>
                                    setLibrarySettings({
                                      ...librarySettings,
                                      operatingHours: {
                                        ...librarySettings.operatingHours,
                                        [day]: { ...hours, close: e.target.value },
                                      },
                                    })
                                  }
                                />
                              </Stack>
                            )}
                          </Stack>
                        </Paper>
                      ),
                    )}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12}>
              <Box display="flex" justifyContent="flex-end">
                <Button
                  variant="contained"
                  startIcon={<Save />}
                  onClick={handleLibrarySettingsSave}
                  disabled={loading}
                >
                  Save Library Settings
                </Button>
              </Box>
            </Grid>
          </Grid>
        </TabPanel>

        <TabPanel value={currentTab} index={1}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Card elevation={1}>
                <CardHeader
                  title="Borrowing Limits"
                  subheader="Control how many books and renewals each patron gets"
                />
                <CardContent>
                  <Stack spacing={2}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Max Books Per Transaction"
                      type="number"
                      value={borrowingRules.maxBooksPerTransaction}
                      onChange={(e) =>
                        setBorrowingRules({
                          ...borrowingRules,
                          maxBooksPerTransaction:
                            parseInt(e.target.value, 10) || 0,
                        })
                      }
                    />
                    <TextField
                      fullWidth
                      size="small"
                      label="Borrowing Period (Days)"
                      type="number"
                      value={borrowingRules.maxBorrowDays}
                      onChange={(e) =>
                        setBorrowingRules({
                          ...borrowingRules,
                          maxBorrowDays: parseInt(e.target.value, 10) || 0,
                        })
                      }
                    />
                    <TextField
                      fullWidth
                      size="small"
                      label="Renewal Limit"
                      type="number"
                      value={borrowingRules.maxRenewals}
                      onChange={(e) =>
                        setBorrowingRules({
                          ...borrowingRules,
                          maxRenewals: parseInt(e.target.value, 10) || 0,
                        })
                      }
                    />
                    <TextField
                      fullWidth
                      size="small"
                      label="Reservation Hold (Days)"
                      type="number"
                      value={borrowingRules.reservationPeriodDays}
                      onChange={(e) =>
                        setBorrowingRules({
                          ...borrowingRules,
                          reservationPeriodDays: parseInt(e.target.value, 10) || 0,
                        })
                      }
                    />
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={6}>
              <Card elevation={1}>
                <CardHeader
                  title="Fines & Grace Period"
                  subheader="Adjust how the system calculates penalties"
                />
                <CardContent>
                  <Stack spacing={2}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={borrowingRules.enableFines}
                          onChange={(e) =>
                            setBorrowingRules({
                              ...borrowingRules,
                              enableFines: e.target.checked,
                            })
                          }
                        />
                      }
                      label="Enable Fines"
                    />
                    <TextField
                      fullWidth
                      size="small"
                      label="Fine Per Day"
                      type="number"
                      inputProps={{ step: 0.01, min: 0 }}
                      value={borrowingRules.finePerDay}
                      onChange={(e) =>
                        setBorrowingRules({
                          ...borrowingRules,
                          finePerDay: parseFloat(e.target.value) || 0,
                        })
                      }
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">₱</InputAdornment>
                        ),
                      }}
                      disabled={!borrowingRules.enableFines}
                    />
                    <TextField
                      fullWidth
                      size="small"
                      label="Grace Period (Days)"
                      type="number"
                      value={borrowingRules.gracePeriodDays}
                      onChange={(e) =>
                        setBorrowingRules({
                          ...borrowingRules,
                          gracePeriodDays: parseInt(e.target.value, 10) || 0,
                        })
                      }
                    />
                    <TextField
                      fullWidth
                      size="small"
                      label="Maximum Fine Amount"
                      type="number"
                      inputProps={{ step: 0.01, min: 0 }}
                      value={borrowingRules.maxFineAmount}
                      onChange={(e) =>
                        setBorrowingRules({
                          ...borrowingRules,
                          maxFineAmount: parseFloat(e.target.value) || 0,
                        })
                      }
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">₱</InputAdornment>
                        ),
                      }}
                      disabled={!borrowingRules.enableFines}
                    />
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12}>
              <Card elevation={1}>
                <CardHeader
                  title="Borrowing Options"
                  subheader="Toggle advanced borrowing flows"
                />
                <CardContent>
                  <Stack spacing={1.5}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={borrowingRules.annualBorrowingEnabled}
                          onChange={(e) =>
                            setBorrowingRules({
                              ...borrowingRules,
                              annualBorrowingEnabled: e.target.checked,
                            })
                          }
                        />
                      }
                      label="Enable Annual Borrowing"
                    />
                    <FormControlLabel
                      control={
                        <Switch
                          checked={borrowingRules.overnightBorrowingEnabled}
                          onChange={(e) =>
                            setBorrowingRules({
                              ...borrowingRules,
                              overnightBorrowingEnabled: e.target.checked,
                            })
                          }
                        />
                      }
                      label="Allow Overnight Borrowing"
                    />
                    <FormControlLabel
                      control={
                        <Switch
                          checked={borrowingRules.allowRenewalsWithOverdue}
                          onChange={(e) =>
                            setBorrowingRules({
                              ...borrowingRules,
                              allowRenewalsWithOverdue: e.target.checked,
                            })
                          }
                        />
                      }
                      label="Allow Renewals When Overdue"
                    />
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12}>
              <Box display="flex" justifyContent="flex-end">
                <Button
                  variant="contained"
                  startIcon={<Save />}
                  onClick={handleBorrowingRulesSave}
                  disabled={loading}
                >
                  Save Borrowing Rules
                </Button>
              </Box>
            </Grid>
          </Grid>
        </TabPanel>

        <TabPanel value={currentTab} index={2}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Card elevation={1}>
                <CardHeader
                  title="Notification Channels"
                  subheader="Choose how patrons receive alerts"
                />
                <CardContent>
                  <Stack spacing={1.5}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={notificationSettings.emailNotifications}
                          onChange={(e) =>
                            setNotificationSettings({
                              ...notificationSettings,
                              emailNotifications: e.target.checked,
                            })
                          }
                        />
                      }
                      label="Email Notifications"
                    />
                    <FormControlLabel
                      control={
                        <Switch
                          checked={notificationSettings.smsNotifications}
                          onChange={(e) =>
                            setNotificationSettings({
                              ...notificationSettings,
                              smsNotifications: e.target.checked,
                            })
                          }
                        />
                      }
                      label="SMS Notifications"
                    />
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={6}>
              <Card elevation={1}>
                <CardHeader
                  title="Notification Types"
                  subheader="Enable reminders that matter to your team"
                />
                <CardContent>
                  <Stack spacing={1.5}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={notificationSettings.dueDateReminders}
                          onChange={(e) =>
                            setNotificationSettings({
                              ...notificationSettings,
                              dueDateReminders: e.target.checked,
                            })
                          }
                        />
                      }
                      label="Due Date Reminders"
                    />
                    <FormControlLabel
                      control={
                        <Switch
                          checked={notificationSettings.overdueNotifications}
                          onChange={(e) =>
                            setNotificationSettings({
                              ...notificationSettings,
                              overdueNotifications: e.target.checked,
                            })
                          }
                        />
                      }
                      label="Overdue Notices"
                    />
                    <FormControlLabel
                      control={
                        <Switch
                          checked={notificationSettings.reservationNotifications}
                          onChange={(e) =>
                            setNotificationSettings({
                              ...notificationSettings,
                              reservationNotifications: e.target.checked,
                            })
                          }
                        />
                      }
                      label="Reservation Updates"
                    />
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={6}>
              <Card elevation={1}>
                <CardHeader
                  title="Reminder Schedule"
                  subheader="Fine-tune when reminders are sent"
                />
                <CardContent>
                  <Stack spacing={2}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Reminder Days Before Due"
                      type="number"
                      value={notificationSettings.reminderDaysBefore}
                      onChange={(e) =>
                        setNotificationSettings({
                          ...notificationSettings,
                          reminderDaysBefore: parseInt(e.target.value, 10) || 0,
                        })
                      }
                    />
                    <TextField
                      fullWidth
                      size="small"
                      label="Maximum Reminders"
                      type="number"
                      value={notificationSettings.maxReminders}
                      onChange={(e) =>
                        setNotificationSettings({
                          ...notificationSettings,
                          maxReminders: parseInt(e.target.value, 10) || 0,
                        })
                      }
                    />
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={6}>
              <Card elevation={1}>
                <CardHeader
                  title="Email Templates"
                  subheader="Personalize the tone of automated emails"
                />
                <CardContent>
                  <Stack spacing={2}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Due Date Template"
                      multiline
                      minRows={2}
                      value={notificationSettings.emailTemplate.dueDate}
                      onChange={(e) =>
                        setNotificationSettings({
                          ...notificationSettings,
                          emailTemplate: {
                            ...notificationSettings.emailTemplate,
                            dueDate: e.target.value,
                          },
                        })
                      }
                    />
                    <TextField
                      fullWidth
                      size="small"
                      label="Overdue Template"
                      multiline
                      minRows={2}
                      value={notificationSettings.emailTemplate.overdue}
                      onChange={(e) =>
                        setNotificationSettings({
                          ...notificationSettings,
                          emailTemplate: {
                            ...notificationSettings.emailTemplate,
                            overdue: e.target.value,
                          },
                        })
                      }
                    />
                    <TextField
                      fullWidth
                      size="small"
                      label="Reservation Template"
                      multiline
                      minRows={2}
                      value={notificationSettings.emailTemplate.reservation}
                      onChange={(e) =>
                        setNotificationSettings({
                          ...notificationSettings,
                          emailTemplate: {
                            ...notificationSettings.emailTemplate,
                            reservation: e.target.value,
                          },
                        })
                      }
                    />
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12}>
              <Box display="flex" justifyContent="flex-end">
                <Button
                  variant="contained"
                  startIcon={<Save />}
                  onClick={handleNotificationSettingsSave}
                  disabled={loading}
                >
                  Save Notification Settings
                </Button>
              </Box>
            </Grid>
          </Grid>
        </TabPanel>

        <TabPanel value={currentTab} index={3}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Card elevation={1}>
                <CardHeader
                  title="Access & Availability"
                  subheader="Control who can access the portal"
                />
                <CardContent>
                  <Stack spacing={1.5}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={systemSettings.maintenanceMode}
                          onChange={(e) =>
                            setSystemSettings({
                              ...systemSettings,
                              maintenanceMode: e.target.checked,
                            })
                          }
                        />
                      }
                      label="Maintenance Mode"
                    />
                    <FormControlLabel
                      control={
                        <Switch
                          checked={systemSettings.allowRegistration}
                          onChange={(e) =>
                            setSystemSettings({
                              ...systemSettings,
                              allowRegistration: e.target.checked,
                            })
                          }
                        />
                      }
                      label="Allow User Registration"
                    />
                    <FormControlLabel
                      control={
                        <Switch
                          checked={systemSettings.requireEmailVerification}
                          onChange={(e) =>
                            setSystemSettings({
                              ...systemSettings,
                              requireEmailVerification: e.target.checked,
                            })
                          }
                        />
                      }
                      label="Require Email Verification"
                    />
                    <FormControlLabel
                      control={
                        <Switch
                          checked={systemSettings.auditLogging}
                          onChange={(e) =>
                            setSystemSettings({
                              ...systemSettings,
                              auditLogging: e.target.checked,
                            })
                          }
                        />
                      }
                      label="Enable Audit Logging"
                    />
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={6}>
              <Card elevation={1}>
                <CardHeader
                  title="Security Limits"
                  subheader="Keep accounts secure with sensible defaults"
                />
                <CardContent>
                  <Stack spacing={2}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Session Timeout (Minutes)"
                      type="number"
                      value={systemSettings.sessionTimeoutMinutes}
                      onChange={(e) =>
                        setSystemSettings({
                          ...systemSettings,
                          sessionTimeoutMinutes:
                            parseInt(e.target.value, 10) || 0,
                        })
                      }
                    />
                    <TextField
                      fullWidth
                      size="small"
                      label="Max Login Attempts"
                      type="number"
                      value={systemSettings.maxLoginAttempts}
                      onChange={(e) =>
                        setSystemSettings({
                          ...systemSettings,
                          maxLoginAttempts: parseInt(e.target.value, 10) || 0,
                        })
                      }
                    />
                    <TextField
                      fullWidth
                      size="small"
                      label="Password Minimum Length"
                      type="number"
                      value={systemSettings.passwordPolicy.minLength}
                      onChange={(e) =>
                        setSystemSettings({
                          ...systemSettings,
                          passwordPolicy: {
                            ...systemSettings.passwordPolicy,
                            minLength: parseInt(e.target.value, 10) || 0,
                          },
                        })
                      }
                    />
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={6}>
              <Card elevation={1}>
                <CardHeader
                  title="Backup & Retention"
                  subheader="Keep data safe and manageable"
                />
                <CardContent>
                  <Stack spacing={2}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Backup Frequency</InputLabel>
                      <Select
                        value={systemSettings.backupFrequency}
                        label="Backup Frequency"
                        onChange={(e) =>
                          setSystemSettings({
                            ...systemSettings,
                            backupFrequency: e.target.value,
                          })
                        }
                      >
                        <MenuItem value="daily">Daily</MenuItem>
                        <MenuItem value="weekly">Weekly</MenuItem>
                        <MenuItem value="monthly">Monthly</MenuItem>
                      </Select>
                    </FormControl>
                    <TextField
                      fullWidth
                      size="small"
                      label="Log Retention (Days)"
                      type="number"
                      value={systemSettings.logRetentionDays}
                      onChange={(e) =>
                        setSystemSettings({
                          ...systemSettings,
                          logRetentionDays: parseInt(e.target.value, 10) || 0,
                        })
                      }
                    />
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12}>
              <Box display="flex" justifyContent="flex-end">
                <Button
                  variant="contained"
                  startIcon={<Save />}
                  onClick={handleSystemSettingsSave}
                  disabled={loading}
                >
                  Save System Settings
                </Button>
              </Box>
            </Grid>
          </Grid>
        </TabPanel>

        <TabPanel value={currentTab} index={4}>
          <Card elevation={1}>
            <CardHeader
              title="Book Categories"
              subheader="Organize titles by keeping categories up to date"
            />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    size="small"
                    label="New Category"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleAddCategory();
                      }
                    }}
                  />
                </Grid>
                <Grid item xs={12} md={6} display="flex" alignItems="center">
                  <Button
                    variant="contained"
                    startIcon={<Add />}
                    onClick={handleAddCategory}
                    disabled={!newCategory.trim() || loading}
                  >
                    Add Category
                  </Button>
                </Grid>
                <Grid item xs={12}>
                  {categories.length === 0 ? (
                    <Typography color="text.secondary">
                      No categories yet. Add your first category to improve search.
                    </Typography>
                  ) : (
                    <List>
                      {categories.map((category) => (
                        <ListItem key={category._id} divider secondaryAction={
                          <IconButton
                            edge="end"
                            color="error"
                            onClick={() => handleDeleteCategory(category._id)}
                          >
                            <Delete />
                          </IconButton>
                        }>
                          <ListItemText primary={category.name} />
                        </ListItem>
                      ))}
                    </List>
                  )}
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </TabPanel>
      </Paper>
    </Box>
  );
};

export default SettingsPage;
