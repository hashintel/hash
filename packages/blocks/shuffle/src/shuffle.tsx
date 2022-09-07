import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BlockComponent,
  useGraphBlockService,
} from "@blockprotocol/graph/react";
import Box from "@mui/material/Box";
import produce from "immer";
import { v4 as uuid } from "uuid";
import isEqual from "lodash.isequal";
import ShuffleIcon from "@mui/icons-material/Shuffle";
import AddIcon from "@mui/icons-material/Add";
import DatasetLinkedIcon from "@mui/icons-material/DatasetLinked";
import ClearIcon from "@mui/icons-material/Clear";
import { EntityType } from "@blockprotocol/graph/.";
import { ItemList } from "./components/item-list";
import {
  AddEntitiesDialog,
  AddEntitiesDialogRef,
} from "./components/add-entities-dialog";
import { getEntityLabel } from "./utils";
import { TooltipButton } from "./components/tooltip-button";

type Item = {
  id: string;
  value: string;
  entityId?: string;
  linkId?: string;
};

export type Items = Item[];

type BlockEntityProperties = {
  items?: Items;
};

const initialItems = [
  { id: "1", value: "Thing 1" },
  { id: "2", value: "Thing 2" },
];

export const Shuffle: BlockComponent<BlockEntityProperties> = ({
  graph: {
    blockEntity: {
      entityId: blockEntityId,
      properties: { items },
    },
    blockGraph,
    readonly,
  },
}) => {
  const blockRootRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<AddEntitiesDialogRef>(null);
  const { graphService } = useGraphBlockService(blockRootRef);
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([]);
  const [draftItems, setDraftItems] = useState<Items>(() =>
    items?.length ? items : initialItems,
  );
  const [prevItems, setPrevItems] = useState(items);

  useEffect(() => {
    void graphService
      ?.aggregateEntityTypes({
        data: {
          includeOtherTypesInUse: true,
        },
      })
      .then(({ data, errors }) => {
        if (errors || !data) {
          return;
        }
        setEntityTypes(data.results);
      });
  }, [graphService]);

  if (items && items !== prevItems) {
    setPrevItems(items);

    if (!isEqual(items, draftItems)) {
      setDraftItems(items);
    }
  }

  const publishItems = (newItems: Items) => {
    if (readonly) {
      return;
    }
    void graphService?.updateEntity({
      data: {
        entityId: blockEntityId,
        properties: { items: newItems },
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

  const onValueChange = (index: number, value: string) => {
    if (readonly) {
      return;
    }

    updateItems(
      produce(draftItems, (newItems) => {
        if (newItems[index]) {
          newItems[index]!.value = value; // eslint-disable-line no-param-reassign
        }
      }),
      false,
    );
  };

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

  const onDelete = (index: number) => {
    updateItems(
      produce(draftItems, (newItems) => {
        const [deletedItem] = newItems.splice(index, 1);

        if (deletedItem?.linkId) {
          void graphService?.deleteLink({
            data: { linkId: deletedItem.linkId },
          });
        }
      }),
    );
  };

  const onShuffle = () =>
    updateItems(
      produce(draftItems, (newItems) => {
        return newItems
          .map((value) => ({ value, sort: Math.random() }))
          .sort((a, b) => a.sort - b.sort)
          .map(({ value }) => value);
      }),
    );

  const removeAllItems = () => {
    const linkIds = draftItems
      .map((item) => item.linkId)
      .filter(Boolean) as string[];

    void Promise.all(
      linkIds.map((linkId) =>
        graphService?.deleteLink({
          data: { linkId },
        }),
      ),
    );

    updateItems([], true);
  };

  const showAddEntitiesDialog = () => dialogRef.current?.show();

  const enhancedDraftItems = useMemo(() => {
    return draftItems.map((item) => {
      const { entityId: itemEntityId } = item;

      const entity = itemEntityId
        ? blockGraph?.linkedEntities.find(
            ({ entityId }) => entityId === itemEntityId,
          )
        : undefined;

      const entityType = entityTypes.find(
        (type) => type.entityTypeId === entity?.entityTypeId,
      );

      return {
        ...item,
        ...(entity && { value: getEntityLabel(entity, entityType) }),
      };
    });
  }, [blockGraph?.linkedEntities, draftItems, entityTypes]);

  return (
    <Box ref={blockRootRef} display="flex" flexDirection="column" px={1}>
      {!readonly && (
        <Box display="flex" alignSelf="end" gap={1}>
          <TooltipButton tooltip="Add new" onClick={onAdd}>
            <AddIcon />
          </TooltipButton>

          <TooltipButton
            tooltip="Shuffle"
            onClick={onShuffle}
            disabled={draftItems.length <= 1}
          >
            <ShuffleIcon />
          </TooltipButton>

          <TooltipButton tooltip="Add entities" onClick={showAddEntitiesDialog}>
            <DatasetLinkedIcon />
          </TooltipButton>

          <TooltipButton tooltip="Remove all" onClick={removeAllItems}>
            <ClearIcon />
          </TooltipButton>
        </Box>
      )}
      <ItemList
        list={enhancedDraftItems}
        onReorder={onReorder}
        onValueChange={onValueChange}
        onItemBlur={onItemBlur}
        onDelete={onDelete}
        readonly={!!readonly}
      />
      <AddEntitiesDialog
        ref={dialogRef}
        graphService={graphService}
        entityTypes={entityTypes}
        blockEntityId={blockEntityId}
        onAddItems={(entityItems) => {
          updateItems(
            produce(draftItems, (newItems) => {
              return newItems.concat(entityItems);
            }),
            true,
          );
        }}
      />
    </Box>
  );
};
