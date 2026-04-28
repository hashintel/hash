"use client";

import { HoverCard } from "@ark-ui/react/hover-card";
import { createStyleContext } from "@hashintel/ds-helpers/jsx";
import { hoverCard } from "@hashintel/ds-helpers/recipes";
import type { ComponentProps } from "react";

const { withRootProvider, withContext } = createStyleContext(hoverCard);

export type RootProps = ComponentProps<typeof Root>;
export const Root = withRootProvider(HoverCard.Root);
export const RootProvider = withRootProvider(HoverCard.RootProvider);
export const Arrow = withContext(HoverCard.Arrow, "arrow");
export const ArrowTip = withContext(HoverCard.ArrowTip, "arrowTip");
export const Content = withContext(HoverCard.Content, "content");
export const Positioner = withContext(HoverCard.Positioner, "positioner");
export const Trigger = withContext(HoverCard.Trigger, "trigger");

export { HoverCardContext as Context } from "@ark-ui/react/hover-card";
