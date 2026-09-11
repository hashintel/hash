import { styled, Typography } from "@mui/material";

import type { TypographyProps } from "@mui/material";

export const AuthHeading = styled((props: TypographyProps) => (
  <Typography variant="h1" {...props} />
))(({ theme }) => ({
  marginBottom: theme.spacing(4.25),
  color: theme.palette.common.black,
  fontSize: 26,
  textTransform: "uppercase",
  fontFamily: "Inter, sans-serif",
  fontWeight: 900,
}));
