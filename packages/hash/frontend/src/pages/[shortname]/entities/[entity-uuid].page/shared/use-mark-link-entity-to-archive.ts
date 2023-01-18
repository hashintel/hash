import { EntityId } from "@local/hash-isomorphic-utils/types";

import { useEntityEditor } from "../entity-editor/entity-editor-context";

export const useMarkLinkEntityToArchive = () => {
  const { draftLinksToCreate, setDraftLinksToCreate, setDraftLinksToArchive } =
    useEntityEditor();

  const markLinkEntityToArchive = (linkEntityId: EntityId) => {
    const foundIndex = draftLinksToCreate.findIndex(
      (item) => item.linkEntity.metadata.editionId.baseId === linkEntityId,
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
