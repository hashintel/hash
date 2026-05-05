"use client";

/* eslint-disable import/no-extraneous-dependencies */

import { Accordion } from "@ark-ui/react/accordion";
import { ark } from "@ark-ui/react/factory";
import { createStyleContext } from "@hashintel/ds-helpers/jsx";
import { accordion } from "@hashintel/ds-helpers/recipes";
import { ChevronDownIcon } from "lucide-react";
import type { ComponentProps } from "react";

const { withProvider, withContext } = createStyleContext(accordion);

export type RootProps = ComponentProps<typeof Root>;
export const Root = withProvider(Accordion.Root, "root");
export const RootProvider = withProvider(Accordion.RootProvider, "root");
export const Item = withContext(Accordion.Item, "item");
export const ItemContent = withContext(Accordion.ItemContent, "itemContent");
export const ItemIndicator = withContext(
  Accordion.ItemIndicator,
  "itemIndicator",
  {
    defaultProps: { children: <ChevronDownIcon /> },
  },
);
export const ItemTrigger = withContext(Accordion.ItemTrigger, "itemTrigger");
export const ItemBody = withContext(ark.div, "itemBody");

export { AccordionContext as Context } from "@ark-ui/react/accordion";
