import type {
  DraftLinksToCreate,
  DraftLinkState,
} from "./use-draft-link-state";
import type { EntityId } from "@blockprotocol/type-system";

/**
 * Create a function that marks a link entity for archival: if the link is an
 * as-yet-uncreated draft it is removed from the draft-create list, otherwise it
 * is added to the draft-archive list.
 *
 * This was previously a hook that read the draft link state from
 * `useEntityEditor`; it is now a plain factory so that the draft state can be
 * passed in as props/row data instead of via context.
 */
export const createMarkLinkEntityToArchive =
  ({
    draftLinksToCreate,
    setDraftLinksToCreate,
    setDraftLinksToArchive,
  }: Pick<
    DraftLinkState,
    "draftLinksToCreate" | "setDraftLinksToCreate" | "setDraftLinksToArchive"
  >) =>
  (linkEntityId: EntityId) => {
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

export type MarkLinkEntityToArchive = (linkEntityId: EntityId) => void;

export type { DraftLinksToCreate };
