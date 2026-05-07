"use client";

import { ark } from "@ark-ui/react/factory";
import { Popover } from "@ark-ui/react/popover";
import { createStyleContext } from "@hashintel/ds-helpers/jsx";
import type { ComponentProps } from "react";

import { popoverSlotRecipe } from "./popover.recipe";

const { withRootProvider, withContext } = createStyleContext(popoverSlotRecipe);

export type RootProps = ComponentProps<typeof Root>;
export const Root = withRootProvider(Popover.Root, {
  defaultProps: { unmountOnExit: true, lazyMount: true },
});
export const RootProvider = withRootProvider(Popover.Root, {
  defaultProps: { unmountOnExit: true, lazyMount: true },
});
export const Anchor = withContext(Popover.Anchor, "anchor");
export const ArrowTip = withContext(Popover.ArrowTip, "arrowTip");
export const Arrow = withContext(Popover.Arrow, "arrow", {
  defaultProps: { children: <ArrowTip /> },
});
export const CloseTrigger = withContext(Popover.CloseTrigger, "closeTrigger");
export const Content = withContext(Popover.Content, "content");
export const Description = withContext(Popover.Description, "description");
export const Indicator = withContext(Popover.Indicator, "indicator");
export const Positioner = withContext(Popover.Positioner, "positioner");
export const Title = withContext(Popover.Title, "title");
export const Trigger = withContext(Popover.Trigger, "trigger");

export const Body = withContext(ark.div, "body");
export const Header = withContext(ark.div, "header");
export const Footer = withContext(ark.div, "footer");

export { PopoverContext as Context } from "@ark-ui/react/popover";
