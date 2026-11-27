import { Box, Typography } from "@mui/material";

import { useEnabledPageKinds } from "../../../../pages/shared/use-enabled-page-kinds";
import { useRoutePageInfo } from "../../../routing";
import { AccountPageList } from "./account-page-list";
import { DashboardList } from "./pages-section/dashboard-list";
import { ViewAllLink } from "./shared/view-all-link";

import type { WebId } from "@blockprotocol/type-system";

export const PagesSection = ({ webId }: { webId: WebId }) => {
  const enabledPageKinds = useEnabledPageKinds();
  const { routePageEntityUuid } =
    useRoutePageInfo({ allowUndefined: true }) ?? {};

  if (!enabledPageKinds.dashboards && !enabledPageKinds.blockPages) {
    return null;
  }

  return (
    <Box component="section" aria-label="Pages" sx={{ mt: 2 }}>
      <Typography
        component="h2"
        variant="smallCaps"
        sx={{ px: 2.25, py: 0.5, color: ({ palette }) => palette.gray[70] }}
      >
        Pages
      </Typography>
      {enabledPageKinds.dashboards && <DashboardList webId={webId} />}
      {enabledPageKinds.blockPages && (
        <AccountPageList
          currentPageEntityUuid={routePageEntityUuid}
          webId={webId}
        />
      )}
      <Box sx={{ ml: 0.75, mt: 0.5 }}>
        <ViewAllLink href="/pages">View all pages</ViewAllLink>
      </Box>
    </Box>
  );
};
