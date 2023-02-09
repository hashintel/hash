import { ProvideEditorComponent } from "@glideapps/glide-data-grid";
import { getRoots } from "@local/hash-subgraph/src/stdlib/roots";
import { Entity, EntityId, VersionedUri } from "@local/hash-types";
import { Box } from "@mui/material";
import produce from "immer";
import { useMemo, useState } from "react";

import { generateEntityLabel } from "../../../../../../../../../lib/entities";
import { useMarkLinkEntityToArchive } from "../../../../../shared/use-mark-link-entity-to-archive";
import { useEntityEditor } from "../../../../entity-editor-context";
import { AddAnotherButton } from "../../../../properties-section/property-table/cells/value-cell/array-editor/add-another-button";
import { GridEditorWrapper } from "../../../../shared/grid-editor-wrapper";
import { LinkAndTargetEntity } from "../../types";
import { LinkedWithCell } from "../linked-with-cell";
import { sortLinkAndTargetEntities } from "../sort-link-and-target-entities";
import { EntitySelector } from "./entity-selector";
import { LinkedEntityListRow } from "./linked-entity-list-editor/linked-entity-list-row";
import { MaxItemsReached } from "./linked-entity-list-editor/max-items-reached";

export const createDraftLinkEntity = ({
  rightEntityId,
  leftEntityId,
  linkEntityTypeId,
}: {
  rightEntityId: EntityId;
  leftEntityId: EntityId;
  linkEntityTypeId: VersionedUri;
}): Entity => {
  return {
    properties: {},
    linkData: { rightEntityId, leftEntityId },
    metadata: {
      archived: false,
      editionId: { recordId: "", baseId: `draft%${Date.now()}` },
      entityTypeId: linkEntityTypeId,
      provenance: { updatedById: "" },
      version: {
        decisionTime: { start: "", end: null },
        transactionTime: { start: "", end: null },
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
  const [selectedLinkEntityId, setSelectedLinkEntityId] = useState<
    string | null
  >(null);

  const onSelect = (selectedEntity: Entity) => {
    const alreadyLinked = linkAndTargetEntities.find(
      ({ rightEntity }) =>
        rightEntity.metadata.recordId.entityId ===
        selectedEntity.metadata.recordId.entityId,
    );

    // if same entity is already linked, do nothing
    if (alreadyLinked) {
      return setAddingLink(false);
    }

    const leftEntityId = getRoots(entitySubgraph)[0]?.metadata.editionId
      .baseId as EntityId;
    const rightEntityId = selectedEntity.metadata.recordId.entityId;

    const linkEntity = createDraftLinkEntity({
      leftEntityId,
      rightEntityId,
      linkEntityTypeId,
    });

    const newLinkAndTargetEntity: LinkAndTargetEntity = {
      linkEntity,
      rightEntity: selectedEntity,
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

  const onCancel = () => {
    onFinishedEditing();
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
        {sortedLinkAndTargetEntities.map(({ rightEntity, linkEntity }) => {
          const linkEntityId = linkEntity.metadata.recordId.entityId;
          const selected = selectedLinkEntityId === linkEntityId;
          return (
            <LinkedEntityListRow
              key={linkEntityId}
              title={generateEntityLabel(entitySubgraph, rightEntity)}
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

                markLinkEntityToArchive(linkentityId);
              }}
              selected={selected}
              onSelect={() =>
                setSelectedLinkEntityId(selected ? null : linkEntityId)
              }
            />
          );
        })}
      </Box>
      {!canAddMore && <MaxItemsReached limit={maxItems} />}
      {canAddMore &&
        (addingLink ? (
          <EntitySelector
            onSelect={onSelect}
            onCancel={onCancel}
            expectedEntityTypes={expectedEntityTypes}
            entityIdsToFilterOut={linkedEntityIds}
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
