/* eslint-disable no-console */
import {
  closestCenter,
  defaultDropAnimationSideEffects,
  DndContext,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  UniqueIdentifier,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import debounce from "lodash.debounce";
import isEqual from "lodash.isequal";
import { useMemo, useRef, useState } from "react";

import { RootEntityKey } from "../../additional-types";
import { RootEntity } from "../../types";
import { PlusIcon } from "../icons/plus-icon";
import { StaticCard } from "./card/static-card";
import { Column } from "./column/column";
import { StaticColumn } from "./column/static-column";
import styles from "./styles.module.scss";
import {
  ActiveItem,
  CardData,
  ColumnsState,
  CreateCardCallback,
  DeleteCardCallback,
  DeleteColumnCallback,
  UpdateCardContentCallback,
  UpdateColumnTitleCallback,
} from "./types";

const generateId = () => Date.now().toString();

const columnOrderKey: RootEntityKey =
  "https://blockprotocol-hk4sbmd9k.stage.hash.ai/@yusuf123/types/property-type/kanban-column-order/";
const columnsKey: RootEntityKey =
  "https://blockprotocol-hk4sbmd9k.stage.hash.ai/@yusuf123/types/property-type/kanban-columns/";

interface BoardProps {
  blockEntity: RootEntity;
  updateEntity: (newProperties: RootEntity["properties"]) => Promise<void>;
  readonly?: boolean;
}

export const Board = ({ blockEntity, updateEntity, readonly }: BoardProps) => {
  const updateEntityQueue = useRef<number[]>([]);
  const isDebounceQueued = useRef(false);
  const {
    properties: {
      [columnOrderKey]: entityColumnOrder = [],
      [columnsKey]: entityColumns = {},
    },
  } = blockEntity;

  const [prevBlockEntity, setPrevBlockEntity] = useState(blockEntity);

  const [activeItem, setActiveItem] = useState<ActiveItem>(null);
  const [columns, setColumns] = useState<ColumnsState>(
    entityColumns as ColumnsState,
  );
  const [columnOrder, setColumnOrder] = useState<string[]>(entityColumnOrder);

  const debouncedUpdateEntity = useMemo(
    () =>
      debounce(async (newProperties: RootEntity["properties"]) => {
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
    newColumns,
    newColumnOrder,
  }: {
    newColumns?: ColumnsState;
    newColumnOrder?: string[];
  }) => {
    if (newColumns) setColumns(newColumns);
    if (newColumnOrder) setColumnOrder(newColumnOrder);

    isDebounceQueued.current = true;
    void debouncedUpdateEntity({
      [columnsKey]: newColumns ?? columns,
      [columnOrderKey]: newColumnOrder ?? columnOrder,
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
      return setActiveItem({ type: "column", id: active.id });
    }

    const foundCard = findColumnOfCard(active.id)?.cards.find(
      (card) => card.id === active.id,
    );

    if (!foundCard) {
      throw new Error("no card found");
    }

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
      newColumns: {
        ...columns,
        [activeColumn.id]: activeColumn,
        [overColumn.id]: overColumn,
      },
    });
  };

  const handleDragEnd = () => {
    setActiveItem(null);
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

  if (blockEntity !== prevBlockEntity && shouldOverrideLocalState) {
    setPrevBlockEntity(blockEntity);

    const columnsChanged = !isEqual(entityColumns, columns);
    if (columnsChanged) {
      setColumns(entityColumns as ColumnsState);
    }

    const columnOrderChanged = !isEqual(entityColumnOrder, columnOrder);
    if (columnOrderChanged) {
      setColumnOrder(entityColumnOrder);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragEnd}
      onDragStart={handleDragStart}
    >
      <SortableContext items={columnOrder} disabled={readonly}>
        <div className={styles.board}>
          {columnOrder.map((columnId) => (
            <Column
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
            <StaticColumn data={columns[activeItem.id]!} />
          ) : (
            <StaticCard data={activeItem.data} shadow />
          )
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
