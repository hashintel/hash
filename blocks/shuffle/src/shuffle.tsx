import type { BlockComponent } from "@blockprotocol/graph/react";
import {
  useEntitySubgraph,
  useGraphBlockModule,
} from "@blockprotocol/graph/react";
import {
  getOutgoingLinksForEntity,
  getRightEntityForLinkEntity,
  parseLabelFromEntity,
} from "@blockprotocol/graph/stdlib";
import AddIcon from "@mui/icons-material/Add";
import ClearIcon from "@mui/icons-material/Clear";
import ShuffleIcon from "@mui/icons-material/Shuffle";
import Box from "@mui/material/Box";
import { produce } from "immer";
import isEqual from "lodash.isequal";
// @todo: https://linear.app/hash/issue/H-3769/investigate-new-eslint-errors
// removed React import
import { useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";

import { ItemList } from "./components/item-list";
import { TooltipButton } from "./components/tooltip-button";
import { propertyIds } from "./property-ids";
import type {
  BlockEntity,
  ShuffleBlockItemPropertyValue,
  ShuffleBlockOutgoingLinkAndTarget,
} from "./types/generated/block-entity";

const initialItems: ShuffleBlockItemPropertyValue[] = [
  { [propertyIds.id]: "1", [propertyIds.value]: "Thing 1" },
  { [propertyIds.id]: "2", [propertyIds.value]: "Thing 2" },
];

export const Shuffle: BlockComponent<BlockEntity> = ({
  graph: { blockEntitySubgraph, readonly },
}) => {
  const { rootEntity } = useEntitySubgraph<
    BlockEntity,
    ShuffleBlockOutgoingLinkAndTarget[]
  >(blockEntitySubgraph);

  const items = rootEntity.properties[propertyIds.list];

  const blockRootRef = useRef<HTMLDivElement>(null);
  /* @ts-expect-error –– @todo H-3839 packages in BP repo needs updating, or this package updating to use graph in this repo */
  const { graphModule } = useGraphBlockModule(blockRootRef);
  const [draftItems, setDraftItems] = useState<ShuffleBlockItemPropertyValue[]>(
    items?.length ? items : initialItems,
  );
  const [prevItems, setPrevItems] = useState(items);

  if (items !== prevItems) {
    setPrevItems(items);

    if (!isEqual(items, draftItems)) {
      setDraftItems(items ?? initialItems);
    }
  }

  const publishItems = (newItems: ShuffleBlockItemPropertyValue[]) => {
    if (readonly) {
      return;
    }

    void graphModule.updateEntity({
      data: {
        entityId: rootEntity.metadata.recordId.entityId,
        entityTypeId: rootEntity.metadata.entityTypeId,
        properties: {
          [propertyIds.list]: newItems,
        },
      },
    });
  };

  const updateItems = (
    newItems: ShuffleBlockItemPropertyValue[],
    publish = true,
  ) => {
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
          newItems[index][propertyIds.value] = value; // eslint-disable-line no-param-reassign
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
        const linkId = deletedItem?.[propertyIds.linkEntityId];
        if (linkId) {
          void graphModule.deleteEntity({
            data: { entityId: linkId },
          });
        }
      }),
    );
  };

  const handleAddNewClick = () =>
    updateItems(
      produce(draftItems, (newItems) => {
        newItems.push({
          [propertyIds.id]: uuid(),
          [propertyIds.value]: `Thing ${draftItems.length + 1}`,
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

  const handleRemoveAllClick = () => {
    // we also want to remove all links for the linked items
    void Promise.all(
      draftItems.map((item) => {
        const linkId = item[propertyIds.linkEntityId];
        if (linkId) {
          return graphModule.deleteEntity({
            data: { entityId: linkId },
          });
        }

        return undefined;
      }),
    );

    updateItems([], true);
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
        link.metadata.recordId.entityId,
        getRightEntityForLinkEntity(
          blockEntitySubgraph,
          link.metadata.recordId.entityId,
        ),
      ]),
    );

    return draftItems.map((item) => {
      const linkId = item[propertyIds.linkEntityId];
      const entity = linkId ? linksMap.get(linkId) : null;

      return {
        ...item,
        ...(entity && {
          [propertyIds.value]: parseLabelFromEntity(
            entity,
            blockEntitySubgraph,
          ),
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
    </Box>
  );
};
