import type { ReactNode } from "react";

import { UI_MESSAGES } from "../constants/ui-messages";
import { Tooltip } from "./tooltip";

interface DisabledTooltipProps {
  /**
   * Whether the wrapped element is disabled.
   * When true, a tooltip explaining why will be shown on hover.
   */
  disabled: boolean;
  /**
   * The content to wrap. Should be a single element.
   */
  children: ReactNode;
  /**
   * Optional custom message. Defaults to the standard readonly mode message.
   */
  message?: string;
}

/**
 * Wraps children with an explanatory tooltip when disabled.
 *
 * Use this to wrap disabled form controls to explain why they're disabled
 * (e.g., during simulation mode).
 *
 * @example
 * <DisabledTooltip disabled={isReadOnly}>
 *   <input disabled={isReadOnly} ... />
 * </DisabledTooltip>
 */
export const DisabledTooltip: React.FC<DisabledTooltipProps> = ({
  disabled,
  children,
  message = UI_MESSAGES.READ_ONLY_MODE,
}) => {
  if (!disabled) {
    return children;
  }

  return <Tooltip content={message}>{children}</Tooltip>;
};
