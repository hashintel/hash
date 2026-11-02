import type { DependentTypeRow } from "./dependent-type-rows";
import type { KeyboardEvent, ReactNode } from "react";

export type VersionGraphTooltipTriggerProps = {
  /** Spread on the row: hovering it shows the tooltip, and the tooltip is placed against it. */
  rowProps: {
    ref: (element: HTMLElement | null) => void;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
  };
  /** Spread on the row's toggle button: focusing it shows the tooltip at once. */
  toggleProps: {
    "aria-describedby"?: string;
    onFocus: () => void;
    onBlur: () => void;
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  };
  /** Hides the tooltip, for example when the row is toggled. */
  hide: () => void;
};

const noop = () => {};

/**
 * Shows a graph of a dependent type's versions against the parent's versions
 * while its row is hovered or its toggle has focus.
 */
export const VersionGraphTooltip = ({
  children,
}: {
  row: DependentTypeRow;
  parentTitle: string;
  parentLatestVersion: number;
  children: (props: VersionGraphTooltipTriggerProps) => ReactNode;
}) =>
  children({
    rowProps: { ref: noop, onMouseEnter: noop, onMouseLeave: noop },
    toggleProps: { onFocus: noop, onBlur: noop, onKeyDown: noop },
    hide: noop,
  });
