import React, { useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

// Simple wrapper around html5-qrcode's Html5QrcodeScanner
// Props:
// - elementId (optional) - DOM id for the scanner container
// - onDetected(value) - called when a QR code is read
// - onClose() - called when component unmounts or when user cancels
const QRScanner = ({ elementId = 'qr-scanner', onDetected, onClose, qrbox = 250, fps = 10 }) => {
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    const config = { fps, qrbox };
    const verbose = false;
    const scanner = new Html5QrcodeScanner(elementId, config, verbose);

    scanner.render(
      (decodedText) => {
        // call parent and stop scanner
        try {
          if (mountedRef.current) {
            onDetected && onDetected(decodedText);
          }
        } finally {
          // clear scanner UI
          scanner.clear().catch(() => {});
        }
      },
      (errorMessage) => {
        // no-op for now; errors happen frequently while scanning
      }
    );

    return () => {
      mountedRef.current = false;
      // ensure scanner is cleared
      scanner.clear().catch(() => {});
      onClose && onClose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div id={elementId} />;
};

export default QRScanner;
