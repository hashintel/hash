import { ProvideEditorComponent } from "@glideapps/glide-data-grid";
import { EntityId } from "@local/hash-isomorphic-utils/types";
import { Entity } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/src/stdlib/roots";

import { useMarkLinkEntityToArchive } from "../../../../../shared/use-mark-link-entity-to-archive";
import { useEntityEditor } from "../../../../entity-editor-context";
import { LinkAndTargetEntity } from "../../types";
import { LinkedWithCell } from "../linked-with-cell";
import { EntitySelector } from "./entity-selector";
import {
  createDraftLinkEntity,
  LinkedEntityListEditor,
} from "./linked-entity-list-editor";

export const LinkedWithCellEditor: ProvideEditorComponent<LinkedWithCell> = (
  props,
) => {
  const { entitySubgraph, setDraftLinksToCreate } = useEntityEditor();
  const markLinkEntityToArchive = useMarkLinkEntityToArchive();

  const { value: cell, onFinishedEditing } = props;
  const {
    expectedEntityTypes,
    linkAndTargetEntities,
    linkEntityTypeId,
    maxItems,
  } = cell.data.linkRow;

  const onSelectForSingleLink = (selectedEntity: Entity) => {
    const { linkEntity: currentLink, rightEntity: currentLinkedEntity } =
      linkAndTargetEntities[0] ?? {};

    const sameEntity =
      currentLinkedEntity?.metadata.editionId.baseId ===
      selectedEntity.metadata.editionId.baseId;

    // if clicked on the same entity, do nothing
    if (sameEntity) {
      return onFinishedEditing();
    }

    // if there is an existing link, archive it
    if (currentLink) {
      markLinkEntityToArchive(
        currentLink.metadata.editionId.baseId as EntityId,
      );
    }

    // create new link
    const linkEntity = createDraftLinkEntity({
      linkEntityTypeId,
      leftEntityId: getRoots(entitySubgraph)[0]?.metadata.editionId
        .baseId as EntityId,
      rightEntityId: selectedEntity.metadata.editionId.baseId as EntityId,
    });

    const newLinkAndTargetEntity: LinkAndTargetEntity = {
      linkEntity,
      rightEntity: selectedEntity,
    };

    setDraftLinksToCreate((prev) => [...prev, newLinkAndTargetEntity]);

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
