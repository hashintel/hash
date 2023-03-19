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
import { useMemo, useState } from "react";

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
}

export const Board = ({ blockEntity, updateEntity }: BoardProps) => {
  const {
    properties: {
      [columnOrderKey]: entityColumnOrder = [],
      [columnsKey]: entityColumns = {},
    },
  } = blockEntity;

  const [prevEntityColumns, setPrevEntityColumns] = useState(entityColumns);
  const [prevEntityColumnOrder, setPrevEntityColumnOrder] =
    useState(entityColumnOrder);

  const [activeItem, setActiveItem] = useState<ActiveItem>(null);
  const [columns, setColumns] = useState<ColumnsState>(
    entityColumns as ColumnsState,
  );
  const [columnOrder, setColumnOrder] = useState<string[]>(entityColumnOrder);

  /**
   * as a hacky way of keeping this debounced function memoized, but still use up-to-date values of
   * local state, called setState functions below, and assigned the up-to-date values of local state
   * to variables, then used those variables to use local state to update entity with a debounced function.
   * If we don't do the hacky way (using setState functions to get current state values),
   * and instead add state values to the dependency array, existing debounced calls get executed because
   * memoization changes every time state is updated
   * */
  const syncLocalStateToEntity = useMemo(
    () =>
      debounce(() => {
        let localColumns: ColumnsState;
        let localColumnOrder: string[];

        setColumns((cols) => {
          localColumns = cols;
          return cols;
        });
        setColumnOrder((colOrder) => {
          localColumnOrder = colOrder;
          return colOrder;
        });

        setImmediate(() => {
          void updateEntity({
            [columnOrderKey]: localColumnOrder,
            [columnsKey]: localColumns,
          });
        });
      }, 500),
    [updateEntity],
  );

  if (
    entityColumnOrder !== prevEntityColumnOrder &&
    (entityColumnOrder.length || prevEntityColumnOrder.length)
  ) {
    if (entityColumnOrder !== columnOrder) {
      setColumnOrder(entityColumnOrder);
    }

    setPrevEntityColumnOrder(entityColumnOrder);
  }

  if (
    entityColumns !== prevEntityColumns &&
    (Object.keys(entityColumns).length || Object.keys(prevEntityColumns).length)
  ) {
    if (entityColumns !== columns) {
      setColumns(entityColumns as ColumnsState);
    }

    setPrevEntityColumns(entityColumns as ColumnsState);
  }

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

    syncLocalStateToEntity();
  };

  const deleteColumn: DeleteColumnCallback = (columnId) => {
    setColumns((cols) => {
      const newCols = { ...cols };
      delete newCols[columnId];
      return newCols;
    });
    setColumnOrder((ids) => ids.filter((id) => id !== columnId));

    syncLocalStateToEntity();
  };

  const updateColumnTitle: UpdateColumnTitleCallback = (columnId, newTitle) => {
    setColumns((cols) => {
      const targetCol = cols[columnId];
      if (!targetCol) return cols;

      const newCols = {
        ...cols,
        [columnId]: { ...targetCol, title: newTitle },
      };

      return newCols;
    });

    syncLocalStateToEntity();
  };

  const createCard: CreateCardCallback = (columnId, content) => {
    setColumns((cols) => {
      const targetCol = cols[columnId];
      if (!targetCol) return cols;

      const cloneCol = { ...targetCol };

      cloneCol.cards.push({ id: generateId(), content });

      return {
        ...cols,
        [columnId]: cloneCol,
      };
    });

    syncLocalStateToEntity();
  };

  const deleteCard: DeleteCardCallback = (columnId, cardId) => {
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

    syncLocalStateToEntity();
  };

  const updateCardContent: UpdateCardContentCallback = (cardId, newContent) => {
    const columnId = findColumnOfCard(cardId)?.id;

    if (!columnId) {
      throw new Error("column of card not found");
    }

    setColumns((cols) => {
      const targetCol = cols[columnId];
      if (!targetCol) return cols;

      const cloneCol = { ...targetCol };

      cloneCol.cards = cloneCol.cards.map((card) =>
        card.id === cardId ? { ...card, content: newContent } : card,
      );

      return {
        ...cols,
        [columnId]: cloneCol,
      };
    });

    syncLocalStateToEntity();
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

      syncLocalStateToEntity();

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

      syncLocalStateToEntity();

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

      syncLocalStateToEntity();

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

    syncLocalStateToEntity();
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
              updateColumnTitle={updateColumnTitle}
              updateCardContent={updateCardContent}
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
