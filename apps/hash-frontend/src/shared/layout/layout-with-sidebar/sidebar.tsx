import { useRouter } from "next/router";
import {
  Fragment,
  type FunctionComponent,
  type ReactNode,
  useMemo,
} from "react";
import { faHome } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon, IconButton } from "@hashintel/design-system";
import { Box, Collapse, Drawer } from "@mui/material";

import { useHashInstance } from "../../../components/hooks/use-hash-instance";
import { useAuthenticatedUser } from "../../../pages/shared/auth-info-context";
import { useEnabledFeatureFlags } from "../../../pages/shared/use-enabled-feature-flags";
import { useActiveWorkspace } from "../../../pages/shared/workspace-context";
import { useDraftEntities } from "../../draft-entities-context";
import { SidebarToggleIcon } from "../../icons";
import { BoltLightIcon } from "../../icons/bolt-light-icon";
import { CogLightIcon } from "../../icons/cog-light-icon";
import { InboxIcon } from "../../icons/inbox-icon";
import { NoteIcon } from "../../icons/note-icon";
import { useNotificationEntities } from "../../notification-entities-context";
import { useRoutePageInfo } from "../../routing";

import { AccountEntitiesList } from "./account-entities-list";
import { AccountEntityTypeList } from "./account-entity-type-list";
import { AccountPageList } from "./account-page-list/account-page-list";
import { useSidebarContext } from "./sidebar-context";
import { TopNavLink } from "./top-nav-link";
import { WorkspaceSwitcher } from "./workspace-switcher";

export const SIDEBAR_WIDTH = 260;

interface NavLinkDefinition {
  title: string;
  path: string;
  activeIfPathMatches?: RegExp;
  icon?: ReactNode;
  tooltipTitle?: string;
  count?: number;
  children?: Omit<NavLinkDefinition, "children" | "icon">[];
}

const isNavLinkActive = ({
  definition,
  currentPath,
}: {
  definition: NavLinkDefinition;
  currentPath: string;
}): boolean =>
  definition.path === currentPath ||
  (definition.activeIfPathMatches &&
    Boolean(currentPath.match(definition.activeIfPathMatches))) ||
  Boolean(
    definition.children?.some((child) =>
      isNavLinkActive({ definition: child, currentPath }),
    ),
  );

export const PageSidebar: FunctionComponent = () => {
  const router = useRouter();
  const { sidebarOpen, closeSidebar } = useSidebarContext();
  const { activeWorkspaceOwnedById } = useActiveWorkspace();
  const { routePageEntityUuid } =
    useRoutePageInfo({ allowUndefined: true }) ?? {};

  const { isInstanceAdmin } = useAuthenticatedUser();

  const enabledFeatureFlags = useEnabledFeatureFlags();

  const { hashInstance } = useHashInstance();

  const { numberOfUnreadNotifications } = useNotificationEntities();

  const { draftEntities } = useDraftEntities();

  const workersSection = useMemo<NavLinkDefinition[]>(
    () =>
      enabledFeatureFlags.workers
        ? [
            {
              title: "Workers",
              path: enabledFeatureFlags.ai ? "/goals" : "/flows",
              icon: <BoltLightIcon sx={{ fontSize: 16 }} />,
              tooltipTitle: "",
              activeIfPathMatches: /^\/@([^/]+)\/(flows|workers)\//,
              children: [
                ...(enabledFeatureFlags.ai
                  ? [
                      {
                        title: "Goals",
                        path: "/goals",
                      },
                    ]
                  : []),
                {
                  title: "Flows",
                  path: "/flows",
                  activeIfPathMatches: /^\/@([^/]+)\/flows\//,
                },
                {
                  title: "Activity Log",
                  path: "/workers",
                  activeIfPathMatches: /^\/@([^/]+)\/workers\//,
                },
              ],
            },
          ]
        : [],
    [enabledFeatureFlags],
  );

  const navLinks = useMemo<NavLinkDefinition[]>(() => {
    const numberOfPendingActions = draftEntities?.length ?? 0;

    return [
      {
        title: "Home",
        path: "/",
        icon: <FontAwesomeIcon icon={faHome} />,
        tooltipTitle: "",
      },
      ...workersSection,
      {
        title: "Inbox",
        path: "/actions",
        icon: <InboxIcon sx={{ fontSize: 16 }} />,
        tooltipTitle: "",
        count: (numberOfUnreadNotifications ?? 0) + numberOfPendingActions,
        children: [
          {
            title: "Actions",
            path: "/actions",
            count: numberOfPendingActions,
          },
          {
            title: "Notifications",
            path: "/inbox",
            count: numberOfUnreadNotifications,
          },
        ],
      },
      ...(enabledFeatureFlags.notes
        ? [
            {
              title: "Notes",
              path: "/notes",
              icon: <NoteIcon sx={{ fontSize: 16 }} />,
              tooltipTitle: "",
            },
          ]
        : []),
      ...(isInstanceAdmin
        ? [
            {
              title: "Instance Administration",
              path: "/admin",
              icon: <CogLightIcon sx={{ fontSize: 16 }} />,
              tooltipTitle: "",
            },
          ]
        : []),
    ];
  }, [
    draftEntities,
    numberOfUnreadNotifications,
    enabledFeatureFlags,
    isInstanceAdmin,
    workersSection,
  ]);

  return (
    <Drawer
      variant={"persistent"}
      anchor={"left"}
      open={sidebarOpen}
      data-testid={"page-sidebar"}
      sx={{
        zIndex: 0,
        width: SIDEBAR_WIDTH,
      }}
      PaperProps={{
        sx: (theme) => ({
          width: SIDEBAR_WIDTH,
          position: "relative",
          flex: 1,
          backgroundColor: theme.palette.white,
          borderRight: `1px solid ${theme.palette.gray[20]}`,
        }),
      }}
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
        <IconButton aria-hidden size={"medium"} onClick={closeSidebar}>
          <SidebarToggleIcon />
        </IconButton>
      </Box>
      {navLinks.map((navLink) => {
        const currentPath = router.asPath;

        const isActive = isNavLinkActive({
          definition: navLink,
          currentPath,
        });

        return (
          <Fragment key={navLink.path}>
            <TopNavLink
              icon={navLink.icon}
              title={navLink.title}
              href={navLink.path}
              tooltipTitle={navLink.tooltipTitle ?? ""}
              count={navLink.count}
              active={isActive}
            />
            <Collapse in={isActive}>
              {navLink.children?.map((definition) => {
                const { path, title, tooltipTitle, count } = definition;

                const isChildActive = isNavLinkActive({
                  definition,
                  currentPath,
                });

                return (
                  <TopNavLink
                    key={path}
                    title={title}
                    href={path}
                    tooltipTitle={tooltipTitle ?? ""}
                    count={count}
                    active={isChildActive}
                    sx={{
                      "&:hover": {
                        background: "transparent",
                      },
                      ...(isChildActive ? { background: "transparent" } : {}),
                    }}
                  />
                );
              })}
            </Collapse>
          </Fragment>
        );
      })}
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
          pb: 4,
        }}
      >
        {activeWorkspaceOwnedById ? (
          <>
            {/* PAGES */}
            {hashInstance?.properties.pagesAreEnabled &&
            enabledFeatureFlags.pages ? (
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
