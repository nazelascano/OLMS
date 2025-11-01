import React, { useEffect, useState } from 'react';
import { Box, Paper, List, ListItem, ListItemText, IconButton, Typography } from '@mui/material';
import { api } from '../../utils/api';
import toast from 'react-hot-toast';
import MarkEmailReadIcon from '@mui/icons-material/MarkEmailRead';
import MarkEmailUnreadIcon from '@mui/icons-material/MarkEmailUnread';
import DeleteIcon from '@mui/icons-material/Delete';

const NotificationsPage = () => {
  const [items, setItems] = useState([]);

  const fetchNotifications = async () => {
    try {
      const resp = await api.get('/notifications/persistent');
      setItems(resp.data.notifications || []);
    } catch (err) {
      console.error('Failed to load notifications', err);
      toast.error('Failed to load notifications');
    }
  };

  useEffect(() => { fetchNotifications(); }, []);

  const toggleRead = async (n, read) => {
    try {
      await api.put(`/notifications/${n.id || n._id}/read`, { read });
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
                <IconButton onClick={() => toggleRead(n, !(n.readBy || []).includes('me'))} title="Toggle read">
                  {(n.readBy || []).length > 0 ? <MarkEmailReadIcon /> : <MarkEmailUnreadIcon />}
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
