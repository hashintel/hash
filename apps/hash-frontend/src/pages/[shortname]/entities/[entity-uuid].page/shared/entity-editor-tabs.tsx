import { Box } from "@mui/material";
import { useRouter } from "next/router";

import { TabLink } from "../../../../../shared/ui/tab-link";
import { Tabs } from "../../../../../shared/ui/tabs";

export type EntityEditorTab = "overview" | "history";

const defaultTab: EntityEditorTab = "overview";

export const getTabUrl = (tab: string) => {
  const pathWithoutParams = window.location.pathname.split("?")[0]!;
  return tab === defaultTab
    ? pathWithoutParams
    : `${pathWithoutParams}?tab=${encodeURIComponent(tab)}`;
};

export const useEntityEditorTab = () => {
  const router = useRouter();

  return router.query.tab ?? defaultTab;
};

export const EntityEditorTabs = () => {
  const currentTab = useEntityEditorTab();

  return (
    <Box display="flex">
      <Tabs value={currentTab}>
        <TabLink
          value="overview"
          href={getTabUrl("overview")}
          label="Overview"
          active={currentTab === "overview"}
        />
        <TabLink
          value="history"
          href={getTabUrl("history")}
          label="History"
          active={currentTab === "history"}
        />
      </Tabs>
    </Box>
  );
};
