import type {
  ActorEntityUuid,
  EntityId,
  VersionedUrl,
} from "@blockprotocol/type-system";
import {
  currentTimestamp,
  extractDraftIdFromEntityId,
} from "@blockprotocol/type-system";
import type { ProvideEditorComponent } from "@glideapps/glide-data-grid";
import { HashEntity } from "@local/hash-graph-sdk/entity";
import { Box } from "@mui/material";
import { produce } from "immer";
import { useMemo, useState } from "react";

import { getImageUrlFromEntityProperties } from "../../../../../../get-file-properties";
import { useMarkLinkEntityToArchive } from "../../../../../shared/use-mark-link-entity-to-archive";
import { useEntityEditor } from "../../../../entity-editor-context";
import { AddAnotherButton } from "../../../../properties-section/property-table/cells/value-cell/array-editor/add-another-button";
import { GridEditorWrapper } from "../../../../shared/grid-editor-wrapper";
import type { LinkedWithCell } from "../linked-with-cell";
import { sortLinkAndTargetEntities } from "../sort-link-and-target-entities";
import { LinkedEntityListRow } from "./linked-entity-list-editor/linked-entity-list-row";
import { MaxItemsReached } from "./linked-entity-list-editor/max-items-reached";
import { LinkedEntitySelector } from "./linked-entity-selector";

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
}): HashEntity =>
  new HashEntity({
    properties: {},
    linkData: { rightEntityId, leftEntityId },
    metadata: {
      archived: false,
      recordId: { editionId: "", entityId: `draft~${Date.now()}` as EntityId },
      entityTypeIds: [linkEntityTypeId],
      provenance: {
        createdById: "" as ActorEntityUuid,
        createdAtTransactionTime: currentTimestamp(),
        createdAtDecisionTime: currentTimestamp(),
        edition: {
          createdById: "" as ActorEntityUuid,
          actorType: "user",
          origin: { type: "api" },
        },
      },
      temporalVersioning: {
        decisionTime: {
          start: {
            kind: "inclusive",
            limit: currentTimestamp(),
          },
          end: {
            kind: "unbounded",
          },
        },
        transactionTime: {
          start: {
            kind: "inclusive",
            limit: currentTimestamp(),
          },
          end: {
            kind: "unbounded",
          },
        },
      },
    },
  });

export const LinkedEntityListEditor: ProvideEditorComponent<LinkedWithCell> = (
  props,
) => {
  const { entity, draftLinksToCreate, setDraftLinksToCreate, readonly } =
    useEntityEditor();
  const markLinkEntityToArchive = useMarkLinkEntityToArchive();

  const { value: cell, onFinishedEditing, onChange } = props;
  const {
    expectedEntityTypes,
    linkAndTargetEntities,
    linkEntityTypeId,
    linkTitle,
    maxItems,
  } = cell.data.linkRow;

  const [addingLink, setAddingLink] = useState(!linkAndTargetEntities.length);

  const onSelect = (selectedEntity: HashEntity, entityLabel: string) => {
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
      rightEntityLabel: entityLabel,
      linkEntityLabel: linkTitle,
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
          ({ rightEntity, linkEntity, rightEntityLabel }) => {
            const linkEntityId = linkEntity.metadata.recordId.entityId;

            const isUncreatedDraftLink = draftLinksToCreate.some(
              (draftLink) =>
                draftLink.linkEntity.metadata.recordId.entityId ===
                linkEntityId,
            );

            return (
              <LinkedEntityListRow
                key={linkEntityId}
                closeEditor={onFinishedEditing}
                entityId={
                  isUncreatedDraftLink
                    ? /**
                       * If the link hasn't yet been created, we can't open it in the slideover. So we open the target entity instead.
                       * In case the link entity HAS been created, it's more useful to open the link entity itself (to be able to see any attributes on the link).
                       * Ideally we'd be able to also be able to edit the properties of the draft link entity.
                       */
                      rightEntity.metadata.recordId.entityId
                    : linkEntityId
                }
                imageSrc={getImageUrlFromEntityProperties(
                  rightEntity.properties,
                )}
                title={rightEntityLabel}
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
        !readonly &&
        (addingLink ? (
          <LinkedEntitySelector
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
