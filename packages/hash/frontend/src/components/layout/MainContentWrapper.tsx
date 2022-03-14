import { IconButton, Fade, Box, Tooltip, styled } from "@mui/material";
import { FunctionComponent } from "react";
import { SIDEBAR_WIDTH } from "../../theme/components/navigation/MuiDrawerThemeOptions";

import { SidebarToggleIcon } from "../icons";
import { HEADER_HEIGHT } from "./PageHeader/PageHeader";
import { PageSidebar } from "./PageSidebar/PageSidebar";
import { useSidebarContext } from "./SidebarContext";

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
            sx={{
              height: 36,
              width: 36,
              borderRadius: "4px",
              position: "absolute",
              top: 32,
              left: 32,
              transform: "rotate(180deg)",

              "&:hover": {
                backgroundColor: ({ palette }) => palette.gray[10],
                color: ({ palette }) => palette.gray[50],
              },
            }}
            onClick={openSidebar}
          >
            <SidebarToggleIcon
              sx={{
                height: 20,
                width: 20,
              }}
            />
          </IconButton>
        </Tooltip>
      </Fade>
      <Main sidebarOpen={sidebarOpen}>{children}</Main>
    </Box>
  );
};
