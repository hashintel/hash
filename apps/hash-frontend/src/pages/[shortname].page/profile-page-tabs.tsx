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
  return (
    <Box>
      <Tabs value={currentTab.title}>
        {tabs.map((tab) => (
          <TabLink
            active={currentTab.title === tab.title}
            key={tab.title}
            label={tab.title}
            value={tab.title}
            href={`/@${profile?.shortname}${
              tab.kind === "profile" ? "" : `?tab=${tab.title}`
            }`}
            count={
              tab.kind === "pinned-entity-type"
                ? tab.entities?.length
                : undefined
            }
          />
        ))}
      </Tabs>
    </Box>
  );
};
