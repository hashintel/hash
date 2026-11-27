import { faHome, faTruckFast } from "@fortawesome/free-solid-svg-icons";
import { Box, Collapse, Drawer, Stack, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { type FunctionComponent, type ReactNode, useMemo } from "react";

import {
  AsteriskRegularIcon,
  FontAwesomeIcon,
  IconButton,
  ShapesRegularIcon,
} from "@hashintel/design-system";

import { useEnabledSections } from "../../../pages/shared/use-enabled-sections";
import { useActiveWorkspace } from "../../../pages/shared/workspace-context";
import { useDraftEntitiesCount } from "../../draft-entities-count-context";
import { getInboxHref } from "../../get-inbox-href";
import { ArrowRightToLineIcon } from "../../icons";
import { BoltLightIcon } from "../../icons/bolt-light-icon";
import { ChartNetworkRegularIcon } from "../../icons/chart-network-regular-icon";
import { InboxIcon } from "../../icons/inbox-icon";
import { NoteIcon } from "../../icons/note-icon";
import { useInvites } from "../../invites-context";
import { useNotificationCount } from "../../notification-count-context";
import { useUserPreferences } from "../../use-user-preferences";
import { HEADER_HEIGHT } from "../layout-with-header/page-header";
import { useSidebarContext } from "./sidebar-context";
import { AccountEntitiesList } from "./sidebar/account-entities-list";
import { AccountEntityTypeList } from "./sidebar/account-entity-type-list";
import { FavoritesList } from "./sidebar/favorites-list";
import { PagesSection } from "./sidebar/pages-section";
import { TopNavLink } from "./sidebar/top-nav-link";
import { WorkspaceSwitcher } from "./sidebar/workspace-switcher";

export const SIDEBAR_WIDTH = 260;

type NavLinkDefinition = {
  title: string;
  path: string;
  activeIfPathMatches?: RegExp;
  icon?: ReactNode;
  tooltipTitle?: string;
  count?: number;
  /** Shown under the link, above its children, while the link is active. */
  shortcuts?: ReactNode;
  children?: Omit<NavLinkDefinition, "children" | "icon" | "shortcuts">[];
};

const isNavLinkActive = ({
  definition,
  currentPath,
}: {
  definition: NavLinkDefinition;
  currentPath: string;
}): boolean =>
  definition.path === currentPath.split(/[?#]/)[0] ||
  (definition.activeIfPathMatches &&
    !!currentPath.match(definition.activeIfPathMatches)) ||
  !!definition.children?.some((child) =>
    isNavLinkActive({ definition: child, currentPath }),
  );

const SidebarNavLink: FunctionComponent<{
  definition: NavLinkDefinition;
  currentPath: string;
}> = ({ definition, currentPath }) => {
  const isActive = isNavLinkActive({ definition, currentPath });

  return (
    <>
      <TopNavLink
        icon={definition.icon}
        title={definition.title}
        href={definition.path}
        tooltipTitle={definition.tooltipTitle ?? ""}
        count={definition.count}
        active={isActive}
      />
      <Collapse in={isActive} unmountOnExit>
        {definition.shortcuts}
        {definition.children?.map((child) => {
          const { path, title, tooltipTitle, count } = child;

          const isChildActive = isNavLinkActive({
            definition: child,
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
    </>
  );
};

export const PageSidebar: FunctionComponent = () => {
  const router = useRouter();
  const { sidebarOpen, closeSidebar } = useSidebarContext();
  const { activeWorkspaceWebId } = useActiveWorkspace();

  const enabledSections = useEnabledSections();

  const preferences = useUserPreferences();

  const { numberOfUnreadNotifications } = useNotificationCount();

  const { count: draftEntitiesCount } = useDraftEntitiesCount();

  const { pendingInvites } = useInvites();

  const processesSection = useMemo<NavLinkDefinition[]>(
    () =>
      enabledSections.processes
        ? [
            {
              title: "Processes",
              path: "/processes",
              icon: <BoltLightIcon sx={{ fontSize: 16 }} />,
              tooltipTitle: "",
              activeIfPathMatches: /^\/@([^/]+)\/(flows|agents|workers)\//,
              children: [
                ...(enabledSections.goals
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
                  title: "Triggers",
                  path: "/flows/triggers",
                  /* Also while it's filtered, e.g. to one flow. */
                  activeIfPathMatches: /^\/flows\/triggers(\?|$)/,
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
    [enabledSections.goals, enabledSections.processes],
  );

  const navLinks = useMemo<NavLinkDefinition[]>(() => {
    const numberOfPendingActions = draftEntitiesCount ?? 0;
    const unreadNotifications = numberOfUnreadNotifications ?? 0;

    return [
      {
        title: "Home",
        path: "/",
        icon: <FontAwesomeIcon icon={faHome} />,
        tooltipTitle: "",
      },
      {
        title: "Inbox",
        path: getInboxHref({
          fallbackHref: "/actions",
          numberOfDraftEntityActions: numberOfPendingActions,
          numberOfPendingInvites: pendingInvites.length,
          numberOfUnreadNotifications: unreadNotifications,
        }),
        icon: <InboxIcon sx={{ fontSize: 16 }} />,
        tooltipTitle: "",
        count:
          unreadNotifications + numberOfPendingActions + pendingInvites.length,
        children: [
          {
            title: "Actions",
            path: "/actions",
            count: numberOfPendingActions,
          },
          {
            title: "Notifications",
            path: "/notifications",
            count: numberOfUnreadNotifications,
          },
          {
            title: "Invites",
            path: "/invites",
            count: pendingInvites.length,
          },
        ],
      },
      ...processesSection,
      ...(enabledSections.environments
        ? [
            {
              title: "Environments",
              path: "/environments",
              icon: <ChartNetworkRegularIcon sx={{ fontSize: 16 }} />,
              activeIfPathMatches: /^\/environments(\/|[?#]|$)/,
            },
          ]
        : []),
      {
        title: "Entities",
        path: "/entities",
        icon: <AsteriskRegularIcon sx={{ fontSize: 16 }} />,
        activeIfPathMatches: /^(\/entities(\/|[?#]|$)|\/@[^/]+\/entities\/)/,
        shortcuts:
          activeWorkspaceWebId &&
          preferences.sidebarSections.entities.variant === "list" ? (
            <AccountEntitiesList webId={activeWorkspaceWebId} />
          ) : undefined,
      },
      {
        title: "Types",
        path: "/types",
        icon: <ShapesRegularIcon sx={{ fontSize: 16 }} />,
        activeIfPathMatches: /^(\/types(\/|[?#]|$)|\/@[^/]+\/types\/)/,
        shortcuts:
          activeWorkspaceWebId &&
          preferences.sidebarSections.entityTypes.variant === "list" ? (
            <AccountEntityTypeList webId={activeWorkspaceWebId} />
          ) : undefined,
      },
      ...(enabledSections.notes
        ? [
            {
              title: "Notes",
              path: "/notes",
              icon: <NoteIcon sx={{ fontSize: 16 }} />,
              tooltipTitle: "",
            },
          ]
        : []),
    ];
  }, [
    draftEntitiesCount,
    processesSection,
    numberOfUnreadNotifications,
    pendingInvites.length,
    enabledSections.environments,
    enabledSections.notes,
    activeWorkspaceWebId,
    preferences.sidebarSections.entities.variant,
    preferences.sidebarSections.entityTypes.variant,
  ]);

  const appLinks = useMemo<NavLinkDefinition[]>(
    () =>
      enabledSections.supplyChain
        ? [
            {
              title: "Supply Chain",
              path: "/supply-chain",
              icon: <FontAwesomeIcon icon={faTruckFast} />,
              activeIfPathMatches: /^\/supply-chain(\/|[?#]|$)/,
            },
          ]
        : [],
    [enabledSections.supplyChain],
  );

  return (
    <Drawer
      variant="persistent"
      anchor="left"
      open={sidebarOpen}
      sx={{
        zIndex: 0,
        width: SIDEBAR_WIDTH,
        maxHeight: `calc(100vh - ${HEADER_HEIGHT}px)`,
      }}
      PaperProps={{
        sx: (theme) => ({
          width: SIDEBAR_WIDTH,
          maxHeight: `calc(100vh - ${HEADER_HEIGHT}px)`,
          position: "relative",
          flex: 1,
          backgroundColor: theme.palette.white,
          borderRight: `1px solid ${theme.palette.gray[20]}`,
        }),
      }}
      data-testid="page-sidebar"
    >
      <Stack
        direction="row"
        sx={{
          mx: 0.75,
          py: 0.5,
          pt: 0.5,
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <Box sx={{ flex: 1 }}>
          <WorkspaceSwitcher />
        </Box>
        <IconButton
          aria-label="Close sidebar"
          size="medium"
          onClick={closeSidebar}
        >
          <ArrowRightToLineIcon />
        </IconButton>
      </Stack>
      <Box
        component="nav"
        aria-label="Main navigation"
        sx={{ overflowY: "auto", minHeight: 0, flex: 1, pb: 4 }}
      >
        {navLinks.map((navLink) => (
          <SidebarNavLink
            key={navLink.path}
            definition={navLink}
            currentPath={router.asPath}
          />
        ))}
        {enabledSections.favorites && preferences.favorites.length > 0 && (
          <FavoritesList />
        )}
        {appLinks.length > 0 && (
          <Box component="section" aria-label="Apps" sx={{ mt: 2 }}>
            <Typography
              variant="smallCaps"
              component="h2"
              sx={{
                px: 2.25,
                py: 0.5,
                color: ({ palette }) => palette.gray[70],
              }}
            >
              Apps
            </Typography>
            {appLinks.map((appLink) => (
              <SidebarNavLink
                key={appLink.path}
                definition={appLink}
                currentPath={router.asPath}
              />
            ))}
          </Box>
        )}
        {activeWorkspaceWebId && (
          <PagesSection
            key={activeWorkspaceWebId}
            webId={activeWorkspaceWebId}
          />
        )}
      </Box>
    </Drawer>
  );
};
