import { ReactNode, FunctionComponent } from "react";
import { Box, Fade, styled, Tooltip } from "@mui/material";
import { IconButton } from "@hashintel/hash-design-system";
import { HEADER_HEIGHT } from "./layout-with-header/page-header";
import {
  PageSidebar,
  SIDEBAR_WIDTH,
  useSidebarContext,
} from "./layout-with-sidebar/page-sidebar";
import { SidebarToggleIcon } from "../icons";
import { LayoutWithHeader } from "./layout-with-header";
import { useReadonlyMode } from "../readonly-mode";

const Main = styled("main")(({ theme, fullWidth }) => ({
  height: `calc(100vh - ${HEADER_HEIGHT}px)`,
  overflowY: "auto",
  flexGrow: 1,
  ...(!fullWidth &&
    {
      // padding: "56px 80px",
      // maxWidth: 1200,
    }),
  marginLeft: "auto",
  marginRight: "auto",
  transition: theme.transitions.create("margin", {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
}));

export type LayoutWithSidebarProps = {
  children?: ReactNode;
  banner?: ReactNode;
  contextBar?: ReactNode;
  fullWidth?: boolean;
};

export const LayoutWithSidebar: FunctionComponent<LayoutWithSidebarProps> = ({
  children,
  banner,
  contextBar,
  fullWidth,
}) => {
  const { openSidebar, sidebarOpen } = useSidebarContext();
  const { readonlyMode } = useReadonlyMode();

  return (
    <LayoutWithHeader>
      <Box
        sx={{
          display: "flex",
          position: "relative",
        }}
      >
        {!readonlyMode && <PageSidebar />}

        <Box
          sx={(theme) => ({
            width: "100%",
            // display: "flex",
            position: "relative",
            // flexDirection: "column",
            marginLeft: `-${SIDEBAR_WIDTH}px`,
            ...(sidebarOpen && {
              transition: theme.transitions.create("margin", {
                easing: theme.transitions.easing.easeOut,
                duration: theme.transitions.duration.enteringScreen,
              }),
              marginLeft: 0,
            }),
            display: "grid",
            gridTemplateColumns: "1fr minmax(65ch, 1200px) 1fr",
            border: "1px solid red",

            "& > *": {
              gridColumn: "2",
            },
            ".full-bleed": {
              gridColumn: "1 / 4",
            },
          })}
        >
          <Box className="full-bleed">
            {banner}

            {contextBar}
          </Box>

          <Box
            sx={{
              ...(fullWidth && {
                gridColumn: "1 / 4",
              }),
            }}
          >
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

            <Main fullWidth={fullWidth}>{children}</Main>
          </Box>
        </Box>
      </Box>
    </LayoutWithHeader>
  );
};

export * from "./layout-with-sidebar/sidebar-context";
