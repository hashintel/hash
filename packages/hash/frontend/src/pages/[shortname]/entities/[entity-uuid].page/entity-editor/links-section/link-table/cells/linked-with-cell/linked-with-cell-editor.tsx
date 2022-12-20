import { ProvideEditorComponent } from "@glideapps/glide-data-grid";
import { Entity } from "@hashintel/hash-subgraph";
import { getRoots } from "@hashintel/hash-subgraph/src/stdlib/roots";
import { useContext } from "react";
import { EntityId, OwnedById } from "@hashintel/hash-shared/types";
import { useBlockProtocolArchiveEntity } from "../../../../../../../../../components/hooks/blockProtocolFunctions/knowledge/useBlockProtocolArchiveEntity";
import { useBlockProtocolCreateEntity } from "../../../../../../../../../components/hooks/blockProtocolFunctions/knowledge/useBlockProtocolCreateEntity";
import { useEntityEditor } from "../../../../entity-editor-context";
import { LinkedWithCell } from "../linked-with-cell";
import { EntitySelector } from "./entity-selector";
import { LinkedEntityListEditor } from "./linked-entity-list-editor";
import { WorkspaceContext } from "../../../../../../../../shared/workspace-context";

export const LinkedWithCellEditor: ProvideEditorComponent<LinkedWithCell> = (
  props,
) => {
  const { activeWorkspaceAccountId } = useContext(WorkspaceContext);
  const { entitySubgraph, refetch } = useEntityEditor();
  const { createEntity } = useBlockProtocolCreateEntity(
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
    (activeWorkspaceAccountId as OwnedById) ?? null,
  );
  const { archiveEntity } = useBlockProtocolArchiveEntity();

  const { value: cell, onFinishedEditing } = props;
  const {
    expectedEntityTypes,
    linkAndTargetEntities,
    linkEntityTypeId,
    maxItems,
  } = cell.data.linkRow;

  const onSelectForSingleLink = async (val: Entity) => {
    const { linkEntity: currentLink, rightEntity: currentLinkedEntity } =
      linkAndTargetEntities[0] ?? {};

    const sameEntity =
      currentLinkedEntity?.metadata.editionId.baseId ===
      val.metadata.editionId.baseId;

    // if clicked on the same entity, do nothing
    if (sameEntity) {
      return onFinishedEditing();
    }

    // if there is an existing link, archive it
    if (currentLink) {
      await archiveEntity({
        data: { entityId: currentLink.metadata.editionId.baseId as EntityId },
      });
    }

    // create new link
    await createEntity({
      data: {
        entityTypeId: linkEntityTypeId,
        properties: {},
        linkData: {
          leftEntityId: getRoots(entitySubgraph)[0]?.metadata.editionId.baseId!,
          rightEntityId: val.metadata.editionId.baseId,
        },
      },
    });

    await refetch();
    onFinishedEditing(undefined);
  };

  const onCancel = () => {
    onFinishedEditing();
  };

  // if there could be one linked entity, just render the entity selector
  if (maxItems === 1) {
    const linkedEntityId =
      linkAndTargetEntities[0]?.rightEntity.metadata.editionId.baseId;

    return (
      <EntitySelector
        onSelect={onSelectForSingleLink}
        onCancel={onCancel}
        expectedEntityTypes={expectedEntityTypes}
        entityIdsToFilterOut={linkedEntityId && [linkedEntityId]}
      />
    );
  }

  return <LinkedEntityListEditor {...props} />;
};
