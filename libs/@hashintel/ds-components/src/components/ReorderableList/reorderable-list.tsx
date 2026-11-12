import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS as dndCss } from "@dnd-kit/utilities";
import {
  Children,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
} from "react";

import { cx } from "@hashintel/ds-helpers/css";

import { Icon } from "../Icon/icon";
import { computeReorderedIds } from "./reorderable-list-util";
import { styles } from "./reorderable-list.recipe";

import type {
  Announcements,
  DragEndEvent,
  Modifier,
  UniqueIdentifier,
} from "@dnd-kit/core";

type ReorderableListContextValue = {
  classes: ReturnType<typeof styles>;
  listDisabled: boolean;
};

const ReorderableListContext =
  createContext<ReorderableListContextValue | null>(null);

// Keeps the dragged row on the list's vertical axis and inside its bounds.
const restrictToVerticalParent: Modifier = ({
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

export type ReorderableListItem = {
  /** Identifies the item within the list; reported through `onChange` */
  id: string;
  /**
   * Names the row for assistive technology: the drag handle's accessible name
   * becomes "Reorder {label}" and drag announcements refer to the row by it
   */
  label: string;
  /** Prevents dragging this item — other items still move around it */
  disabled?: boolean;
  className?: string;
  /** The row's content, rendered after the drag handle */
  children: React.ReactNode;
};

export const ReorderableListItem = ({
  id,
  label,
  disabled,
  className,
  children,
}: ReorderableListItem) => {
  const context = useContext(ReorderableListContext);
  if (!context) {
    throw new Error(
      "ReorderableList.Item must be rendered inside ReorderableList",
    );
  }
  const { classes, listDisabled } = context;
  const isDisabled = disabled === true || listDisabled;

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: isDisabled });

  return (
    <li
      ref={setNodeRef}
      className={cx(classes.item, className)}
      data-dragging={isDragging ? "" : undefined}
      data-disabled={isDisabled ? "" : undefined}
      style={{
        transform: dndCss.Translate.toString(transform),
        transition,
      }}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className={classes.handle}
        data-dragging={isDragging ? "" : undefined}
        data-disabled={isDisabled ? "" : undefined}
        disabled={isDisabled}
        aria-label={`Reorder ${label}`}
        {...attributes}
        {...listeners}
      >
        <Icon name="gripVertical" size="xs" />
      </button>
      <div className={classes.content}>{children}</div>
    </li>
  );
};

const isItemElement = (
  child: unknown,
): child is React.ReactElement<ReorderableListItem> =>
  isValidElement(child) && child.type === ReorderableListItem;

export type ReorderableListProps = {
  /**
   * Called when a drag or keyboard reorder completes, with the item ids in
   * their new order and the move that produced it
   */
  onChange: (
    orderedIds: string[],
    move: { id: string; from: number; to: number },
  ) => void;
  /** The `ReorderableList.Item`s, in their current order */
  children: React.ReactNode;
  /** `card` frames each row; `plain` leaves row styling to the content */
  variant?: "card" | "plain";
  /**
   * Where the drag grip sits against the item: `center` (default) centres it
   * over the item's full height; `start` aligns it with a standard
   * small-control first row, for items stacking extra rows beneath it
   */
  handleAlign?: "center" | "start";
  /** Prevents reordering any item */
  disabled?: boolean;
  className?: string;
  /** An optional testId */
  testId?: string;
} & React.AriaAttributes;

export const ReorderableListRoot = ({
  onChange,
  children,
  variant = "card",
  handleAlign = "center",
  disabled = false,
  className,
  testId,
  ...ariaProps
}: ReorderableListProps) => {
  const dndId = useId();
  const previousBodyCursor = useRef<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const itemElements = Children.toArray(children).filter(isItemElement);
  const ids = itemElements.map((element) => element.props.id);
  const labelById = new Map(
    itemElements.map((element) => [element.props.id, element.props.label]),
  );
  const disabledIds = new Set(
    itemElements
      .filter((element) => element.props.disabled === true)
      .map((element) => element.props.id),
  );

  const describe = (id: UniqueIdentifier) =>
    labelById.get(String(id)) ?? "item";
  const positionOf = (id: UniqueIdentifier) => ids.indexOf(String(id)) + 1;

  // dnd-kit's default announcements describe generic draggables; these speak
  // in list positions, per its sortable guidance.
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Picked up ${describe(active.id)}, position ${positionOf(active.id)} of ${ids.length}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${describe(active.id)} moved to position ${positionOf(over.id)} of ${ids.length}.`
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `${describe(active.id)} dropped at position ${positionOf(over.id)} of ${ids.length}.`
        : `${describe(active.id)} dropped.`,
    onDragCancel: ({ active }) =>
      `Reordering cancelled. ${describe(active.id)} returned to position ${positionOf(active.id)} of ${ids.length}.`,
  };

  const restoreBodyCursor = useCallback(() => {
    if (previousBodyCursor.current !== null) {
      document.body.style.cursor = previousBodyCursor.current;
      previousBodyCursor.current = null;
    }
  }, []);

  // onDragEnd/onDragCancel never fire if the list unmounts mid-drag — restore
  // the body cursor from the unmount path too.
  useEffect(
    () => () => {
      restoreBodyCursor();
    },
    [restoreBodyCursor],
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    restoreBodyCursor();
    if (!over || active.id === over.id) {
      return;
    }
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) {
      return;
    }
    const next = computeReorderedIds(ids, disabledIds, from, to);
    if (next.every((id, index) => id === ids[index])) {
      return;
    }
    onChange(next, {
      id: String(active.id),
      from,
      to: next.indexOf(String(active.id)),
    });
  };

  const classes = useMemo(
    () => styles({ variant, handleAlign }),
    [variant, handleAlign],
  );
  const contextValue = useMemo(
    () => ({ classes, listDisabled: disabled }),
    [classes, disabled],
  );

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalParent]}
      accessibility={{ announcements }}
      onDragStart={() => {
        // The axis lock lets the pointer drift off the handle mid-drag; hold
        // the grabbing cursor on the body so it doesn't flicker.
        previousBodyCursor.current = document.body.style.cursor;
        document.body.style.cursor = "grabbing";
      }}
      onDragEnd={handleDragEnd}
      onDragCancel={restoreBodyCursor}
    >
      <SortableContext
        items={ids}
        strategy={verticalListSortingStrategy}
        disabled={disabled}
      >
        <ReorderableListContext.Provider value={contextValue}>
          {/* eslint-disable-next-line jsx-a11y/no-redundant-roles -- Safari VoiceOver drops the implicit list role once list-style is none */}
          <ul
            role="list"
            className={cx(classes.root, className)}
            data-testid={testId}
            {...ariaProps}
          >
            {children}
          </ul>
        </ReorderableListContext.Provider>
      </SortableContext>
    </DndContext>
  );
};

export const ReorderableList = Object.assign(ReorderableListRoot, {
  Item: ReorderableListItem,
});

// Stable names for the docs Stage code serializer under minification; the
// dotted part names intentionally serialize transparently.
ReorderableListRoot.displayName = "ReorderableList";
ReorderableListItem.displayName = "ReorderableList.Item";
