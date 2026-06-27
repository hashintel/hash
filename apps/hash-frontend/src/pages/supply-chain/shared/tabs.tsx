import { Tabs as ArkTabs } from "@ark-ui/react";

import { css } from "@hashintel/ds-helpers/css";

import type { ReactNode } from "react";

/**
 * Local tab-bar built on `@ark-ui/react/tabs`, styled with ds-helpers `css()` +
 * C3 tokens. Replaces the site `tab-button` row. Controlled; panel content is
 * rendered by the consumer (so this is just the trigger strip + indicator).
 */
export interface TabItem {
  value: string;
  label: ReactNode;
}

interface TabsProps {
  tabs: TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}

const listStyles = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  position: "relative",
  borderBottomWidth: "1px",
  borderBottomStyle: "solid",
  borderBottomColor: "bd.subtle",
});

const triggerStyles = css({
  position: "relative",
  paddingX: "3",
  paddingY: "2",
  textStyle: "sm",
  fontWeight: "medium",
  color: "fg.muted",
  cursor: "pointer",
  whiteSpace: "nowrap",
  transition: "colors",
  _hover: { color: "fg.body" },
  "&[data-selected]": { color: "fg.heading" },
});

const indicatorStyles = css({
  height: "[2px]",
  bg: "status.info.bg.solid",
  borderTopRadius: "sm",
});

export const Tabs = ({ tabs, value, onValueChange, className }: TabsProps) => {
  return (
    <ArkTabs.Root
      value={value}
      onValueChange={(details) => onValueChange(details.value)}
      className={className}
    >
      <ArkTabs.List className={listStyles}>
        {tabs.map((tab) => (
          <ArkTabs.Trigger
            key={tab.value}
            value={tab.value}
            className={triggerStyles}
          >
            {tab.label}
          </ArkTabs.Trigger>
        ))}
        <ArkTabs.Indicator className={indicatorStyles} />
      </ArkTabs.List>
    </ArkTabs.Root>
  );
};
