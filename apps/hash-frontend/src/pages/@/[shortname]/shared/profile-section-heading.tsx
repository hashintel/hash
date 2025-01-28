import { styled, Typography } from "@mui/material";

export const ProfileSectionHeading = styled(Typography)(({ theme }) => ({
  textTransform: "uppercase",
  color: theme.palette.gray[70],
  fontSize: 12,
  fontWeight: 600,
}));
