"use client";

import { RadioGroup } from "@ark-ui/react/radio-group";
import { createStyleContext } from "@hashintel/ds-helpers/jsx";
import { radioGroup } from "@hashintel/ds-helpers/recipes";
import type { ComponentProps } from "react";

const { withProvider, withContext } = createStyleContext(radioGroup);

export type RootProps = ComponentProps<typeof Root>;
export type ItemProps = ComponentProps<typeof Item>;

export const Root = withProvider(RadioGroup.Root, "root");
export const RootProvider = withProvider(RadioGroup.RootProvider, "root");
export const Indicator = withContext(RadioGroup.Indicator, "indicator");
export const Item = withContext(RadioGroup.Item, "item");
export const ItemControl = withContext(RadioGroup.ItemControl, "itemControl");
export const ItemText = withContext(RadioGroup.ItemText, "itemText");
export const Label = withContext(RadioGroup.Label, "label");
export const ItemHiddenInput = RadioGroup.ItemHiddenInput;

export { RadioGroupContext as Context } from "@ark-ui/react/radio-group";
