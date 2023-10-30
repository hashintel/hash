import { Box } from "@mui/material";
import { styled } from "@mui/system";

export const NotesSectionWrapper = styled(Box)(({ theme }) => ({
  display: "flex",
  columnGap: theme.spacing(7.5),
  marginBottom: theme.spacing(3),
}));
