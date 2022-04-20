import { ReactNode, VFC } from "react";
import { Box, Fade, styled, Tooltip } from "@mui/material";
import { HEADER_HEIGHT } from "./layout-with-header/page-header";
import {
  PageSidebar,
  SIDEBAR_WIDTH,
  useSidebarContext,
} from "./layout-with-sidebar/page-sidebar";
import { IconButton } from "../ui";
import { SidebarToggleIcon } from "../icons";
import { LayoutWithHeader } from "./layout-with-header";

const Main = styled("main", {
  shouldForwardProp: (prop) => prop !== "sidebarOpen",
})<{
  sidebarOpen?: boolean;
}>(({ theme, sidebarOpen }) => ({
  height: `calc(100vh - ${HEADER_HEIGHT}px)`,
  overflowY: "auto",
  flexGrow: 1,
  padding: "60px 120px 0 120px",
  transition: theme.transitions.create("margin", {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
  marginLeft: `-${SIDEBAR_WIDTH}px`,
  ...(sidebarOpen && {
    transition: theme.transitions.create("margin", {
      easing: theme.transitions.easing.easeOut,
      duration: theme.transitions.duration.enteringScreen,
    }),
    marginLeft: 0,
  }),
}));

export const LayoutWithSidebar: VFC<{ children?: ReactNode }> = ({
  children,
}) => {
  const { openSidebar, sidebarOpen } = useSidebarContext();

  return (
    <LayoutWithHeader>
      <Box
        sx={{
          display: "flex",
          position: "relative",
        }}
      >
        <PageSidebar />
        <Fade in={!sidebarOpen}>
          <Tooltip title="Expand Sidebar">
            <IconButton
              size="large"
              sx={{
                position: "absolute",
                top: 1,
                left: 32,
                transform: "rotate(180deg)",

                "&:hover": {
                  backgroundColor: ({ palette }) => palette.gray[10],
                  color: ({ palette }) => palette.gray[50],
                },
              }}
              onClick={openSidebar}
            >
              <SidebarToggleIcon />
            </IconButton>
          </Tooltip>
        </Fade>
        <Main sidebarOpen={sidebarOpen}>{children}</Main>
      </Box>
    </LayoutWithHeader>
  );
};

export * from "./layout-with-sidebar/sidebar-context";
