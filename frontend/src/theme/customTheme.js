import { createTheme } from "@mui/material/styles";

// Custom theme matching the Figma design
const customTheme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#305FB7", // Updated blue from Figma
      light: "#4F7BC9",
      dark: "#1E4A8C",
      contrastText: "#FFFFFF",
    },
    secondary: {
      main: "#22C55E", // Green for active nav items
      light: "#4ADE80",
      dark: "#16A34A",
      contrastText: "#FFFFFF",
    },
    background: {
      default: "#305FB7", // Updated blue gradient background
      paper: "#FFFFFF",
      secondary: "#F8FAFC", // Light background for content
    },
    text: {
      primary: "#000000", // 21:1 contrast ratio (AAA compliant)
      secondary: "#2D3748", // 7.1:1 contrast ratio (AAA compliant)
      disabled: "#6B7280", // 4.5:1 contrast ratio (AA compliant)
    },
    divider: "#E2E8F0",
    success: {
      main: "#22C55E",
      light: "#4ADE80",
      dark: "#16A34A",
    },
    info: {
      main: "#3B82F6",
      light: "#60A5FA",
      dark: "#2563EB",
    },
    warning: {
      main: "#F59E0B",
      light: "#FBBF24",
      dark: "#D97706",
    },
    error: {
      main: "#EF4444",
      light: "#F87171",
      dark: "#DC2626",
    },
  },
  spacing: 4, // Reduce default spacing from 8px to 4px
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontSize: "2rem",
      fontWeight: 700,
      color: "#000000", // AAA compliant
    },
    h2: {
      fontSize: "1.75rem",
      fontWeight: 600,
      color: "#000000", // AAA compliant
    },
    h3: {
      fontSize: "1.5rem",
      fontWeight: 600,
      color: "#000000", // AAA compliant
    },
    h4: {
      fontSize: "1.25rem",
      fontWeight: 600,
      color: "#000000", // AAA compliant
    },
    h5: {
      fontSize: "1.125rem",
      fontWeight: 600,
      color: "#000000", // AAA compliant
    },
    h6: {
      fontSize: "1rem",
      fontWeight: 600,
      color: "#000000", // AAA compliant
    },
    body1: {
      fontSize: "0.875rem",
      color: "#2D3748", // AAA compliant
    },
    body2: {
      fontSize: "0.75rem",
      color: "#2D3748", // AAA compliant
    },
    button: {
      textTransform: "none",
      fontWeight: 600,
      fontSize: "0.875rem",
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background: "linear-gradient(135deg, #305FB7 0%, #4F7BC9 100%)",
          minHeight: "100vh",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: "4px", // Sharp corners like Figma
          boxShadow:
            "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: "4px", // Sharp corners like Figma
          boxShadow:
            "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
          border: "1px solid #E2E8F0",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: "8px",
          textTransform: "none",
          fontWeight: 500,
          padding: "6px 12px",
          minHeight: "32px",
          fontSize: "0.75rem",
        },
        contained: {
          boxShadow: "0 3px 8px rgba(0, 0, 0, 0.12)",
          "&:hover": {
            boxShadow: "0 6px 18px rgba(0, 0, 0, 0.16)",
            transform: "translateY(-1px)",
          },
          "&.Mui-disabled": {
            opacity: 0.6,
            boxShadow: "none",
          },
          "&:focus-visible": {
            outline: "2px solid #305FB7",
            outlineOffset: "2px",
          },
        },
        outlined: {
          borderWidth: "1.5px",
          borderColor: "#E2E8F0",
          "&:hover": {
            borderColor: "#305FB7",
            backgroundColor: "rgba(48, 95, 183, 0.04)",
          },
        },
        text: {
          "&:hover": {
            backgroundColor: "rgba(48, 95, 183, 0.04)",
          },
        },
        small: {
          padding: "6px 10px",
          minHeight: "32px",
          fontSize: "0.8rem",
        },
        containedPrimary: {
          backgroundColor: "#305FB7",
          color: "#FFFFFF",
          '&:hover': {
            backgroundColor: '#1E4A8C',
          }
        },
        containedSecondary: {
          backgroundColor: '#22C55E',
          color: '#FFFFFF',
          '&:hover': {
            backgroundColor: '#16A34A',
          }
        },
        outlinedPrimary: {
          borderColor: '#305FB7',
          color: '#305FB7',
        },
        outlinedSecondary: {
          borderColor: '#22C55E',
          color: '#22C55E',
        },
      },
    },
    MuiFab: {
      styleOverrides: {
        root: {
          boxShadow: '0 6px 18px rgba(0,0,0,0.16)',
          '&:hover': {
            boxShadow: '0 10px 26px rgba(0,0,0,0.18)',
            transform: 'translateY(-2px)'
          }
        }
      }
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          padding: 8,
          borderRadius: 8,
          color: "#374151",
          backgroundColor: "transparent",
          '&:hover': {
            backgroundColor: '#F1F5F9',
          },
          '&.Mui-disabled': {
            color: '#9CA3AF',
          },
          '&:focus-visible': {
            outline: '3px solid rgba(48, 95, 183, 0.18)',
            outlineOffset: '2px',
          }
        }
      }
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            borderRadius: "4px", // Sharp corners like Figma
            backgroundColor: "#FFFFFF",
            "& fieldset": {
              borderColor: "#E2E8F0",
            },
            "&:hover fieldset": {
              borderColor: "#305FB7",
            },
            "&.Mui-focused fieldset": {
              borderColor: "#305FB7",
            },
          },
        },
      },
    },
    MuiTableContainer: {
      styleOverrides: {
        root: {
          borderRadius: "4px", // Sharp corners like Figma
          border: "1px solid #E2E8F0",
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          "& .MuiTableCell-head": {
            backgroundColor: "#F8FAFC",
            fontWeight: 600,
            color: "#374151",
            borderBottom: "1px solid #E2E8F0",
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: "1px solid #F1F5F9",
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: "#FFFFFF",
          borderRight: "1px solid #E2E8F0",
          boxShadow:
            "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: "8px",
          margin: "4px 8px",
          "&.Mui-selected": {
            backgroundColor: "#22C55E",
            color: "#FFFFFF",
            "& .MuiListItemIcon-root": {
              color: "#FFFFFF",
            },
            "&:hover": {
              backgroundColor: "#16A34A",
            },
          },
          "&:hover": {
            backgroundColor: "#F1F5F9",
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: "6px",
        },
      },
    },
  },
  shape: {
    borderRadius: 8,
  },
});

export default customTheme;
