import { faTrash } from "@fortawesome/free-solid-svg-icons";
import { ProvideEditorComponent } from "@glideapps/glide-data-grid";
import { Button } from "@hashintel/hash-design-system";
import { Entity } from "@hashintel/hash-subgraph";
import { getRoots } from "@hashintel/hash-subgraph/src/stdlib/roots";
import { Box } from "@mui/material";
import produce from "immer";
import { useContext, useState } from "react";
import { useBlockProtocolArchiveEntity } from "../../../../../../../../../components/hooks/blockProtocolFunctions/knowledge/useBlockProtocolArchiveEntity";
import { useBlockProtocolCreateEntity } from "../../../../../../../../../components/hooks/blockProtocolFunctions/knowledge/useBlockProtocolCreateEntity";
import { generateEntityLabel } from "../../../../../../../../../lib/entities";
import { WorkspaceContext } from "../../../../../../../../shared/workspace-context";
import { useEntityEditor } from "../../../../entity-editor-context";
import { AddAnotherButton } from "../../../../properties-section/property-table/cells/value-cell/value-cell-editor/array-editor/add-another-button";
import { RowAction } from "../../../../properties-section/property-table/cells/value-cell/value-cell-editor/array-editor/row-action";
import { ValueChip } from "../../../../properties-section/property-table/cells/value-cell/value-cell-editor/array-editor/value-chip";
import { LinkedWithCell } from "../linked-with-cell";
import { EntitySelector } from "./entity-selector";

const LinkArrayRow = ({
  title,
  onDelete,
  selected,
  onSelect,
}: {
  title: string;
  selected: boolean;
  onDelete: () => void;
  onSelect: () => void;
}) => {
  const [hovered, setHovered] = useState(false);

  const shouldShowActions = hovered || selected;
  return (
    <Box
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      sx={{
        height: 48,
        display: "flex",
        alignItems: "center",
        borderBottom: "1px solid",
        borderColor: "gray.20",
        position: "relative",
        outline: "none",
        px: 1.5,
      }}
      onClick={onSelect}
    >
      <ValueChip selected={selected} value={title} />

      {shouldShowActions && (
        <Box
          display="flex"
          sx={{
            position: "absolute",
            inset: 0,
            left: "unset",
            "::before": {
              content: `""`,
              width: 50,
              background: `linear-gradient(90deg, transparent 0%, white 100%)`,
            },
          }}
        >
          <Box sx={{ display: "flex", background: "white" }}>
            <RowAction tooltip="Delete" icon={faTrash} onClick={onDelete} />
          </Box>
        </Box>
      )}
    </Box>
  );
};

const MaxItemsReached = ({ limit }: { limit: number }) => {
  return (
    <Button
      disabled
      size="small"
      variant="tertiary_quiet"
      fullWidth
      sx={{ justifyContent: "flex-start", borderRadius: 0 }}
    >
      Max Items ({limit}) Reached
    </Button>
  );
};

export const LinkArrayEditor: ProvideEditorComponent<LinkedWithCell> = (
  props,
) => {
  const { activeWorkspaceAccountId } = useContext(WorkspaceContext);

  const { entitySubgraph, refetch } = useEntityEditor();
  const { createEntity } = useBlockProtocolCreateEntity(
    activeWorkspaceAccountId ?? null,
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
  const [selectedLinkEntityId, setSelectedLinkEntityId] = useState("");

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

  const sortedLinkAndTargetEntities = [...linkAndTargetEntities].sort((a, b) =>
    a.linkEntity.metadata.editionId.version.localeCompare(
      b.linkEntity.metadata.editionId.version,
    ),
  );

  const canAddMore = linkAndTargetEntities.length < maxItems;

  return (
    <Box
      sx={(theme) => ({
        border: "1px solid",
        borderColor: "gray.30",
        borderRadius: theme.borderRadii.lg,
        background: "white",
        overflow: "hidden",
      })}
    >
      <Box sx={{ maxHeight: 300, overflowY: "scroll" }}>
        {sortedLinkAndTargetEntities.map(({ rightEntity, linkEntity }) => {
          const linkEntityId = linkEntity.metadata.editionId.baseId;
          const selected = selectedLinkEntityId === linkEntityId;
          return (
            <LinkArrayRow
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
                  data: { entityId: linkEntity.metadata.editionId.baseId },
                });

                await refetch();
              }}
              selected={selected}
              onSelect={() =>
                setSelectedLinkEntityId(selected ? "" : linkEntityId)
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
            entityIdsToFilterOut={linkAndTargetEntities.map(
              ({ rightEntity }) => rightEntity.metadata.editionId.baseId,
            )}
          />
        ) : (
          <AddAnotherButton
            title="Add Another Link"
            onClick={() => {
              setAddingLink(true);
            }}
          />
        ))}
    </Box>
  );
};
