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
import { useState } from "react";

import { PlusIcon } from "../icons/plus-icon";
import { StaticCard } from "./card/static-card";
import { Column } from "./column/column";
import { StaticColumn } from "./column/static-column";
import styles from "./styles.module.scss";
import { CardData, ColumnsState, defaultColumns } from "./types";

const generateId = () => Date.now().toString();

export const Board = () => {
  const [activeItem, setActiveItem] = useState<
    | { type: "column"; id: UniqueIdentifier }
    | { type: "card"; id: UniqueIdentifier; data: CardData }
    | null
  >(null);
  const [columns, setColumns] = useState<ColumnsState>(defaultColumns);
  const [columnOrder, setColumnOrder] = useState<string[]>(
    Object.keys(defaultColumns),
  );

  const deleteColumn = (columnId: string) => {
    setColumns((cols) => {
      const newCols = { ...cols };
      delete newCols[columnId];
      return newCols;
    });
    setColumnOrder((ids) => ids.filter((id) => id !== columnId));
  };

  const createColumn = () => {
    const newColId = generateId();

    setColumns((cols) => {
      return {
        ...cols,
        [newColId]: {
          id: newColId,
          title: `Column ${Object.keys(cols).length + 1}`,
          cards: [],
        },
      };
    });

    setColumnOrder((cols) => [...cols, newColId]);
  };

  const createCard = (columnId: string, content: string) => {
    setColumns((cols) => {
      const targetCol = cols[columnId];
      if (!targetCol) return cols;

      const cloneCol = { ...targetCol };

      cloneCol.cards.push({ id: generateId(), content, columnId });

      return {
        ...cols,
        [columnId]: cloneCol,
      };
    });
  };

  const deleteCard = (columnId: string, cardId: string) => {
    setColumns((cols) => {
      const targetCol = cols[columnId];
      if (!targetCol) return cols;

      const cloneCol = { ...targetCol };

      cloneCol.cards = cloneCol.cards.filter((card) => card.id !== cardId);

      return {
        ...cols,
        [columnId]: cloneCol,
      };
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

      setColumnOrder((colIds) => {
        const oldIndex = colIds.findIndex((id) => id === active.id);
        const newIndex = colIds.findIndex((id) => id === overColumnId);

        return arrayMove(colIds, oldIndex, newIndex);
      });

      return;
    }

    const activeColumn = findColumnOfCard(active.id);

    if (!activeColumn) {
      throw Error("activeColumn not found");
    }

    // dropping card into a column
    if (isOverColumn) {
      setColumns((cols) => {
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

        return {
          ...cols,
          [activeColumn.id]: activeColumn,
          [overColumn.id]: {
            ...overColumn,
            cards: [...overColumn.cards, movedCard],
          },
        };
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
      setColumns((cols) => {
        const oldIndex = overColumn.cards.findIndex(
          (card) => card.id === active.id,
        );
        const newIndex = overColumn.cards.findIndex(
          (card) => card.id === over.id,
        );
        const newCards = arrayMove(overColumn.cards, oldIndex, newIndex);

        overColumn.cards = newCards;

        return { ...cols, [overColumn.id]: overColumn };
      });

      return;
    }

    setColumns((cols) => {
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
      const newIndex = overColumn.cards.findIndex(
        (card) => card.id === over.id,
      );
      const newCards = [...overColumn.cards];
      newCards.splice(newIndex, 0, movedCard);
      overColumn.cards = newCards;

      return {
        ...cols,
        [activeColumn.id]: activeColumn,
        [overColumn.id]: overColumn,
      };
    });
  };

  const handleDragEnd = () => {
    setActiveItem(null);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { tolerance: { x: 10, y: 10 }, delay: 100 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragEnd}
      onDragStart={handleDragStart}
    >
      <SortableContext items={columnOrder}>
        <div className={styles.board}>
          {columnOrder.map((columnId) => (
            <Column
              key={columnId}
              data={columns[columnId]!}
              deleteColumn={deleteColumn}
              createCard={createCard}
              deleteCard={deleteCard}
            />
          ))}

          <button
            className={styles.addColumnButton}
            type="button"
            onClick={createColumn}
          >
            Add another column
            <PlusIcon />
          </button>
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
