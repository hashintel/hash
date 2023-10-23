import { Box, styled } from "@mui/material";

export const NotesWrapper = styled(Box)(({ theme }) => ({
  flexGrow: 1,
  borderRadius: 8,
  borderColor: theme.palette.gray[30],
  borderWidth: 1,
  borderStyle: "solid",
  backgroundColor: theme.palette.common.white,
}));
