import type { EntityId } from "@local/hash-graph-types/entity";

import { useEntityEditor } from "../entity-editor/entity-editor-context";

export const useMarkLinkEntityToArchive = () => {
  const { draftLinksToCreate, setDraftLinksToCreate, setDraftLinksToArchive } =
    useEntityEditor();

  const markLinkEntityToArchive = (linkEntityId: EntityId) => {
    const foundIndex = draftLinksToCreate.findIndex(
      (item) => item.linkEntity.metadata.recordId.entityId === linkEntityId,
    );

    if (foundIndex !== -1) {
      setDraftLinksToCreate((previous) => {
        const clone = [...previous];

        clone.splice(foundIndex, 1);

        return clone;
      });
    } else {
      setDraftLinksToArchive((previous) => [...previous, linkEntityId]);
    }
  };

  return markLinkEntityToArchive;
};
