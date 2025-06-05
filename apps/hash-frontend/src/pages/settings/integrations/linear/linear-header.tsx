import { Typography } from "@mui/material";

import { LinearLogo } from "../../../../shared/icons/linear-logo";

export const LinearHeader = () => (
  <Typography variant="h1">
    <LinearLogo sx={{ fontSize: 42, mr: 2 }} />
    Linear
  </Typography>
);
