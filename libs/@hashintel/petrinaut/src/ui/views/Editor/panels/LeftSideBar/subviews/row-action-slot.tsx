import type { ReactNode } from "react";

/**
 * The focusable slot for a list row's trailing action (a row menu, an add or
 * delete button). It registers the first button inside it as the row's
 * action column in the enclosing focus-stops table, reports focus back, and
 * hands arrow keys to the table while keeping every other key (Enter, Space,
 * clicks) inside the slot so the row's own handlers never double-fire.
 *
 * Carries `data-row-action` so the list's hover / focus-within reveal styles
 * apply to the whole slot.
 */
export const RowActionSlot: React.FC<{
  registerButton: (element: HTMLElement | null) => void;
  onArrowKeyDown: React.KeyboardEventHandler;
  onButtonFocus: () => void;
  children: ReactNode;
}> = ({ registerButton, onArrowKeyDown, onButtonFocus, children }) => (
  <span
    role="presentation"
    data-row-action
    ref={(element) => {
      registerButton(element?.querySelector("button") ?? null);
    }}
    onClick={(event) => event.stopPropagation()}
    onFocus={onButtonFocus}
    onKeyDown={(event) => {
      if (event.key.startsWith("Arrow")) {
        onArrowKeyDown(event);
      }
      event.stopPropagation();
    }}
  >
    {children}
  </span>
);
