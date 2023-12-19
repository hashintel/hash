import { faHome } from "@fortawesome/free-solid-svg-icons";
import {
  FontAwesomeIcon,
  IconButton,
  PenRegularIcon,
} from "@hashintel/design-system";
import { Box, Drawer, Tooltip } from "@mui/material";
import { useRouter } from "next/router";
import { FunctionComponent } from "react";

import { useHashInstance } from "../../../components/hooks/use-hash-instance";
import { useActiveWorkspace } from "../../../pages/shared/workspace-context";
import { useDraftEntities } from "../../draft-entities-context";
import { SidebarToggleIcon } from "../../icons";
import { InboxIcon } from "../../icons/inbox-icon";
import { QuickNoteIcon } from "../../icons/quick-note-icon";
import { useNotifications } from "../../notifications-context";
import { useRoutePageInfo } from "../../routing";
import { HEADER_HEIGHT } from "../layout-with-header/page-header";
import { AccountEntitiesList } from "./account-entities-list";
import { AccountEntityTypeList } from "./account-entity-type-list";
import { AccountPageList } from "./account-page-list/account-page-list";
import { useSidebarContext } from "./sidebar-context";
import { TopNavLink } from "./top-nav-link";
import { WorkspaceSwitcher } from "./workspace-switcher";

export const SIDEBAR_WIDTH = 260;

export const PageSidebar: FunctionComponent = () => {
  const router = useRouter();
  const { sidebarOpen, closeSidebar } = useSidebarContext();
  const { activeWorkspaceOwnedById } = useActiveWorkspace();
  const { routePageEntityUuid } =
    useRoutePageInfo({ allowUndefined: true }) ?? {};

  const { hashInstance } = useHashInstance();

  const { numberOfUnreadNotifications } = useNotifications();

  const { draftEntities } = useDraftEntities();

  return (
    <Drawer
      variant="persistent"
      anchor="left"
      open={sidebarOpen}
      sx={{
        zIndex: 0,
        width: SIDEBAR_WIDTH,
        height: `calc(100vh - ${HEADER_HEIGHT}px)`,
      }}
      PaperProps={{
        sx: (theme) => ({
          width: SIDEBAR_WIDTH,
          position: "relative",
          flex: 1,
          backgroundColor: theme.palette.white,
          borderRight: `1px solid ${theme.palette.gray[30]}`,
        }),
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
        icon={<FontAwesomeIcon icon={faHome} />}
        title="Home"
        href="/"
        tooltipTitle=""
        active={router.pathname === "/[shortname]"}
      />
      <TopNavLink
        icon={<InboxIcon sx={{ fontSize: 16 }} />}
        title="Inbox"
        href="/inbox"
        tooltipTitle=""
        count={numberOfUnreadNotifications}
        active={router.pathname === "/inbox"}
      />
      <TopNavLink
        icon={<PenRegularIcon sx={{ fontSize: 16 }} />}
        title="Drafts"
        href="/drafts"
        tooltipTitle=""
        count={draftEntities?.length}
        active={router.pathname === "/drafts"}
      />
      <TopNavLink
        icon={<QuickNoteIcon sx={{ fontSize: 16 }} />}
        title="Quick Note"
        href="/notes"
        tooltipTitle=""
        active={router.pathname === "/notes"}
      />
      {/* 
        Commented out nav links whose functionality have not been 
        implemented yet
        
        @todo uncomment when the functionalities are implemented
      */}

      {/*
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
        {activeWorkspaceOwnedById ? (
          <>
            {/* PAGES */}
            {hashInstance?.properties.pagesAreEnabled ? (
              <AccountPageList
                currentPageEntityUuid={routePageEntityUuid}
                ownedById={activeWorkspaceOwnedById}
              />
            ) : null}
            {/* ENTITIES */}
            <AccountEntitiesList ownedById={activeWorkspaceOwnedById} />
            {/* TYPES */}
            <AccountEntityTypeList ownedById={activeWorkspaceOwnedById} />
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
