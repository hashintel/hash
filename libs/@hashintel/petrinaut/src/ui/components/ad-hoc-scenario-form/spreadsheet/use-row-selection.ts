/**
 * The row-selection model every gutter table shares: focusing any gutter
 * selects its whole row, and a row whose gutter menu is open stays selected
 * while the menu holds focus. One menu is open at a time per table.
 */

import { useState } from "react";

export interface RowSelection {
  /** The row rendered as selected: the focused row, or the menu's row. */
  selectedRow: number | null;
  /** The open gutter menu, if any. */
  menu: { row: number; anchor: HTMLButtonElement } | null;
  openMenu: (row: number, anchor: HTMLButtonElement) => void;
  closeMenu: () => void;
  /** Reports gutter focus (`null` on blur). */
  setFocusedRow: (row: number | null) => void;
}

export function useRowSelection(): RowSelection {
  const [focusedRow, setFocusedRow] = useState<number | null>(null);
  const [menu, setMenu] = useState<{
    row: number;
    anchor: HTMLButtonElement;
  } | null>(null);

  return {
    selectedRow: menu?.row ?? focusedRow,
    menu,
    openMenu: (row, anchor) => setMenu({ row, anchor }),
    closeMenu: () => setMenu(null),
    setFocusedRow,
  };
}
