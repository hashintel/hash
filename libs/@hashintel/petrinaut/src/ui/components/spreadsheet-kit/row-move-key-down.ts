/**
 * The row step an Alt+arrow asks for: -1 for up, 1 for down, `null` for
 * any other key, and for a key typed into a text field, where the arrows
 * belong to the caret.
 */
const rowMoveStep = (event: React.KeyboardEvent): -1 | 1 | null => {
  if (!event.altKey || event.metaKey || event.ctrlKey) {
    return null;
  }
  const target = event.target as HTMLElement;
  if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
    return null;
  }
  return event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : null;
};

export interface RowMoveKeys {
  /** The table's focus grid: other keys go to it, and it follows the row. */
  grid: {
    onKeyDown: (row: number, column: number) => React.KeyboardEventHandler;
    onFocusCell: (row: number, column: number) => void;
  };
  /** Hears the moved row's new index when its gutter holds focus. */
  setFocusedRow: (row: number) => void;
  rowCount: number;
  onMove: (from: number, to: number) => void;
  /** Alt+arrow moves nothing; every key goes to the grid. */
  readOnly?: boolean;
}

/**
 * The key handler of the cell at `(row, column)` in a reorderable table.
 * Alt with an arrow moves the row one place, inside the table, and keeps
 * focus and the row highlight on it; every other key walks the grid.
 */
export const rowMoveKeyDown =
  ({ grid, setFocusedRow, rowCount, onMove, readOnly = false }: RowMoveKeys) =>
  (row: number, column: number): React.KeyboardEventHandler =>
  (event) => {
    const step = readOnly ? null : rowMoveStep(event);
    if (step === null) {
      grid.onKeyDown(row, column)(event);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const to = row + step;
    if (to < 0 || to >= rowCount) {
      return;
    }
    onMove(row, to);
    grid.onFocusCell(to, column);
    // The gutter keeps focus through the move, so no focus event follows
    // to move the row highlight.
    if (column === 0) {
      setFocusedRow(to);
    }
  };
