"use client";

import { Collapsible } from "@ark-ui/react/collapsible";
import { createStyleContext } from "@hashintel/ds-helpers/jsx";
import type { ComponentProps } from "react";

import { collapsibleSlotRecipe } from "./collapsible.recipe";

const { withProvider, withContext } = createStyleContext(collapsibleSlotRecipe);

export type RootProps = ComponentProps<typeof Root>;
export const Root = withProvider(Collapsible.Root, "root");
export const RootProvider = withProvider(Collapsible.RootProvider, "root");
export const Content = withContext(Collapsible.Content, "content");
export const Indicator = withContext(Collapsible.Indicator, "indicator");
export const Trigger = withContext(Collapsible.Trigger, "trigger");

export { CollapsibleContext as Context } from "@ark-ui/react/collapsible";
