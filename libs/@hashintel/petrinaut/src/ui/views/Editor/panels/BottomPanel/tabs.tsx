import { useRef } from "react";

import { HelpTooltip, Tabs, type TabItem } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import { useKeptScroll } from "../../../../shared/use-kept-state";

import type { SubView } from "../../../../sub-view/types";

const tabsStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "[1]",
  minHeight: "0",
});

/**
 * The header is a size container (its width is imposed by the panel, so
 * inline-size containment is safe): descendants use
 * `@container bottom-panel-header (…)` to adapt to the panel width rather
 * than the viewport. The actions give up slack before the tabs scroll.
 */
const headerStyle = css({
  alignItems: "center",
  gap: "2",
  padding: "[6px]",
  flexShrink: "0",
  containerType: "inline-size",
  containerName: "bottom-panel-header",
  "& > :not([data-scope='tabs'])": {
    flexShrink: "[10]",
    paddingBottom: "0",
  },
});

const tabStyle = css({
  textTransform: "uppercase",
  "&&": { paddingX: "[10px]", paddingY: "1" },
});

const contentStyle = css({
  "&&": {
    display: "flex",
    flexDirection: "column",
    flex: "[1]",
    minHeight: "0",
    paddingY: "0",
  },
});

const scrollStyle = cva({
  base: {
    fontSize: "xs",
    flex: "[1]",
    overflowY: "auto",
  },
  variants: {
    padded: {
      true: { padding: "[16px]" },
      false: { padding: "0" },
    },
  },
  defaultVariants: { padded: true },
});

type BottomPanelTabView = Pick<SubView, "id" | "title" | "tooltip">;

/** Scrolls the active tab's content, keeping its offset while unmounted. */
const TabScroll = ({
  padded,
  children,
}: {
  padded: boolean;
  children: React.ReactNode;
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  useKeptScroll(scrollRef, "scroll:tab-panel");

  return (
    <div ref={scrollRef} className={scrollStyle({ padded })}>
      {children}
    </div>
  );
};

/** The bottom panel's tab bar, its header actions, and the active tab's content. */
export const BottomPanelTabs = ({
  tabs,
  activeTabId,
  onTabChange,
  actions,
  padded = true,
  children,
}: {
  tabs: BottomPanelTabView[];
  activeTabId: string;
  onTabChange: (tabId: string) => void;
  actions: React.ReactNode;
  padded?: boolean;
  children: React.ReactNode;
}) => {
  const items: TabItem[] = tabs.map((tab) => ({
    id: tab.id,
    className: tabStyle,
    "aria-label": tab.title,
    children: (
      <>
        {tab.title}
        {tab.tooltip && <HelpTooltip content={tab.tooltip} />}
      </>
    ),
  }));

  return (
    <Tabs
      value={activeTabId}
      onChange={onTabChange}
      variant="pill"
      size="xs"
      className={tabsStyle}
    >
      <Tabs.TabList className={headerStyle} items={items} actions={actions} />
      <Tabs.TabContent
        className={contentStyle}
        items={[
          {
            id: activeTabId,
            children: <TabScroll padded={padded}>{children}</TabScroll>,
          },
        ]}
      />
    </Tabs>
  );
};
