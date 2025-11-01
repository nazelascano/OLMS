import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Avatar,
  Button,
  TextField,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider,
  InputAdornment,
} from "@mui/material";
import {
  Person,
  Email,
  School,
  Assignment,
  Warning,
  Edit,
  Cancel,
  LibraryBooks,
  Visibility,
  VisibilityOff,
  Security,
  ArrowBack,
  Phone,
  Save,
} from "@mui/icons-material";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../utils/api";
import { formatCurrency } from "../../utils/currency";
import { useNavigate, useParams } from "react-router-dom";

const UserProfile = () => {
  const { user } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const [profileData, setProfileData] = useState({});
  const [borrowingHistory, setBorrowingHistory] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [changePasswordDialog, setChangePasswordDialog] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [stats, setStats] = useState({
    totalBorrowings: 0,
    activeBorrowings: 0,
    overdueBorrowings: 0,
    totalFines: 0,
  });
  const [isSelfProfile, setIsSelfProfile] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  const getUserIdentifier = (value) => value?._id || value?.id || value?.uid;

  const computeStatsFromHistory = (history = []) => {
    const now = new Date();
    return {
      totalBorrowings: history.length,
      activeBorrowings: history.filter((t) => t.status === "borrowed").length,
      overdueBorrowings: history.filter((t) => {
        if (t.status !== "borrowed") return false;
        if (!t.dueDate) return false;
        return new Date(t.dueDate) < now;
      }).length,
      totalFines: history.reduce((sum, t) => sum + (t.fineAmount || t.fine || 0), 0),
    };
  };

  useEffect(() => {
    const initializeProfile = async () => {
      if (!user) return;

      setError("");
      setSuccess("");

      const currentUserId = getUserIdentifier(user);
      const viewingSelf = !id || id === currentUserId;
      setIsSelfProfile(viewingSelf);

      if (!viewingSelf) {
        setEditMode(false);
        setChangePasswordDialog(false);
      }

      if (viewingSelf) {
        setProfileData(user);
        const history = await fetchBorrowingHistory(currentUserId, true);
        await fetchUserStats(currentUserId, true, history);
      } else {
        await loadProfileById(id);
      }
    };

    initializeProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, id]);

  const loadProfileById = async (targetUserId) => {
    try {
      setProfileLoading(true);
      const response = await api.get(`/users/${targetUserId}`);
      setProfileData(response.data);
      await fetchBorrowingHistory(targetUserId, false);
    } catch (err) {
      console.error("Error loading user profile:", err);
      setError("Failed to load user profile");
    } finally {
      setProfileLoading(false);
    }
  };

  const fetchBorrowingHistory = async (targetUserId, viewingSelf) => {
    try {
      let response;
      if (viewingSelf) {
        response = await api.get("/users/profile/borrowing-history");
      } else {
        response = await api.get(`/transactions/user/${targetUserId}`);
      }

      const historyData = Array.isArray(response.data)
        ? response.data
        : response.data?.transactions || [];

      setBorrowingHistory(historyData);

      if (!viewingSelf) {
        setStats(computeStatsFromHistory(historyData));
      }

      return historyData;
    } catch (err) {
      console.error("Error fetching borrowing history:", err);
      if (!viewingSelf) {
        setStats(computeStatsFromHistory([]));
      }
      return [];
    }
  };

  const fetchUserStats = async (targetUserId, viewingSelf, historyData) => {
    if (!viewingSelf) {
      setStats(computeStatsFromHistory(historyData || []));
      return;
    }

    try {
      const response = await api.get("/users/profile/stats");
      setStats(response.data);
    } catch (err) {
      console.error("Error fetching user stats:", err);
    }
  };

  const handleProfileUpdate = async () => {
    if (!isSelfProfile) return;

    try {
      setLoading(true);
      const targetId = getUserIdentifier(profileData);
      if (!targetId) {
        setError("Unable to determine user identifier");
        return;
      }

      const updatePayload = {
        firstName: profileData.firstName,
        lastName: profileData.lastName,
        phoneNumber: profileData.phoneNumber,
        address: profileData.address,
      };

      await api.put(`/users/${targetId}`, updatePayload);
      setSuccess("Profile updated successfully");
      setProfileData((prev) => ({ ...prev, ...updatePayload }));
      if (isSelfProfile && user) {
        const updatedUser = { ...user, ...updatePayload };
        localStorage.setItem("userData", JSON.stringify(updatedUser));
      }
      setEditMode(false);
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError("Failed to update profile");
      console.error("Error updating profile:", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!isSelfProfile) return;

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError("New passwords do not match");
      return;
    }

    if (passwordData.newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    try {
      setLoading(true);
      await api.post("/auth/change-password", {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      });
      setSuccess("Password changed successfully");
      setChangePasswordDialog(false);
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to change password");
      console.error("Error changing password:", err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "active":
        return "primary";
      case "returned":
        return "success";
      case "overdue":
        return "error";
      default:
        return "default";
    }
  };

  const togglePasswordVisibility = (field) => {
    setShowPasswords((prev) => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  return (
    <Box>
      <Box display="flex" alignItems="center" gap={1.5} mb={2}>
        <IconButton aria-label="Go back" onClick={() => navigate(-1)}>
          <ArrowBack />
        </IconButton>
        <Typography variant="h4" gutterBottom sx={{ mb: 0 }}>
          {isSelfProfile ? "My Profile" : "User Profile"} {" "}
        </Typography>
      </Box>
      {profileLoading && (
        <Box
          display="flex"
          alignItems="center"
          gap={1}
          color="text.secondary"
          sx={{ mb: 2 }}
        >
          <CircularProgress size={20} />
          <Typography variant="body2">Loading user profile...</Typography>
        </Box>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {" "}
          {error}{" "}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {" "}
          {success}{" "}
        </Alert>
      )}
      <Grid container spacing={3}>
        {" "}
        {/* Profile Information */}{" "}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box
                display="flex"
                flexDirection="column"
                alignItems="center"
                mb={3}
              >
                <Avatar
                  sx={{
                    width: 100,
                    height: 100,
                    mb: 2,
                    bgcolor: "primary.main",
                    fontSize: "2.5rem",
                  }}
                >
                  {profileData.firstName?.[0] || profileData.username?.[0] || (
                    <Person />
                  )}{" "}
                </Avatar>{" "}
                <Typography variant="h6">
                  {" "}
                  {profileData.firstName} {profileData.lastName}{" "}
                </Typography>{" "}
                {profileData.role && (
                  <Chip
                    label={profileData.role}
                    color="primary"
                    size="small"
                    sx={{ textTransform: "capitalize" }}
                  />
                )}{" "}
              </Box>
              <Divider sx={{ mb: 2 }} />
              <List>
                <ListItem>
                  <ListItemIcon>
                    <Person />
                  </ListItemIcon>{" "}
                  <ListItemText
                    primary="Username"
                    secondary={profileData.username}
                  />{" "}
                </ListItem>{" "}
                <ListItem>
                  <ListItemIcon>
                    <Email />
                  </ListItemIcon>{" "}
                  <ListItemText
                    primary="Email"
                    secondary={profileData.email}
                  />{" "}
                </ListItem>{" "}
                {/* Student-specific details: shown when this profile is a student */}
                {profileData.role === "student" && (
                  <>
                    {profileData.libraryCardNumber && (
                      <ListItem>
                        <ListItemIcon>
                          <Assignment />
                        </ListItemIcon>
                        <ListItemText primary="Library Card" secondary={profileData.libraryCardNumber} />
                      </ListItem>
                    )}
                    {profileData.studentId && (
                      <ListItem>
                        <ListItemIcon>
                          <School />
                        </ListItemIcon>
                        <ListItemText primary="Student ID" secondary={profileData.studentId} />
                      </ListItem>
                    )}
                    {profileData.lrn && (
                      <ListItem>
                        <ListItemIcon>
                          <Assignment />
                        </ListItemIcon>
                        <ListItemText primary="LRN" secondary={profileData.lrn} />
                      </ListItem>
                    )}
                    {(profileData.grade || profileData.section) && (
                      <ListItem>
                        <ListItemIcon>
                          <LibraryBooks />
                        </ListItemIcon>
                        <ListItemText
                          primary="Grade / Section"
                          secondary={`${profileData.grade || ""}${profileData.grade && profileData.section ? " • " : ""}${profileData.section || ""}`}
                        />
                      </ListItem>
                    )}
                    {profileData.fullAddress && (
                      <ListItem>
                        <ListItemText primary="Address" secondary={profileData.fullAddress} />
                      </ListItem>
                    )}
                  </>
                )}
                {profileData.phoneNumber && (
                  <ListItem>
                    <ListItemIcon>
                      <Phone />
                    </ListItemIcon>{" "}
                    <ListItemText
                      primary="Phone"
                      secondary={profileData.phoneNumber}
                    />{" "}
                  </ListItem>
                )}{" "}
                {(profileData.studentNumber || profileData.studentId || profileData.libraryCardNumber || (profileData.library && profileData.library.cardNumber)) && (
                  <ListItem>
                    <ListItemIcon>
                      <School />
                    </ListItemIcon>
                    <ListItemText
                      primary="Student Number"
                      secondary={profileData.studentNumber || profileData.studentId || profileData.libraryCardNumber || (profileData.library && profileData.library.cardNumber)}
                    />
                  </ListItem>
                )}
                {profileData.curriculum && (
                  <ListItem>
                    <ListItemText
                      primary="Curriculum"
                      secondary={profileData.curriculum}
                    />{" "}
                  </ListItem>
                )}{" "}
              </List>
              <Box mt={2}>
                {isSelfProfile && (
                  <Box>
                    <Button
                      fullWidth
                      variant="outlined"
                      startIcon={<Edit />}
                      onClick={() => setEditMode(true)}
                      sx={{ mb: 1 }}
                    >
                      Edit Profile{" "}
                    </Button>{" "}
                    <Button
                      fullWidth
                      variant="outlined"
                      startIcon={<Security />}
                      onClick={() => setChangePasswordDialog(true)}
                    >
                      Change Password{" "}
                    </Button>{" "}
                  </Box>
                )}
                {!isSelfProfile && profileData.role === "student" && (user && (user.role === "admin" || user.role === "librarian" || user.role === "staff")) && (
                  <Box mt={2}>
                    <Button
                      fullWidth
                      variant="contained"
                      onClick={() => {
                        const targetId = profileData._id || profileData.id;
                        if (targetId) navigate(`/students/${targetId}/edit`);
                      }}
                    >
                      Open Student Record
                    </Button>
                  </Box>
                )}
              </Box>{" "}
            </CardContent>{" "}
          </Card>{" "}
        </Grid>
        {/* Statistics and Activity */}{" "}
        <Grid item xs={12} md={8}>
          {" "}
          {/* Statistics Cards */}{" "}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={6} md={3}>
              <Card>
                <CardContent sx={{ textAlign: "center" }}>
                  <LibraryBooks color="primary" sx={{ fontSize: 40, mb: 1 }} />{" "}
                  <Typography variant="h6">
                    {" "}
                    {stats.totalBorrowings}{" "}
                  </Typography>{" "}
                  <Typography variant="body2" color="textSecondary">
                    Total Borrowed{" "}
                  </Typography>{" "}
                </CardContent>{" "}
              </Card>{" "}
            </Grid>{" "}
            <Grid item xs={6} md={3}>
              <Card>
                <CardContent sx={{ textAlign: "center" }}>
                  <Assignment color="info" sx={{ fontSize: 40, mb: 1 }} />{" "}
                  <Typography variant="h6">
                    {" "}
                    {stats.activeBorrowings}{" "}
                  </Typography>{" "}
                  <Typography variant="body2" color="textSecondary">
                    Currently Borrowed{" "}
                  </Typography>{" "}
                </CardContent>{" "}
              </Card>{" "}
            </Grid>{" "}
            <Grid item xs={6} md={3}>
              <Card>
                <CardContent sx={{ textAlign: "center" }}>
                  <Warning color="error" sx={{ fontSize: 40, mb: 1 }} />{" "}
                  <Typography variant="h6">
                    {" "}
                    {stats.overdueBorrowings}{" "}
                  </Typography>{" "}
                  <Typography variant="body2" color="textSecondary">
                    Overdue{" "}
                  </Typography>{" "}
                </CardContent>{" "}
              </Card>{" "}
            </Grid>{" "}
            <Grid item xs={6} md={3}>
              <Card>
                <CardContent sx={{ textAlign: "center" }}>
                  <Typography variant="h6" color="error">
                    {formatCurrency(stats.totalFines)}{" "}
                  </Typography>{" "}
                  <Typography variant="body2" color="textSecondary">
                    Total Fines{" "}
                  </Typography>{" "}
                </CardContent>{" "}
              </Card>{" "}
            </Grid>{" "}
          </Grid>
          {/* Borrowing History */}{" "}
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Recent Borrowing History{" "}
              </Typography>{" "}
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell> Book Title </TableCell>{" "}
                      <TableCell> Borrow Date </TableCell>{" "}
                      <TableCell> Due Date </TableCell>{" "}
                      <TableCell> Status </TableCell>{" "}
                    </TableRow>{" "}
                  </TableHead>{" "}
                  <TableBody>
                    {" "}
                    {borrowingHistory.slice(0, 10).map((transaction) => (
                      <TableRow key={transaction._id}>
                        <TableCell>
                          <Typography variant="body2" fontWeight="medium">
                            {" "}
                            {transaction.bookTitle}{" "}
                          </Typography>{" "}
                          <Typography variant="caption" color="textSecondary">
                            {" "}
                            {transaction.author}{" "}
                          </Typography>{" "}
                        </TableCell>{" "}
                        <TableCell>
                          {" "}
                          {new Date(
                            transaction.borrowDate,
                          ).toLocaleDateString()}{" "}
                        </TableCell>{" "}
                        <TableCell>
                          {" "}
                          {new Date(
                            transaction.dueDate,
                          ).toLocaleDateString()}{" "}
                        </TableCell>{" "}
                        <TableCell>
                          <Chip
                            label={transaction.status}
                            color={getStatusColor(transaction.status)}
                            size="small"
                          />
                        </TableCell>{" "}
                      </TableRow>
                    ))}{" "}
                  </TableBody>{" "}
                </Table>{" "}
              </TableContainer>{" "}
              {borrowingHistory.length === 0 && (
                <Typography
                  textAlign="center"
                  color="textSecondary"
                  sx={{ py: 3 }}
                >
                  No borrowing history found{" "}
                </Typography>
              )}{" "}
            </CardContent>{" "}
          </Card>{" "}
        </Grid>{" "}
      </Grid>
      {isSelfProfile && (
        <>
          {/* Edit Profile Dialog */}
          <Dialog
            open={editMode}
            onClose={() => setEditMode(false)}
            maxWidth="sm"
            fullWidth
          >
            <DialogTitle> Edit Profile </DialogTitle>
            <DialogContent>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="First Name"
                    value={profileData.firstName || ""}
                    onChange={(e) =>
                      setProfileData({
                        ...profileData,
                        firstName: e.target.value,
                      })
                    }
                    margin="normal"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Last Name"
                    value={profileData.lastName || ""}
                    onChange={(e) =>
                      setProfileData({
                        ...profileData,
                        lastName: e.target.value,
                      })
                    }
                    margin="normal"
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Phone Number"
                    value={profileData.phoneNumber || ""}
                    onChange={(e) =>
                      setProfileData({
                        ...profileData,
                        phoneNumber: e.target.value,
                      })
                    }
                    margin="normal"
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Address"
                    multiline
                    rows={3}
                    value={profileData.address || ""}
                    onChange={(e) =>
                      setProfileData({
                        ...profileData,
                        address: e.target.value,
                      })
                    }
                    margin="normal"
                  />
                </Grid>
              </Grid>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setEditMode(false)} startIcon={<Cancel />}>
                Cancel
              </Button>
              <Button
                onClick={handleProfileUpdate}
                variant="contained"
                disabled={loading}
                startIcon={<Save />}
              >
                {loading ? "Saving..." : "Save Changes"}
              </Button>
            </DialogActions>
          </Dialog>
          {/* Change Password Dialog */}
          <Dialog
            open={changePasswordDialog}
            onClose={() => setChangePasswordDialog(false)}
            maxWidth="sm"
            fullWidth
          >
            <DialogTitle> Change Password </DialogTitle>
            <DialogContent>
              <TextField
                fullWidth
                label="Current Password"
                type={showPasswords.current ? "text" : "password"}
                value={passwordData.currentPassword}
                onChange={(e) =>
                  setPasswordData({
                    ...passwordData,
                    currentPassword: e.target.value,
                  })
                }
                margin="normal"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => togglePasswordVisibility("current")}
                        edge="end"
                      >
                        {showPasswords.current ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              <TextField
                fullWidth
                label="New Password"
                type={showPasswords.new ? "text" : "password"}
                value={passwordData.newPassword}
                onChange={(e) =>
                  setPasswordData({
                    ...passwordData,
                    newPassword: e.target.value,
                  })
                }
                margin="normal"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => togglePasswordVisibility("new")}
                        edge="end"
                      >
                        {showPasswords.new ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              <TextField
                fullWidth
                label="Confirm New Password"
                type={showPasswords.confirm ? "text" : "password"}
                value={passwordData.confirmPassword}
                onChange={(e) =>
                  setPasswordData({
                    ...passwordData,
                    confirmPassword: e.target.value,
                  })
                }
                margin="normal"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => togglePasswordVisibility("confirm")}
                        edge="end"
                      >
                        {showPasswords.confirm ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            </DialogContent>
            <DialogActions>
              <Button
                onClick={() => setChangePasswordDialog(false)}
                startIcon={<Cancel />}
              >
                Cancel
              </Button>
              <Button
                onClick={handlePasswordChange}
                variant="contained"
                disabled={
                  loading ||
                  !passwordData.currentPassword ||
                  !passwordData.newPassword ||
                  !passwordData.confirmPassword
                }
                startIcon={<Save />}
              >
                {loading ? "Changing..." : "Change Password"}
              </Button>
            </DialogActions>
          </Dialog>
        </>
      )}
    </Box>
  );
};

export default UserProfile;
