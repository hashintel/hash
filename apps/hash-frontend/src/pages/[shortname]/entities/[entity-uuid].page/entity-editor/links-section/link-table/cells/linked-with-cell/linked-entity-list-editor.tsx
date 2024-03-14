import type { VersionedUrl } from "@blockprotocol/type-system";
import type { ProvideEditorComponent } from "@glideapps/glide-data-grid";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import type {
  CreatedAtDecisionTime,
  CreatedAtTransactionTime,
  CreatedById,
  EditionCreatedById,
  Entity,
  EntityId,
  EntityRootType,
  Subgraph,
  Timestamp,
} from "@local/hash-subgraph";
import { extractDraftIdFromEntityId } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { Box } from "@mui/material";
import produce from "immer";
import { useMemo, useState } from "react";

import { getImageUrlFromEntityProperties } from "../../../../../../../../shared/get-image-url-from-properties";
import { useMarkLinkEntityToArchive } from "../../../../../shared/use-mark-link-entity-to-archive";
import { useEntityEditor } from "../../../../entity-editor-context";
import { AddAnotherButton } from "../../../../properties-section/property-table/cells/value-cell/array-editor/add-another-button";
import { GridEditorWrapper } from "../../../../shared/grid-editor-wrapper";
import type { LinkedWithCell } from "../linked-with-cell";
import { sortLinkAndTargetEntities } from "../sort-link-and-target-entities";
import { EntitySelector } from "./entity-selector";
import { LinkedEntityListRow } from "./linked-entity-list-editor/linked-entity-list-row";
import { MaxItemsReached } from "./linked-entity-list-editor/max-items-reached";

/**
 * @todo - This is unsafe, and should be refactored to return a new type `DraftEntity`, so that we aren't
 *   breaking invariants and constraints. Having a disjoint type will let us rely on `tsc` properly and avoid casts
 *   and empty placeholder values below
 *   see https://linear.app/hash/issue/H-1083/draft-entities
 */
export const createDraftLinkEntity = ({
  rightEntityId,
  leftEntityId,
  linkEntityTypeId,
}: {
  rightEntityId: EntityId;
  leftEntityId: EntityId;
  linkEntityTypeId: VersionedUrl;
}): Entity => {
  return {
    properties: {},
    linkData: { rightEntityId, leftEntityId },
    metadata: {
      archived: false,
      recordId: { editionId: "", entityId: `draft~${Date.now()}` as EntityId },
      entityTypeId: linkEntityTypeId,
      provenance: {
        createdById: "" as CreatedById,
        createdAtTransactionTime: "" as CreatedAtTransactionTime,
        createdAtDecisionTime: "" as CreatedAtDecisionTime,
        edition: { createdById: "" as EditionCreatedById },
      },
      temporalVersioning: {
        decisionTime: {
          start: {
            kind: "inclusive",
            limit: "" as Timestamp,
          },
          end: {
            kind: "unbounded",
          },
        },
        transactionTime: {
          start: {
            kind: "inclusive",
            limit: "" as Timestamp,
          },
          end: {
            kind: "unbounded",
          },
        },
      },
    },
  };
};

export const LinkedEntityListEditor: ProvideEditorComponent<LinkedWithCell> = (
  props,
) => {
  const { entitySubgraph, setDraftLinksToCreate } = useEntityEditor();
  const markLinkEntityToArchive = useMarkLinkEntityToArchive();

  const { value: cell, onFinishedEditing, onChange } = props;
  const {
    expectedEntityTypes,
    linkAndTargetEntities,
    linkEntityTypeId,
    maxItems,
  } = cell.data.linkRow;

  const [addingLink, setAddingLink] = useState(!linkAndTargetEntities.length);

  const entity = useMemo(() => getRoots(entitySubgraph)[0]!, [entitySubgraph]);

  const onSelect = (
    selectedEntity: Entity,
    sourceSubgraph: Subgraph<EntityRootType> | null,
  ) => {
    const alreadyLinked = linkAndTargetEntities.find(
      ({ rightEntity }) =>
        rightEntity.metadata.recordId.entityId ===
        selectedEntity.metadata.recordId.entityId,
    );

    // if same entity is already linked, do nothing
    if (alreadyLinked) {
      return setAddingLink(false);
    }

    const leftEntityId = entity.metadata.recordId.entityId;
    const rightEntityId = selectedEntity.metadata.recordId.entityId;

    const linkEntity = createDraftLinkEntity({
      leftEntityId,
      rightEntityId,
      linkEntityTypeId,
    });

    const newLinkAndTargetEntity = {
      linkEntity,
      rightEntity: selectedEntity,
      sourceSubgraph,
    };

    setDraftLinksToCreate((prev) => [...prev, newLinkAndTargetEntity]);

    setAddingLink(false);

    const newCell = produce(cell, (draftCell) => {
      /** @see https://github.com/immerjs/immer/issues/839 for ts-ignore reason */
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      draftCell.data.linkRow.linkAndTargetEntities.push(newLinkAndTargetEntity);
    });

    // used onChange for optimistic loading
    onChange(newCell);
  };

  const sortedLinkAndTargetEntities = sortLinkAndTargetEntities(
    linkAndTargetEntities,
  );

  const canAddMore =
    maxItems === undefined || linkAndTargetEntities.length < maxItems;

  const linkedEntityIds = useMemo(
    () =>
      linkAndTargetEntities.map(
        ({ rightEntity }) => rightEntity.metadata.recordId.entityId,
      ),
    [linkAndTargetEntities],
  );

  return (
    <GridEditorWrapper>
      <Box sx={{ maxHeight: 300, overflowY: "auto" }}>
        {sortedLinkAndTargetEntities.map(
          ({ rightEntity, linkEntity, sourceSubgraph }) => {
            const linkEntityId = linkEntity.metadata.recordId.entityId;
            return (
              <LinkedEntityListRow
                key={linkEntityId}
                imageSrc={getImageUrlFromEntityProperties(
                  rightEntity.properties,
                )}
                title={generateEntityLabel(sourceSubgraph, rightEntity)}
                onDelete={() => {
                  const newCell = produce(cell, (draftCell) => {
                    draftCell.data.linkRow.linkAndTargetEntities =
                      draftCell.data.linkRow.linkAndTargetEntities.filter(
                        (item) =>
                          item.linkEntity.metadata.recordId.entityId !==
                          linkEntityId,
                      );
                  });

                  onChange(newCell);

                  markLinkEntityToArchive(linkEntityId);
                }}
              />
            );
          },
        )}
      </Box>
      {!canAddMore && <MaxItemsReached limit={maxItems} />}
      {canAddMore &&
        (addingLink ? (
          <EntitySelector
            includeDrafts={
              !!extractDraftIdFromEntityId(entity.metadata.recordId.entityId)
            }
            onSelect={onSelect}
            onFinishedEditing={onFinishedEditing}
            expectedEntityTypes={expectedEntityTypes}
            entityIdsToFilterOut={linkedEntityIds}
            linkEntityTypeId={linkEntityTypeId}
          />
        ) : (
          <AddAnotherButton
            title="Add Another Link"
            onClick={() => {
              setAddingLink(true);
            }}
          />
        ))}
    </GridEditorWrapper>
  );
};
