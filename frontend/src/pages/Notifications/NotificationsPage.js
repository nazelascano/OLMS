import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Paper, List, ListItem, ListItemText, IconButton, Typography } from '@mui/material';
import { api, notificationsAPI } from '../../utils/api';
import toast from 'react-hot-toast';
import MarkEmailReadIcon from '@mui/icons-material/MarkEmailRead';
import MarkEmailUnreadIcon from '@mui/icons-material/MarkEmailUnread';
import DeleteIcon from '@mui/icons-material/Delete';
import { useAuth } from '../../contexts/AuthContext';

const NotificationsPage = () => {
  const [items, setItems] = useState([]);
  const { user } = useAuth();
  const userId = useMemo(() => {
    return user?.id || user?._id || user?.userId || null;
  }, [user]);

  const fetchNotifications = useCallback(async () => {
    try {
      const resp = await api.get('/notifications/persistent');
      const notifications = Array.isArray(resp.data.notifications)
        ? resp.data.notifications.map((entry) => {
            const readBy = Array.isArray(entry.readBy)
              ? entry.readBy.map((value) => String(value))
              : [];
            const normalizedUserId = userId ? String(userId) : null;
            return {
              ...entry,
              read: normalizedUserId ? readBy.includes(normalizedUserId) : false,
            };
          })
        : [];
      setItems(notifications);
    } catch (err) {
      console.error('Failed to load notifications', err);
      toast.error('Failed to load notifications');
    }
  }, [userId]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const toggleRead = async (n, read) => {
    try {
      const identifier = n.id || n._id;
      if (!identifier) {
        return;
      }
      await notificationsAPI.markRead(identifier, read);
      fetchNotifications();
    } catch (err) {
      console.error('Mark read failed', err);
      toast.error('Failed to update notification');
    }
  };

  const handleDelete = async (n) => {
    try {
      await api.delete(`/notifications/${n.id || n._id}`);
      fetchNotifications();
      toast.success('Deleted');
    } catch (err) {
      console.error('Delete failed', err);
      toast.error('Failed to delete');
    }
  };

  return (
    <Box>
      <Box mb={2}><Typography variant="h4">Notifications</Typography></Box>
      <Paper>
        <List>
          {items.length === 0 ? (
            <ListItem><ListItemText primary="No notifications" /></ListItem>
          ) : items.map(n => (
            <ListItem key={n.id || n._id} secondaryAction={(
              <>
                <IconButton onClick={() => toggleRead(n, !n.read)} title="Toggle read">
                  {n.read ? <MarkEmailReadIcon /> : <MarkEmailUnreadIcon />}
                </IconButton>
                <IconButton onClick={() => handleDelete(n)} title="Delete"><DeleteIcon /></IconButton>
              </>
            )}>
              <ListItemText primary={n.title} secondary={n.message} />
            </ListItem>
          ))}
        </List>
      </Paper>
    </Box>
  );
};

export default NotificationsPage;
