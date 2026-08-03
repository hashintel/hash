import { cx } from "@hashintel/ds-helpers/css";

import {
  baseBadgeFrame,
  baseBadgePosition,
  baseBadgeWrapper,
} from "./base-badge.recipe";

export interface BaseBadgeProps {
  className?: string;
  /** The element the overlay attaches to (e.g. an icon). */
  children: React.ReactNode;
  /** The overlay placed on the chosen corner of `children`. */
  content: React.ReactNode;
  /** Which corner of the anchor the overlay overhangs. */
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  /**
   * Set to `"circle"` to align the overlay to a circular anchor (e.g. a round
   * avatar) — it sits on the circle's edge instead of the empty bounding-box
   * corner. Assumes a square/circular anchor.
   */
  alignTo?: "circle";
}

/**
 * Positions arbitrary `content` on a corner of `children`, like a styled
 * sup/sub. It owns only the layout — the relative wrap and corner placement —
 * leaving the overlay's own appearance to the caller (see `Badge`).
 */
export const BaseBadge = ({
  className,
  children,
  content,
  position = "top-right",
  alignTo,
}: BaseBadgeProps) => (
  <span className={cx(baseBadgeWrapper, className)}>
    {children}
    <span className={baseBadgeFrame}>
      <span className={baseBadgePosition({ position, alignTo })}>
        {content}
      </span>
    </span>
  </span>
);
