import { VoidFunctionComponent } from "react";

import { useRouter } from "next/router";
import { Box, Drawer, Typography, Tooltip } from "@mui/material";
import {
  faHistory,
  faHome,
  faLifeRing,
  faZap,
} from "@fortawesome/free-solid-svg-icons";
import { AccountPageList } from "./AccountPageList/AccountPageList";

import { AccountEntityTypeList } from "./AccountEntityTypeList/AccountEntityTypeList";
import { FontAwesomeIcon, SidebarToggleIcon } from "../../icons";
import { TopNavLink } from "./TopNavLink";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { useSidebarContext } from "../SidebarContext";
import { IconButton } from "../../IconButton";

export const PageSidebar: VoidFunctionComponent = () => {
  const router = useRouter();
  const { sidebarOpen, closeSidebar } = useSidebarContext();
  const { accountId, pageEntityId } = router.query as Record<
    "accountId" | "pageEntityId",
    string
  >;

  return (
    <Drawer variant="persistent" open={sidebarOpen} sx={{ zIndex: 0 }}>
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
        active={router.pathname === "/[accountId]"}
      />
      <TopNavLink
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
      />
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

      {/* @todo replace with button implementation */}
      <Box
        sx={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
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
      </Box>
    </Drawer>
  );
};
