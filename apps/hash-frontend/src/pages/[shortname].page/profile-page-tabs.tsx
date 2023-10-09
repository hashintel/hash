import { Box } from "@mui/material";
import { FunctionComponent } from "react";

import { Org, User } from "../../lib/user-and-org";
import { TabLink } from "../../shared/ui/tab-link";
import { Tabs } from "../../shared/ui/tabs";
import { ProfilePageTab } from "./util";

export const ProfilePageTabs: FunctionComponent<{
  profile?: User | Org;
  tabs: ProfilePageTab[];
  currentTab: ProfilePageTab;
}> = ({ tabs, currentTab, profile }) => {
  const currentTabLabel =
    currentTab.kind === "profile" ? currentTab.title : currentTab.pluralTitle;

  return (
    <Box sx={{ overflowX: "scroll" }}>
      <Tabs value={currentTabLabel}>
        {tabs.map((tab) => {
          const label = tab.kind === "profile" ? tab.title : tab.pluralTitle;

          return label ? (
            <TabLink
              active={currentTabLabel === label}
              key={
                tab.kind === "pinned-entity-type"
                  ? tab.entityTypeBaseUrl
                  : tab.kind
              }
              label={label}
              value={label}
              href={`/@${profile?.shortname}${
                tab.kind === "profile" ? "" : `?tab=${label}`
              }`}
              count={
                tab.kind === "pinned-entity-type"
                  ? tab.entities?.length
                  : undefined
              }
            />
          ) : null;
        })}
      </Tabs>
    </Box>
  );
};
