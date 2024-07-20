import type { PropsWithChildren } from "react";
import { Box, Grid } from "@mui/material";

import { useSidebarContext } from "../../../shared/layout/layout-with-sidebar/sidebar-context";

export const HomepageCard = ({
  children,
  wide,
}: PropsWithChildren<{ wide?: boolean }>) => {
  const { sidebarOpen } = useSidebarContext();

  return (
    <Grid
      item
      xs={12}
      md={sidebarOpen ? 12 : 6}
      lg={sidebarOpen ? 6 : wide ? 6 : 4}
      xl={wide ? 6 : 4}
    >
      <Box
        sx={({ breakpoints, palette }) => ({
          background: palette.gray[10],
          border: `1px solid ${palette.gray[30]}`,
          borderRadius: 2,
          maxWidth: sidebarOpen
            ? { md: 600, lg: "100%" }
            : { sm: 600, md: "100%" },
          px: 6,
          py: 6,
          minHeight: 268,
          [breakpoints.up(sidebarOpen ? "xl" : "lg")]: wide
            ? {
                px: 10,
                py: 7,
              }
            : {},
        })}
      >
        {children}
      </Box>
    </Grid>
  );
};
