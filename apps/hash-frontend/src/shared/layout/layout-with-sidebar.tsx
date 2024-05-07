import { IconButton } from "@hashintel/design-system";
import { Box, Collapse, Stack, styled } from "@mui/material";
import type { FunctionComponent, ReactNode } from "react";
import { useState } from "react";

import { EditBarScroller } from "../edit-bar-scroller";
import { SidebarToggleIcon } from "../icons";
import { useIsReadonlyModeForApp } from "../readonly-mode";
import { LayoutWithHeader } from "./layout-with-header";
import { HEADER_HEIGHT } from "./layout-with-header/page-header";
import {
  PageSidebar,
  SIDEBAR_WIDTH,
  useSidebarContext,
} from "./layout-with-sidebar/page-sidebar";

const Main = styled("main")(({ theme }) => ({
  height: `calc(100vh - ${HEADER_HEIGHT}px)`,
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
  grayBackground?: boolean;
};

export const LayoutWithSidebar: FunctionComponent<LayoutWithSidebarProps> = ({
  children,
  fullWidth = false,
  grayBackground = true,
}) => {
  const { openSidebar, sidebarOpen } = useSidebarContext();
  const isReadonlyMode = useIsReadonlyModeForApp();
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

        <Stack
          direction="row"
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
          <Collapse orientation="horizontal" timeout={100} in={!sidebarOpen}>
            <Stack
              alignItems="center"
              sx={({ palette, zIndex }) => ({
                background: palette.common.white,
                borderRight: `1px solid ${palette.gray[20]}`,
                height: "100%",
                p: 1,
                textAlign: "center",
                width: 42,
                zIndex: zIndex.drawer,
              })}
            >
              <IconButton
                aria-hidden
                size="medium"
                sx={({ palette }) => ({
                  transform: "rotate(180deg)",

                  "&:hover": {
                    backgroundColor: palette.gray[20],
                    color: palette.gray[60],
                  },
                })}
                onClick={openSidebar}
              >
                <SidebarToggleIcon />
              </IconButton>
            </Stack>
          </Collapse>

          <Box
            sx={({ palette }) => ({
              backgroundColor: grayBackground
                ? palette.gray[10]
                : palette.common.white,
              minHeight: "100%",
              overflowY: "scroll",
              flex: 1,
            })}
          >
            <Main
              sx={({ spacing }) => ({
                ...(!fullWidth && {
                  padding: spacing(7, 10),
                  margin: "0 auto",
                  maxWidth: 820,
                }),
              })}
              ref={setMain}
            >
              {/* Enables EditBar to make the page scroll as it animates in */}
              <EditBarScroller scrollingNode={main}>{children}</EditBarScroller>
            </Main>
          </Box>
        </Stack>
      </Box>
    </LayoutWithHeader>
  );
};

export * from "./layout-with-sidebar/sidebar-context";
