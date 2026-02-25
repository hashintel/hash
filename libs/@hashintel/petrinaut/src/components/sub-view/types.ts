import type { ComponentType, ReactNode } from "react";

/**
 * Configuration for resizable subviews.
 */
export interface SubViewResizeConfig {
  /** Default height when expanded (in pixels) */
  defaultHeight: number;
  /** Minimum height constraint (in pixels) */
  minHeight?: number;
  /** Maximum height constraint (in pixels) */
  maxHeight?: number;
}

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
  /**
   * Minimum height for this section in the proportional layout (in pixels).
   * Defaults to 100px.
   */
  minHeight?: number;
  /**
   * Whether this is the main (primary) subview.
   * When true, shows a non-collapsible header with a larger title style.
   * The title and `renderHeaderAction` are displayed in the fixed header,
   * and the content should not include its own title/actions.
   */
  main?: boolean;
  /**
   * Whether the section can be collapsed by clicking the header.
   * Defaults to true. Forced to false when `main` is true.
   */
  collapsible?: boolean;
  /**
   * Configuration for making the subview resizable when expanded.
   * Only affects vertical layout. When set, the section can be resized by dragging its bottom edge.
   */
  resizable?: SubViewResizeConfig;
}
