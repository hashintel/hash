"use client";

import { Dialog } from "@ark-ui/react/dialog";
import { ark } from "@ark-ui/react/factory";
import { createStyleContext } from "@hashintel/ds-helpers/jsx";
import type { ComponentProps } from "react";

import { drawerSlotRecipe } from "./drawer.recipe";

const { withRootProvider, withContext } = createStyleContext(drawerSlotRecipe);

export type RootProps = ComponentProps<typeof Root>;
export const Root = withRootProvider(Dialog.Root, {
  defaultProps: { unmountOnExit: true, lazyMount: true },
});
export const RootProvider = withRootProvider(Dialog.Root, {
  defaultProps: { unmountOnExit: true, lazyMount: true },
});
export const Backdrop = withContext(Dialog.Backdrop, "backdrop");
export const Positioner = withContext(Dialog.Positioner, "positioner");
export const CloseTrigger = withContext(Dialog.CloseTrigger, "closeTrigger");
export const Content = withContext(Dialog.Content, "content");
export const Description = withContext(Dialog.Description, "description");
export const Title = withContext(Dialog.Title, "title");
export const Trigger = withContext(Dialog.Trigger, "trigger");

export const Body = withContext(ark.div, "body");
export const Header = withContext(ark.div, "header");
export const Footer = withContext(ark.div, "footer");

export { DialogContext as Context } from "@ark-ui/react/dialog";
