import type { ComponentType } from "react";

import { Tooltip } from "../tooltip";

type WithTooltipProps = {
  /** Tooltip to show when hovering (useful for explaining disabled state). */
  tooltip?: string;
  /**
   * Display mode for the tooltip wrapper element.
   * - "block": For full-width elements like inputs/selects (default)
   * - "inline": For inline elements like buttons in flex containers
   */
  tooltipDisplay?: "block" | "inline";
};

/**
 * Higher-Order Component that adds tooltip support to any component.
 *
 * When `tooltip` prop is provided, the component is wrapped with a Tooltip.
 * When `tooltip` is undefined/empty, the component renders unwrapped.
 *
 * @param Component - The component to wrap
 * @param defaultDisplay - Default display mode for the tooltip wrapper ("block" | "inline")
 *
 * @example
 * ```tsx
 * const MyButtonBase: React.FC<{ onClick: () => void }> = ({ onClick }) => (
 *   <button onClick={onClick}>Click me</button>
 * );
 *
 * export const MyButton = withTooltip(MyButtonBase, "inline");
 *
 * // Usage:
 * <MyButton onClick={handleClick} tooltip="Click to submit" />
 * ```
 */
export function withTooltip<P extends object>(
  Component: ComponentType<P>,
  defaultDisplay: "block" | "inline" = "block",
): ComponentType<P & WithTooltipProps> {
  const WrappedComponent: React.FC<P & WithTooltipProps> = ({
    tooltip,
    tooltipDisplay = defaultDisplay,
    ...props
  }) => {
    const element = <Component {...(props as P)} />;

    if (!tooltip) {
      return element;
    }

    return (
      <Tooltip content={tooltip} display={tooltipDisplay}>
        {element}
      </Tooltip>
    );
  };

  // Set display name for debugging
  WrappedComponent.displayName = `withTooltip(${Component.displayName ?? Component.name})`;

  return WrappedComponent;
}
