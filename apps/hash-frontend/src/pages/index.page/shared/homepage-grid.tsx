import type { PropsWithChildren } from "react";
import { Box, Grid } from "@mui/material";

export const HomepageGrid = ({ children }: PropsWithChildren) => (
  <Box
    py={{ xs: 2, sm: 3, md: 4 }}
    px={{ xs: 2.5, sm: 3.5, md: 4.5 }}
    maxWidth={1400}
  >
    <Grid container spacing={{ xs: 2, sm: 3, md: 4 }}>
      {children}
    </Grid>
  </Box>
);
