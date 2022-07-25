import React, { useEffect, useReducer, useRef } from "react";
import {
  BlockComponent,
  useGraphBlockService,
} from "@blockprotocol/graph/react";
// eslint-disable-next-line no-restricted-imports
import Button from "@mui/material/Button";
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

  const onValueChange = (index: number, value: string) =>
    dispatch({
      type: ActionType.UPDATE,
      payload: {
        index,
        value,
      },
    });

  const onAdd = (index: number) =>
    dispatch({
      type: ActionType.ADD,
      payload: { index },
    });

  const onDelete = (index: number) =>
    dispatch({
      type: ActionType.DELETE,
      payload: { index },
    });

  useEffect(() => {
    void graphService?.updateEntity({
      data: {
        entityId,
        properties: { items: list },
      },
    });
  }, [graphService, entityId, list]);

  return (
    <Box ref={blockRootRef}>
      <Button
        disabled={items?.length <= 1}
        onClick={() => dispatch({ type: ActionType.SHUFFLE })}
      >
        Shuffle
      </Button>
      <ItemList
        list={list}
        onReorder={onReorder}
        onValueChange={onValueChange}
        onAdd={onAdd}
        onDelete={onDelete}
      />
    </Box>
  );
};
