import { IconButton, styled } from "@mui/material";

export const ChipIconButton = styled(IconButton)(({ theme }) => ({
  width: 18,
  height: 18,
  padding: theme.spacing(0.25),
  background: "transparent",
  color: theme.palette.blue[40],
  "&:hover": {
    background: theme.palette.blue[30],
    color: theme.palette.blue[70],
  },
  cursor: "pointer",
}));
