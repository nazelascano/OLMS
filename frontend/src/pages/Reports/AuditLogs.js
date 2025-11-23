import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import {
  Download,
  ExpandLess,
  ExpandMore,
  FilterList,
  Refresh,
  Search,
  Visibility,
} from "@mui/icons-material";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { auditAPI, downloadFile, usersAPI } from "../../utils/api";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const FALLBACK_ROLE_OPTIONS = ["admin", "librarian", "staff", "student"];
const toIsoIfValid = (value) =>
  value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString() : undefined;

const formatDateTime = (value) => {
  if (!value) {
    return "—";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return DATE_TIME_FORMATTER.format(date);
};

const humanizeKey = (key = "") =>
  key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());

const formatDetailValue = (value) => {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => formatDetailValue(entry)).join(", ");
  }
  if (typeof value === "object") {
    const nested = Object.entries(value)
      .map(([key, nestedValue]) => `${humanizeKey(key)}: ${formatDetailValue(nestedValue)}`)
      .join("; ");
    return nested || "—";
  }
  return String(value);
};

const stringifyDetails = (details) => {
  if (!details) {
    return "No additional details provided.";
  }
  if (typeof details === "string") {
    return details;
  }
  if (typeof details !== "object") {
    return String(details);
  }

  if (Array.isArray(details)) {
    if (details.length === 0) {
      return "No additional details provided.";
    }
    return details
      .map((item, index) => `${index + 1}. ${formatDetailValue(item)}`)
      .join("\n");
  }

  const entries = Object.entries(details).map(
    ([key, value]) => `${humanizeKey(key)}: ${formatDetailValue(value)}`,
  );

  return entries.length > 0 ? entries.join("\n") : "No additional details provided.";
};

const getLogIdentifier = (log) => log?.id || log?._id || log?.timestamp;

const getUserPrimary = (log) =>
  log?.userName || log?.userEmail || log?.userId || log?.performedBy || "System";

const getUserSecondary = (log) =>
  log?.userRole || log?.userEmail || (log?.userId ? `ID: ${log.userId}` : "");

const getEntityDisplay = (log) => {
  const entity = log?.entity || log?.resource || "—";
  if (log?.entityId || log?.resourceId) {
    return `${entity} • ${log.entityId || log.resourceId}`;
  }
  return entity;
};

const getStatusMeta = (log) => {
  const rawStatus =
    log?.status ||
    (log?.success === false ? "Failed" : log?.success === true ? "Success" : "Info");
  const normalized = String(rawStatus).toLowerCase();

  if (normalized.includes("fail") || normalized.includes("error")) {
    return { label: rawStatus || "Failed", color: "error" };
  }

  if (normalized.includes("warn")) {
    return { label: rawStatus || "Warning", color: "warning" };
  }

  if (normalized.includes("success") || normalized.includes("ok")) {
    return { label: rawStatus || "Success", color: "success" };
  }

  return { label: rawStatus || "Info", color: "default" };
};

const getActionLabel = (log) =>
  log?.action || log?.eventType || log?.activity || "Unknown";

const getDescription = (log) =>
  log?.description || log?.message || log?.summary || "No description provided.";

const toPlainObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

