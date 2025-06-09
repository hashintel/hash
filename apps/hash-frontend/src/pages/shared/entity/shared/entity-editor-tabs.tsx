import { Box } from "@mui/material";
import { useRouter } from "next/router";
import type { PropsWithChildren } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { TabLink } from "../../../../shared/ui/tab-link";
import { Tabs } from "../../../../shared/ui/tabs";

type EntityEditorTab = "overview" | "history";

const defaultTab: EntityEditorTab = "overview";

interface EntityEditorTabContextValue {
  tab: EntityEditorTab;
  setTab: (tab: EntityEditorTab) => void;
}

const EntityEditorTabContext =
  createContext<EntityEditorTabContextValue | null>(null);

export const EntityEditorTabProvider = ({
  children,
  isInSlide,
}: PropsWithChildren<{ isInSlide: boolean }>) => {
  const router = useRouter();
  const routerTab = router.query.tab as EntityEditorTab | undefined;

  const [tab, setTab] = useState<EntityEditorTab>(
    isInSlide ? defaultTab : (routerTab ?? defaultTab),
  );

  useEffect(() => {
    if (isInSlide) {
      return;
    }

    if (tab !== routerTab) {
      setTab(routerTab ?? defaultTab);
    }
  }, [tab, isInSlide, routerTab]);

  const contextValue = useMemo(() => ({ tab, setTab }), [tab, setTab]);

  return (
    <EntityEditorTabContext.Provider value={contextValue}>
      {children}
    </EntityEditorTabContext.Provider>
  );
};

export const useEntityEditorTab = () => {
  const context = useContext(EntityEditorTabContext);
  if (!context) {
    throw new Error(
      "useEntityEditorTab must be used within an EntityEditorTabProvider",
    );
  }
  return context;
};

const getTabUrl = (tab: string, entityPath: string) => {
  let searchParams = new URLSearchParams();

  /**
   * Preserve search params except any existing tab param
   */
  const url = new URL(entityPath, window.location.href);
  searchParams = new URLSearchParams(url.search);
  searchParams.delete("tab");

  const entityPathWithoutParams = new URL(entityPath, window.location.href)
    .pathname;

  if (tab === defaultTab) {
    return `${entityPathWithoutParams}?${searchParams.toString()}`;
  }

  searchParams.set("tab", tab);

  return `${entityPathWithoutParams}?${searchParams.toString()}`;
};

export const EntityEditorTabs = ({
  entityPath,
  isInSlide,
}: {
  entityPath: string;
  isInSlide: boolean;
}) => {
  const { tab, setTab } = useEntityEditorTab();

  return (
    <Box display="flex">
      <Tabs value={tab}>
        <TabLink
          value="overview"
          href={getTabUrl("overview", entityPath)}
          onClick={
            isInSlide
              ? (event) => {
                  event.preventDefault();
                  setTab("overview");
                }
              : undefined
          }
          label="Overview"
          active={tab === "overview"}
        />
        <TabLink
          value="history"
          href={getTabUrl("history", entityPath)}
          onClick={
            isInSlide
              ? (event) => {
                  event.preventDefault();
                  setTab("history");
                }
              : undefined
          }
          label="History"
          active={tab === "history"}
        />
      </Tabs>
    </Box>
  );
};
