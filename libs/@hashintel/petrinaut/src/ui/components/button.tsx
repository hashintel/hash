import {
  Button as DsButton,
  type ButtonProps as DsButtonProps,
} from "@hashintel/ds-components";

import { withTooltip } from "./hoc/with-tooltip";

import type { ComponentType } from "react";

/**
 * Wrap the ds-components Button to:
 *  - Allow arbitrary `data-*` attributes (e.g. CSS hooks like `[data-row-action]`).
 *  - Relax the requirement that a `<button>` provides either `onClick` or
 *    `type: "submit"|"reset"`. Ark UI `asChild` patterns inject `onClick` at
 *    runtime, so call sites legitimately render `<Button>` without it.
 *
 * The underlying Button already spreads unknown props onto the DOM element, so
 * widening the type here only affects compile-time checks.
 */
export type ButtonProps = Omit<DsButtonProps, "onClick" | "type"> & {
  onClick?: React.ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
  type?: "button" | "submit" | "reset";
} & Record<`data-${string}`, unknown>;

export const Button = withTooltip(
  DsButton as ComponentType<ButtonProps>,
  "block",
);
