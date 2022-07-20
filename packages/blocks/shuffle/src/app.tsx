import React, { useEffect, useReducer, useRef } from "react";
import { BlockComponent, useGraphBlockService } from "@blockprotocol/graph";
import { Button } from "@mui/material";
import Box from "@mui/material/Box";
import List from "@mui/material/List";
import { DragDropContext, Droppable } from "react-beautiful-dnd";
import { Item } from "./item";
import { ItemList, ActionType, initialList, reducer } from "./store";

type BlockEntityProperties = {
  items: ItemList;
};

export const App: BlockComponent<BlockEntityProperties> = ({
  graph: {
    blockEntity: {
      entityId,
      properties: { items },
    },
  },
}) => {
  const blockRootRef = useRef<HTMLDivElement>(null);
  const { graphService } = useGraphBlockService(blockRootRef);

  const [list, dispatch] = useReducer(
    reducer,
    items?.length ? items : initialList,
  );

  const onDragEnd = (result) => {
    if (!result.destination) {
      return;
    }

    dispatch({
      type: ActionType.REORDER,
      payload: {
        sourceIndex: result.source.index,
        destinationIndex: result.destination.index,
      },
    });
  };

  useEffect(() => {
    void graphService?.updateEntity({
      data: {
        entityId,
        properties: { items: list },
      },
    });
  }, [entityId, list]);

  return (
    <Box sx={{ width: "100%", bgcolor: "background.paper" }} ref={blockRootRef}>
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="droppable">
          {(provided, snapshot) => (
            <List {...provided.droppableProps} ref={provided.innerRef}>
              {list.map((item, index) => (
                <Item
                  id={item.id}
                  index={index}
                  value={item.value}
                  onValueChange={(value: string) =>
                    dispatch({
                      type: ActionType.UPDATE,
                      payload: {
                        id: item.id,
                        value,
                      },
                    })
                  }
                  onDelete={() =>
                    dispatch({
                      type: ActionType.DELETE,
                      payload: { id: item.id },
                    })
                  }
                />
              ))}
              {provided.placeholder}
            </List>
          )}
        </Droppable>
      </DragDropContext>
      <Button onClick={() => dispatch({ type: ActionType.ADD })}>Add</Button>
      <Button onClick={() => dispatch({ type: ActionType.SHUFFLE })}>
        Shuffle
      </Button>
    </Box>
  );
};
