import React from 'react';
import { Box, Typography } from '@mui/material';
import logo from '../assets/images/logo.png';

const SplashScreen = () => {
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
        src={logo}
        alt="ONHS Library Management System Logo"
        sx={{
          width: 200,
          height: 'auto',
          mb: 2,
        }}
      />
      <Typography variant="h5" sx={{ fontFamily: 'Inknut Antiqua, serif' }}>
        The School of Choice
      </Typography>
    </Box>
  );
};

export default SplashScreen;