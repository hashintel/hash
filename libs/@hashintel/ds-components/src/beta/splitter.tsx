"use client";

import { Splitter } from "@ark-ui/react/splitter";
import { createStyleContext } from "@hashintel/ds-helpers/jsx";
import type { ComponentProps } from "react";

import { splitterSlotRecipe } from "./splitter.recipe";

const { withProvider, withContext } = createStyleContext(splitterSlotRecipe);

export type RootProps = ComponentProps<typeof Root>;
export const Root = withProvider(Splitter.Root, "root");
export const RootProvider = withProvider(Splitter.RootProvider, "root");
export const Panel = withContext(Splitter.Panel, "panel");
export const ResizeTrigger = withContext(
  Splitter.ResizeTrigger,
  "resizeTrigger",
);

export { SplitterContext as Context } from "@ark-ui/react/splitter";
