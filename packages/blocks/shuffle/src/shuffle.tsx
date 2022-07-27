import React, { useRef, useState } from "react";
import {
  BlockComponent,
  useGraphBlockService,
} from "@blockprotocol/graph/react";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import produce from "immer";
import { v4 as uuid } from "uuid";
import isEqual from "lodash.isequal";
import ShuffleIcon from "@mui/icons-material/Shuffle";
import AddIcon from "@mui/icons-material/Add";
import { ItemList } from "./components/item-list";

export type Item = {
  id: string;
  value: string;
};

export type Items = Item[];

type BlockEntityProperties = {
  items?: string[];
};

export const initialItems = ["Thing 1", "Thing 2"];

const createItems = (items: string[]) =>
  items.map((item) => ({ id: uuid(), value: item }));

const getItemValues = (items: Items) => items.map((item) => item.value);

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

  const [draftItems, setDraftItems] = useState(() =>
    createItems(items?.length ? items : initialItems),
  );

  const [prevItems, setPrevItems] = useState(items);

  if (items && items !== prevItems) {
    setPrevItems(items);

    if (!isEqual(items, getItemValues(draftItems))) {
      setDraftItems(createItems(items));
    }
  }

  const publishItems = (newItems: Items) => {
    void graphService?.updateEntity({
      data: {
        entityId,
        properties: { items: getItemValues(newItems) },
      },
    });
  };

  const updateItems = (newItems: Items, publish = true) => {
    setDraftItems(newItems);

    if (publish) {
      publishItems(newItems);
    }
  };

  const onReorder = (sourceIndex: number, destinationIndex: number) =>
    updateItems(
      produce(draftItems, (newItems) => {
        const [removed] = newItems.splice(sourceIndex, 1);
        if (removed) {
          newItems.splice(destinationIndex, 0, removed);
        }
      }),
    );

  const onValueChange = (index: number, value: string) =>
    updateItems(
      produce(draftItems, (newItems) => {
        if (newItems[index]) {
          newItems[index]!.value = value; // eslint-disable-line no-param-reassign
        }
      }),
      false,
    );

  const onItemBlur = () => publishItems(draftItems);

  const onAdd = () =>
    updateItems(
      produce(draftItems, (newItems) => {
        newItems.push({
          id: uuid(),
          value: `Thing ${draftItems.length + 1}`,
        });
      }),
    );

  const onDelete = (index: number) =>
    updateItems(
      produce(draftItems, (newItems) => {
        newItems.splice(index, 1);
      }),
    );

  const onShuffle = () =>
    updateItems(
      produce(draftItems, (newItems) => {
        return newItems
          .map((value) => ({ value, sort: Math.random() }))
          .sort((a, b) => a.sort - b.sort)
          .map(({ value }) => value);
      }),
    );

  return (
    <Box
      ref={blockRootRef}
      sx={{ display: "flex", flexDirection: "column", paddingX: 1 }}
    >
      <Box sx={{ display: "flex", alignSelf: "end" }}>
        <Button
          variant="outlined"
          sx={{ marginRight: 1 }}
          onClick={() => onAdd()}
        >
          <AddIcon fontSize="small" />
        </Button>
        <Button
          variant="outlined"
          disabled={draftItems.length <= 1}
          onClick={() => onShuffle()}
        >
          <ShuffleIcon />
        </Button>
      </Box>
      <ItemList
        list={draftItems}
        onReorder={onReorder}
        onValueChange={onValueChange}
        onItemBlur={onItemBlur}
        onDelete={onDelete}
      />
    </Box>
  );
};
