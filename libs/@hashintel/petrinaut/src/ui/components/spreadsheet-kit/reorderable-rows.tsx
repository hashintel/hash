/**
 * Row reordering for a spreadsheet, two ways: a pointer drag on a row's
 * gutter, and Alt with the up or down arrow on any resting cell of the row.
 *
 * `ReorderableRows` is the table body; each `ReorderableRow` is a `<tr>`
 * that slides out of the way while another row is dragged over it, and the
 * row's gutter button takes the drag listeners through `useRowDragHandle`.
 * The owning table applies every move itself: a drop reports
 * `onMove(from, to)`, and `rowMoveKeyDown` builds the cells' key handler,
 * which calls the same move for the shortcut. Rows keep their keys across a
 * move, so the focused element travels with its row.
 */

import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS as dndCss } from "@dnd-kit/utilities";
import { createContext, use, useId } from "react";

import { css } from "@hashintel/ds-helpers/css";

import type { DragEndEvent, Modifier } from "@dnd-kit/core";
import type { ReactNode } from "react";

export interface RowDragHandle {
  /** Attach to the element a pointer drag starts from. */
  ref: (element: HTMLElement | null) => void;
  /** Spread onto that element; `undefined` while reordering is disabled. */
  listeners: ReturnType<typeof useSortable>["listeners"];
  dragging: boolean;
}

const RowDragContext = createContext<RowDragHandle | null>(null);

/** The enclosing `ReorderableRow`'s drag handle, `null` outside one. */
export const useRowDragHandle = (): RowDragHandle | null => use(RowDragContext);

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

// Keeps the dragged row on the body's vertical axis and inside its bounds.
const restrictToRows: Modifier = ({
  transform,
  containerNodeRect,
  draggingNodeRect,
}) => {
  let { y } = transform;
  if (containerNodeRect && draggingNodeRect) {
    y = Math.max(y, containerNodeRect.top - draggingNodeRect.top);
    y = Math.min(y, containerNodeRect.bottom - draggingNodeRect.bottom);
  }
  return { ...transform, x: 0, y };
};

export interface ReorderableRowsProps {
  /** Row ids in display order; each `ReorderableRow` names one of them. */
  ids: readonly string[];
  /** A dropped drag: the row at `from` lands at `to`, both inside `ids`. */
  onMove: (from: number, to: number) => void;
  /** No drags; the rows render as plain rows. */
  readOnly?: boolean;
  children: ReactNode;
}

export const ReorderableRows: React.FC<ReorderableRowsProps> = ({
  ids,
  onMove,
  readOnly = false,
  children,
}) => {
  const id = useId();
  // A short travel before a drag starts, so a click still selects the row.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) {
      return;
    }
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from !== -1 && to !== -1) {
      onMove(from, to);
    }
  };

  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToRows]}
      onDragEnd={onDragEnd}
      accessibility={{
        // Portalled out: inline, the live region would be a div in a table.
        container: typeof document === "undefined" ? undefined : document.body,
      }}
    >
      <SortableContext
        items={[...ids]}
        strategy={verticalListSortingStrategy}
        disabled={readOnly}
      >
        <tbody>{children}</tbody>
      </SortableContext>
    </DndContext>
  );
};

// A lifted row: hairlines above and below its cells, painted over the rows
// it passes. A transformed row is its own stacking context, so the z-index
// decides which of two moving rows is on top.
const rowStyle = css({
  "&[data-dragging]": {
    position: "relative",
    zIndex: "[1]",
  },
  "&[data-dragging] > td": {
    boxShadow:
      "[inset 0 1px 0 {colors.blue.s50}, inset 0 -1px 0 {colors.blue.s50}]",
  },
});

export interface ReorderableRowProps {
  id: string;
  children: ReactNode;
}

export const ReorderableRow: React.FC<ReorderableRowProps> = ({
  id,
  children,
}) => {
  const {
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <RowDragContext
      value={{ ref: setActivatorNodeRef, listeners, dragging: isDragging }}
    >
      <tr
        ref={setNodeRef}
        className={rowStyle}
        data-dragging={isDragging || undefined}
        style={{
          transform: dndCss.Translate.toString(transform),
          transition,
        }}
      >
        {children}
      </tr>
    </RowDragContext>
  );
};
