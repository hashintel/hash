import { IconButton, Fade, Box, Tooltip, styled } from "@mui/material";
import { FunctionComponent } from "react";
import { SIDEBAR_WIDTH } from "../../theme/components/navigation/MuiDrawerThemeOptions";
import { Button } from "../Button";

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
      <Main sidebarOpen={sidebarOpen}>
        <Box sx={{ display: "flex", alignItems: "flex-start" }}>
          <Button variant="primary" size="large">
            Primary Large
          </Button>
          <Box sx={{ mr: 2 }} />
          <Button size="medium">Primary Medium Button</Button>
          <Box sx={{ mr: 2 }} />
          <Button size="small">Primary Small Button</Button>
          <Box sx={{ mr: 2 }} />
          <Button size="xs">Primary XS Button</Button>
          <Box sx={{ mr: 2 }} />
        </Box>
        <br />
        <Box sx={{ display: "flex", alignItems: "flex-start" }}>
          <Button variant="secondary" size="large">
            Secondary Large
          </Button>
          <Box sx={{ mr: 2 }} />
          <Button variant="secondary" size="medium">
            Secondary Medium Button
          </Button>
          <Box sx={{ mr: 2 }} />
          <Button variant="secondary" size="small">
            Secondary Small Button
          </Button>
          <Box sx={{ mr: 2 }} />
          <Button variant="secondary" size="xs">
            Secondary XS Button
          </Button>
        </Box>
        <br />
        <Box sx={{ display: "flex", alignItems: "flex-start" }}>
          <Button variant="tertiary" size="large">
            Tertiary Large
          </Button>
          <Box sx={{ mr: 2 }} />
          <Button variant="tertiary" size="medium">
            Tertiary Medium Button
          </Button>
          <Box sx={{ mr: 2 }} />
          <Button variant="tertiary" size="small">
            Tertiary Small Button
          </Button>
          <Box sx={{ mr: 2 }} />
          <Button variant="tertiary" size="xs">
            Tertiary XS Button
          </Button>
          <Box sx={{ mr: 2 }} />
        </Box>
        <br />
        <Box sx={{ display: "flex", alignItems: "flex-start" }}>
          <Button variant="tertiary_quiet" size="large">
            Tertiary Quiet Large
          </Button>
          <Box sx={{ mr: 2 }} />
          <Button variant="tertiary_quiet" size="medium">
            Tertiary Quiet Medium Button
          </Button>
          <Box sx={{ mr: 2 }} />
          <Button variant="tertiary_quiet" size="small">
            Tertiary Quiet Small Button
          </Button>
          <Box sx={{ mr: 2 }} />
          <Button variant="tertiary_quiet" size="xs">
            Tertiary Quiet XS Button
          </Button>
          <Box sx={{ mr: 2 }} />
        </Box>
        <br />
        <Box sx={{ display: "flex", alignItems: "flex-start" }}>
          <Button variant="warning" size="large">
            Warning Large
          </Button>
          <Box sx={{ mr: 2 }} />
          <Button variant="warning" size="medium">
            Warning
          </Button>
          <Box sx={{ mr: 2 }} />
          <Button variant="warning" size="small">
            Warning Small Button
          </Button>
          <Box sx={{ mr: 2 }} />
          <Button variant="warning" size="xs">
            Warning XS
          </Button>
          <Box sx={{ mr: 2 }} />
        </Box>
        <br />
        <Box sx={{ display: "flex", alignItems: "flex-start" }}>
          <Button variant="danger" size="large">
            Delete Large
          </Button>
          <Box sx={{ mr: 2 }} />
          <Button variant="danger" size="medium">
            Delete
          </Button>
          <Box sx={{ mr: 2 }} />
          <Button variant="danger" size="small">
            Delete Small Button
          </Button>
          <Box sx={{ mr: 2 }} />
          <Button variant="danger" size="xs">
            Delete XS
          </Button>
          <Box sx={{ mr: 2 }} />
        </Box>
        <br />
        <Box sx={{ display: "flex", alignItems: "flex-start" }}>
          <Button disabled>Disabled Button</Button>
          <Box sx={{ mr: 2 }} />
          <Button disabled size="small">
            {" "}
            Disabled button{" "}
          </Button>
          <Box sx={{ mr: 2 }} />
          <Button
            disabled
            disabledTooltipText="Please enter a title or type to continue"
          >
            A disabled button
          </Button>
          <Box sx={{ mr: 2 }} />
        </Box>
        <br />
        <Box sx={{ display: "flex", alignItems: "flex-start" }}>
          <Button loading>Primary</Button>
          <Box sx={{ mr: 2 }} />
          <Button variant="secondary" size="medium" loadingWithoutText>
            Secondary
          </Button>
          <Box sx={{ mr: 2 }} />
        </Box>

        {children}
      </Main>
    </Box>
  );
};
