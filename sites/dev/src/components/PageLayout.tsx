import { Box, buttonClasses } from "@mui/material";
import { useTheme } from "@mui/system";
import { FC } from "react";
import { Footer } from "./Footer";
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

        [`.${buttonClasses.root}`]: {
          minHeight: 32,
          py: 1,
          borderRadius: 30,
          borderWidth: 1,

          "&:after": {
            borderWidth: 3,
            left: -6,
            top: -6,
            right: -6,
            bottom: -6,
          },

          "&.MuiButton-primary": {
            borderColor: "yellow.500",
            "&, svg": {
              color: `${theme.palette.yellow[900]} !important`,
            },

            ":hover, :focus-visible, &.Button--focus:not(:disabled)": {
              backgroundColor: "yellow.400",
            },
          },

          "&.MuiButton-tertiary": {
            borderColor: "gray.20",

            "&, svg": {
              color: "gray.70",
            },

            ":focus-visible, &.Button--focus:not(:disabled)": {
              borderColor: "gray.40",
            },
          },
        },
        ".NavLink": {
          borderColor: "transparent !important",
          px: 1.5,
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
    </Box>
  );
};
