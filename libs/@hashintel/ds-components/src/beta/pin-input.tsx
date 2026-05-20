"use client";

import { PinInput } from "@ark-ui/react/pin-input";

import { createStyleContext } from "@hashintel/ds-helpers/jsx";

import { pinInputSlotRecipe } from "./pin-input.recipe";

import type { ComponentProps } from "react";

const { withProvider, withContext } = createStyleContext(pinInputSlotRecipe);

export type RootProps = ComponentProps<typeof Root>;
export const Root = withProvider(PinInput.Root, "root", {
  forwardProps: ["mask"],
});
export const RootProvider = withProvider(PinInput.RootProvider, "root");
export const Control = withContext(PinInput.Control, "control");
export const HiddenInput = PinInput.HiddenInput;
export const Input = withContext(PinInput.Input, "input");
export const Label = withContext(PinInput.Label, "label");

export { PinInputContext as Context } from "@ark-ui/react/pin-input";
