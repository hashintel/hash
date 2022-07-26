import React, { FunctionComponent, useState } from "react";
import { List } from "@mui/material";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Items } from "../shuffle";
import { Item } from "./item";

type ItemListProps = {
  list: Items;
  onReorder: (sourceIndex: number, destinationIndex: number) => void;
  onValueChange: (index: number, value: string) => void;
  onItemBlur: () => void;
  onAdd: (index: number) => void;
  onDelete: (index: number) => void;
};

const findItemIndexById = (list: Items, id: UniqueIdentifier) =>
  list.findIndex((item) => item.id === id);

export const ItemList: FunctionComponent<ItemListProps> = ({
  list,
  onReorder,
  onValueChange,
  onItemBlur,
  onAdd,
  onDelete,
}) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const activeItem = activeIndex !== null && list[activeIndex];

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={({ active }) =>
        setActiveIndex(findItemIndexById(list, active.id))
      }
      onDragEnd={({ active, over }) => {
        setActiveIndex(null);

        if (over?.id && active.id !== over?.id) {
          const sourceIndex = findItemIndexById(list, active.id);
          const destinationIndex = findItemIndexById(list, over.id);
          onReorder(sourceIndex, destinationIndex);
        }
      }}
      onDragCancel={() => setActiveIndex(null)}
    >
      <SortableContext items={list} strategy={verticalListSortingStrategy}>
        <List>
          {list.map((item, index) => (
            <Item
              key={item.id}
              id={item.id}
              value={item.value}
              isDragging={index === activeIndex}
              onValueChange={(value: string) => onValueChange(index, value)}
              onItemBlur={() => onItemBlur()}
              onAdd={() => onAdd(index + 1)}
              onDelete={() => onDelete(index)}
            />
          ))}

          <DragOverlay>
            {activeItem ? (
              <Item
                key={activeItem.id}
                id={activeItem.id}
                value={activeItem.value}
              />
            ) : null}
          </DragOverlay>
        </List>
      </SortableContext>
    </DndContext>
  );
};
