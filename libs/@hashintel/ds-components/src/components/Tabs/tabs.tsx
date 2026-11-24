import { Tabs as ArkTabs } from "@ark-ui/react/tabs";
import { useMemo, useState } from "react";

import { TabContent } from "./tab-content";
import { TabList } from "./tab-list";
import { TabsRootContext } from "./tabs-context";

import type { TabsOrientation, TabsSize } from "./tabs-context";

export { TabContent, type TabContentProps } from "./tab-content";
export {
  type TabItem,
  TabItemDoc,
  TabList,
  type TabListProps,
} from "./tab-list";
export type { TabsSize } from "./tabs-context";

export type TabsProps<Value extends string = string> = {
  className?: string;
  /** The `id` of the selected tab. */
  value: Value;
  /** Called with the newly selected tab's `id`. */
  onChange?: (id: Value) => void;
  /** Forwarded to the `TabList`/`TabContent` children, which can override it. */
  variant?: "line" | "pill" | "folder";
  /** Forwarded to the `TabList`/`TabContent` children, which can override it. */
  orientation?: "horizontal" | "vertical";
  /** Forwarded to the `TabList`/`TabContent` children, which can override it. */
  size?: TabsSize;
  children: React.ReactNode;
};

export const TabsRoot = <Value extends string = string>({
  className,
  value,
  onChange,
  variant,
  orientation,
  size,
  children,
}: TabsProps<Value>) => {
  // The list registers its effective orientation (its own prop beating the
  // root's), which is what the ark machine must follow
  const [registeredOrientation, setRegisteredOrientation] =
    useState<TabsOrientation | null>(null);
  const contextValue = useMemo(
    () => ({
      variant,
      orientation,
      size,
      registerOrientation: setRegisteredOrientation,
    }),
    [variant, orientation, size],
  );
  return (
    <TabsRootContext.Provider value={contextValue}>
      <ArkTabs.Root
        value={value}
        onValueChange={(details) =>
          // The machine only reports ids of rendered triggers
          onChange?.(details.value as Value)
        }
        orientation={registeredOrientation ?? orientation ?? "horizontal"}
        className={className}
      >
        {children}
      </ArkTabs.Root>
    </TabsRootContext.Provider>
  );
};

// Stable name for the docs Stage code serializer under minification
TabsRoot.displayName = "Tabs";

export const Tabs = Object.assign(TabsRoot, {
  TabContent,
  TabList,
});
