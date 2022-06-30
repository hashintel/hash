import { ReactNode, VFC } from "react";
import { Box, Collapse, Fade, styled, Tooltip } from "@mui/material";
import { IconButton } from "@hashintel/hash-design-system";
import { HEADER_HEIGHT } from "./layout-with-header/page-header";
import {
  PageSidebar,
  SIDEBAR_WIDTH,
  useSidebarContext,
} from "./layout-with-sidebar/page-sidebar";
import { SidebarToggleIcon } from "../icons";
import { LayoutWithHeader } from "./layout-with-header";
import { useNotificationBannerContext } from "./layout-with-sidebar/notification-banner-context";
import { PageNotificationBanner } from "./layout-with-sidebar/notification-banner";

const Main = styled("main")(({ theme }) => ({
  height: `calc(100vh - ${HEADER_HEIGHT}px)`,
  overflowY: "auto",
  flexGrow: 1,
  padding: "56px 80px",
  transition: theme.transitions.create("margin", {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
}));

export const LayoutWithSidebar: VFC<{ children?: ReactNode }> = ({
  children,
}) => {
  const { openSidebar, sidebarOpen } = useSidebarContext();
  const { notificationBannerOpen } = useNotificationBannerContext();

  return (
    <LayoutWithHeader>
      <Box
        sx={{
          display: "flex",
          position: "relative",
        }}
      >
        <PageSidebar />

        <Box
          sx={(theme) => ({
            width: 1,
            display: "flex",
            position: "relative",
            flexDirection: "column",
            marginLeft: `-${SIDEBAR_WIDTH}px`,
            ...(sidebarOpen && {
              transition: theme.transitions.create("margin", {
                easing: theme.transitions.easing.easeOut,
                duration: theme.transitions.duration.enteringScreen,
              }),
              marginLeft: 0,
            }),
          })}
        >
          <Collapse in={notificationBannerOpen}>
            <PageNotificationBanner />
          </Collapse>

          <Box>
            <Fade timeout={800} in={!sidebarOpen}>
              <Tooltip title="Expand Sidebar">
                <IconButton
                  size="medium"
                  sx={{
                    position: "absolute",
                    top: 8,
                    left: 8,
                    transform: "rotate(180deg)",

                    "&:hover": {
                      backgroundColor: ({ palette }) => palette.gray[20],
                      color: ({ palette }) => palette.gray[60],
                    },
                  }}
                  onClick={openSidebar}
                >
                  <SidebarToggleIcon />
                </IconButton>
              </Tooltip>
            </Fade>

            <Main>{children}</Main>
          </Box>
        </Box>
      </Box>
    </LayoutWithHeader>
  );
};

export * from "./layout-with-sidebar/sidebar-context";
