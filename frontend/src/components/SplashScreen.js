import React from 'react';
import { Box, Typography } from '@mui/material';
import logo from '../assets/images/logo.png';
import { useSettings } from '../contexts/SettingsContext';

const SplashScreen = () => {
  const { libraryTagline, libraryLogoUrl } = useSettings();
  const displayLogo = libraryLogoUrl || logo;

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#305FB7',
        color: 'white',
      }}
    >
      <Box
        component="img"
        src={displayLogo}
        alt="ONHS Library Management System Logo"
        sx={{
          width: 200,
          height: 'auto',
          mb: 2,
        }}
      />
      <Typography variant="h5" sx={{ fontFamily: 'Inknut Antiqua, serif' }}>
        {libraryTagline}
      </Typography>
    </Box>
  );
};

export default SplashScreen;