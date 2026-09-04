import { createContext } from "react";

/** What one collapsible group of toolbar controls takes up, in CSS pixels. */
export interface CollapsibleGroupWidth {
  /** Width the group takes when the bar shows everything. */
  readonly natural: number;
  /** Width currently clipped away — 0 while the group is expanded. */
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
 * The default keeps groups expanded, so the controls render normally outside
 * the bar — in Storybook, say.
 */
export const BottomBarCollapseContext = createContext<BottomBarCollapseValue>({
  isCollapsed: false,
  reportGroupWidth: () => {},
});
