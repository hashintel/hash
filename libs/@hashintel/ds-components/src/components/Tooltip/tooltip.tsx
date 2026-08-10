import { BaseTooltip, type BaseTooltipProps } from "./base-tooltip";
import { contentStyles } from "./tooltip.recipe";

export type { Delay, Position } from "./base-tooltip";

export type TooltipProps = BaseTooltipProps & {
  /** Whether to display a light or dark tooltip */
  variant?: "light" | "dark";
};

/**
 * Short, non-interactive informational overlay shown on hover or focus.
 *
 * @remarks
 * - Use for brief, read-only hints: a label, a definition, a keyboard shortcut.
 *   Keep `content` to a short phrase or sentence.
 * - Content must stay non-interactive. Tooltips dismiss on blur/pointer-leave, so
 *   buttons, links, or form fields inside one are effectively unreachable.
 * - Prefer {@link Popover} for anything with custom layout, rich or interactive
 *   content, or its own UX (menus, forms, multi-line panels).
 */
export const Tooltip = ({
  variant = "dark",
  content,
  ...props
}: TooltipProps) => (
  <BaseTooltip
    {...props}
    content={<div className={contentStyles({ variant })}>{content}</div>}
  />
);
