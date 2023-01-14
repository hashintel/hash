import { faHome } from "@fortawesome/free-solid-svg-icons";
import { IconButton } from "@local/hash-design-system";
import { Box, Drawer, Tooltip } from "@mui/material";
import { useRouter } from "next/router";
import { FunctionComponent, useContext } from "react";

import { WorkspaceContext } from "../../../pages/shared/workspace-context";
import { SidebarToggleIcon } from "../../icons";
import { useRoutePageInfo } from "../../routing";
import { HEADER_HEIGHT } from "../layout-with-header/page-header";
import { AccountEntityTypeList } from "./account-entity-type-list";
import { AccountPageList } from "./account-page-list/account-page-list";
import { useSidebarContext } from "./sidebar-context";
import { TopNavLink } from "./top-nav-link";
import { WorkspaceSwitcher } from "./workspace-switcher";

export const SIDEBAR_WIDTH = 260;

export const PageSidebar: FunctionComponent = () => {
  const router = useRouter();
  const { sidebarOpen, closeSidebar } = useSidebarContext();
  const { activeWorkspaceAccountId } = useContext(WorkspaceContext);
  const { routePageEntityUuid } =
    useRoutePageInfo({ allowUndefined: true }) ?? {};

  return (
    <Drawer
      variant="persistent"
      open={sidebarOpen}
      sx={{
        zIndex: 0,
        width: SIDEBAR_WIDTH,
        height: `calc(100vh - ${HEADER_HEIGHT}px)`,
      }}
      PaperProps={{
        sx: {
          width: SIDEBAR_WIDTH,
        },
      }}
      data-testid="page-sidebar"
    >
      <Box
        sx={{
          mx: 0.75,
          py: 0.5,
          pt: 0.5,
          display: "flex",
          alignItems: "center",
        }}
      >
        <Box sx={{ flex: 1 }}>
          <WorkspaceSwitcher />
        </Box>
        <Tooltip title="Collapse Sidebar">
          <IconButton size="medium" onClick={closeSidebar}>
            <SidebarToggleIcon />
          </IconButton>
        </Tooltip>
      </Box>
      <TopNavLink
        icon={faHome}
        title="Home"
        href="/"
        tooltipTitle="View your inbox and latest activity"
        active={router.pathname === "/[shortname]"}
      />
      {/* 
        Commented out nav links whose functionality have not been 
        implemented yet
        
        @todo uncomment when the functionalities are implemented
      */}

      {/* <TopNavLink
        icon={faZap}
        title="Quick Capture"
        href="/"
        tooltipTitle="Quickly create notes, entities, and types"
      />
      <TopNavLink
        icon={faHistory}
        title="Recently visited"
        href="/"
        tooltipTitle="Pages you’ve recently visited"
      /> */}

      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
        }}
      >
        {activeWorkspaceAccountId ? (
          <>
            {/* PAGES */}
            <AccountPageList
              currentPageEntityUuid={routePageEntityUuid}
              accountId={activeWorkspaceAccountId}
            />
            {/* TYPES */}
            <AccountEntityTypeList ownedById={activeWorkspaceAccountId} />
          </>
        ) : null}
      </Box>

      {/* 
        Commented this out because its functionality has not been 
        implemented yet
        @todo uncomment when this is done
      */}
      {/* <Link
        noLinkStyle
        href="/"
        sx={{
          zIndex: 2,
          padding: "18px 22px",
          backgroundColor: ({ palette }) => palette.gray[10],
          borderTop: ({ palette }) => `1px solid ${palette.gray[30]}`,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",

          "&:hover": {
            backgroundColor: ({ palette }) => palette.gray[20],
          },
        }}
      >
        <FontAwesomeIcon
          sx={{ mr: 1.5, color: ({ palette }) => palette.gray[50] }}
          color="inherit"
          icon={faLifeRing}
        />
        <Typography
          variant="smallTextLabels"
          sx={{ color: ({ palette }) => palette.gray[70] }}
        >
          Help and Support
        </Typography>
      </Link> */}
    </Drawer>
  );
};
