import React from "react";
import { List } from "@mui/material";
import { FunctionComponent } from "react";
import { Items } from "../reducer";
import { DragDropContext, Droppable } from "react-beautiful-dnd";
import { Item } from "./item";

type ItemListProps = {
  list: Items;
  onReorder: (sourceIndex: number, destinationIndex: number) => void;
  onValueChange: (index: number, value: string) => void;
  onAdd: (index: number) => void;
  onDelete: (index: number) => void;
};

export const ItemList: FunctionComponent<ItemListProps> = ({
  list,
  onReorder,
  onValueChange,
  onAdd,
  onDelete,
}) => {
  const onDragEnd = (result) => {
    if (!result.destination) {
      return;
    }

    onReorder(result.source.index, result.destination.index);
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId="droppable">
        {(provided, { draggingOverWith }) => (
          <List {...provided.droppableProps} ref={provided.innerRef}>
            {list.map((item, index) => (
              <Item
                id={item.id}
                index={index}
                value={item.value}
                canHover={!draggingOverWith || draggingOverWith === item.id}
                onValueChange={(value: string) => onValueChange(index, value)}
                onAdd={() => onAdd(index + 1)}
                onDelete={() => onDelete(index)}
              />
            ))}
            {provided.placeholder}
          </List>
        )}
      </Droppable>
    </DragDropContext>
  );
};
