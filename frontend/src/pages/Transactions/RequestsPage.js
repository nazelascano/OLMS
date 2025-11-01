import React, { useEffect, useState } from 'react';
import { Box, Paper, Table, TableHead, TableRow, TableCell, TableBody, Button, Typography, Dialog, DialogTitle, DialogContent, TextField, DialogActions, Checkbox, TableContainer, TablePagination } from '@mui/material';
import { api } from '../../utils/api';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';

const RequestsPage = () => {
  useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const resp = await api.get('/transactions', { params: { status: 'requested', limit: 200 } });
      const data = Array.isArray(resp.data) ? resp.data : resp.data?.transactions || [];
      setRequests(data);
    } catch (err) {
      console.error('Failed to load requests', err);
      toast.error('Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRequests(); }, []);

  const handleApprove = async (tx) => {
    const id = tx.id || tx.transactionId || tx._id;
    if (!id) return;
    try {
      await api.post(`/transactions/approve/${id}`);
      toast.success('Request approved');
      fetchRequests();
    } catch (err) {
      console.error('Approve failed', err);
      toast.error(err.response?.data?.message || 'Approve failed');
    }
  };

  const handleBulkApprove = async () => {
    if (!selected || selected.length === 0) return;
    const results = { success: 0, failed: 0, details: [] };
    for (const txId of selected) {
      try {
        await api.post(`/transactions/approve/${txId}`);
        results.success++;
      } catch (err) {
        results.failed++;
        results.details.push({ id: txId, message: err.response?.data?.message || err.message });
      }
    }
    fetchRequests();
    setSelected([]);
    toast.success(`Approved ${results.success} requests${results.failed ? `, ${results.failed} failed` : ''}`);
    if (results.failed) console.error('Bulk approve failures', results.details);
  };

  const handleReject = async () => {
    if (!selected || (Array.isArray(selected) && selected.length === 0)) return;
    // support single selection (object) or array of ids
    const ids = Array.isArray(selected) ? selected : [selected.id || selected.transactionId || selected._id];
    const results = { success: 0, failed: 0, details: [] };
    for (const id of ids) {
      try {
        await api.post(`/transactions/reject/${id}`, { reason: rejectReason });
        results.success++;
      } catch (err) {
        results.failed++;
        results.details.push({ id, message: err.response?.data?.message || err.message });
      }
    }
    setRejectDialogOpen(false);
    setSelected([]);
    fetchRequests();
    toast.success(`Rejected ${results.success} requests${results.failed ? `, ${results.failed} failed` : ''}`);
    if (results.failed) console.error('Bulk reject failures', results.details);
  };

  const isSelected = (id) => selected.includes(id);

  const toggleSelect = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      const allIds = requests.map(tx => tx.id || tx.transactionId || tx._id).filter(Boolean);
      setSelected(allIds);
    } else {
      setSelected([]);
    }
  };

  const handleChangePage = (event, newPage) => setPage(newPage);
  const handleChangeRowsPerPage = (event) => { setRowsPerPage(parseInt(event.target.value, 10)); setPage(0); };

  return (
    <Box>
      <Box mb={2}><Typography variant="h4">Borrow Requests</Typography></Box>
      <Paper>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    indeterminate={selected.length > 0 && selected.length < requests.length}
                    checked={requests.length > 0 && selected.length === requests.length}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    inputProps={{ 'aria-label': 'select all requests' }}
                  />
                </TableCell>
                <TableCell>Transaction ID</TableCell>
                <TableCell>Borrower</TableCell>
                <TableCell>Items</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {requests.length === 0 ? (
                <TableRow><TableCell colSpan={6} align="center">{loading ? 'Loading...' : 'No requests'}</TableCell></TableRow>
              ) : (
                (requests.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)).map(tx => {
                  const txId = tx.id || tx._id || tx.transactionId;
                  return (
                    <TableRow key={txId} hover>
                      <TableCell padding="checkbox">
                        <Checkbox checked={isSelected(txId)} onChange={() => toggleSelect(txId)} />
                      </TableCell>
                      <TableCell>{txId}</TableCell>
                      <TableCell>{tx.borrowerName || tx.user || tx.userId || 'Unknown'}</TableCell>
                      <TableCell>{(tx.items || []).length}</TableCell>
                      <TableCell>{new Date(tx.createdAt || tx.borrowDate || Date.now()).toLocaleString()}</TableCell>
                      <TableCell>
                        <Button size="small" onClick={() => handleApprove(tx)} sx={{ mr: 1 }}>Approve</Button>
                        <Button size="small" color="error" onClick={() => { setSelected([txId]); setRejectDialogOpen(true); setRejectReason(''); }}>Reject</Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <Box display="flex" alignItems="center" justifyContent="space-between" p={1}>
          <Box>
            <Button variant="contained" onClick={handleBulkApprove} disabled={selected.length === 0} sx={{ mr: 1 }}>Approve Selected</Button>
            <Button variant="outlined" color="error" onClick={() => setRejectDialogOpen(true)} disabled={selected.length === 0}>Reject Selected</Button>
          </Box>
          <TablePagination component="div" count={requests.length} page={page} onPageChange={handleChangePage} rowsPerPage={rowsPerPage} onRowsPerPageChange={handleChangeRowsPerPage} rowsPerPageOptions={[10,25,50,100]} />
        </Box>
      </Paper>

      <Dialog open={rejectDialogOpen} onClose={() => setRejectDialogOpen(false)}>
        <DialogTitle>Reject Request</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Reason" multiline minRows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleReject}>Reject</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default RequestsPage;
