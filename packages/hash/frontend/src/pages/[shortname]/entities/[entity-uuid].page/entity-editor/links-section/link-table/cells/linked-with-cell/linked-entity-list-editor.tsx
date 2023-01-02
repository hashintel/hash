import { ProvideEditorComponent } from "@glideapps/glide-data-grid";
import { EntityId, OwnedById } from "@hashintel/hash-shared/types";
import { Entity } from "@hashintel/hash-subgraph";
import { getRoots } from "@hashintel/hash-subgraph/src/stdlib/roots";
import { Box } from "@mui/material";
import produce from "immer";
import { useContext, useMemo, useState } from "react";

import { useBlockProtocolArchiveEntity } from "../../../../../../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-archive-entity";
import { useBlockProtocolCreateEntity } from "../../../../../../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-create-entity";
import { generateEntityLabel } from "../../../../../../../../../lib/entities";
import { WorkspaceContext } from "../../../../../../../../shared/workspace-context";
import { useEntityEditor } from "../../../../entity-editor-context";
import { AddAnotherButton } from "../../../../properties-section/property-table/cells/value-cell/array-editor/add-another-button";
import { GridEditorWrapper } from "../../../../shared/grid-editor-wrapper";
import { LinkedWithCell } from "../linked-with-cell";
import { sortLinkAndTargetEntities } from "../sort-link-and-target-entities";
import { EntitySelector } from "./entity-selector";
import { LinkedEntityListRow } from "./linked-entity-list-editor/linked-entity-list-row";
import { MaxItemsReached } from "./linked-entity-list-editor/max-items-reached";

export const LinkedEntityListEditor: ProvideEditorComponent<LinkedWithCell> = (
  props,
) => {
  const { activeWorkspaceAccountId } = useContext(WorkspaceContext);

  const { entitySubgraph, refetch } = useEntityEditor();
  const { createEntity } = useBlockProtocolCreateEntity(
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
    (activeWorkspaceAccountId as OwnedById) ?? null,
  );
  const { archiveEntity } = useBlockProtocolArchiveEntity();

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

  const onSelect = async (selectedEntity: Entity) => {
    const alreadyLinked = linkAndTargetEntities.find(
      ({ rightEntity }) =>
        rightEntity.metadata.editionId.baseId ===
        selectedEntity.metadata.editionId.baseId,
    );

    // if same entity is already linked, do nothing
    if (alreadyLinked) {
      return setAddingLink(false);
    }

    // create new link
    const { data: linkEntity } = await createEntity({
      data: {
        entityTypeId: linkEntityTypeId,
        properties: {},
        linkData: {
          leftEntityId: getRoots(entitySubgraph)[0]?.metadata.editionId.baseId!,
          rightEntityId: selectedEntity.metadata.editionId.baseId,
        },
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- improve logic or types to remove this comment
    if (!linkEntity || linkEntity === undefined) {
      throw new Error("failed to create link");
    }

    setAddingLink(false);

    const newCell = produce(cell, (draftCell) => {
      /** @see https://github.com/immerjs/immer/issues/839 for ts-ignore reason */
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      draftCell.data.linkRow.linkAndTargetEntities.push({
        linkEntity,
        rightEntity: selectedEntity,
      });
    });

    // used onChange for optimistic loading
    onChange(newCell);

    await refetch();
  };

  const onCancel = () => {
    onFinishedEditing();
  };

  const sortedLinkAndTargetEntities = sortLinkAndTargetEntities(
    linkAndTargetEntities,
  );

  const canAddMore = linkAndTargetEntities.length < maxItems;

  const linkedEntityIds = useMemo(
    () =>
      linkAndTargetEntities.map(
        ({ rightEntity }) => rightEntity.metadata.editionId.baseId,
      ),
    [linkAndTargetEntities],
  );

  return (
    <GridEditorWrapper>
      <Box sx={{ maxHeight: 300, overflowY: "auto" }}>
        {sortedLinkAndTargetEntities.map(({ rightEntity, linkEntity }) => {
          const linkEntityId = linkEntity.metadata.editionId.baseId;
          const selected = selectedLinkEntityId === linkEntityId;
          return (
            <LinkedEntityListRow
              key={linkEntityId}
              title={generateEntityLabel(entitySubgraph, rightEntity)}
              onDelete={async () => {
                const newCell = produce(cell, (draftCell) => {
                  draftCell.data.linkRow.linkAndTargetEntities =
                    draftCell.data.linkRow.linkAndTargetEntities.filter(
                      (item) =>
                        item.linkEntity.metadata.editionId.baseId !==
                        linkEntityId,
                    );
                });

                onChange(newCell);

                await archiveEntity({
                  data: {
                    entityId: linkEntity.metadata.editionId.baseId as EntityId,
                  },
                });

                await refetch();
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
