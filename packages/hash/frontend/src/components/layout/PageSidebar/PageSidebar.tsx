import { VoidFunctionComponent } from "react";

import { useRouter } from "next/router";
import { Box, Drawer, Typography, IconButton, Tooltip } from "@mui/material";
import {
  faHistory,
  faHome,
  faLifeRing,
  faZap,
} from "@fortawesome/free-solid-svg-icons";
import { AccountPageList } from "./AccountPageList/AccountPageList";

import { AccountEntityTypeList } from "./AccountEntityTypeList/AccountEntityTypeList";
import { FontAwesomeSvgIcon, SidebarToggleIcon } from "../../icons";
import { TopNavLink } from "./TopNavLink";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { useSidebarContext } from "../SidebarContext";

export const PageSidebar: VoidFunctionComponent = () => {
  const router = useRouter();
  const { sidebarOpen, closeSidebar } = useSidebarContext();
  const { accountId, pageEntityId } = router.query as Record<string, string>;

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
          <IconButton
            sx={{
              height: 36,
              width: 36,
              borderRadius: "4px",
            }}
            onClick={closeSidebar}
          >
            <SidebarToggleIcon
              sx={{
                height: 20,
                width: 20,
              }}
            />
          </IconButton>
        </Tooltip>
      </Box>
      <TopNavLink
        icon={faHome}
        title="Home"
        href="/"
        tooltipTitle="View your inbox and latest activity"
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
        <FontAwesomeSvgIcon
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
