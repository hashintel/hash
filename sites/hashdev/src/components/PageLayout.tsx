import { Box } from "@mui/material";
import { useTheme } from "@mui/system";
import { FC } from "react";
import { Footer } from "./Footer";
import { HiringBanner } from "./HiringBanner";
import { Navbar } from "./Navbar";
import { PreFooter } from "./PreFooter";

// @todo extract NavLink component

export const PageLayout: FC<{ subscribe?: boolean }> = ({
  children,
  subscribe = true,
}) => {
  const theme = useTheme();

  return (
    <Box
      display="flex"
      flexDirection="column"
      sx={{
        minHeight: "100vh",
        ".NavLink": {
          borderColor: "transparent !important",
          px: 1.5,
          py: 1,
          background: "transparent",

          fontWeight: 500,

          svg: {
            fontWeight: "400 !important",
          },

          "&:not(.active)": {
            "&, svg": {
              color: `${theme.palette.gray[70]} !important`,
            },

            "&:hover": {
              borderColor: `${theme.palette.gray[20]} !important`,
              background: "transparent !important",
              "&, svg": {
                color: `${theme.palette.gray[90]} !important`,
              },
            },
          },

          "&.active": {
            background: `${theme.palette.yellow[200]} !important`,
          },
        },
      }}
    >
      <Navbar />
      <Box flexGrow={1} display="flex" flexDirection="column">
        {children}
      </Box>
      <Box sx={{ flex: 1 }} />
      <PreFooter subscribe={subscribe} />
      <Footer />
      <HiringBanner />
    </Box>
  );
};
