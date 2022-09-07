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
  // entityId is used to find the entity easily, instead of doing linkId -> link -> entityId
  entityId?: string;
  // if there is a link between this item and an entity, we save the linkId
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
  const [draftItems, setDraftItems] = useState<Items>(
    items?.length ? items : initialItems,
  );
  const [prevItems, setPrevItems] = useState(items);

  useEffect(() => {
    /**
     * setting the entityTypes to the state,
     * so we can get the `labelProperty` for the linked items, and show entityTypes in modal
     * */
    const getEntityTypes = async () => {
      if (!graphService) return;

      const { data, errors } = await graphService.aggregateEntityTypes({
        data: {
          includeOtherTypesInUse: true,
        },
      });

      if (errors || !data) return;

      setEntityTypes(data.results);
    };

    void getEntityTypes();
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

  const handleReorder = (sourceIndex: number, destinationIndex: number) =>
    updateItems(
      produce(draftItems, (newItems) => {
        const [removed] = newItems.splice(sourceIndex, 1);
        if (removed) {
          newItems.splice(destinationIndex, 0, removed);
        }
      }),
    );

  const handleValueChange = (index: number, value: string) => {
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

  const handleItemBlur = () => publishItems(draftItems);

  const handleDelete = (index: number) => {
    updateItems(
      produce(draftItems, (newItems) => {
        const [deletedItem] = newItems.splice(index, 1);

        // if item is linked to an entity, we want to delete the link as well
        if (deletedItem?.linkId) {
          void graphService?.deleteLink({
            data: { linkId: deletedItem.linkId },
          });
        }
      }),
    );
  };

  const handleAddNewClick = () =>
    updateItems(
      produce(draftItems, (newItems) => {
        newItems.push({
          id: uuid(),
          value: `Thing ${draftItems.length + 1}`,
        });
      }),
    );

  const handleShuffleClick = () =>
    updateItems(
      produce(draftItems, (newItems) => {
        return newItems
          .map((value) => ({ value, sort: Math.random() }))
          .sort((a, b) => a.sort - b.sort)
          .map(({ value }) => value);
      }),
    );

  const handleAddEntitiesClick = () => dialogRef.current?.show();

  const handleRemoveAllClick = () => {
    // we also want to remove all links for the linked items
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

  // adds the items selected on AddEntitiesDialog to the list
  const handleAddEntityItems = (entityItems: Items) => {
    updateItems(
      produce(draftItems, (newItems) => {
        return newItems.concat(entityItems);
      }),
      true,
    );
  };

  /**
   * linked items does not store a `value`,
   * instead we use `entityId` to set the up-to-date entity label as `value`
   * this way, we don't show a stale `value` if the linked entity gets updated
   */
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
          <TooltipButton tooltip="Add new" onClick={handleAddNewClick}>
            <AddIcon />
          </TooltipButton>

          <TooltipButton
            tooltip="Shuffle"
            onClick={handleShuffleClick}
            disabled={draftItems.length <= 1}
          >
            <ShuffleIcon />
          </TooltipButton>

          <TooltipButton
            tooltip="Add entities"
            onClick={handleAddEntitiesClick}
          >
            <DatasetLinkedIcon />
          </TooltipButton>

          <TooltipButton tooltip="Remove all" onClick={handleRemoveAllClick}>
            <ClearIcon />
          </TooltipButton>
        </Box>
      )}
      <ItemList
        list={enhancedDraftItems}
        onReorder={handleReorder}
        onValueChange={handleValueChange}
        onItemBlur={handleItemBlur}
        onDelete={handleDelete}
        readonly={!!readonly}
      />
      <AddEntitiesDialog
        ref={dialogRef}
        graphService={graphService}
        entityTypes={entityTypes}
        blockEntityId={blockEntityId}
        onAddEntityItems={handleAddEntityItems}
      />
    </Box>
  );
};
