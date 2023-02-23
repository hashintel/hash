import { EntityType } from "@blockprotocol/graph/";
import {
  BlockComponent,
  useEntitySubgraph,
  useGraphBlockModule,
} from "@blockprotocol/graph/react";
import {
  getOutgoingLinksForEntity,
  getRightEntityForLinkEntity,
} from "@blockprotocol/graph/stdlib";
import AddIcon from "@mui/icons-material/Add";
import ClearIcon from "@mui/icons-material/Clear";
import DatasetLinkedIcon from "@mui/icons-material/DatasetLinked";
import ShuffleIcon from "@mui/icons-material/Shuffle";
import Box from "@mui/material/Box";
import produce from "immer";
import isEqual from "lodash.isequal";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";

import { AddEntitiesDialog } from "./components/add-entities-dialog";
import { ItemList } from "./components/item-list";
import { TooltipButton } from "./components/tooltip-button";
import { RootEntity, RootEntityLinkedEntities } from "./types";
import { parseLabelFromEntity } from "./utils";

export type Item = {
  id: string;
  value: string;
  // if there is a link between this item and an entity, we save the linkId
  linkId?: string;
};

type Items = Item[];

const initialItems = [
  { id: "1", value: "Thing 1" },
  { id: "2", value: "Thing 2" },
];

export const Shuffle: BlockComponent<RootEntity> = ({
  graph: { blockEntitySubgraph, readonly },
}) => {
  if (!blockEntitySubgraph) {
    throw new Error("blockEntitySubgraph missing");
  }

  const { linkedEntities, rootEntity } = useEntitySubgraph<
    RootEntity,
    RootEntityLinkedEntities
  >(blockEntitySubgraph);

  const items: Item[] = useMemo(
    () =>
      // @todo this should be optional
      rootEntity.properties[
        "https://blockprotocol-gqpc30oin.stage.hash.ai/@nate/types/property-type/list-item/"
      ].map((item, idx) => ({
        value: typeof item === "string" ? item : "",
        id: `${idx + 1}`,
        ...(typeof item === "object"
          ? {
              linkId:
                item[
                  "https://blockprotocol-gqpc30oin.stage.hash.ai/@nate/types/property-type/link-entity-id/"
                ],
            }
          : {}),
      })),
    [rootEntity.properties],
  );

  const blockRootRef = useRef<HTMLDivElement>(null);
  const { graphModule } = useGraphBlockModule(blockRootRef);
  const [entitiesDialogOpen, setEntitiesDialogOpen] = useState(false);
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([]);
  const [draftItems, setDraftItems] = useState<Items>(
    items.length ? items : initialItems,
  );
  const [prevItems, setPrevItems] = useState(items);

  useEffect(() => {
    /**
     * setting the entityTypes to the state,
     * so we can get the `labelProperty` for the linked items, and show entityTypes in modal
     * */
    const getEntityTypes = async () => {
      const { data, errors } = await graphModule.aggregateEntityTypes({
        data: {
          includeOtherTypesInUse: true,
        },
      });

      if (errors || !data) return;

      console.log(data.results);

      // setEntityTypes(data.results);
    };

    void getEntityTypes();
  }, [graphModule]);

  if (items !== prevItems) {
    setPrevItems(items);

    if (!isEqual(items, draftItems)) {
      setDraftItems(items);
    }
  }

  const publishItems = (newItems: Items) => {
    if (readonly) {
      return;
    }

    console.log(newItems);

    // void graphModule.updateEntity({
    //   data: {
    //     entityId: blockEntityId,
    //     properties: { items: newItems },
    //   },
    // });
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
          void graphModule.deleteEntity({
            data: { entityId: deletedItem.linkId },
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

  const handleAddEntitiesClick = () => setEntitiesDialogOpen(true);

  const handleRemoveAllClick = () => {
    // we also want to remove all links for the linked items
    void Promise.all(
      draftItems.map((item) => {
        if (item.linkId) {
          return graphModule.deleteEntity({ data: { entityId: item.linkId } });
        }

        return undefined;
      }),
    );

    updateItems([], true);
  };

  // adds the items selected on AddEntitiesDialog to the list
  const handleAddEntityItems = (entityItems: Items) => {
    updateItems(draftItems.concat(entityItems), true);
  };

  /**
   * linked items does not store a `value`,
   * instead we use `entityId` to set the up-to-date entity label as `value`
   * this way, we don't show a stale `value` if the linked entity gets updated
   */
  const enhancedDraftItems = useMemo(() => {
    const outgoingLinks = getOutgoingLinksForEntity(
      blockEntitySubgraph,
      rootEntity.metadata.recordId.entityId,
    );

    const linksMap = new Map(
      outgoingLinks.map((link) => [
        link.linkData!.rightEntityId,
        getRightEntityForLinkEntity(
          blockEntitySubgraph,
          link.metadata.recordId.entityId,
        ),
      ]),
    );

    return draftItems.map((item) => {
      const { linkId } = item;
      const entity = linkId ? linksMap.get(linkId) : null;

      return {
        ...item,
        ...(entity && {
          value: parseLabelFromEntity(entity, blockEntitySubgraph),
        }),
      };
    });
  }, [blockEntitySubgraph, draftItems, rootEntity.metadata.recordId.entityId]);

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

          <TooltipButton
            tooltip="Remove all"
            onClick={handleRemoveAllClick}
            disabled={draftItems.length < 1}
          >
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
        open={entitiesDialogOpen}
        onClose={() => setEntitiesDialogOpen(false)}
        graphModule={graphModule}
        entityTypes={entityTypes}
        blockEntityId={rootEntity.metadata.recordId.entityId}
        onAddEntityItems={handleAddEntityItems}
      />
    </Box>
  );
};
