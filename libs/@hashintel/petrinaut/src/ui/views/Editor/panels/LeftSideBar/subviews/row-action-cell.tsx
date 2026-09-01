import type { ReactNode } from "react";

/**
 * A list row's trailing action (row menu, add or delete button), wired as
 * column 1 of the row's focus stop: registers the first button inside it,
 * reports its focus, hands arrow keys to the flow, and stops every other
 * event before it reaches the row's handlers. `data-row-action` drives the
 * row's reveal styles.
 */
export const RowActionCell: React.FC<{
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
