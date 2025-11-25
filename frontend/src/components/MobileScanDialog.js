import React, { useMemo } from "react";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button } from "@mui/material";
import QRScanner from "./QRScanner";

const MobileScanDialog = ({
  open,
  onClose,
  onDetected,
  title = "Scan QR Code",
  cancelLabel = "Cancel",
  elementId,
  targetSelector,
}) => {
  const fallbackId = useMemo(
    () => `mobile-scan-${Math.random().toString(36).slice(2, 10)}`,
    []
  );
  const resolvedId = elementId || fallbackId;

  const handleDetected = (value) => {
    if (typeof onDetected === "function") {
      onDetected(value);
    }
    if (typeof onClose === "function") {
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {open ? (
          <QRScanner
            elementId={resolvedId}
            onDetected={handleDetected}
            onClose={onClose}
            targetSelector={targetSelector}
          />
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{cancelLabel}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default MobileScanDialog;
