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
};

export const TypesPageTabs: FunctionComponent<TypesPageTabsProps> = ({
  currentTab,
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
        />
      ))}
    </Tabs>
  );
};
