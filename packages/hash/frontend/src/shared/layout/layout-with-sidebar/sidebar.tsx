import { VoidFunctionComponent } from "react";

import { useRouter } from "next/router";
import { Box, Drawer, Typography, Tooltip } from "@mui/material";
import {
  faHistory,
  faHome,
  faLifeRing,
  faZap,
} from "@fortawesome/free-solid-svg-icons";
import { AccountPageList } from "./account-page-list";

import { AccountEntityTypeList } from "./account-entity-type-list";
import { FontAwesomeIcon, SidebarToggleIcon } from "../../icons";
import { TopNavLink } from "./top-nav-link";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { useSidebarContext } from "./sidebar-context";
import { IconButton, Link } from "../../ui";
import { HEADER_HEIGHT } from "../layout-with-header/page-header";
import { useRouteAccountInfo, useRoutePageInfo } from "../../routing";

export const SIDEBAR_WIDTH = 260;

export const PageSidebar: VoidFunctionComponent = () => {
  const router = useRouter();
  const { sidebarOpen, closeSidebar } = useSidebarContext();
  const { accountId } = useRouteAccountInfo();
  const { pageEntityId } = useRoutePageInfo({ allowUndefined: true }) ?? {};

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
    >
      <Box
        sx={{
          mx: 0.75,
          py: 0.5,
          display: "flex",
          alignItems: "center",
        }}
      >
        <Box sx={{ flex: 1 }}>
          <WorkspaceSwitcher />
        </Box>
        <Tooltip title="Collapse Sidebar">
          <IconButton size="large" onClick={closeSidebar}>
            <SidebarToggleIcon />
          </IconButton>
        </Tooltip>
      </Box>
      <TopNavLink
        icon={faHome}
        title="Home"
        href="/"
        tooltipTitle="View your inbox and latest activity"
        active={router.pathname === "/[account-slug]"}
      />
      {/* Commenting out till it gets implemented */}
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
      <Box sx={{ mb: 1.5 }} />

      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
        }}
      >
        {/* PAGES */}
        <AccountPageList
          currentPageEntityId={pageEntityId}
          accountId={accountId}
        />
        {/* TYPES */}
        <AccountEntityTypeList accountId={accountId} />
      </Box>

      <Link
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
      </Link>
    </Drawer>
  );
};
