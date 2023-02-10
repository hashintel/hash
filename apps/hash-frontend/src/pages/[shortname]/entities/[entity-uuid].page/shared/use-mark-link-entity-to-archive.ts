import { EntityId } from "@local/hash-subgraph/main";

import { useEntityEditor } from "../entity-editor/entity-editor-context";

export const useMarkLinkEntityToArchive = () => {
  const { draftLinksToCreate, setDraftLinksToCreate, setDraftLinksToArchive } =
    useEntityEditor();

  const markLinkEntityToArchive = (linkEntityId: EntityId) => {
    const foundIndex = draftLinksToCreate.findIndex(
      (item) => item.linkEntity.metadata.recordId.entityId === linkEntityId,
    );

    if (foundIndex !== -1) {
      setDraftLinksToCreate((prev) => {
        const clone = [...prev];
        clone.splice(foundIndex, 1);
        return clone;
      });
    } else {
      setDraftLinksToArchive((prev) => [...prev, linkEntityId]);
    }
  };

  return markLinkEntityToArchive;
};
