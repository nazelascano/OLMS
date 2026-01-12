import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemText,
  Paper,
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
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import { api } from '../../utils/api';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import QRScanner from '../../components/QRScanner';

const RequestsPage = () => {
  useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [approveTarget, setApproveTarget] = useState(null);
  const [approveAssignments, setApproveAssignments] = useState({});
  const [approveBooks, setApproveBooks] = useState({});
  const [approveLoading, setApproveLoading] = useState(false);
  const [approveSubmitting, setApproveSubmitting] = useState(false);
  const [approveError, setApproveError] = useState('');
  const [scannerConfig, setScannerConfig] = useState({ open: false, targetKey: null, label: '' });

  const approveTransaction = (txId, payload) => api.post(`/transactions/approve/${txId}`, payload);

  const resolveTransactionId = (entry) =>
    entry?.id || entry?.transactionId || entry?._id || entry?.resolvedId || null;

  const getTransactionItems = (entry) => {
    if (!entry) return [];
    if (Array.isArray(entry.items)) return entry.items;
    if (entry.transaction && Array.isArray(entry.transaction.items)) return entry.transaction.items;
    return [];
  };

  const buildItemKey = (item, index) => {
    if (!item) return `item-${index}`;
    if (item.requestItemId) return String(item.requestItemId);
    const bookId = item.bookId ? String(item.bookId) : 'book';
    return `${bookId}-${index}`;
  };

    const normalizeRequests = useCallback((entries = []) => {
      if (!Array.isArray(entries)) return [];
      const seen = new Set();
      return entries.reduce((acc, entry, index) => {
        const id = resolveTransactionId(entry);
        if (id) {
          if (seen.has(id)) {
            return acc;
          }
          seen.add(id);
          acc.push(entry);
          return acc;
        }
        acc.push({ ...entry, __fallbackKey: `request-${index}` });
        return acc;
      }, []);
    }, []);

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      const resp = await api.get('/transactions', { params: { status: 'requested', limit: 200 } });
      const data = Array.isArray(resp.data) ? resp.data : resp.data?.transactions || [];
      setRequests(normalizeRequests(data));
    } catch (err) {
      console.error('Failed to load requests', err);
      toast.error('Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, [normalizeRequests]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const shouldFallbackToAssignments = (errorResponse) => {
    if (!errorResponse) return false;
    const message = String(errorResponse.message || '').toLowerCase();
    const hasMessageMatch = message && (
      message.includes('copy assignments') ||
      message.includes('missing copy') ||
      message.includes('missing-copy') ||
      message.includes('copy-not-found') ||
      message.includes('copy-unavailable') ||
      message.includes('requested copies are missing')
    );

    const detailReasons = Array.isArray(errorResponse.details)
      ? errorResponse.details
      : Array.isArray(errorResponse.details?.validationFailures)
        ? errorResponse.details.validationFailures
        : [];

    const hasDetailMatch = detailReasons.some((entry) => {
      const reason = String(entry?.reason || '').toLowerCase();
      return reason && (
        reason.includes('copy') ||
        reason.includes('missing')
      );
    });

    return hasMessageMatch || hasDetailMatch;
  };

  const approveWithoutAssignments = async (tx) => {
    const id = resolveTransactionId(tx);
    if (!id) return;
    try {
      await approveTransaction(id);
      toast.success('Request approved');
      setSelected((prev) => prev.filter((value) => value !== id));
      fetchRequests();
    } catch (err) {
      console.error('Approve failed', err);
      const status = err.response?.status;
      const message = err.response?.data?.message || 'Approve failed';
      if (status === 400 && shouldFallbackToAssignments(err.response?.data)) {
        toast.error(`${message}. Please assign copies manually.`);
        openApproveDialog(tx);
        return;
      }
      toast.error(message);
    }
  };

  const startApproveWorkflow = (tx) => {
    const items = getTransactionItems(tx);
    if (items.some((item) => !item?.copyId)) {
      openApproveDialog(tx);
      return;
    }
    approveWithoutAssignments(tx);
  };

  const openApproveDialog = async (tx) => {
    const id = resolveTransactionId(tx);
    const items = getTransactionItems(tx).map((item) => ({ ...item }));
    if (!id) return;

    setApproveDialogOpen(true);
    setApproveTarget({ id, transaction: tx, items });
    setApproveAssignments({});
    setApproveBooks({});
    setApproveError('');
    setApproveSubmitting(false);
    setApproveLoading(true);

    try {
      const missingBookRefs = items.some((item) => !item.copyId && !item.bookId);
      if (missingBookRefs) {
        setApproveError('Some requested items do not reference a specific book. Please review the request.');
      }

      const uniqueBookIds = Array.from(
        new Set(
          items
            .map((item) => (item.bookId ? String(item.bookId) : ''))
            .filter((value) => Boolean(value))
        )
      );

      let booksMap = {};
      if (uniqueBookIds.length > 0) {
        const responses = await Promise.all(
          uniqueBookIds.map(async (bookId) => {
            try {
              const resp = await api.get(`/books/${bookId}`);
              return { bookId, data: resp.data };
            } catch (err) {
              console.error('Failed to load book details', bookId, err);
              return { bookId, error: err };
            }
          })
        );

        const failedBooks = [];
        responses.forEach(({ bookId, data, error }) => {
          if (data) {
            const normalizedId = String(data.id || data._id || bookId);
            booksMap[normalizedId] = data;
            booksMap[String(bookId)] = data;
          } else {
            failedBooks.push(bookId);
          }
        });

        if (failedBooks.length > 0) {
          setApproveError((prev) =>
            prev || 'Some book details could not be loaded. Please verify availability before approving.'
          );
        }
      }

      setApproveBooks(booksMap);

      setApproveAssignments(() => {
        const initial = {};
        items.forEach((item, index) => {
          const key = buildItemKey(item, index);
          if (item.copyId) {
            initial[key] = item.copyId;
            return;
          }

          const bookId = item.bookId ? String(item.bookId) : '';
          const book = booksMap[bookId];
          const availableCopies = Array.isArray(book?.copies)
            ? book.copies.filter((copy) => copy.status === 'available')
            : [];

          if (availableCopies.length === 1) {
            initial[key] = availableCopies[0].copyId;
          } else {
            initial[key] = '';
          }
        });
        return initial;
      });
    } catch (err) {
      console.error('Failed to prepare approval dialog', err);
      setApproveError(err.response?.data?.message || 'Failed to load book details');
    } finally {
      setApproveLoading(false);
    }
  };

  const handleAssignmentChange = (itemKey, copyId) => {
    const normalized = (copyId || '').toString().trim();
    setApproveAssignments((prev) => ({ ...prev, [itemKey]: normalized }));
    setApproveError('');
  };

  const openScannerForItem = (itemKey, label) => {
    if (!itemKey) return;
    setScannerConfig({ open: true, targetKey: itemKey, label: label || 'Reference ID' });
  };

  const closeScannerDialog = () => {
    setScannerConfig({ open: false, targetKey: null, label: '' });
  };

  const handleScannerDetected = (value) => {
    const trimmed = String(value || '').trim();
    if (!trimmed) {
      toast.error('QR code did not contain a reference ID');
      return;
    }
    if (!scannerConfig.targetKey) {
      toast.error('No target field selected for scanning');
      return;
    }
    setApproveAssignments((prev) => ({ ...prev, [scannerConfig.targetKey]: trimmed }));
    toast.success('Reference ID captured');
    closeScannerDialog();
  };

  const closeApproveDialog = () => {
    if (approveSubmitting) return;
    setApproveDialogOpen(false);
    setApproveTarget(null);
    setApproveAssignments({});
    setApproveBooks({});
    setApproveError('');
  };

  const handleSubmitAssignments = async () => {
    if (!approveTarget) return;
    const { id, items } = approveTarget;
    setApproveSubmitting(true);
    setApproveError('');

    try {
      const payloadItems = items.map((item, index) => {
        const key = buildItemKey(item, index);
        const selectedCopyId = (approveAssignments[key] || item.copyId || '').toString().trim();
        const normalizedBookId = item.bookId ? String(item.bookId) : undefined;
        return {
          requestItemId: item.requestItemId,
          bookId: normalizedBookId,
          copyId: selectedCopyId,
        };
      });

      const missingAssignments = payloadItems.filter((entry) => !entry.copyId);
      if (missingAssignments.length > 0) {
        setApproveError('Please assign a copy for each requested book.');
        setApproveSubmitting(false);
        return;
      }

      await approveTransaction(id, { items: payloadItems });
      toast.success('Request approved');
      closeApproveDialog();
      fetchRequests();
      setSelected((prev) => prev.filter((value) => value !== id));
    } catch (err) {
      console.error('Approve failed', err);
      setApproveError(err.response?.data?.message || 'Approve failed');
    } finally {
      setApproveSubmitting(false);
    }
  };

  const takenCopyMap = useMemo(() => {
    const mapping = {};
    Object.entries(approveAssignments).forEach(([key, value]) => {
      if (!value) return;
      mapping[String(value).toLowerCase()] = key;
    });
    return mapping;
  }, [approveAssignments]);

  const dialogItems = useMemo(() => approveTarget?.items || [], [approveTarget]);

  const assignmentsReady = useMemo(() => {
    if (!approveDialogOpen || approveLoading) return false;
    return dialogItems.every((item, index) => {
      const key = buildItemKey(item, index);
      const assigned = approveAssignments[key] || item.copyId;
      return Boolean((assigned || '').toString().trim());
    });
  }, [approveAssignments, approveDialogOpen, approveLoading, dialogItems]);

  const actionableRequestCount = useMemo(
    () => requests.filter((entry) => Boolean(resolveTransactionId(entry))).length,
    [requests]
  );

  const handleBulkApprove = async () => {
    if (!selected || selected.length === 0) return;
    const autoApprove = [];
    const needsManual = [];

    selected.forEach((txId) => {
      const tx = requests.find((entry) => resolveTransactionId(entry) === txId);
      const items = getTransactionItems(tx);
      if (items.some((item) => !item?.copyId)) {
        needsManual.push(txId);
      } else {
        autoApprove.push(txId);
      }
    });

    if (needsManual.length > 0) {
      toast.error(`Cannot bulk approve ${needsManual.length} request${needsManual.length > 1 ? 's' : ''} without assigning copies first.`);
    }

    if (autoApprove.length === 0) {
      return;
    }

    const results = { success: 0, failed: 0, details: [] };
    for (const txId of autoApprove) {
      try {
        await approveTransaction(txId);
        results.success += 1;
      } catch (err) {
        results.failed += 1;
        results.details.push({ id: txId, message: err.response?.data?.message || err.message });
      }
    }

    fetchRequests();
    setSelected([]);

    if (results.success > 0) {
      toast.success(`Approved ${results.success} request${results.success > 1 ? 's' : ''}${results.failed ? `, ${results.failed} failed` : ''}`);
    } else if (results.failed > 0) {
      toast.error(`Failed to approve ${results.failed} request${results.failed > 1 ? 's' : ''}`);
    }

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
    if (!id) return;
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      const allIds = requests.map(resolveTransactionId).filter(Boolean);
      setSelected(allIds);
    } else {
      setSelected([]);
    }
  };

  const handleChangePage = (event, newPage) => setPage(newPage);
  const handleChangeRowsPerPage = (event) => { setRowsPerPage(parseInt(event.target.value, 10)); setPage(0); };
  const handleBack = () => navigate('/transactions');

  return (
    <Box>
      <Box display="flex" alignItems="center" mb={2}>
        <IconButton onClick={handleBack} aria-label="Go back" sx={{ color: 'text.primary', mr: 2 }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4" color={"white"}>Borrow Requests</Typography>
      </Box>
      <Paper>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    indeterminate={selected.length > 0 && selected.length < actionableRequestCount}
                    checked={actionableRequestCount > 0 && selected.length === actionableRequestCount}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    inputProps={{ 'aria-label': 'select all requests' }}
                    disabled={actionableRequestCount === 0}
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
                (requests.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)).map((tx, idx) => {
                  const txId = resolveTransactionId(tx);
                  const rowIndex = page * rowsPerPage + idx;
                  const rowKey = txId || tx.__fallbackKey || `request-row-${rowIndex}`;
                  const isActionable = Boolean(txId);
                  return (
                    <TableRow key={rowKey} hover>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={Boolean(txId) && isSelected(txId)}
                          onChange={() => toggleSelect(txId)}
                          disabled={!isActionable}
                        />
                      </TableCell>
                      <TableCell>{txId}</TableCell>
                      <TableCell>{tx.borrowerName || tx.user || tx.userId || 'Unknown'}</TableCell>
                      <TableCell>{(tx.items || []).length}</TableCell>
                      <TableCell>{new Date(tx.createdAt || tx.borrowDate || Date.now()).toLocaleString()}</TableCell>
                      <TableCell>
                        <Button size="small" onClick={() => startApproveWorkflow(tx)} sx={{ mr: 1 }} disabled={!isActionable}>Approve</Button>
                        <Button
                          size="small"
                          color="error"
                          onClick={() => {
                            if (!txId) return;
                            setSelected([txId]);
                            setRejectDialogOpen(true);
                            setRejectReason('');
                          }}
                          disabled={!isActionable}
                        >
                          Reject
                        </Button>
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

      <Dialog
        open={approveDialogOpen}
        onClose={closeApproveDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Assign Copies</DialogTitle>
        <DialogContent dividers>
          {approveError && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {approveError}
            </Alert>
          )}

          {approveLoading ? (
            <Box display="flex" alignItems="center" justifyContent="center" minHeight={160}>
              <CircularProgress />
            </Box>
          ) : dialogItems.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No items to assign for this request.
            </Typography>
          ) : (
            <List disablePadding>
              {dialogItems.map((item, index) => {
                const key = buildItemKey(item, index);
                const assignedCopyId = approveAssignments[key] || item.copyId || '';
                const bookId = item.bookId ? String(item.bookId) : '';
                const bookDetails = approveBooks[bookId];
                const availableCopies = Array.isArray(bookDetails?.copies)
                  ? bookDetails.copies.filter((copy) => copy.status === 'available')
                  : [];
                const hasBookDetails = Boolean(bookDetails);
                const title = bookDetails?.title || item.title || 'Unknown title';
                const author = bookDetails?.author || item.author || '';
                const isbn = bookDetails?.isbn || item.isbn || '';
                const secondary = [
                  author ? `Author: ${author}` : null,
                  isbn ? `ISBN: ${isbn}` : null,
                  bookDetails?.category ? `Category: ${bookDetails.category}` : null,
                ]
                  .filter(Boolean)
                  .join(' • ');

                return (
                  <React.Fragment key={key}>
                    <ListItem disableGutters sx={{ flexDirection: 'column', alignItems: 'stretch', py: 1 }}>
                      <ListItemText primary={title} secondary={secondary || undefined} />

                      {item.copyId ? (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                          Copy already assigned: {item.copyId}
                        </Typography>
                      ) : hasBookDetails && availableCopies.length > 0 ? (
                        <Box sx={{ width: '100%', mt: 1 }}>
                          <Autocomplete
                            freeSolo
                            disableClearable
                            autoHighlight
                            options={availableCopies
                              .filter((copy) => {
                                const owner = takenCopyMap[String(copy.copyId).toLowerCase()];
                                return !owner || owner === key;
                              })
                              .map((copy) => copy.copyId)
                              .filter(Boolean)}
                            value={assignedCopyId || ''}
                            onChange={(event, newValue) => handleAssignmentChange(key, newValue || '')}
                            onInputChange={(event, newInputValue, reason) => {
                              if (reason === 'input') {
                                handleAssignmentChange(key, newInputValue || '');
                              }
                            }}
                            disabled={approveSubmitting}
                            renderOption={(props, option) => {
                              const copyMeta = availableCopies.find((copy) => copy.copyId === option);
                              return (
                                <li {...props} key={option}>
                                  <Box display="flex" flexDirection="column">
                                    <Typography variant="body2">{option}</Typography>
                                    {copyMeta?.location && (
                                      <Typography variant="caption" color="text.secondary">
                                        Location: {copyMeta.location}
                                      </Typography>
                                    )}
                                    {copyMeta?.condition && (
                                      <Typography variant="caption" color="text.secondary">
                                        Condition: {copyMeta.condition}
                                      </Typography>
                                    )}
                                  </Box>
                                </li>
                              );
                            }}
                            renderInput={(params) => (
                              <TextField
                                {...params}
                                label="Reference ID"
                                placeholder="Search or scan reference ID"
                                InputProps={{
                                  ...params.InputProps,
                                  endAdornment: (
                                    <>
                                      <InputAdornment position="end">
                                        <Tooltip title="Scan QR code">
                                          <span>
                                            <IconButton
                                              size="small"
                                              onClick={() => openScannerForItem(key, title)}
                                              disabled={approveSubmitting}
                                            >
                                              <QrCodeScannerIcon fontSize="small" />
                                            </IconButton>
                                          </span>
                                        </Tooltip>
                                      </InputAdornment>
                                      {params.InputProps.endAdornment}
                                    </>
                                  ),
                                }}
                                helperText="Type to search available copies or scan a QR label"
                                size="small"
                              />
                            )}
                          />
                        </Box>
                      ) : (
                        <Alert severity={hasBookDetails ? 'warning' : 'error'} sx={{ mt: 1 }}>
                          {hasBookDetails
                            ? 'No available copies for this book.'
                            : 'Unable to load available copies for this book.'}
                        </Alert>
                      )}
                    </ListItem>
                    {index < dialogItems.length - 1 && <Divider component="li" />}
                  </React.Fragment>
                );
              })}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeApproveDialog} disabled={approveSubmitting}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmitAssignments}
            disabled={!assignmentsReady || approveSubmitting}
          >
            {approveSubmitting ? 'Assigning…' : 'Assign Copies'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={scannerConfig.open}
        onClose={closeScannerDialog}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Scan Reference ID</DialogTitle>
        <DialogContent>
          {scannerConfig.open && (
            <QRScanner
              elementId="requests-approval-qr"
              onDetected={handleScannerDetected}
            />
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Position the QR label for {scannerConfig.label || 'this item'} inside the frame.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeScannerDialog}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={rejectDialogOpen} onClose={() => setRejectDialogOpen(false)}>
        <DialogTitle>Reject Request</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Reason" multiline minRows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleReject}>Reject</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default RequestsPage;
