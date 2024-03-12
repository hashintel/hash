import type {
  DragOverEvent,
  DragStartEvent,
  UniqueIdentifier,
} from "@dnd-kit/core";
import {
  closestCenter,
  defaultDropAnimationSideEffects,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { PlusIcon } from "@hashintel/design-system";
import cloneDeep from "lodash.clonedeep";
import debounce from "lodash.debounce";
import isEqual from "lodash.isequal";
import { useMemo, useRef, useState } from "react";

import type {
  BlockEntityKey,
  BoardCardKey,
  BoardColumnKey,
} from "../../additional-types";
import type {
  BlockEntity,
  KanbanBoardColumnPropertyValue,
} from "../../types/generated/block-entity";
import { StaticCard } from "./card/static-card";
import { Column } from "./column/column";
import { SortableColumn } from "./column/sortable-column";
import styles from "./styles.module.scss";
import type {
  ActiveItem,
  CardData,
  ColumnsState,
  CreateCardCallback,
  DataBeforeDrag,
  DeleteCardCallback,
  DeleteColumnCallback,
  UpdateCardContentCallback,
  UpdateColumnTitleCallback,
} from "./types";

const generateId = () => Date.now().toString();

export const columnsKey: BlockEntityKey =
  "https://blockprotocol.org/@hash/types/property-type/kanban-board-column/";

export const columnIdKey: BoardColumnKey =
  "https://blockprotocol.org/@hash/types/property-type/kanban-board-column-id/";
export const columnTitleKey: BoardColumnKey =
  "https://blockprotocol.org/@blockprotocol/types/property-type/title/";
export const columnCardsKey: BoardColumnKey =
  "https://blockprotocol.org/@hash/types/property-type/kanban-board-card/";

export const cardIdKey: BoardCardKey =
  "https://blockprotocol.org/@hash/types/property-type/kanban-board-card-id/";
export const cardContentKey: BoardCardKey =
  "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/";

const transformEntityColumnsToColumnsState = (
  columns: KanbanBoardColumnPropertyValue[],
): ColumnsState => {
  const cols: ColumnsState = {};

  for (const column of columns) {
    const {
      [columnIdKey]: id,
      [columnTitleKey]: title = "",
      [columnCardsKey]: cards = [],
    } = column;

    cols[id] = {
      id,
      title,
      cards: cards.map((card) => ({
        id: card[cardIdKey],
        content: card[cardContentKey] ?? "",
      })),
    };
  }

  return cols;
};

const transformColumnsStateToEntityColumns = (
  columns: ColumnsState,
  columnOrder: string[],
): KanbanBoardColumnPropertyValue[] => {
  return columnOrder.map((columnId) => {
    const column = columns[columnId]!;
    return {
      [columnIdKey]: column.id,
      [columnTitleKey]: column.title,
      [columnCardsKey]: column.cards.map((card) => ({
        [cardIdKey]: card.id,
        [cardContentKey]: card.content,
      })),
    };
  });
};

interface BoardProps {
  blockEntity: BlockEntity;
  updateEntity: (newProperties: BlockEntity["properties"]) => Promise<void>;
  readonly?: boolean;
}

export const Board = ({ blockEntity, updateEntity, readonly }: BoardProps) => {
  const updateEntityQueue = useRef<number[]>([]);
  const isDebounceQueued = useRef(false);
  const {
    properties: { [columnsKey]: entityColumns = [] },
  } = blockEntity;

  const [prevBlockEntity, setPrevBlockEntity] = useState(blockEntity);

  const [activeItem, setActiveItem] = useState<ActiveItem>(null);
  const [columns, setColumns] = useState<ColumnsState>(
    transformEntityColumnsToColumnsState(entityColumns),
  );
  const [columnOrder, setColumnOrder] = useState<string[]>(
    entityColumns.map((col) => col[columnIdKey]),
  );
  const [dataBeforeDrag, setDataBeforeDrag] = useState<DataBeforeDrag>(null);

  const debouncedUpdateEntity = useMemo(
    () =>
      debounce(async (newProperties: BlockEntity["properties"]) => {
        isDebounceQueued.current = false;

        const updateId = Date.now();
        updateEntityQueue.current.push(updateId);
        await updateEntity(newProperties);
        updateEntityQueue.current = updateEntityQueue.current.filter(
          (id) => id !== updateId,
        );
      }, 1000),
    [updateEntity],
  );

  const updateStateAndEntity = ({
    newColumnOrder,
    newColumns,
    skipUpdatingEntity,
  }: {
    newColumns?: ColumnsState;
    newColumnOrder?: string[];
    skipUpdatingEntity?: boolean;
  }) => {
    if (newColumns) setColumns(newColumns);
    if (newColumnOrder) setColumnOrder(newColumnOrder);

    if (skipUpdatingEntity) return;

    isDebounceQueued.current = true;
    void debouncedUpdateEntity({
      [columnsKey]: transformColumnsStateToEntityColumns(
        newColumns ?? columns,
        newColumnOrder ?? columnOrder,
      ),
    });
  };

  const isCardOrColumn = (id: UniqueIdentifier) => {
    if (id in columns) return "column";

    return "card";
  };

  const findColumnOfCard = (cardId: UniqueIdentifier) => {
    return Object.values(columns).find(
      (col) => !!col.cards.find((card) => card.id === cardId),
    );
  };

  const createColumn = () => {
    const newColId = generateId();

    const newColumns = {
      ...columns,
      [newColId]: {
        id: newColId,
        title: `Column ${Object.keys(columns).length + 1}`,
        cards: [],
      },
    };

    updateStateAndEntity({
      newColumns,
      newColumnOrder: [...columnOrder, newColId],
    });
  };

  const deleteColumn: DeleteColumnCallback = (columnId) => {
    const newColumns = { ...columns };
    delete newColumns[columnId];

    updateStateAndEntity({
      newColumns,
      newColumnOrder: columnOrder.filter((id) => id !== columnId),
    });
  };

  const updateColumnTitle: UpdateColumnTitleCallback = (columnId, newTitle) => {
    const targetCol = columns[columnId];
    if (!targetCol) return;

    updateStateAndEntity({
      newColumns: {
        ...columns,
        [columnId]: { ...targetCol, title: newTitle },
      },
    });
  };

  const createCard: CreateCardCallback = (columnId, content) => {
    const targetCol = columns[columnId];
    if (!targetCol) return;

    const cloneCol = { ...targetCol };
    cloneCol.cards.push({ id: generateId(), content });

    updateStateAndEntity({
      newColumns: {
        ...columns,
        [columnId]: cloneCol,
      },
    });
  };

  const deleteCard: DeleteCardCallback = (columnId, cardId) => {
    const targetCol = columns[columnId];
    if (!targetCol) return;

    const cloneCol = { ...targetCol };
    cloneCol.cards = cloneCol.cards.filter((card) => card.id !== cardId);

    updateStateAndEntity({
      newColumns: {
        ...columns,
        [columnId]: cloneCol,
      },
    });
  };

  const updateCardContent: UpdateCardContentCallback = (cardId, newContent) => {
    const columnId = findColumnOfCard(cardId)?.id;

    if (!columnId) {
      throw new Error("column of card not found");
    }

    const targetCol = columns[columnId];
    if (!targetCol) return;

    const cloneCol = { ...targetCol };

    cloneCol.cards = cloneCol.cards.map((card) =>
      card.id === cardId ? { ...card, content: newContent } : card,
    );

    updateStateAndEntity({
      newColumns: {
        ...columns,
        [columnId]: cloneCol,
      },
    });
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    if (isCardOrColumn(active.id) === "column") {
      setDataBeforeDrag({ type: "columnOrder", data: [...columnOrder] });
      return setActiveItem({ type: "column", id: active.id });
    }

    const foundCard = findColumnOfCard(active.id)?.cards.find(
      (card) => card.id === active.id,
    );

    if (!foundCard) {
      throw new Error("no card found");
    }

    setDataBeforeDrag({ type: "columns", data: cloneDeep(columns) });
    setActiveItem({ type: "card", data: foundCard, id: active.id });
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;

    if (active.id === over?.id || !over) {
      return;
    }

    const isDraggingColumn = isCardOrColumn(active.id) === "column";
    const isOverColumn = isCardOrColumn(over.id) === "column";

    if (isDraggingColumn) {
      const overColumnId = isOverColumn
        ? over.id
        : findColumnOfCard(over.id)?.id;

      const oldIndex = columnOrder.findIndex((id) => id === active.id);
      const newIndex = columnOrder.findIndex((id) => id === overColumnId);

      updateStateAndEntity({
        skipUpdatingEntity: true,
        newColumnOrder: arrayMove(columnOrder, oldIndex, newIndex),
      });

      return;
    }

    const activeColumn = findColumnOfCard(active.id);

    if (!activeColumn) {
      throw Error("activeColumn not found");
    }

    // dropping card into a column
    if (isOverColumn) {
      let movedCard: CardData | undefined;

      // remove card from old column
      activeColumn.cards = activeColumn.cards.filter((card) => {
        if (card.id === active.id) {
          movedCard = card;
          return false;
        }

        return true;
      });

      // insert the card into the new column
      if (!movedCard) {
        throw new Error("moved card not foundƒ");
      }

      const overColumn = columns[over.id];

      if (!overColumn) {
        throw new Error("overColumn not found");
      }

      updateStateAndEntity({
        skipUpdatingEntity: true,
        newColumns: {
          ...columns,
          [activeColumn.id]: activeColumn,
          [overColumn.id]: {
            ...overColumn,
            cards: [...overColumn.cards, movedCard],
          },
        },
      });

      return;
    }

    const overColumn = findColumnOfCard(over.id);

    if (!overColumn) {
      throw new Error("overColumn not found");
    }

    const droppedToSameColumn = activeColumn.id === overColumn.id;

    // card moved in the same column
    if (droppedToSameColumn) {
      const oldIndex = overColumn.cards.findIndex(
        (card) => card.id === active.id,
      );
      const newIndex = overColumn.cards.findIndex(
        (card) => card.id === over.id,
      );
      const newCards = arrayMove(overColumn.cards, oldIndex, newIndex);

      overColumn.cards = newCards;

      updateStateAndEntity({
        skipUpdatingEntity: true,
        newColumns: { ...columns, [overColumn.id]: overColumn },
      });

      return;
    }

    let movedCard: CardData | undefined;

    // remove card from old column
    activeColumn.cards = activeColumn.cards.filter((card) => {
      if (card.id === active.id) {
        movedCard = card;
        return false;
      }

      return true;
    });

    if (!movedCard) {
      throw new Error("moved card not foundƒ");
    }

    // insert the card into the new column
    const newIndex = overColumn.cards.findIndex((card) => card.id === over.id);
    const newCards = [...overColumn.cards];
    newCards.splice(newIndex, 0, movedCard);
    overColumn.cards = newCards;

    updateStateAndEntity({
      skipUpdatingEntity: true,
      newColumns: {
        ...columns,
        [activeColumn.id]: activeColumn,
        [overColumn.id]: overColumn,
      },
    });
  };

  const handleDragEnd = () => {
    /** we call `updateStateAndEntity` to update the entity with the current state after drag ends */
    updateStateAndEntity({});
    setDataBeforeDrag(null);
    setActiveItem(null);
  };

  const handleDragCancel = () => {
    setActiveItem(null);

    if (!dataBeforeDrag) return;

    const { data, type } = dataBeforeDrag;

    if (type === "columnOrder") {
      return setColumnOrder(data);
    }

    setColumns(data);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 10 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const isUpdatingEntity = updateEntityQueue.current.length > 0;
  const shouldOverrideLocalState =
    !isDebounceQueued.current && !isUpdatingEntity;

  if (
    blockEntity !== prevBlockEntity &&
    shouldOverrideLocalState &&
    /** do not update the state while user is dragging an item to prevent flickering */
    !activeItem
  ) {
    setPrevBlockEntity(blockEntity);

    const columnsChanged = !isEqual(entityColumns, columns);
    if (columnsChanged) {
      setColumns(transformEntityColumnsToColumnsState(entityColumns));
      setColumnOrder(entityColumns.map((col) => col[columnIdKey]));
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      onDragStart={handleDragStart}
    >
      <SortableContext items={columnOrder} disabled={readonly}>
        <div className={styles.board}>
          {columnOrder.map((columnId) => (
            <SortableColumn
              key={columnId}
              data={columns[columnId]!}
              deleteColumn={deleteColumn}
              createCard={createCard}
              deleteCard={deleteCard}
              updateColumnTitle={updateColumnTitle}
              updateCardContent={updateCardContent}
              readonly={readonly}
            />
          ))}

          {!readonly && (
            <button
              className={styles.addColumnButton}
              type="button"
              onClick={createColumn}
            >
              Add another column
              <PlusIcon />
            </button>
          )}
        </div>
      </SortableContext>
      <DragOverlay
        dropAnimation={{
          sideEffects: defaultDropAnimationSideEffects({
            styles: {
              active: {
                opacity: "0.5",
              },
            },
          }),
        }}
      >
        {activeItem ? (
          activeItem.type === "column" ? (
            <Column data={columns[activeItem.id]!} />
          ) : (
            <StaticCard data={activeItem.data} shadow />
          )
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
