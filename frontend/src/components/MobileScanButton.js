import React from "react";
import { Button } from "@mui/material";
import QrCodeScanner from "@mui/icons-material/QrCodeScanner";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";

const MobileScanButton = ({
  label = "Scan QR Code",
  onClick,
  disabled = false,
  sx,
  icon,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  if (!isMobile) {
    return null;
  }

  return (
    <Button
      fullWidth
      variant="outlined"
      startIcon={icon || <QrCodeScanner />}
      onClick={onClick}
      disabled={disabled}
      sx={{ mt: 2, ...sx }}
    >
      {label}
    </Button>
  );
};

export default MobileScanButton;
