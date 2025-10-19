import React, { useState, useEffect } from "react";
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
} from "@mui/material";
import {
  Add,
  Search,
  MoreVert,
  Edit,
  Delete,
  Visibility,
  Block,
  CheckCircle,
  Person,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../utils/api";
import toast from "react-hot-toast";

const UsersList = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState(null);

  const roles = ["admin", "librarian", "staff", "student"];

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await api.get("/users");
      setUsers(response.data.users || []);
    } catch (error) {
      console.error("Failed to fetch users:", error);
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const getUserId = (user) => user?._id || user?.id || user?.uid;

  const handleRowDoubleClick = (user) => {
    const userId = getUserId(user);
    if (!userId) {
      toast.error("User identifier is missing");
      return;
    }
    navigate(`/users/${userId}`);
  };

  const handleDeleteUser = async () => {
    try {
      const userId = getUserId(selectedUser);
      if (!userId) {
        toast.error("User identifier is missing");
        return;
      }
      await api.delete(`/users/${userId}`);
      setUsers(users.filter((user) => getUserId(user) !== userId));
      toast.success("User deleted successfully");
      setDeleteDialogOpen(false);
      setSelectedUser(null);
    } catch (error) {
      console.error("Failed to delete user:", error);
      toast.error("Failed to delete user");
    }
  };

  const handleToggleStatus = async () => {
    try {
      const userId = getUserId(selectedUser);
      if (!userId) {
        toast.error("User identifier is missing");
        return;
      }
      const newStatus = !selectedUser.isActive;
      await api.put(`/users/${userId}/status`, {
        isActive: newStatus,
      });
      setUsers(
        users.map((user) =>
          getUserId(user) === userId ? { ...user, isActive: newStatus } : user,
        ),
      );
      toast.success(
        `User ${newStatus ? "activated" : "deactivated"} successfully`,
      );
      setStatusDialogOpen(false);
      setSelectedUser(null);
    } catch (error) {
      console.error("Failed to update user status:", error);
      toast.error("Failed to update user status");
    }
  };

  const handleMenuClick = (event, user) => {
    setMenuAnchor(event.currentTarget);
    setSelectedUser(user);
  };

  const handleMenuClose = (clearSelection = true) => {
    setMenuAnchor(null);
    if (clearSelection) {
      setSelectedUser(null);
    }
  };

  const handleStatusDialogClose = () => {
    setStatusDialogOpen(false);
    setSelectedUser(null);
  };

  const handleDeleteDialogClose = () => {
    setDeleteDialogOpen(false);
    setSelectedUser(null);
  };

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
  user.studentNumber?.includes(searchTerm) ||
  user.studentId?.includes(searchTerm);

    const matchesRole = !roleFilter || user.role === roleFilter;

    return matchesSearch && matchesRole;
  });

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

  const getStatusColor = (isActive) => {
    return isActive ? "success" : "error";
  };

  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="60vh"
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {" "}
      {/* Header */}{" "}
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={3}
      >
        <Typography variant="h4" component="h1">
          Users Management{" "}
        </Typography>{" "}
        {hasPermission("users.create") && (
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => navigate("/users/new")}
            sx={{
              backgroundColor: "#22C55E",
              "&:hover": { backgroundColor: "#16A34A" },
            }}
          >
            Add New User{" "}
          </Button>
        )}{" "}
      </Box>
      {/* Search and Filters */}{" "}
      <Box mb={3}>
        <Box display="flex" gap={2} flexWrap="wrap">
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
          />{" "}
          <FormControl sx={{ minWidth: 120 }}>
            <InputLabel> Role </InputLabel>{" "}
            <Select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              label="Role"
            >
              <MenuItem value=""> All Roles </MenuItem>{" "}
              {roles.map((role) => (
                <MenuItem key={role} value={role}>
                  {" "}
                  {role.charAt(0).toUpperCase() + role.slice(1)}{" "}
                </MenuItem>
              ))}{" "}
            </Select>{" "}
          </FormControl>{" "}
        </Box>{" "}
      </Box>
      {/* Users Table */}{" "}
      {filteredUsers.length === 0 ? (
        <Box textAlign="center" py={8}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            {" "}
            {searchTerm || roleFilter
              ? "No users found matching your criteria"
              : "No users available"}{" "}
          </Typography>{" "}
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {" "}
            {hasPermission("users.create") &&
              "Start by adding your first user to the system"}{" "}
          </Typography>{" "}
          {hasPermission("users.create") && (
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => navigate("/users/new")}
              sx={{
                mt: 2,
                backgroundColor: "#22C55E",
                "&:hover": { backgroundColor: "#16A34A" },
              }}
            >
              Add First User{" "}
            </Button>
          )}{" "}
        </Box>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell> User </TableCell> <TableCell> Email </TableCell>{" "}
                <TableCell> Role </TableCell>{" "}
                <TableCell> Student Number </TableCell>{" "}
                <TableCell> Department </TableCell>{" "}
                <TableCell> Status </TableCell>{" "}
                <TableCell> Last Login </TableCell>{" "}
                <TableCell align="right"> Actions </TableCell>{" "}
              </TableRow>{" "}
            </TableHead>{" "}
            <TableBody>
              {" "}
              {filteredUsers.map((user) => (
                <TableRow
                  key={getUserId(user)}
                  hover
                  onDoubleClick={() => handleRowDoubleClick(user)}
                  sx={{ cursor: "pointer" }}
                >
                  <TableCell>
                    <Box display="flex" alignItems="center" gap={2}>
                      <Avatar sx={{ bgcolor: "primary.main" }}>
                        {" "}
                        {user.firstName?.[0] || user.username?.[0] || (
                          <Person />
                        )}{" "}
                      </Avatar>{" "}
                      <Box>
                        <Typography variant="body2" fontWeight="medium">
                          {" "}
                          {user.firstName} {user.lastName}{" "}
                        </Typography>{" "}
                        <Typography variant="caption" color="text.secondary">
                          @ {user.username}{" "}
                        </Typography>{" "}
                      </Box>{" "}
                    </Box>{" "}
                  </TableCell>{" "}
                  <TableCell> {user.email} </TableCell>{" "}
                  <TableCell>
                    <Chip
                      label={user.role}
                      size="small"
                      color={getRoleColor(user.role)}
                    />{" "}
                  </TableCell>{" "}
                  <TableCell> {user.studentNumber || "-"} </TableCell>{" "}
                  <TableCell> {user.department || "-"} </TableCell>{" "}
                  <TableCell>
                    <Chip
                      label={user.isActive ? "Active" : "Inactive"}
                      size="small"
                      color={getStatusColor(user.isActive)}
                      icon={user.isActive ? <CheckCircle /> : <Block />}
                    />{" "}
                  </TableCell>{" "}
                  <TableCell>
                    {" "}
                    {user.lastLoginAt
                      ? new Date(user.lastLoginAt).toLocaleDateString()
                      : "Never"}{" "}
                  </TableCell>{" "}
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      onClick={(e) => handleMenuClick(e, user)}
                    >
                      <MoreVert />
                    </IconButton>{" "}
                  </TableCell>{" "}
                </TableRow>
              ))}{" "}
            </TableBody>{" "}
          </Table>{" "}
        </TableContainer>
      )}
      {/* Action Menu */}{" "}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
  onClose={() => handleMenuClose(true)}
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
          <Visibility sx={{ mr: 1 }} /> View Profile{" "}
        </MenuItem>{" "}
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
            <Edit sx={{ mr: 1 }} /> Edit User{" "}
          </MenuItem>
        )}{" "}
        {hasPermission("users.update") && (
          <MenuItem
            onClick={() => {
              setStatusDialogOpen(true);
              handleMenuClose(false);
            }}
          >
            {" "}
            {selectedUser?.isActive ? (
              <Block sx={{ mr: 1 }} />
            ) : (
              <CheckCircle sx={{ mr: 1 }} />
            )}{" "}
            {selectedUser?.isActive ? "Deactivate" : "Activate"}{" "}
          </MenuItem>
        )}{" "}
        {hasPermission("users.delete") && (
          <MenuItem
            onClick={() => {
              setDeleteDialogOpen(true);
              handleMenuClose(false);
            }}
          >
            <Delete sx={{ mr: 1 }} /> Delete User{" "}
          </MenuItem>
        )}{" "}
      </Menu>
      {/* Delete Confirmation Dialog */}{" "}
      <Dialog open={deleteDialogOpen} onClose={handleDeleteDialogClose}>
        <DialogTitle> Delete User </DialogTitle>{" "}
        <DialogContent>
          <Typography>
            Are you sure you want to delete user "{selectedUser?.firstName}{" "}
            {selectedUser?.lastName}" ? This action cannot be undone and will
            remove all associated data.{" "}
          </Typography>{" "}
        </DialogContent>{" "}
        <DialogActions>
          <Button onClick={handleDeleteDialogClose}> Cancel </Button>{" "}
          <Button onClick={handleDeleteUser} color="error" variant="contained">
            Delete{" "}
          </Button>{" "}
        </DialogActions>{" "}
      </Dialog>
      {/* Status Change Confirmation Dialog */}{" "}
      <Dialog open={statusDialogOpen} onClose={handleStatusDialogClose}>
        <DialogTitle>
          {" "}
          {selectedUser?.isActive ? "Deactivate" : "Activate"}
          User{" "}
        </DialogTitle>{" "}
        <DialogContent>
          <Typography>
            Are you sure you want to{" "}
            {selectedUser?.isActive ? "deactivate" : "activate"}
            user "{selectedUser?.firstName} {selectedUser?.lastName}" ?
          </Typography>{" "}
        </DialogContent>{" "}
        <DialogActions>
          <Button onClick={handleStatusDialogClose}> Cancel </Button>{" "}
          <Button
            onClick={handleToggleStatus}
            color={selectedUser?.isActive ? "error" : "success"}
            variant="contained"
          >
            {selectedUser?.isActive ? "Deactivate" : "Activate"}{" "}
          </Button>{" "}
        </DialogActions>{" "}
      </Dialog>
      {/* Floating Add Button for Mobile */}{" "}
      {hasPermission("users.create") && (
        <Fab
          color="primary"
          aria-label="add user"
          sx={{
            position: "fixed",
            bottom: 16,
            right: 16,
            display: { xs: "flex", sm: "none" },
            backgroundColor: "#22C55E",
            "&:hover": { backgroundColor: "#16A34A" },
          }}
          onClick={() => navigate("/users/new")}
        >
          <Add />
        </Fab>
      )}{" "}
    </Box>
  );
};

export default UsersList;
