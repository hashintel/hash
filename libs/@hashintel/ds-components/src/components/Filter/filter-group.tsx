import { cx } from "@hashintel/ds-helpers/css";

import { Button, type ButtonElementProps } from "../Button/button";
import {
  actionClassName,
  actionLabel,
  clearFiltersButton,
  styles,
} from "./filter-group.recipe";

import type { DistributedOmit } from "type-fest";

/**
 * A `Button` pinned to the group's look: ghost variant, `sm` size (matching
 * the `Filter` default) and fixed content, with everything else passed
 * through. The omit distributes over the button/anchor union so both element
 * flavours stay usable.
 */
type GroupButtonProps = DistributedOmit<
  ButtonElementProps,
  "children" | "iconName" | "iconPosition" | "prefix" | "suffix"
>;

const AddFilter = ({
  size = "sm",
  variant = "ghost",
  renderAs = "plus",
  className,
  ...props
}: GroupButtonProps & {
  /** What fills the button: a plus glyph (default), the plus glyph with an "Add filter" label, or the filter icon */
  renderAs?: "plus" | "plusLabel" | "filterIcon";
}) => (
  <Button
    aria-label="Add filter"
    {...props}
    className={cx(actionClassName, className)}
    size={size}
    variant={variant}
    iconName={renderAs === "filterIcon" ? "filter" : "plus"}
  >
    {renderAs === "plusLabel" ? (
      <span className={actionLabel({ size })}>Add filter</span>
    ) : undefined}
  </Button>
);

const ClearFilters = ({
  size = "sm",
  variant = "ghost",
  className,
  ...props
}: GroupButtonProps) => (
  <Button
    {...props}
    className={cx(actionClassName, clearFiltersButton({ size }), className)}
    size={size}
    variant={variant}
  >
    <span className={actionLabel({ size })}>Clear</span>
  </Button>
);

/**
 * Lays out a collection of `Filter` chips — and any interleaved controls
 * (buttons, dropdowns, ...) — as a wrapping flex row. Purely presentational:
 * the children manage their own state.
 *
 * `FilterGroup.AddFilter` and `FilterGroup.ClearFilters` are pre-styled
 * buttons for the group's two standard actions; wiring them up (and any
 * conditional disabling) is the consumer's job.
 */
const FilterGroupRoot = ({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) => {
  return (
    <div role="group" className={cx(styles, className)}>
      {children}
    </div>
  );
};

export const FilterGroup = Object.assign(FilterGroupRoot, {
  AddFilter,
  ClearFilters,
});
