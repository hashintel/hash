import { Box, Skeleton } from "@mui/material";
import type { FunctionComponent } from "react";

import type { Org, User } from "../../../lib/user-and-org";
import { TabLink } from "../../../shared/ui/tab-link";
import { Tabs } from "../../../shared/ui/tabs";
import type { ProfilePageTab } from "./util";

export const ProfilePageTabs: FunctionComponent<{
  profile?: User | Org;
  tabs: ProfilePageTab[];
  currentTab: ProfilePageTab;
  typesCount: number;
}> = ({ tabs, currentTab, profile, typesCount }) => {
  const currentTabLabel =
    currentTab.kind === "pinned-entity-type"
      ? currentTab.pluralTitle
      : currentTab.title;

  return (
    <Box sx={{ overflowX: "auto", overflowY: "hidden" }}>
      <Tabs value={currentTabLabel}>
        {tabs.map((tab) => {
          const label =
            tab.kind === "pinned-entity-type" ? tab.pluralTitle : tab.title;

          return (
            <TabLink
              active={currentTabLabel === label}
              key={
                tab.kind === "pinned-entity-type"
                  ? tab.entityTypeBaseUrl
                  : tab.kind
              }
              label={label ?? <Skeleton width={60} />}
              value={label ?? ""}
              href={`/@${profile?.shortname}${
                tab.kind === "profile"
                  ? ""
                  : tab.kind === "types"
                    ? "/types"
                    : `?tab=${label}`
              }`}
              count={
                tab.kind === "pinned-entity-type"
                  ? tab.entities?.length
                  : tab.kind === "types"
                    ? typesCount
                    : undefined
              }
            />
          );
        })}
      </Tabs>
    </Box>
  );
};
