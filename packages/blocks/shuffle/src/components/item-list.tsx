import React, { FunctionComponent, useState, useRef } from "react";
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
  DropAnimation,
  MeasuringStrategy,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Items } from "../shuffle";
import { Item } from "./item";
import { SortableItem } from "./sortable-item";

type ItemListProps = {
  list: Items;
  onReorder: (sourceIndex: number, destinationIndex: number) => void;
  onValueChange: (index: number, value: string) => void;
  onItemBlur: () => void;
  onDelete: (index: number) => void;
};

const measuringConfig = {
  droppable: {
    strategy: MeasuringStrategy.Always,
  },
};

const findItemIndexById = (list: Items, id: UniqueIdentifier) =>
  list.findIndex((item) => item.id === id);

const boxShadow =
  "rgba(63, 63, 68, 0.05) 0px 0px 0px 1px, rgba(34, 33, 81, 0.15) 0px 1px 3px 0px";
const draggingBoxShadow =
  "-1px 0 15px 0 rgba(34, 33, 81, 0.01), 0px 15px 15px 0 rgba(34, 33, 81, 0.25)";

export const ItemList: FunctionComponent<ItemListProps> = ({
  list,
  onReorder,
  onValueChange,
  onItemBlur,
  onDelete,
}) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [droppingId, setDroppingId] = useState<UniqueIdentifier | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const dragOverlayRef = useRef<HTMLDivElement | null>(null);

  const activeItem = activeIndex !== null && list[activeIndex];

  const dropAnimationConfig: DropAnimation = {
    keyframes({ transform }) {
      return [
        {
          transform: CSS.Transform.toString(transform.initial),
        },
        {
          transform: CSS.Transform.toString({
            ...transform.final,
            scaleX: 0.95,
            scaleY: 0.95,
          }),
        },
      ];
    },
    duration: 250,
    sideEffects({ active }) {
      setDroppingId(active.id);

      if (dragOverlayRef.current) {
        dragOverlayRef.current.animate(
          [
            {
              boxShadow: draggingBoxShadow,
            },
            { boxShadow },
          ],
          {
            duration: 250,
            easing: "ease",
            fill: "forwards",
          },
        );
      }

      return () => {
        setDroppingId(null);
      };
    },
  };

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
      measuring={measuringConfig}
    >
      <SortableContext items={list} strategy={verticalListSortingStrategy}>
        <List>
          {list.map((item, index) => (
            <SortableItem
              key={item.id}
              id={item.id}
              value={item.value}
              isDragging={index === activeIndex || droppingId === item.id}
              onValueChange={(value: string) => onValueChange(index, value)}
              onItemBlur={() => onItemBlur()}
              onDelete={() => onDelete(index)}
              paperStyle={{ boxShadow }}
            />
          ))}
          <DragOverlay dropAnimation={dropAnimationConfig}>
            {activeItem ? (
              <Item
                id={activeItem.id}
                value={activeItem.value}
                paperStyle={{
                  boxShadow: draggingBoxShadow,
                  transform: "scale(1.05)",
                  "@keyframes pop": {
                    from: {
                      transform: "scale(1)",
                    },
                    to: {
                      transform: "scale(1.05)",
                    },
                  },
                  animation: `pop 250ms normal ease`,
                }}
                dragOverlay={dragOverlayRef}
              />
            ) : null}
          </DragOverlay>
        </List>
      </SortableContext>
    </DndContext>
  );
};
