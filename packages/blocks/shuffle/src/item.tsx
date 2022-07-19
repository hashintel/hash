import { BlockComponent, useGraphBlockService } from "@blockprotocol/graph";
import React, {
  useCallback,
  useRef,
  useState,
  useReducer,
  FunctionComponent,
} from "react";
import Box from "@mui/material/Box";
import List from "@mui/material/List";
import { DndProvider, useDrop, useDrag } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { reducer, ActionType } from "./store";
import { Button, TextField } from "@mui/material";

type BlockEntityProperties = {
  name: string;
};

type DragItem = {
  id: number;
  index: number;
};
type ItemProps = {
  id: number;
  index: number;
  value: string;
  onValueChange: (value: string) => void;
  onReorder: (targetId: number) => void;
};

export const Item: FunctionComponent<ItemProps> = ({
  id,
  index,
  value,
  onValueChange,
  onReorder,
}) => {
  const ref = useRef(null);

  const [, drop] = useDrop<DragItem>({
    accept: "item",
    collect(monitor) {
      return {
        handlerId: monitor.getHandlerId(),
      };
    },
    hover(item, monitor) {
      // console.log(item);
      if (!ref.current) {
        return;
      }
      const dragIndex = item.index;
      const hoverIndex = index;
      // Don't replace items with themselves
      if (dragIndex === hoverIndex) {
        return;
      }
      // Determine rectangle on screen
      const hoverBoundingRect = ref.current?.getBoundingClientRect();
      // Get vertical middle
      const hoverMiddleY =
        (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      // Determine mouse position
      const clientOffset = monitor.getClientOffset();
      // Get pixels to the top
      const hoverClientY = clientOffset.y - hoverBoundingRect.top;
      // Only perform the move when the mouse has crossed half of the items height
      // When dragging downwards, only move when the cursor is below 50%
      // When dragging upwards, only move when the cursor is above 50%
      // Dragging downwards
      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) {
        return;
      }
      // Dragging upwards
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) {
        return;
      }

      if (item.id) {
        onReorder(item.id);
      }
      // Time to actually perform the action
      // moveCard(dragIndex, hoverIndex);
      // Note: we're mutating the monitor item here!
      // Generally it's better to avoid mutations,
      // but it's good here for the sake of performance
      // to avoid expensive index searches.
      item.index = hoverIndex;
    },
  });

  const [{ opacity }, drag, preview] = useDrag<DragItem>({
    type: "item",
    item: { id, index },
    collect: (monitor) => ({
      opacity: monitor.isDragging() ? 0 : 1,
    }),
  });

  drag(drop(ref));

  return (
    <Box sx={{ opacity }} ref={ref}>
      <Box ref={preview}>
        <div ref={drag}>...</div>
        <TextField
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
        />
      </Box>
    </Box>
  );
};
