import React, { useEffect, useReducer, useRef } from "react";
import { BlockComponent, useGraphBlockService } from "@blockprotocol/graph";
import { Button } from "@mui/material";
import Box from "@mui/material/Box";
import { ItemList } from "./components/item-list";
import { ActionType, initialItems, Items, shuffleReducer } from "./reducer";

type BlockEntityProperties = {
  items: Items;
};

export const Shuffle: BlockComponent<BlockEntityProperties> = ({
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
    shuffleReducer,
    items?.length ? items : initialItems,
  );

  const onReorder = (sourceIndex: number, destinationIndex: number) =>
    dispatch({
      type: ActionType.REORDER,
      payload: {
        sourceIndex,
        destinationIndex,
      },
    });

  const onValueChange = (id: string, value: string) =>
    dispatch({
      type: ActionType.UPDATE,
      payload: {
        id,
        value,
      },
    });

  const onDelete = (id: string) =>
    dispatch({
      type: ActionType.DELETE,
      payload: { id },
    });

  useEffect(() => {
    void graphService?.updateEntity({
      data: {
        entityId,
        properties: { items: list },
      },
    });
  }, [entityId, list]);

  return (
    <Box ref={blockRootRef}>
      <ItemList
        list={list}
        onReorder={onReorder}
        onValueChange={onValueChange}
        onDelete={onDelete}
      />
      <Button onClick={() => dispatch({ type: ActionType.ADD })}>Add</Button>
      <Button onClick={() => dispatch({ type: ActionType.SHUFFLE })}>
        Shuffle
      </Button>
    </Box>
  );
};
