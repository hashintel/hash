import type { FunctionComponent } from "react";

import { TabLink } from "../../../shared/ui/tab-link";
import { Tabs } from "../../../shared/ui/tabs";
import type { TabId } from "../[[...type-kind]].page";

const tabIds = [
  "all",
  "entity-type",
  "link-type",
  "property-type",
  "data-type",
] satisfies TabId[];

export const tabTitles: Record<TabId, string> = {
  all: "All",
  "entity-type": "Entity Types",
  "link-type": "Link Types",
  "property-type": "Property Types",
  "data-type": "Data Types",
};

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
