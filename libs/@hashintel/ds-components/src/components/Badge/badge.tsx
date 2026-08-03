import { cx } from "@hashintel/ds-helpers/css";

import { badgeRecipe, badgeWrapper } from "./badge.recipe";

import type { ChipColor } from "../Chip/chip";

export interface BadgeProps {
  className?: string;
  /** The element the badge attaches to (e.g. an icon). */
  children: React.ReactNode;
  /**
   * The badge's own content (e.g. a `99` unread count). Omit to render a small
   * dot with no content.
   */
  content?: React.ReactNode;
  shape?: "default" | "round";
  color?: ChipColor;
  variant?: "fill" | "outline";
  /** Which corner of the anchor the badge overhangs. */
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  /**
   * Caps numeric `content`: a value above `max` renders as `{max}+` (e.g.
   * `content={100}` with `max={99}` shows "99+"). Ignored for non-numeric
   * content.
   */
  max?: number;
  onClick?: () => void;
}

/**
 * A small status pill that attaches to another element like a styled sup/sub —
 * e.g. a "99+" unread count overhanging a mail icon. Pass the element to
 * decorate as `children` and the badge's content as `content`; the badge is
 * positioned in the chosen corner of that element.
 */
export const Badge = ({
  className,
  children,
  content,
  shape = "default",
  color = "grey",
  variant = "fill",
  position = "top-right",
  max,
  onClick,
}: BadgeProps) => {
  const isDot = content === undefined || content === null;
  const display =
    max !== undefined && typeof content === "number" && content > max
      ? `${max}+`
      : content;

  const badgeClassName = badgeRecipe({
    color,
    variant,
    shape,
    position,
    dot: isDot,
    clickable: !!onClick,
  });

  const badge = onClick ? (
    <button type="button" className={badgeClassName} onClick={onClick}>
      {display}
    </button>
  ) : (
    <span className={badgeClassName}>{display}</span>
  );

  return (
    <span className={cx(badgeWrapper, className)}>
      {children}
      {badge}
    </span>
  );
};
