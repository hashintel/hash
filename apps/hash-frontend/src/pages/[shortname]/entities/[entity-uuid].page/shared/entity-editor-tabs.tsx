import { useRouter } from "next/router";
import { Box } from "@mui/material";

import { TabLink } from "../../../../../shared/ui/tab-link";
import { Tabs } from "../../../../../shared/ui/tabs";

export type EntityEditorTab = "overview" | "history";

const defaultTab: EntityEditorTab = "overview";

export const getTabUrl = (tab: string) => {
  const url = new URL(window.location.href);
  const searchParams = new URLSearchParams(url.search);

  searchParams.delete("tab");

  if (tab === defaultTab) {
    return `${url.pathname}?${searchParams.toString()}`;
  }

  searchParams.set("tab", tab);

  return `${url.pathname}?${searchParams.toString()}`;
};

export const useEntityEditorTab = () => {
  const router = useRouter();

  return router.query.tab ?? defaultTab;
};

export const EntityEditorTabs = () => {
  const currentTab = useEntityEditorTab();

  return (
    <Box display={"flex"}>
      <Tabs value={currentTab}>
        <TabLink
          value={"overview"}
          href={getTabUrl("overview")}
          label={"Overview"}
          active={currentTab === "overview"}
        />
        <TabLink
          value={"history"}
          href={getTabUrl("history")}
          label={"History"}
          active={currentTab === "history"}
        />
      </Tabs>
    </Box>
  );
};
