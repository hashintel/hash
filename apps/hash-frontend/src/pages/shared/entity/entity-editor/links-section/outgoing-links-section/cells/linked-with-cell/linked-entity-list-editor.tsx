import { Box } from "@mui/material";
import { produce } from "immer";
import { useMemo, useState } from "react";

import { extractDraftIdFromEntityId } from "@blockprotocol/type-system";

import { getImageUrlFromEntityProperties } from "../../../../../../get-file-properties";
import { AddAnotherButton } from "../../../../properties-section/property-table/cells/value-cell/array-editor/add-another-button";
import { GridEditorWrapper } from "../../../../shared/grid-editor-wrapper";
import { sortLinkAndTargetEntities } from "../sort-link-and-target-entities";
import { createDraftLinkEntity } from "./create-draft-link-entity";
import { LinkedEntityListRow } from "./linked-entity-list-editor/linked-entity-list-row";
import { MaxItemsReached } from "./linked-entity-list-editor/max-items-reached";
import { LinkedEntitySelector } from "./linked-entity-selector";

import type { LinkedWithCell } from "../linked-with-cell";
import type { ProvideEditorComponent } from "@glideapps/glide-data-grid";
import type { HashEntity } from "@local/hash-graph-sdk/entity";

export const LinkedEntityListEditor: ProvideEditorComponent<LinkedWithCell> = (
  props,
) => {
  const { value: cell, onFinishedEditing, onChange } = props;
  const {
    draftLinksToCreate,
    entity,
    expectedEntityTypes,
    linkAndTargetEntities,
    linkEntityTypeId,
    linkTitle,
    markLinkAsArchived,
    maxItems,
    onEntityClick,
    readonly,
    setDraftLinksToCreate,
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
                onEntityClick={onEntityClick}
                readonly={readonly}
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

                  markLinkAsArchived(linkEntityId);
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
            entity={entity}
            includeDrafts={
              !!extractDraftIdFromEntityId(entity.metadata.recordId.entityId)
            }
            onSelect={onSelect}
            onFinishedEditing={onFinishedEditing}
            expectedEntityTypes={expectedEntityTypes}
            entityIdsToFilterOut={linkedEntityIds}
            linkEntityTypeId={linkEntityTypeId}
            readonly={readonly}
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
