import { useEffect, useRef } from "react";

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

/** A `Filter` chip's root element, as rendered anywhere inside the group. */
const chipSelector = '[role="group"][data-property]';

/** A chip's first interactive segment (operator trigger or input) — never its remove button. */
const firstSegmentOf = (chip: HTMLElement) =>
  chip.querySelector<HTMLElement>(
    'button:enabled:not([data-part="remove"]), input:enabled',
  );

/**
 * Lays out a collection of `Filter` chips — and any interleaved controls
 * (buttons, dropdowns, ...) — as a wrapping flex row. The children manage
 * their own state; the group's one behaviour is moving focus into any chip
 * added after mount. Without this, closing the add-filter menu restores
 * focus to its trigger, which strands keyboard users on the button and —
 * for `dismissAbandoned` chips — counts as focusing outside the fresh chip,
 * starting its abandonment countdown the moment it appears.
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
  const rootRef = useRef<HTMLDivElement>(null);
  // Chip properties present on the previous render; null until first observed.
  const seenPropertiesRef = useRef<ReadonlySet<string> | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    const chips = Array.from(root.querySelectorAll<HTMLElement>(chipSelector));
    const seenProperties = seenPropertiesRef.current;
    seenPropertiesRef.current = new Set(
      chips.map((chip) => chip.getAttribute("data-property") ?? ""),
    );
    // The initial render's chips are restored state, not a user addition.
    if (seenProperties === null) {
      return;
    }
    const freshChip = chips.find(
      (chip) => !seenProperties.has(chip.getAttribute("data-property") ?? ""),
    );
    if (!freshChip) {
      return;
    }
    // Double rAF so the focus lands after ark-ui restores focus to the
    // add-menu trigger when the menu closes (mirrors Filter's focusFirstInput).
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!freshChip.isConnected) {
          return;
        }
        const active = document.activeElement;
        // The user already moved into a chip; don't yank focus from them.
        if (active instanceof Element && active.closest(chipSelector)) {
          return;
        }
        firstSegmentOf(freshChip)?.focus();
      });
    });
  });

  return (
    <div role="group" ref={rootRef} className={cx(styles, className)}>
      {children}
    </div>
  );
};

export const FilterGroup = Object.assign(FilterGroupRoot, {
  AddFilter,
  ClearFilters,
});
