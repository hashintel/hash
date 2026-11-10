/**
 * The inside of a gutter cell, shared by every row-owning table: the main
 * button (focus selects the row, a pointer click selects first, Enter or the
 * trailing dots button opens the row menu, Delete removes the row) and the
 * `GutterMenu` itself, with the dismiss-refocus choreography. Inside a
 * `ReorderableRow` the main button is also the row's drag handle. The
 * owning `<td>` stays with the table — it carries the table's own tints and
 * widths.
 */

import { Icon, Tooltip } from "@hashintel/ds-components";
import { cx } from "@hashintel/ds-helpers/css";

import {
  dragHandleButtonStyle,
  gutterButtonStyle,
  gutterMenuButtonStyle,
} from "./form-table";
import { GutterMenu } from "./gutter-menu";
import { useRowDragHandle } from "./reorderable-rows";

import type { GutterMenuItem } from "./gutter-menu";
import type { ReactNode } from "react";

export interface GutterCellProps {
  /** The glyph the main button shows (`#1`, `i`, a variable icon). */
  glyph: ReactNode;
  tooltip?: string;
  /** Accessible name of the main button. */
  label: string;
  /** Accessible name of the dots button. */
  menuLabel: string;
  items: GutterMenuItem[];
  /**
   * Called with the chosen item after the menu closes; focus handling after
   * a selection stays with the caller (a deletion moves it elsewhere).
   */
  onMenuSelect: (id: string) => void;
  /** The open menu's anchor, `null` while closed. */
  menuAnchor: HTMLButtonElement | null;
  onOpenMenu: (anchor: HTMLButtonElement) => void;
  onCloseMenu: () => void;
  /** Registers the main button for the owning table's keyboard grid. */
  buttonRef?: (element: HTMLButtonElement | null) => void;
  onFocus: () => void;
  onBlur: () => void;
  onKeyDown: React.KeyboardEventHandler<HTMLButtonElement>;
  /** Delete/Backspace on the selected gutter. */
  onDelete: () => void;
  /**
   * No row actions: the menu, the dots affordance, Delete and the drag
   * handle are gone, while the button stays focusable so the row can still
   * be selected and walked.
   */
  readOnly?: boolean;
}

export const GutterCell: React.FC<GutterCellProps> = ({
  glyph,
  tooltip,
  label,
  menuLabel,
  items,
  onMenuSelect,
  menuAnchor,
  onOpenMenu,
  onCloseMenu,
  buttonRef,
  onFocus,
  onBlur,
  onKeyDown,
  onDelete,
  readOnly = false,
}) => {
  const dragHandle = useRowDragHandle();
  const draggable =
    !readOnly && dragHandle !== null && dragHandle.listeners !== undefined;

  const button = (
    <button
      ref={(element) => {
        buttonRef?.(element);
        if (draggable) {
          dragHandle.ref(element);
        }
      }}
      type="button"
      className={cx(gutterButtonStyle, draggable && dragHandleButtonStyle)}
      data-dragging={draggable && dragHandle.dragging ? "" : undefined}
      aria-label={label}
      aria-haspopup={readOnly ? undefined : "menu"}
      aria-expanded={readOnly ? undefined : menuAnchor !== null}
      aria-keyshortcuts={draggable ? "Alt+ArrowUp Alt+ArrowDown" : undefined}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={(event) => {
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          event.stopPropagation();
          if (!readOnly) {
            onDelete();
          }
          return;
        }
        onKeyDown(event);
      }}
      onClick={(event) => {
        // A pointer click only selects; the keyboard "click" (Enter) and the
        // dots button open the menu.
        if (event.detail === 0 && !readOnly) {
          onOpenMenu(event.currentTarget);
        }
      }}
      {...(draggable ? dragHandle.listeners : undefined)}
    >
      {draggable ? (
        <>
          <span data-glyph>{glyph}</span>
          <span data-grip aria-hidden>
            <Icon name="gripVertical" size="xs" />
          </span>
        </>
      ) : (
        glyph
      )}
    </button>
  );

  return (
    <>
      {tooltip ? <Tooltip content={tooltip}>{button}</Tooltip> : button}
      {readOnly ? null : (
        <button
          type="button"
          tabIndex={-1}
          className={gutterMenuButtonStyle}
          aria-label={menuLabel}
          onClick={(event) => onOpenMenu(event.currentTarget)}
        >
          ⋯
        </button>
      )}
      {menuAnchor ? (
        <GutterMenu
          anchor={menuAnchor}
          items={items}
          onSelect={(id) => {
            onCloseMenu();
            onMenuSelect(id);
          }}
          onClose={onCloseMenu}
          onDismiss={() => {
            onCloseMenu();
            // After the Popover teardown settles — Zag's own Escape handling
            // races this and would blur to the body.
            setTimeout(() => menuAnchor.focus(), 0);
          }}
        />
      ) : null}
    </>
  );
};
