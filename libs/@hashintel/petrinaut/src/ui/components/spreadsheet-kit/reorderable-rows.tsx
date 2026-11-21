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
import { useId, useSyncExternalStore } from "react";

import { usePortalContainerRef } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { RowDragContext } from "./row-drag-handle";

import type { DragEndEvent, Modifier } from "@dnd-kit/core";
import type { ReactNode } from "react";

const neverChanges = () => () => {};

/**
 * Where a table's drag announcements go: the editor's overlay host, or the
 * page for a table outside an editor. A table that unmounts takes its two
 * announcement elements with it, and an element that leaves from before a
 * sibling makes the browser recalculate the style of everything in its
 * parent: in the overlay host that is the overlays, in `<body>` the page.
 *
 * The host is read once it is in the page, which is after the first render
 * of an editor that opens with a table.
 */
const useAnnouncementContainer = (): HTMLElement | undefined => {
  const overlayHost = usePortalContainerRef();
  return useSyncExternalStore(
    neverChanges,
    () => overlayHost?.current ?? document.body,
    () => undefined,
  );
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

interface ReorderableRowsProps {
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
  const announcements = useAnnouncementContainer();
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
        container: announcements,
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

interface ReorderableRowProps {
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
