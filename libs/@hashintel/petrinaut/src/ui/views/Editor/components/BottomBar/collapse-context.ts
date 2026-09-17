import { createContext } from "react";

/** What one collapsible group of toolbar controls takes up, in CSS pixels. */
export interface CollapsibleGroupWidth {
  /** What this group takes when its controls are shown. */
  readonly natural: number;
  /** Width removed from the group's footprint by folding — 0 while fully shown. */
  readonly hidden: number;
}

export interface BottomBarCollapseValue {
  /** True while the bar shows only its essential controls. */
  readonly isCollapsed: boolean;
  /**
   * Report what a group takes up, so the bar knows how wide it would be with
   * everything shown. Pass `null` when the group unmounts.
   */
  readonly reportGroupWidth: (
    id: string,
    width: CollapsibleGroupWidth | null,
  ) => void;
}

/**
 * Lets controls anywhere under the bottom bar mark themselves collapsible
 * without the bar having to know what its segments are made of.
 *
 * The default shows everything and measures nothing: away from the bar there
 * is no space to run out of.
 */
export const BottomBarCollapseContext = createContext<BottomBarCollapseValue>({
  isCollapsed: false,
  reportGroupWidth: () => {},
});