const getUserSearchFields = (log) => {
  const details = toPlainObject(log?.details);
  const metadata = toPlainObject(log?.metadata);
  const nestedUser = toPlainObject(log?.user);
  const nestedLibrary = toPlainObject(nestedUser.library);
  const detailStudent = toPlainObject(details.student);
  const metadataStudent = toPlainObject(metadata.student);
  const detailProfile = toPlainObject(details.profile);
  const metadataProfile = toPlainObject(metadata.profile);
  const request = toPlainObject(metadata.createRequest || metadata.request);
  const requestStudent = toPlainObject(request.student);
  const requestLibrary = toPlainObject(request.library);
  const profileLibrary = toPlainObject(detailProfile.library);
  const metadataLibrary = toPlainObject(metadataProfile.library);
  const detailUser = toPlainObject(details.user);
  const metadataUser = toPlainObject(metadata.user);
  const borrower = toPlainObject(details.borrower || metadata.borrower || log.borrower);

  const buildName = (source) => {
    if (!source) {
      return "";
    }
    const fullName = [source.firstName, source.middleName, source.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    return fullName || source.name || "";
  };

  const studentName =
    log?.studentName ||
    details.studentName ||
    metadata.studentName ||
    detailProfile.studentName ||
    metadataProfile.studentName ||
    detailUser.studentName ||
    metadataUser.studentName ||
    borrower.name ||
    borrower.fullName ||
    details.borrowerName ||
    metadata.borrowerName ||
    log?.borrowerName ||
    buildName(detailStudent) ||
    buildName(metadataStudent) ||
    buildName(detailProfile) ||
    buildName(detailUser) ||
    buildName(metadataProfile) ||
    buildName(request) ||
    buildName(requestStudent) ||
    nestedUser.studentName ||
    nestedUser.name ||
    getUserPrimary(log);

  const studentId =
    log?.studentId ||
    details.studentId ||
    metadata.studentId ||
    detailStudent.studentId ||
    metadataStudent.studentId ||
    detailProfile.studentId ||
    metadataProfile.studentId ||
    detailUser.studentId ||
    metadataUser.studentId ||
    request.studentId ||
    requestStudent.studentId ||
    nestedUser.studentId ||
    nestedUser.studentNumber ||
    borrower.studentId ||
    log?.userId;

  const username =
    log?.username ||
    details.username ||
    metadata.username ||
    detailUser.username ||
    metadataUser.username ||
    nestedUser.username ||
    log?.userName ||
    log?.userEmail;

  const libraryId =
    log?.libraryId ||
    log?.libraryCardNumber ||
    details.libraryId ||
    details.libraryCardNumber ||
    detailStudent.libraryCardNumber ||
    metadataStudent.libraryCardNumber ||
    detailProfile.libraryCardNumber ||
    metadataProfile.libraryCardNumber ||
    detailUser.libraryCardNumber ||
    metadataUser.libraryCardNumber ||
    profileLibrary.cardNumber ||
    metadataLibrary.cardNumber ||
    request.libraryId ||
    request.libraryCardNumber ||
    requestStudent.libraryCardNumber ||
    requestLibrary.cardNumber ||
    borrower.libraryCardNumber ||
    metadata.libraryId ||
    metadata.libraryCardNumber ||
    nestedUser.libraryCardNumber ||
    nestedLibrary.cardNumber;

  return {
    studentName,
    studentId,
    username,
    libraryId,
  };
};

const resolveOptionSearchValue = (option, typedValue) => {
  if (!option) {
    return typedValue ?? "";
  }

  const normalizedTyped = (typedValue || "").trim().toLowerCase();
  if (normalizedTyped && Array.isArray(option.candidates)) {
    const match = option.candidates.find((candidate) => {
      if (!candidate) {
        return false;
      }
      return String(candidate).toLowerCase() === normalizedTyped;
    });
    if (match) {
      return typedValue;
    }
  }

  return option.searchValue || option.label || option.value || typedValue || "";
};

const AuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [expandedRows, setExpandedRows] = useState(() => new Set());
  const [selectedLog, setSelectedLog] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [summary, setSummary] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [roleOptions, setRoleOptions] = useState(FALLBACK_ROLE_OPTIONS);

  const [filters, setFilters] = useState({
    action: "all",
    entity: "all",
    role: "all",
    userQuery: "",
    startDate: null,
    endDate: null,
  });
  const handleFiltersUpdate = useCallback((updates) => {
    setFilters((prev) => {
      const nextUpdates =
        typeof updates === "function" ? updates(prev) : { ...updates };
      return { ...prev, ...nextUpdates };
    });
    setPage(0);
  }, []);

  const handleFilterChange = (key, value) => {
    handleFiltersUpdate({ [key]: value });
  };

  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const trimmedQuery = filters.userQuery?.trim();

      const params = {
        page: page + 1,
        limit: rowsPerPage,
        action: filters.action !== "all" ? filters.action : undefined,
        entity: filters.entity !== "all" ? filters.entity : undefined,
        role: filters.role !== "all" ? filters.role : undefined,
        userQuery: trimmedQuery ? trimmedQuery : undefined,
        startDate: toIsoIfValid(filters.startDate),
        endDate: toIsoIfValid(filters.endDate),
      };

      const { data } = await auditAPI.getLogs(params);
      const items = Array.isArray(data?.logs) ? data.logs : Array.isArray(data) ? data : [];
      const pagination = data?.pagination;

      setLogs(items);
      setTotalCount(pagination?.total ?? items.length ?? 0);
    } catch (err) {
      console.error("Failed to load audit logs", err);
      setError("Failed to load audit logs. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [filters, page, rowsPerPage]);

  const loadSummary = useCallback(async () => {
    try {
      const trimmedQuery = filters.userQuery?.trim();
      const params = {
        days: 30,
        action: filters.action !== "all" ? filters.action : undefined,
        entity: filters.entity !== "all" ? filters.entity : undefined,
        role: filters.role !== "all" ? filters.role : undefined,
        userQuery: trimmedQuery ? trimmedQuery : undefined,
        startDate: toIsoIfValid(filters.startDate),
        endDate: toIsoIfValid(filters.endDate),
      };

      const [summaryResponse, recentResponse] = await Promise.all([
        auditAPI.getSummary(params),
        auditAPI.getRecentActivity({ limit: 5 }),
      ]);

      setSummary(summaryResponse?.data ?? null);
      setRecentActivity(Array.isArray(recentResponse?.data) ? recentResponse.data : []);
    } catch (err) {
      console.error("Failed to load audit summary", err);
    }
  }, [filters]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    let isMounted = true;

    const fetchRoles = async () => {
      try {
        const { data } = await usersAPI.getRoles();
        const rawRoles = Array.isArray(data?.roles) ? data.roles : Array.isArray(data) ? data : [];
        const normalized = Array.from(
          new Set(
            rawRoles
              .map((role) => (role ? String(role).trim().toLowerCase() : ""))
              .filter(Boolean),
          ),
        ).sort((a, b) => a.localeCompare(b));
        if (isMounted) {
          setRoleOptions(normalized.length > 0 ? normalized : FALLBACK_ROLE_OPTIONS);
        }
      } catch (err) {
        console.error("Failed to load user roles", err);
        if (isMounted) {
          setRoleOptions(FALLBACK_ROLE_OPTIONS);
        }
      }
    };

    fetchRoles();

    return () => {
      isMounted = false;
    };
  }, []);

  const metrics = useMemo(() => {
    if (!summary) {
      return {
        totalLogs: 0,
        logsToday: 0,
        uniqueUsers: 0,
        topAction: "—",
        topEntity: "—",
      };
    }

    const totalLogs = summary.totalLogs ?? 0;
    const uniqueUsers = Object.keys(summary.userCounts ?? {}).length;
    const todayKey = new Date().toDateString();
    const logsToday = summary.dailyActivity?.[todayKey] ?? 0;

    const topActionEntry = Object.entries(summary.actionCounts ?? {}).sort(
      (a, b) => b[1] - a[1],
    )[0];

    const topEntityEntry = Object.entries(summary.entityCounts ?? {}).sort(
      (a, b) => b[1] - a[1],
    )[0];

    return {
      totalLogs,
      logsToday,
      uniqueUsers,
      topAction: topActionEntry ? `${topActionEntry[0]} • ${topActionEntry[1]}` : "—",
      topEntity: topEntityEntry ? `${topEntityEntry[0]} • ${topEntityEntry[1]}` : "—",
    };
  }, [summary]);

  const filterOptions = useMemo(() => {
    const actionSet = new Set();
    const entitySet = new Set();

    if (summary) {
      Object.keys(summary.actionCounts ?? {}).forEach((action) => action && actionSet.add(action));
      Object.keys(summary.entityCounts ?? {}).forEach((entity) => entity && entitySet.add(entity));
    }

    logs.forEach((log) => {
      if (log?.action) {
        actionSet.add(log.action);
      }
      if (log?.entity || log?.resource) {
        entitySet.add(log.entity || log.resource);
      }
    });

    return {
      actions: Array.from(actionSet).sort((a, b) => a.localeCompare(b)),
      entities: Array.from(entitySet).sort((a, b) => a.localeCompare(b)),
    };
  }, [logs, summary]);

  const userOptions = useMemo(() => {
    const userMap = new Map();

    const registerOption = (key, option) => {
      if (!key || userMap.has(key)) {
        return;
      }
      userMap.set(key, option);
    };

    logs.forEach((log) => {
      if (!log) {
        return;
      }
      const meta = getUserSearchFields(log);
      const key =
        meta.libraryId ||
        meta.studentId ||
        meta.studentName ||
        meta.username ||
        log.userId ||
        getLogIdentifier(log);
      if (!key) {
        return;
      }

      const label =
        meta.studentName ||
        getUserPrimary(log) ||
        meta.libraryId ||
        meta.studentId ||
        meta.username ||
        "Unknown user";

      const secondaryParts = [
        meta.studentId ? `Student ID: ${meta.studentId}` : null,
        meta.username ? `Username: ${meta.username}` : null,
        meta.libraryId ? `Library ID: ${meta.libraryId}` : null,
      ].filter(Boolean);

      const searchValue =
        meta.libraryId ||
        meta.studentId ||
        meta.studentName ||
        meta.username ||
        label;

      registerOption(key, {
        value: key,
        label,
        secondary: secondaryParts.join(" • ") || getUserSecondary(log) || "",
        meta,
        searchValue,
        candidates: [
          meta.libraryId,
          meta.studentId,
          meta.studentName,
          meta.username,
          getUserPrimary(log),
          getUserSecondary(log),
          log.userId,
        ].filter(Boolean),
        searchText: [
          label,
          secondaryParts.join(" "),
          meta.studentId,
          meta.username,
          meta.libraryId,
          meta.studentName,
          log.userEmail,
        ]
          .filter(Boolean)
          .map((entry) => String(entry).toLowerCase())
          .join(" "),
      });
    });

    Object.keys(summary?.userCounts ?? {}).forEach((userId) => {
      if (!userId) {
        return;
      }
      registerOption(userId, {
        value: userId,
        label: userId,
        secondary: "",
        meta: { studentId: userId },
        searchValue: userId,
        candidates: [userId],
        searchText: String(userId).toLowerCase(),
      });
    });

    return Array.from(userMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [logs, summary]);

  const filterUserOptions = useMemo(
    () =>
      createFilterOptions({
        stringify: (option) =>
          [
            option.label,
            option.secondary,
            option.meta?.studentId,
            option.meta?.username,
            option.meta?.libraryId,
          ]
            .filter(Boolean)
            .join(" "),
      }),
    [],
  );

  const visibleUserOptions = useMemo(() => {
    const trimmed = filters.userQuery.trim();
    if (!trimmed) {
      return [];
    }
    return userOptions;
  }, [filters.userQuery, userOptions]);


  const toggleRowExpansion = (logId) => {
    if (!logId) {
      return;
    }
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(logId)) {
        next.delete(logId);
      } else {
        next.add(logId);
      }
      return next;
    });
  };

  const handleOpenDetails = (log) => {
    setSelectedLog(log);
    setDetailsOpen(true);
  };

  const handleCloseDetails = () => {
    setDetailsOpen(false);
    setSelectedLog(null);
  };

  const handleExport = async () => {
    try {
      setError(null);
      const trimmedQuery = filters.userQuery?.trim();
      const params = {
        action: filters.action !== "all" ? filters.action : undefined,
        entity: filters.entity !== "all" ? filters.entity : undefined,
        role: filters.role !== "all" ? filters.role : undefined,
        userQuery: trimmedQuery ? trimmedQuery : undefined,
        startDate: toIsoIfValid(filters.startDate),
        endDate: toIsoIfValid(filters.endDate),
      };

      const { data } = await auditAPI.exportCsv(params);
      downloadFile(data, `audit_logs_${new Date().toISOString().split("T")[0]}.csv`);
    } catch (err) {
      console.error("Failed to export audit logs", err);
      setError("Failed to export audit logs. Please try again.");
    }
  };

  const handleRefresh = () => {
    loadLogs();
    loadSummary();
  };

  const handleResetFilters = () => {
    setFilters({
      action: "all",
      entity: "all",
      role: "all",
      userQuery: "",
      startDate: null,
      endDate: null,
    });
    setPage(0);
  };

  const canExport = logs.length > 0 && !loading;

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box display="flex" flexDirection="column" gap={3}>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h4" color={"white"}>Audit Logs</Typography>
            <Typography variant="body2" color="white">
              Monitor recent activity, usage patterns, and notable security events.
            </Typography>
          </Box>
          <Box display="flex" gap={1}>
            <Button
              variant="outlined"
              startIcon={<Download />}
              onClick={handleExport}
              disabled={!canExport}
            >
              Export CSV
            </Button>
            <Button
              variant="outlined"
              startIcon={<Refresh />}
              onClick={handleRefresh}
              disabled={loading}
            >
              Refresh
            </Button>
          </Box>
        </Box>

        {error && <Alert severity="error">{error}</Alert>}

        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary">
                  Total Logs (30 days)
                </Typography>
                <Typography variant="h5">{metrics.totalLogs}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary">
                  Logged Today
                </Typography>
                <Typography variant="h5">{metrics.logsToday}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary">
                  Active Users
                </Typography>
                <Typography variant="h5">{metrics.uniqueUsers}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary">
                  Top Activity
                </Typography>
                <Typography variant="h6" noWrap>{metrics.topAction}</Typography>
                <Typography variant="body2" color="text.secondary" noWrap>
                  {metrics.topEntity}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Paper sx={{ p: 2 }}>
          <Box sx={{ width: "100%", mb: 2 }}>
            <Autocomplete
              fullWidth
              freeSolo
              options={visibleUserOptions}
              filterOptions={filterUserOptions}
              value={null}
              inputValue={filters.userQuery}
              onInputChange={(_, newInputValue, reason) => {
                if (reason === "reset") {
                  return;
                }
                handleFilterChange("userQuery", newInputValue ?? "");
              }}
              onChange={(_, newValue) => {
                if (!newValue) {
                  handleFilterChange("userQuery", "");
                  return;
                }
                if (typeof newValue === "string") {
                  handleFilterChange("userQuery", newValue);
                  return;
                }
                handleFilterChange(
                  "userQuery",
                  resolveOptionSearchValue(newValue, filters.userQuery),
                );
              }}
              getOptionLabel={(option) =>
                typeof option === "string"
                  ? option
                  : option.label || option.searchValue || option.value || ""
              }
              isOptionEqualToValue={(option, value) => option.value === value?.value}
              renderOption={(props, option) => (
                <Box component="li" {...props} sx={{ display: "flex", flexDirection: "column" }}>
                  <Typography variant="body2">{option.label}</Typography>
                  {option.secondary && (
                    <Typography variant="caption" color="text.secondary">
                      {option.secondary}
                    </Typography>
                  )}
                </Box>
              )}
              ListboxProps={{ style: { maxHeight: 240 } }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Search user"
                  placeholder="Student ID, name, username, or library ID"
                  size="small"
                  fullWidth
                  InputProps={{
                    ...params.InputProps,
                    startAdornment: (
                      <>
                        <InputAdornment position="start">
                          <Search fontSize="small" />
                        </InputAdornment>
                        {params.InputProps.startAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />
          </Box>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel id="audit-action-filter">Action</InputLabel>
                <Select
                  labelId="audit-action-filter"
                  label="Action"
                  value={filters.action}
                  onChange={(event) => handleFilterChange("action", event.target.value)}
                >
                  <MenuItem value="all">All actions</MenuItem>
                  {filterOptions.actions.map((action) => (
                    <MenuItem key={action} value={action}>
                      {action}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel id="audit-role-filter">Role</InputLabel>
                <Select
                  labelId="audit-role-filter"
                  label="Role"
                  value={filters.role}
                  onChange={(event) => handleFilterChange("role", event.target.value)}
                >
                  <MenuItem value="all">All roles</MenuItem>
                  {roleOptions.map((role) => (
                    <MenuItem key={role} value={role}>
                      {humanizeKey(role)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel id="audit-entity-filter">Entity</InputLabel>
                <Select
                  labelId="audit-entity-filter"
                  label="Entity"
                  value={filters.entity}
                  onChange={(event) => handleFilterChange("entity", event.target.value)}
                >
                  <MenuItem value="all">All entities</MenuItem>
                  {filterOptions.entities.map((entity) => (
                    <MenuItem key={entity} value={entity}>
                      {entity}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3} display="flex" justifyContent="flex-end" gap={1}>
              <Button
                variant="outlined"
                startIcon={<FilterList />}
                onClick={handleResetFilters}
                disabled={loading}
              >
                Reset
              </Button>
            </Grid>
            <Grid item xs={12} md={3}>
              <DateTimePicker
                label="Start date"
                value={filters.startDate}
                onChange={(value) => handleFilterChange("startDate", value ?? null)}
                renderInput={(params) => <TextField {...params} size="small" fullWidth />}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <DateTimePicker
                label="End date"
                value={filters.endDate}
                onChange={(value) => handleFilterChange("endDate", value ?? null)}
                renderInput={(params) => <TextField {...params} size="small" fullWidth />}
              />
            </Grid>
            {recentActivity.length > 0 && (
              <Grid item xs={12} md={6}>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                    Recent activity snapshot
                  </Typography>
                  <List dense>
                    {recentActivity.map((item) => {
                      const key = getLogIdentifier(item);
                      return (
                        <ListItem key={key} disablePadding sx={{ py: 0.5 }}>
                          <ListItemText
                            primary={`${getActionLabel(item)} • ${formatDateTime(item.timestamp)}`}
                            secondary={getEntityDisplay(item)}
                          />
                        </ListItem>
                      );
                    })}
                  </List>
                </Box>
              </Grid>
            )}
          </Grid>
        </Paper>

        <Paper>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell width={48} />
                  <TableCell>Timestamp</TableCell>
                  <TableCell>User</TableCell>
                  <TableCell>Action</TableCell>
                  <TableCell>Entity</TableCell>
                  <TableCell>IP Address</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Details</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={8} sx={{ p: 0 }}>
                      <LinearProgress />
                    </TableCell>
                  </TableRow>
                )}

                {!loading && logs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                      <Typography variant="body2" color="text.secondary">
                        No audit activity matches the selected filters.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}

                {logs.map((log) => {
                  const logId = getLogIdentifier(log);
                  const statusMeta = getStatusMeta(log);
                  const initials = getUserPrimary(log).match(/[A-Za-z]/)?.[0]?.toUpperCase() || "?";

                  return (
                    <React.Fragment key={logId}>
                      <TableRow hover>
                        <TableCell>
                          <IconButton
                            size="small"
                            onClick={() => toggleRowExpansion(logId)}
                            aria-label={expandedRows.has(logId) ? "Hide details" : "Show details"}
                          >
                            {expandedRows.has(logId) ? <ExpandLess /> : <ExpandMore />}
                          </IconButton>
                        </TableCell>
                        <TableCell>{formatDateTime(log?.timestamp)}</TableCell>
                        <TableCell>
                          <Box display="flex" alignItems="center" gap={1.5}>
                            <Avatar sx={{ width: 32, height: 32 }}>{initials}</Avatar>
                            <Box>
                              <Typography variant="body2">{getUserPrimary(log)}</Typography>
                              {getUserSecondary(log) && (
                                <Typography variant="caption" color="text.secondary">
                                  {getUserSecondary(log)}
                                </Typography>
                              )}
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell>{getActionLabel(log)}</TableCell>
                        <TableCell>
                          <Typography variant="body2">{getEntityDisplay(log)}</Typography>
                        </TableCell>
                        <TableCell>{log?.ipAddress || "—"}</TableCell>
                        <TableCell>
                          <Chip label={statusMeta.label} color={statusMeta.color} size="small" />
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="View full details">
                            <span>
                              <IconButton size="small" onClick={() => handleOpenDetails(log)}>
                                <Visibility fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell colSpan={8} sx={{ py: 0, border: 0 }}>
                          <Collapse in={expandedRows.has(logId)} timeout="auto" unmountOnExit>
                            <Box sx={{ px: 3, py: 2, bgcolor: "grey.50" }}>
                              <Typography variant="subtitle2" gutterBottom>
                                Summary
                              </Typography>
                              <Typography variant="body2" sx={{ mb: 2 }}>
                                {getDescription(log)}
                              </Typography>
                              {log?.details && (
                                <Box>
                                  <Typography variant="subtitle2" gutterBottom>
                                    Details
                                  </Typography>
                                  <Paper variant="outlined" sx={{ p: 2, maxHeight: 240, overflow: "auto" }}>
                                    <Typography variant="body2" sx={{ whiteSpace: "pre-line" }}>
                                      {stringifyDetails(log.details)}
                                    </Typography>
                                  </Paper>
                                </Box>
                              )}
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={totalCount}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(event) => {
              setRowsPerPage(parseInt(event.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[10, 25, 50, 100]}
          />
        </Paper>

        <Dialog open={detailsOpen} onClose={handleCloseDetails} maxWidth="md" fullWidth>
          <DialogTitle>Audit Log Details</DialogTitle>
          <DialogContent dividers>
            {selectedLog && (
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Timestamp
                  </Typography>
                  <Typography variant="body1">{formatDateTime(selectedLog.timestamp)}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="text.secondary">
                    User
                  </Typography>
                  <Typography variant="body1">{getUserPrimary(selectedLog)}</Typography>
                  {getUserSecondary(selectedLog) && (
                    <Typography variant="body2" color="text.secondary">
                      {getUserSecondary(selectedLog)}
                    </Typography>
                  )}
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Action
                  </Typography>
                  <Typography variant="body1">{getActionLabel(selectedLog)}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Entity
                  </Typography>
                  <Typography variant="body1">{getEntityDisplay(selectedLog)}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Status
                  </Typography>
                  <Chip
                    label={getStatusMeta(selectedLog).label}
                    color={getStatusMeta(selectedLog).color}
                    size="small"
                    sx={{ mt: 0.5 }}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="text.secondary">
                    IP Address
                  </Typography>
                  <Typography variant="body1">{selectedLog?.ipAddress || "—"}</Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Summary
                  </Typography>
                  <Typography variant="body1">{getDescription(selectedLog)}</Typography>
                </Grid>
                {selectedLog?.details && (
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Details
                    </Typography>
                    <Paper variant="outlined" sx={{ p: 2, maxHeight: 320, overflow: "auto" }}>
                      <Typography variant="body2" sx={{ whiteSpace: "pre-line" }}>
                        {stringifyDetails(selectedLog.details)}
                      </Typography>
                    </Paper>
                  </Grid>
                )}
              </Grid>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseDetails}>Close</Button>
          </DialogActions>
        </Dialog>
      </Box>
    </LocalizationProvider>
  );
};

export default AuditLogs;
