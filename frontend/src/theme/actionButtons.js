const sharedButtonSx = {
  textTransform: "none",
  fontWeight: 600,
  letterSpacing: 0.2,
  borderRadius: 12,
  whiteSpace: "nowrap",
  transition: "box-shadow 0.2s ease, transform 0.2s ease, background-color 0.2s ease, border-color 0.2s ease",
};

export const addActionButtonSx = {
  ...sharedButtonSx,
  color: "#ffffff",
  backgroundColor: "#16a34a",
  border: "1px solid #15803d",
  boxShadow: "0 8px 18px rgba(21, 128, 61, 0.35)",
  "&:hover": {
    backgroundColor: "#15803d",
    borderColor: "#166534",
    boxShadow: "0 10px 20px rgba(21, 128, 61, 0.4)",
    transform: "translateY(-1px)",
  },
  "&:active": {
    boxShadow: "0 4px 10px rgba(21, 128, 61, 0.4)",
    transform: "translateY(0)",
  },
  "&:focus-visible": {
    outline: "3px solid rgba(34, 197, 94, 0.35)",
    outlineOffset: "2px",
  },
};

export const importActionButtonSx = {
  ...sharedButtonSx,
  color: "#ffffff",
  backgroundColor: "#0ea5e9",
  border: "1px solid #0284c7",
  boxShadow: "0 6px 16px rgba(2, 132, 199, 0.35)",
  "&:hover": {
    backgroundColor: "#0284c7",
    borderColor: "#0369a1",
    boxShadow: "0 10px 20px rgba(2, 132, 199, 0.4)",
    transform: "translateY(-1px)",
  },
  "&:active": {
    boxShadow: "0 4px 10px rgba(2, 132, 199, 0.4)",
    transform: "translateY(0)",
  },
  "&:focus-visible": {
    outline: "3px solid rgba(56, 189, 248, 0.6)",
    outlineOffset: "2px",
  },
};

export const printActionButtonSx = {
  ...sharedButtonSx,
  color: "#0f172a",
  backgroundColor: "#fde047",
  border: "1px solid #facc15",
  "&:hover": {
    backgroundColor: "#facc15",
    borderColor: "#eab308",
    transform: "translateY(-1px)",
  },
  "&:active": {
    transform: "translateY(0)",
  },
  "&:focus-visible": {
    outline: "3px solid rgba(250, 204, 21, 0.45)",
    outlineOffset: "2px",
  },
};

export const floatingAddFabSx = {
  backgroundColor: "#16a34a",
  color: "#ffffff",
  boxShadow: "0 12px 26px rgba(21, 128, 61, 0.45)",
  "&:hover": {
    backgroundColor: "#15803d",
    boxShadow: "0 16px 30px rgba(21, 128, 61, 0.5)",
  },
};
