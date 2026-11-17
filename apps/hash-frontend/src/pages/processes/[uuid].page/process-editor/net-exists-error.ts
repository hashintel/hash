import type { SavedSnapshot } from "./petrinaut-editor";
import type { EntityId } from "@blockprotocol/type-system";

/**
 * A Create refused because the net it was to create exists already and the
 * user can see it, as when another tab of the same draft created it first.
 * Nothing was written. The draft becomes that saved net, with its latest
 * revision as the saved state, so edits not in it stay unsaved and the next
 * save updates it.
 */
export class NetExistsError extends Error {
  readonly entityId: EntityId;
  readonly savedSnapshot: NonNullable<SavedSnapshot>;
  readonly userEditable: boolean;

  constructor({
    entityId,
    savedSnapshot,
    userEditable,
  }: {
    entityId: EntityId;
    savedSnapshot: NonNullable<SavedSnapshot>;
    userEditable: boolean;
  }) {
    super(
      "The process was not created because it exists already, saved from elsewhere. Its saved version is now open, with these edits still unsaved; saving again updates it.",
    );
    this.name = "NetExistsError";
    this.entityId = entityId;
    this.savedSnapshot = savedSnapshot;
    this.userEditable = userEditable;
  }
}
