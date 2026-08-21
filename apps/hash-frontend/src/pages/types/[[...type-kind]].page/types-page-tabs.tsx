import { TabLink } from "../../../shared/ui/tab-link";
import { Tabs } from "../../../shared/ui/tabs";
import { tabTitles } from "./tab-titles";

import type { TabId } from "../[[...type-kind]].page";
import type { FunctionComponent } from "react";

const tabIds = [
  "all",
  "entity-type",
  "link-type",
  "property-type",
  "data-type",
] satisfies TabId[];

type TypesPageTabsProps = {
  currentTab: TabId;
  numberOfTypesByTab: Record<TabId, number | undefined>;
};

export const TypesPageTabs: FunctionComponent<TypesPageTabsProps> = ({
  currentTab,
  numberOfTypesByTab,
}) => {
  return (
    <Tabs value={currentTab}>
      {tabIds.map((tabId) => (
        <TabLink
          key={tabId}
          value={tabId}
          href={tabId === "all" ? "/types" : `/types/${tabId}`}
          active={tabId === currentTab}
          label={tabTitles[tabId]}
          count={numberOfTypesByTab[tabId]}
          loading={numberOfTypesByTab[tabId] === undefined}
        />
      ))}
    </Tabs>
  );
};
