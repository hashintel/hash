import { ButtonBase, styled } from "@mui/material";

export const DangerButton = styled(ButtonBase)(({ theme }) => ({
  fontWeight: 600,
  display: "flex",
  color: theme.palette.red[80],
  "&:hover": {
    color: theme.palette.red[90],
  },
}));
