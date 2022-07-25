import React, { useEffect, useRef, useState } from "react";
import {
  BlockComponent,
  useGraphBlockService,
} from "@blockprotocol/graph/react";
// eslint-disable-next-line no-restricted-imports
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import produce from "immer";
import { v4 as uuid } from "uuid";
import { ItemList } from "./components/item-list";

export type Item = {
  id: string;
  value: string;
};

export type Items = Item[];

type BlockEntityProperties = {
  items?: Items;
};

export const initialItems = [
  { id: uuid(), value: "Thing 1" },
  { id: uuid(), value: "Thing 2" },
];

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

  const [list, setList] = useState(items?.length ? items : initialItems);

  useEffect(() => {
    if (items) {
      setList(items);
    }
  }, [items]);

  const publishChanges = (newItems: Items) => {
    void graphService?.updateEntity({
      data: {
        entityId,
        properties: { items: newItems },
      },
    });
  };

  const onReorder = (sourceIndex: number, destinationIndex: number) => {
    const newItems = produce(list, (draftItems) => {
      const [removed] = draftItems.splice(sourceIndex, 1);
      if (removed) {
        draftItems.splice(destinationIndex, 0, removed);
      }
    });

    setList(newItems);
    publishChanges(newItems);
  };

  const onValueChange = (index: number, value: string) => {
    const newItems = produce(list, (draftItems) => {
      if (draftItems[index]) {
        draftItems[index]!.value = value;
      }
    });

    setList(newItems);
  };

  const onItemBlur = () => {
    publishChanges(list);
  };

  const onAdd = (index: number) => {
    const newItems = produce(list, (draftItems) => {
      draftItems.splice(index, 0, {
        id: uuid(),
        value: `Thing ${list.length + 1}`,
      });
    });

    setList(newItems);
    publishChanges(newItems);
  };

  const onDelete = (index: number) => {
    const newItems = produce(list, (draftItems) => {
      draftItems.splice(index, 1);
      if (draftItems.length === 0) {
        draftItems.push({ id: uuid(), value: "Thing 1" });
      }
    });

    setList(newItems);
    publishChanges(newItems);
  };

  const onShuffle = () => {
    const newItems = produce(list, (draftItems) => {
      return draftItems
        .map((value) => ({ value, sort: Math.random() }))
        .sort((a, b) => a.sort - b.sort)
        .map(({ value }) => value);
    });

    setList(newItems);
    publishChanges(newItems);
  };

  return (
    <Box ref={blockRootRef}>
      <Button disabled={list.length <= 1} onClick={() => onShuffle()}>
        Shuffle
      </Button>
      <ItemList
        list={list}
        onReorder={onReorder}
        onValueChange={onValueChange}
        onItemBlur={onItemBlur}
        onAdd={onAdd}
        onDelete={onDelete}
      />
    </Box>
  );
};
