import { Box } from "@mui/material";
import { styled } from "@mui/system";

export const NotesWrapper = styled(Box)(({ theme }) => ({
  flexGrow: 1,
  padding: theme.spacing(3.25, 4.5),
  borderRadius: 8,
  borderColor: theme.palette.gray[30],
  borderWidth: 1,
  borderStyle: "solid",
  backgroundColor: theme.palette.common.white,
}));
