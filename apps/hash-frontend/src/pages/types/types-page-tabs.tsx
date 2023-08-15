import { Tabs, tabsClasses, typographyClasses } from "@mui/material";
import { FunctionComponent } from "react";

import { TabLink } from "../../shared/ui/tab-link";
import { TabId } from "./[[...type-kind]].page";

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
    <Tabs
      value={currentTab}
      TabIndicatorProps={{
        sx: ({ palette }) => ({
          height: 3,
          backgroundColor: palette.blue[60],
          minHeight: 0,
          bottom: -1,
        }),
      }}
      sx={{
        minHeight: 0,
        overflow: "visible",
        alignItems: "flex-end",
        flex: 1,
        [`.${tabsClasses.scroller}`]: {
          overflow: "visible !important",
        },
      }}
    >
      {tabIds.map((tabId) => (
        <TabLink
          key={tabId}
          value={tabId}
          href={tabId === "all" ? "/types" : `/types/${tabId}`}
          label={tabTitles[tabId]}
          count={numberOfTypesByTab[tabId]}
          loading={numberOfTypesByTab[tabId] === undefined}
          sx={[
            ({ palette }) => ({
              marginRight: 3,
              paddingY: 1.25,
              paddingX: 0.5,
              minWidth: 0,
              minHeight: 0,
              ":hover": {
                [`.${typographyClasses.root}`]: {
                  color: `${
                    currentTab === tabId
                      ? palette.primary.main
                      : palette.blue[60]
                  } !important`,
                },
              },
            }),
          ]}
        />
      ))}
    </Tabs>
  );
};
