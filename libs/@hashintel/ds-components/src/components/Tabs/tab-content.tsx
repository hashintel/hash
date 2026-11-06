import { Tabs as ArkTabs } from "@ark-ui/react/tabs";
import { useContext } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import { TabsRootContext } from "./tabs-context";
import { styles } from "./tabs.recipe";

import type { TabsSize } from "./tabs-context";

export type TabContentProps<Value extends string = string> = {
  className?: string;
  /** One panel per tab; `id` names the tab it belongs to. */
  items: Array<{
    id: Value;
    children: React.ReactNode;
  }>;
  /**
   * The visual style of the tabs the panels attach to. Falls back to the
   * `Tabs` root's `variant`.
   */
  variant?: "line" | "pill" | "folder";
  /**
   * The orientation of the tabs the panels attach to. Falls back to the
   * `Tabs` root's `orientation`.
   */
  orientation?: "horizontal" | "vertical";
  /**
   * The size of the tabs the panels attach to. Falls back to the `Tabs`
   * root's `size`.
   */
  size?: TabsSize;
};

export const TabContent = <const Value extends string = string>({
  className,
  items,
  variant,
  orientation,
  size,
}: TabContentProps<Value>) => {
  const rootContext = useContext(TabsRootContext);
  const classes = styles({
    variant: variant ?? rootContext?.variant ?? "line",
    orientation: orientation ?? rootContext?.orientation ?? "horizontal",
    size: size ?? rootContext?.size ?? "md",
  });
  return (
    <>
      {items.map(({ id, children }) => (
        <ArkTabs.Content
          key={id}
          value={id}
          className={cx(classes.content, className)}
        >
          {children}
        </ArkTabs.Content>
      ))}
    </>
  );
};

// Stable name for the docs Stage code serializer under minification
TabContent.displayName = "Tabs.TabContent";
