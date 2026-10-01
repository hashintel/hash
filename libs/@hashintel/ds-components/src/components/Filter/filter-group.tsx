import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import { Button, type ButtonElementProps } from "../Button/button";
import {
  actionClassName,
  actionLabel,
  clearFiltersButton,
  styles,
} from "./filter-group.recipe";
import {
  attachAbandonmentController,
  FilterGroupAbandonmentContext,
  focusWithoutRing,
  type AbandonableChip,
  type FilterGroupAbandonment,
} from "./filter-util";

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
 * (buttons, dropdowns, ...)
 * */
const FilterGroupRoot = ({
  className,
  children,
  dismissAbandoned = false,
}: {
  className?: string;
  children?: React.ReactNode;
  /**
   * Auto-dismiss abandoned chips: once the user focuses or clicks outside
   * the group while any member chip's draft is incomplete removes the chip after a delay
   * */
  dismissAbandoned?: boolean;
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const seenPropertiesRef = useRef<ReadonlySet<string> | null>(null);
  const chipsRef = useRef(new Set<AbandonableChip>());
  const [fading, setFading] = useState(false);

  const registerChip = useCallback((chip: AbandonableChip) => {
    chipsRef.current.add(chip);
    return () => {
      chipsRef.current.delete(chip);
    };
  }, []);

  useEffect(() => {
    if (!dismissAbandoned) {
      return;
    }
    return attachAbandonmentController({
      getRoot: () => rootRef.current,
      getChips: () => chipsRef.current,
      onFadingChange: setFading,
    });
  }, [dismissAbandoned]);

  const abandonment = useMemo<FilterGroupAbandonment | null>(
    () => (dismissAbandoned ? { fading, register: registerChip } : null),
    [dismissAbandoned, fading, registerChip],
  );

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
        const segment = firstSegmentOf(freshChip);
        if (segment) {
          focusWithoutRing(freshChip, segment);
        }
      });
    });
  });

  return (
    <FilterGroupAbandonmentContext.Provider value={abandonment}>
      <div
        role="group"
        data-part="filter-group"
        ref={rootRef}
        className={cx(styles, className)}
      >
        {children}
      </div>
    </FilterGroupAbandonmentContext.Provider>
  );
};

export const FilterGroup = Object.assign(FilterGroupRoot, {
  AddFilter,
  ClearFilters,
});
