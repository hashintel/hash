import { baseBadgePosition, baseBadgeWrapper } from "./base-badge.recipe";

export interface BaseBadgeProps {
  /** The element the overlay attaches to (e.g. an icon). */
  children: React.ReactNode;
  /** The overlay placed on the chosen corner of `children`. */
  content: React.ReactNode;
  /** Which corner of the anchor the overlay overhangs. */
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
}

/**
 * Positions arbitrary `content` on a corner of `children`, like a styled
 * sup/sub. It owns only the layout — the relative wrap and corner placement —
 * leaving the overlay's own appearance to the caller (see `Badge`).
 */
export const BaseBadge = ({
  children,
  content,
  position = "top-right",
}: BaseBadgeProps) => (
  <span className={baseBadgeWrapper}>
    {children}
    <span className={baseBadgePosition({ position })}>{content}</span>
  </span>
);
