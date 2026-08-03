import { cx } from "@hashintel/ds-helpers/css";

import { badgeRecipe } from "./badge.recipe";
import { BaseBadge } from "./base-badge";

import type { ChipColor } from "../Chip/chip";

export interface BadgeProps {
  className?: string;
  contentClassName?: string;
  /** The element the badge attaches to (e.g. an icon). */
  children: React.ReactNode;
  /**
   * The badge's own content (e.g. a `99` unread count). Omit to render a small
   * dot with no content.
   */
  content?: React.ReactNode;
  shape?: "square" | "round";
  color?: ChipColor;
  /** Which corner of the anchor the badge overhangs. */
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  /**
   * Set to `"circle"` to align the badge to a circular anchor (e.g. a round
   * avatar) — it sits on the circle's edge instead of the empty bounding-box
   * corner.
   */
  alignTo?: "circle";
  /**
   * Caps numeric `content`: a value above `max` renders as `{max}+` (e.g.
   * `content={100}` with `max={99}` shows "99+"). Ignored for non-numeric
   * content.
   */
  max?: number;
}

/**
 * A small status pill that attaches to another element like a styled sup/sub —
 * e.g. a "99+" unread count overhanging a mail icon. Pass the element to
 * decorate as `children` and the badge's content as `content`; the badge is
 * positioned in the chosen corner of that element.
 */
export const Badge = ({
  className,
  contentClassName,
  children,
  content,
  shape = "round",
  color = "grey",
  position = "top-right",
  alignTo,
  max = 99,
}: BadgeProps) => {
  const isDot = content === undefined || content === null;
  const display =
    typeof content === "number" && content > max ? `${max}+` : content;

  const pill = (
    <span
      className={cx(
        badgeRecipe({ color, shape, dot: isDot }),
        contentClassName,
      )}
    >
      {display}
    </span>
  );

  return (
    <BaseBadge
      className={className}
      position={position}
      alignTo={alignTo}
      content={pill}
    >
      {children}
    </BaseBadge>
  );
};
