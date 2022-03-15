import { Fade, Box, Tooltip, styled, Typography } from "@mui/material";
import { FunctionComponent } from "react";
import { SIDEBAR_WIDTH } from "../../theme/components/navigation/MuiDrawerThemeOptions";

import { SidebarToggleIcon } from "../icons";
import { HEADER_HEIGHT } from "./PageHeader/PageHeader";
import { PageSidebar } from "./PageSidebar/PageSidebar";
import { useSidebarContext } from "./SidebarContext";
import { IconButton } from "../IconButton";

const Main = styled("main", {
  shouldForwardProp: (prop) => prop !== "sidebarOpen",
})<{
  sidebarOpen?: boolean;
}>(({ theme, sidebarOpen }) => ({
  height: `calc(100vh - ${HEADER_HEIGHT}px)`,
  overflowY: "scroll",
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

export const MainContentWrapper: FunctionComponent = ({ children }) => {
  const { openSidebar, sidebarOpen } = useSidebarContext();

  return (
    <Box
      sx={{
        display: "flex",
        position: "relative",
      }}
    >
      <PageSidebar />
      <Fade in={!sidebarOpen}>
        <Tooltip title="Open Sidebar">
          <IconButton
            size="large"
            sx={{
              position: "absolute",
              top: "8px",
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
  );
};
