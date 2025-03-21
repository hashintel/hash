import { extractDraftIdFromEntityId } from "@blockprotocol/type-system";
import type { ProvideEditorComponent } from "@glideapps/glide-data-grid";
import type { HashEntity } from "@local/hash-graph-sdk/entity";

import { useMarkLinkEntityToArchive } from "../../../../../shared/use-mark-link-entity-to-archive";
import { useEntityEditor } from "../../../../entity-editor-context";
import type { LinkedWithCell } from "../linked-with-cell";
import {
  createDraftLinkEntity,
  LinkedEntityListEditor,
} from "./linked-entity-list-editor";
import { LinkedEntitySelector } from "./linked-entity-selector";

export const LinkedWithCellEditor: ProvideEditorComponent<LinkedWithCell> = (
  props,
) => {
  const { entity, setDraftLinksToCreate } = useEntityEditor();
  const markLinkEntityToArchive = useMarkLinkEntityToArchive();

  const { value: cell, onFinishedEditing } = props;
  const {
    expectedEntityTypes,
    linkAndTargetEntities,
    linkEntityTypeId,
    linkTitle,
    maxItems,
  } = cell.data.linkRow;

  const onSelectForSingleLink = (
    selectedEntity: HashEntity,
    selectedEntityLabel: string,
  ) => {
    const { linkEntity: currentLink, rightEntity: currentLinkedEntity } =
      linkAndTargetEntities[0] ?? {};

    const sameEntity =
      currentLinkedEntity?.metadata.recordId.entityId ===
      selectedEntity.metadata.recordId.entityId;

    // if clicked on the same entity, do nothing
    if (sameEntity) {
      return onFinishedEditing();
    }

    // if there is an existing link, archive it
    if (currentLink) {
      markLinkEntityToArchive(currentLink.metadata.recordId.entityId);
    }

    // create new link
    const linkEntity = createDraftLinkEntity({
      linkEntityTypeId,
      leftEntityId: entity.metadata.recordId.entityId,
      rightEntityId: selectedEntity.metadata.recordId.entityId,
    });

    const newLinkAndTargetEntity = {
      linkEntity,
      linkEntityLabel: linkTitle,
      rightEntity: selectedEntity,
      rightEntityLabel: selectedEntityLabel,
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
      linkAndTargetEntities[0]?.rightEntity.metadata.recordId.entityId;

    return (
      <LinkedEntitySelector
        includeDrafts={
          !!extractDraftIdFromEntityId(entity.metadata.recordId.entityId)
        }
        onSelect={onSelectForSingleLink}
        onFinishedEditing={onCancel}
        expectedEntityTypes={expectedEntityTypes}
        entityIdsToFilterOut={linkedEntityId && [linkedEntityId]}
        linkEntityTypeId={linkEntityTypeId}
      />
    );
  }

  return <LinkedEntityListEditor {...props} />;
};
