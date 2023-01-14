import { IconButton } from "@local/hash-design-system";
import { Box, Fade, styled, Tooltip } from "@mui/material";
import { FunctionComponent, ReactNode, useState } from "react";

import { EditBarScroller } from "../edit-bar-scroller";
import { SidebarToggleIcon } from "../icons";
import { useIsReadonlyMode } from "../readonly-mode";
import { LayoutWithHeader } from "./layout-with-header";
import { HEADER_HEIGHT } from "./layout-with-header/page-header";
import {
  PageSidebar,
  SIDEBAR_WIDTH,
  useSidebarContext,
} from "./layout-with-sidebar/page-sidebar";

const Main = styled("main")(({ theme }) => ({
  height: `calc(100vh - ${HEADER_HEIGHT}px)`,
  overflowY: "auto",
  flexGrow: 1,
  marginLeft: "auto",
  marginRight: "auto",
  transition: theme.transitions.create("margin", {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
}));

export type LayoutWithSidebarProps = {
  children?: ReactNode;
  fullWidth?: boolean;
};

export const LayoutWithSidebar: FunctionComponent<LayoutWithSidebarProps> = ({
  children,

  fullWidth,
}) => {
  const { openSidebar, sidebarOpen } = useSidebarContext();
  const isReadonlyMode = useIsReadonlyMode();
  const [main, setMain] = useState<HTMLElement | null>(null);

  return (
    <LayoutWithHeader>
      <Box
        sx={{
          display: "flex",
          position: "relative",
        }}
      >
        {!isReadonlyMode && <PageSidebar />}

        <Box
          sx={(theme) => ({
            width: "100%",
            position: "relative",
            marginLeft: `-${SIDEBAR_WIDTH}px`,
            transition: theme.transitions.create("margin", {
              easing: theme.transitions.easing.easeOut,
              duration: theme.transitions.duration.enteringScreen,
            }),
            ...(sidebarOpen && {
              marginLeft: 0,
            }),
          })}
        >
          <Fade timeout={800} in={!sidebarOpen}>
            <Tooltip title="Expand Sidebar">
              <IconButton
                size="medium"
                sx={({ zIndex }) => ({
                  position: "absolute",
                  top: 8,
                  left: 8,
                  transform: "rotate(180deg)",
                  zIndex: zIndex.drawer,

                  "&:hover": {
                    backgroundColor: ({ palette }) => palette.gray[20],
                    color: ({ palette }) => palette.gray[60],
                  },
                })}
                onClick={openSidebar}
              >
                <SidebarToggleIcon />
              </IconButton>
            </Tooltip>
          </Fade>

          <Main
            sx={({ spacing }) => ({
              ...(!fullWidth && {
                padding: spacing(7, 10),
              }),
            })}
            ref={setMain}
          >
            {/* Enables EditBar to make the page scroll as it animates in */}
            <EditBarScroller scrollingNode={main}>{children}</EditBarScroller>
          </Main>
        </Box>
      </Box>
    </LayoutWithHeader>
  );
};

export * from "./layout-with-sidebar/sidebar-context";
