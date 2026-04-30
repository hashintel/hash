"use client";

import { Tabs } from "@ark-ui/react/tabs";
import { createStyleContext } from "@hashintel/ds-helpers/jsx";
import { tabs } from "@hashintel/ds-helpers/recipes";
import type { ComponentProps } from "react";

const { withProvider, withContext } = createStyleContext(tabs);

export type RootProps = ComponentProps<typeof Root>;
export const Root = withProvider(Tabs.Root, "root");
export const RootProvider = withProvider(Tabs.RootProvider, "root");
export const List = withContext(Tabs.List, "list");
export const Trigger = withContext(Tabs.Trigger, "trigger");
export const Content = withContext(Tabs.Content, "content");
export const Indicator = withContext(Tabs.Indicator, "indicator");

export { TabsContext as Context } from "@ark-ui/react/tabs";
