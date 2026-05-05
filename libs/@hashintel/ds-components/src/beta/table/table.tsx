"use client";

import { ark } from "@ark-ui/react/factory";
import { createStyleContext } from "@hashintel/ds-helpers/jsx";
import { table } from "@hashintel/ds-helpers/recipes";
import type { ComponentProps } from "react";

const { withProvider, withContext } = createStyleContext(table);

export type RootProps = ComponentProps<typeof Root>;
export const Root = withProvider(ark.table, "root");
export const Body = withContext(ark.tbody, "body");
export const Caption = withContext(ark.caption, "caption");
export const Cell = withContext(ark.td, "cell");
export const Foot = withContext(ark.tfoot, "foot");
export const Head = withContext(ark.thead, "head");
export const Header = withContext(ark.th, "header");
export const Row = withContext(ark.tr, "row");
