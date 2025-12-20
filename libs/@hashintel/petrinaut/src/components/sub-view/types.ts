import type { ComponentType, ReactNode } from "react";

/**
 * SubView represents a single view that can be displayed in either:
 * - A vertical collapsible section (LeftSideBar)
 * - A horizontal tab (BottomPanel)
 *
 * This abstraction allows views to be easily moved between panels.
 */
export interface SubView {
  /** Unique identifier for the subview */
  id: string;
  /** Title displayed in the section header or tab */
  title: string;
  /** Optional tooltip shown when hovering over the title/tab */
  tooltip?: string;
  /** The component to render for this subview */
  component: ComponentType;
  /**
   * Optional render function for the header right side (e.g., add button).
   * Only used in vertical (collapsible) layout.
   */
  renderHeaderAction?: () => ReactNode;
  /**
   * Whether this subview should grow to fill available space.
   * Only affects vertical layout. Defaults to false.
   */
  flexGrow?: boolean;
}

