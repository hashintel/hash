import React, { useReducer } from "react";
import { BlockComponent } from "@blockprotocol/graph";
import { Button } from "@mui/material";
import Box from "@mui/material/Box";
import List from "@mui/material/List";
import { DragDropContext, Droppable } from "react-beautiful-dnd";
import { Item } from "./item";
import { ActionType, initialList, reducer } from "./store";

type BlockEntityProperties = {
  name: string;
};

export const App: BlockComponent<BlockEntityProperties> = ({
  graph: {
    blockEntity: { entityId, properties },
  },
}) => {
  const [list, dispatch] = useReducer(reducer, initialList);

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

  return (
    <Box sx={{ width: "100%", bgcolor: "background.paper" }}>
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
