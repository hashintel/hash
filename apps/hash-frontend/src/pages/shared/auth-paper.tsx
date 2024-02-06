import { Paper, styled } from "@mui/material";

export const AuthPaper = styled(Paper)(({ theme }) => ({
  borderRadius: "8px",
  boxShadow: theme.shadows[3],
  padding: theme.spacing(9),
}));
