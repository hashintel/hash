/**
 * The pop-up menu a row gutter opens, keyboard-first: opening moves focus
 * into the menu onto the checked item (or the first one), ArrowUp/ArrowDown
 * cycle the items, Enter chooses, and Escape or Tab returns focus to the
 * gutter. Checkable items render as a radio group with a checkmark;
 * destructive ones (Delete row) render red.
 */

import { useRef } from "react";

import { Popover } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

const menuStyle = css({
  display: "flex",
  flexDirection: "column",
  minWidth: "[160px]",
  paddingY: "1",
});

const menuItemStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  border: "none",
  background: "[transparent]",
  paddingX: "2.5",
  paddingY: "1",
  fontSize: "xs",
  color: "neutral.s110",
  cursor: "pointer",
  textAlign: "left",
  outline: "none",
  _hover: { backgroundColor: "neutral.s15" },
  _focus: { backgroundColor: "neutral.s15" },
});

const destructiveItemStyle = css({
  color: "red.s100",
});

const menuMarkStyle = css({
  width: "[14px]",
  fontFamily: "mono",
  color: "neutral.s80",
});

export interface GutterMenuItem {
  id: string;
  label: string;
  /** Renders the item as a radio with a checkmark when true. */
  checked?: boolean;
  /** Renders the item red (Delete row). */
  destructive?: boolean;
}

export interface GutterMenuProps {
  anchor: HTMLButtonElement;
  items: GutterMenuItem[];
  onSelect: (id: string) => void;
  /** The menu went away without a choice (outside interaction). */
  onClose: () => void;
  /** The menu was dismissed from the keyboard: close and refocus the gutter. */
  onDismiss: () => void;
}

export const GutterMenu: React.FC<GutterMenuProps> = ({
  anchor,
  items,
  onSelect,
  onClose,
  onDismiss,
}) => {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const focusedOnOpenRef = useRef(false);
  // The Popover focuses this when it opens; the initial item's ref fills it.
  const initialItemRef = useRef<HTMLElement | null>(null);
  const checkedIndex = items.findIndex((item) => item.checked);
  const initialIndex = checkedIndex === -1 ? 0 : checkedIndex;

  const handleMenuKeyDown = (event: React.KeyboardEvent) => {
    const focusables = itemRefs.current.filter(
      (item): item is HTMLButtonElement => item !== null,
    );
    const activeIndex = focusables.findIndex(
      (item) => item === document.activeElement,
    );
    const focusItem = (index: number) => {
      event.preventDefault();
      event.stopPropagation();
      focusables[(index + focusables.length) % focusables.length]?.focus();
    };
    if (event.key === "ArrowDown") {
      focusItem(activeIndex + 1);
    } else if (event.key === "ArrowUp") {
      focusItem(activeIndex - 1);
    } else if (event.key === "Home") {
      focusItem(0);
    } else if (event.key === "End") {
      focusItem(focusables.length - 1);
    } else if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      onDismiss();
    }
  };

  const hasCheckable = items.some((item) => item.checked !== undefined);

  return (
    <Popover
      triggerRef={{ current: anchor }}
      position="bottom-start"
      onClose={onClose}
      initialFocusRef={initialItemRef}
    >
      <Popover.Container>
        <Popover.Body withPadding={false}>
          <div
            className={menuStyle}
            role="menu"
            aria-orientation="vertical"
            tabIndex={-1}
            onKeyDown={handleMenuKeyDown}
          >
            {items.map((item, index) => (
              <button
                key={item.id}
                ref={(element) => {
                  itemRefs.current[index] = element;
                  if (index === initialIndex) {
                    initialItemRef.current = element;
                    // Focus on first attach too: jsdom never runs the
                    // Popover's own open autofocus.
                    if (element && !focusedOnOpenRef.current) {
                      focusedOnOpenRef.current = true;
                      element.focus();
                    }
                  }
                }}
                type="button"
                role={item.checked !== undefined ? "menuitemradio" : "menuitem"}
                aria-checked={
                  item.checked !== undefined ? item.checked : undefined
                }
                tabIndex={index === initialIndex ? 0 : -1}
                className={cx(
                  menuItemStyle,
                  item.destructive && destructiveItemStyle,
                )}
                onClick={() => onSelect(item.id)}
              >
                {hasCheckable ? (
                  <span className={menuMarkStyle} aria-hidden="true">
                    {item.checked ? "✓" : ""}
                  </span>
                ) : null}
                {item.label}
              </button>
            ))}
          </div>
        </Popover.Body>
      </Popover.Container>
    </Popover>
  );
};
