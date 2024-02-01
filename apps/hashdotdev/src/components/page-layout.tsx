import { Box, BoxProps, ContainerProps } from "@mui/material";
import { useTheme } from "@mui/system";
import { FunctionComponent, ReactNode } from "react";

import { Footer } from "./footer";
import { GradientContainer } from "./gradient-container";
import { Navbar } from "./navbar";
import { PreFooter } from "./pre-footer";

export const PageLayout: FunctionComponent<{
  children?: ReactNode;
  subscribe?: boolean;
  recentBlogPosts?: boolean;
  community?: boolean;
  contentWrapperSx?: BoxProps["sx"];
  navbarSx?: BoxProps["sx"];
  navbarContainerSx?: ContainerProps["sx"];
  navbarLogoEndAdornment?: ReactNode;
}> = ({
  children,
  subscribe = true,
  recentBlogPosts = false,
  community = true,
  contentWrapperSx,
  navbarSx,
  navbarContainerSx,
  navbarLogoEndAdornment,
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
      <Navbar
        sx={navbarSx}
        containerSx={navbarContainerSx}
        logoEndAdornment={navbarLogoEndAdornment}
      />
      <Box flexGrow={1} display="flex" flexDirection="column">
        <GradientContainer
          sx={[
            { py: { xs: 6, md: 10 } },
            ...(Array.isArray(contentWrapperSx)
              ? contentWrapperSx
              : [contentWrapperSx]),
          ]}
        >
          {children}
        </GradientContainer>
      </Box>
      <Box sx={{ flex: 1 }} />
      <PreFooter
        subscribe={subscribe}
        recentBlogPosts={recentBlogPosts}
        community={community}
      />
      <Footer />
    </Box>
  );
};
