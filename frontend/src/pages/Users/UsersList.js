
import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  TablePagination,
  IconButton,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Fab,
  InputAdornment,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  Avatar,
  ListItemIcon,
} from "@mui/material";
import {
  Search,
  Add,
  MoreVert,
  FilterList,
  Edit,
  Visibility,
  Delete,
  CheckCircle,
  Block,
  Person,
  LockReset,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { api, usersAPI } from "../../utils/api";
import { resolveEntityAvatar } from "../../utils/media";
import toast from "react-hot-toast";

const UsersList = () => {
  const navigate = useNavigate();
  const { hasPermission, hasRole } = useAuth();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalUsers, setTotalUsers] = useState(0);
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");

  const [selectedUser, setSelectedUser] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  const [menuAnchor, setMenuAnchor] = useState(null);

  // Compact filter menu state
  const [filterAnchorEl, setFilterAnchorEl] = useState(null);
  const filtersOpen = Boolean(filterAnchorEl);
  const openFilters = (e) => setFilterAnchorEl(e.currentTarget);
  const closeFilters = () => setFilterAnchorEl(null);

  const roles = ["admin", "librarian", "staff", "student"];

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const loadUsers = useCallback(
    async (override = {}) => {
      const pageToFetch = override.page ?? page;
      const limitToFetch = override.limit ?? rowsPerPage;
      const limitValue = typeof limitToFetch === "string" ? limitToFetch.toLowerCase() : limitToFetch;
      const isAllMode = limitValue === "all" || limitValue === -1;
      const roleToFetch = override.role ?? roleFilter;
      const searchToFetch = override.search ?? debouncedSearchTerm;

      try {
        setLoading(true);
        const limitParam = isAllMode ? "all" : limitToFetch;
        const pageParam = isAllMode ? 1 : pageToFetch + 1;
        const params = {
          page: pageParam,
          limit: limitParam,
        };
        if (roleToFetch) params.role = roleToFetch;
        if (searchToFetch) params.search = searchToFetch;

        const response = await api.get("/users", { params });
        const payload = response.data || {};
        const userList = payload.users || payload.data || [];
        const total = payload.pagination?.total ?? payload.total ?? userList.length ?? 0;

        setUsers(userList);
        setTotalUsers(total);
      } catch (error) {
        console.error("Failed to fetch users:", error);
        toast.error("Failed to load users");
      } finally {
        setLoading(false);
      }
    },
    [page, rowsPerPage, roleFilter, debouncedSearchTerm]
  );

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const getUserId = (user) => user?._id || user?.id || user?.userId || null;

  const handleMenuClick = (e, user) => {
    setSelectedUser(user);
    setMenuAnchor(e.currentTarget);
  };

  const handleMenuClose = (clearSelected = false) => {
    setMenuAnchor(null);
    if (clearSelected) setSelectedUser(null);
  };

  const handleRowDoubleClick = (user) => {
    const id = getUserId(user);
    if (id) navigate(`/users/${id}`);
  };

  const handleDeleteUser = async () => {
    try {
      setLoading(true);
      const userId = getUserId(selectedUser);
      if (!userId) return;
      await api.delete(`/users/${userId}`);
      await loadUsers();
      toast.success("User deleted successfully");
      setDeleteDialogOpen(false);
      setSelectedUser(null);
    } catch (error) {
      console.error("Failed to delete user:", error);
      toast.error("Failed to delete user");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async () => {
    try {
      setLoading(true);
      const userId = getUserId(selectedUser);
      if (!userId) return;
      const newStatus = !selectedUser?.isActive;
      await api.patch(`/users/${userId}`, { isActive: newStatus });
      setUsers((prev) => prev.map((u) => (getUserId(u) === userId ? { ...u, isActive: newStatus } : u)));
      toast.success("User status updated");
      setStatusDialogOpen(false);
      setSelectedUser(null);
    } catch (error) {
      console.error("Failed to update status:", error);
      toast.error("Failed to update user status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(0);
  }, [debouncedSearchTerm, roleFilter]);

  useEffect(() => {
    if (!loading && users.length === 0 && totalUsers > 0 && page > 0) {
      setPage((prev) => Math.max(prev - 1, 0));
    }
  }, [loading, users.length, totalUsers, page]);

  const getRoleColor = (role) => {
    switch (role) {
      case "admin":
        return "error";
      case "librarian":
        return "warning";
      case "staff":
        return "info";
      case "student":
        return "success";
      default:
        return "default";
    }
  };

  const getStatusColor = (isActive) => (isActive ? "success" : "error");

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1" color={"white"}>
          Users Management
        </Typography>
        {hasPermission("users.create") && (
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => navigate("/users/new")}
            sx={{ backgroundColor: "#22C55E", "&:hover": { backgroundColor: "#16A34A" } }}
          >
            Add New User
          </Button>
        )}
      </Box>

      <Box mb={3}>
        <Box display="flex" gap={2} flexWrap="wrap" alignItems="center">
          <TextField
            placeholder="Search users by name, email, username, or student number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            sx={{ flex: 1, minWidth: 300 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search />
                </InputAdornment>
              ),
            }}
          />

          {/* Filter icon + menu (compact) */}
          <IconButton aria-label="Open filters" onClick={openFilters} size="small" sx={{ border: "1px solid #E2E8F0", backgroundColor: "#F8FAFC" }}>
            <FilterList />
          </IconButton>

          <Menu
            anchorEl={filterAnchorEl}
            open={filtersOpen}
            onClose={closeFilters}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
            PaperProps={{ sx: { p: 2, minWidth: 220 } }}
          >
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Role</InputLabel>
                <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} label="Role">
                  <MenuItem value="">All Roles</MenuItem>
                  {roles.map((role) => (
                    <MenuItem key={role} value={role}>
                      {role.charAt(0).toUpperCase() + role.slice(1)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Box display="flex" justifyContent="flex-end" gap={1} mt={1}>
                <Button size="small" onClick={() => { setRoleFilter(""); closeFilters(); }}>Clear</Button>
                <Button size="small" variant="contained" onClick={closeFilters}>Apply</Button>
              </Box>
            </Box>
          </Menu>
        </Box>
      </Box>

      {!loading && totalUsers === 0 ? (
        <Box textAlign="center" py={8}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            {searchTerm || roleFilter ? "No users found matching your criteria" : "No users available"}
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {hasPermission("users.create") && "Start by adding your first user to the system"}
          </Typography>
          {hasPermission("users.create") && (
            <Button variant="contained" startIcon={<Add />} onClick={() => navigate("/users/new")} sx={{ mt: 2, backgroundColor: "#22C55E", "&:hover": { backgroundColor: "#16A34A" } }}>
              Add First User
            </Button>
          )}
        </Box>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>User</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Student Number</TableCell>
                <TableCell>Curriculum</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Last Login</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((user) => {
                const avatarSrc = resolveEntityAvatar(user);
                const fallbackInitial = [user.firstName, user.lastName, user.username, user.email]
                  .map((value) => (typeof value === "string" && value.trim() ? value.trim().charAt(0).toUpperCase() : ""))
                  .find(Boolean);
                const avatarAlt = [user.firstName, user.lastName]
                  .filter((value) => typeof value === "string" && value.trim())
                  .join(" ") || user.username || user.email || "User avatar";

                return (
                  <TableRow key={getUserId(user)} hover onDoubleClick={() => handleRowDoubleClick(user)} sx={{ cursor: "pointer" }}>
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={2}>
                        <Avatar
                          src={avatarSrc || undefined}
                          alt={avatarAlt}
                          sx={{
                            bgcolor: avatarSrc ? "transparent" : "primary.main",
                            color: avatarSrc ? "inherit" : "primary.contrastText",
                          }}
                        >
                          {fallbackInitial || <Person fontSize="small" />}
                        </Avatar>
                        <Box>
                          <Typography variant="body2" fontWeight="medium">{user.firstName} {user.lastName}</Typography>
                          <Typography variant="caption" color="text.secondary">@ {user.username}</Typography>
                        </Box>
                      </Box>
                    </TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Chip label={user.role} size="small" color={getRoleColor(user.role)} />
                  </TableCell>
                  <TableCell>{user.studentNumber || user.studentId || user.libraryCardNumber || (user.library && user.library.cardNumber) || "-"}</TableCell>
                  <TableCell>{user.curriculum || "-"}</TableCell>
                  <TableCell>
                    <Chip label={user.isActive ? "Active" : "Inactive"} size="small" color={getStatusColor(user.isActive)} icon={user.isActive ? <CheckCircle /> : <Block />} />
                  </TableCell>
                  <TableCell>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : "Never"}</TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={(e) => handleMenuClick(e, user)}>
                      <MoreVert />
                    </IconButton>
                  </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={totalUsers}
            page={page}
            onPageChange={(event, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(event) => {
              const value = parseInt(event.target.value, 10);
              setRowsPerPage(Number.isNaN(value) ? 10 : value);
              setPage(0);
            }}
            rowsPerPageOptions={[10, 25, 50, 100, { label: "All", value: -1 }]}
            labelRowsPerPage="Rows per page"
            sx={{ borderTop: "1px solid", borderColor: "divider" }}
          />
        </TableContainer>
      )}

      {/* Action Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => handleMenuClose(true)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <MenuItem
          onClick={() => {
            const selectedUserId = getUserId(selectedUser);
            if (!selectedUserId) {
              handleMenuClose();
              return;
            }
            navigate(`/users/${selectedUserId}`);
            handleMenuClose(true);
          }}
        >
          <ListItemIcon>
            <Visibility fontSize="small" />
          </ListItemIcon>
          View Profile
        </MenuItem>
        {hasPermission("users.update") && (
          <MenuItem
            onClick={() => {
              const selectedUserId = getUserId(selectedUser);
              if (!selectedUserId) {
                handleMenuClose();
                return;
              }
              navigate(`/users/${selectedUserId}/edit`);
              handleMenuClose(true);
            }}
          >
            <ListItemIcon>
              <Edit fontSize="small" />
            </ListItemIcon>
            Edit User
          </MenuItem>
        )}
        {hasPermission("users.update") && (
          <MenuItem
            onClick={() => {
              setStatusDialogOpen(true);
              handleMenuClose(false);
            }}
          >
            <ListItemIcon>{selectedUser?.isActive ? <Block fontSize="small" /> : <CheckCircle fontSize="small" />}</ListItemIcon>
            {selectedUser?.isActive ? "Deactivate" : "Activate"}
          </MenuItem>
        )}
        {(hasRole("admin") || hasPermission("users.resetPassword")) && (
          <MenuItem
            onClick={() => {
              setNewPassword("");
              setPasswordDialogOpen(true);
              handleMenuClose(false);
            }}
          >
            <ListItemIcon>
              <LockReset fontSize="small" />
            </ListItemIcon>
            Reset Password
          </MenuItem>
        )}
        {hasPermission("users.delete") && (
          <MenuItem
            onClick={() => {
              setDeleteDialogOpen(true);
              handleMenuClose(false);
            }}
          >
            <ListItemIcon>
              <Delete fontSize="small" />
            </ListItemIcon>
            Delete User
          </MenuItem>
        )}
      </Menu>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete User</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete user "{selectedUser?.firstName} {selectedUser?.lastName}"? This action cannot be undone and will remove all associated data.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteUser} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>

      {/* Status Change Confirmation Dialog */}
      <Dialog open={statusDialogOpen} onClose={() => setStatusDialogOpen(false)}>
        <DialogTitle>{selectedUser?.isActive ? "Deactivate" : "Activate"} User</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to {selectedUser?.isActive ? "deactivate" : "activate"} user "{selectedUser?.firstName} {selectedUser?.lastName}"?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStatusDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleToggleStatus} color={selectedUser?.isActive ? "error" : "success"} variant="contained">
            {selectedUser?.isActive ? "Deactivate" : "Activate"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={passwordDialogOpen} onClose={() => setPasswordDialogOpen(false)}>
        <DialogTitle>Reset Password</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Enter a new password for {selectedUser?.firstName} {selectedUser?.lastName}. The user will be required to use this password on next login.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            type="password"
            label="New Password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            helperText="Minimum of 6 characters."
            disabled={passwordSaving}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPasswordDialogOpen(false)} disabled={passwordSaving}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              const userId = getUserId(selectedUser);
              if (!userId) {
                setPasswordDialogOpen(false);
                return;
              }
              const trimmed = newPassword.trim();
              if (trimmed.length < 6) {
                toast.error("Password must be at least 6 characters long.");
                return;
              }
              try {
                setPasswordSaving(true);
                await usersAPI.resetPassword(userId, trimmed);
                toast.success("Password reset successfully.");
                setPasswordDialogOpen(false);
                setSelectedUser(null);
                setNewPassword("");
              } catch (error) {
                console.error("Failed to reset password:", error);
                toast.error("Failed to reset password");
              } finally {
                setPasswordSaving(false);
              }
            }}
            variant="contained"
            disabled={passwordSaving}
          >
            {passwordSaving ? "Saving..." : "Reset Password"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Floating Add Button for Mobile */}
      {hasPermission("users.create") && (
        <Fab color="primary" aria-label="add user" sx={{ position: "fixed", bottom: 16, right: 16, display: { xs: "flex", sm: "none" }, backgroundColor: "#22C55E", "&:hover": { backgroundColor: "#16A34A" } }} onClick={() => navigate("/users/new")}>
          <Add />
        </Fab>
      )}
    </Box>
  );
};

export default UsersList;
