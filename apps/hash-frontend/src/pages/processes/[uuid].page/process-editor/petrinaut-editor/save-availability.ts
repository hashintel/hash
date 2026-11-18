import type { NetMode } from "../petrinaut-editor";

/** What decides whether the editor's Save may start now. */
export type SaveFacts = {
  /** The user may not edit or save the open net. */
  readonly: boolean;
  /** A save of the open net is waiting for its result. */
  saving: boolean;
  /** The open net has edits its last save doesn't include. */
  isDirty: boolean;
};

/** Why the editor's Save can't start now. */
export type SaveRefusal = "readonly" | "saving" | "clean";

/**
 * Whether the editor's Save may start, for the Save button and the agent's
 * save alike: `null` when it may, otherwise the first reason it can't.
 */
export const saveRefusal = ({
  readonly,
  saving,
  isDirty,
}: SaveFacts): SaveRefusal | null =>
  readonly ? "readonly" : saving ? "saving" : !isDirty ? "clean" : null;

const agentRefusalWording: Record<SaveRefusal, string> = {
  readonly: "The user can't edit this net, so they can't save it.",
  saving: "A save of this net is already in progress.",
  clean: "There are no unsaved changes to save.",
};

/**
 * Why the agent's save of `documentId` can't start, in the words it is told,
 * or `null` when it may. The agent saves only the saved net open in the
 * editor, from the load that offered it; a draft's button is Create, which
 * the agent never runs.
 */
export const agentSaveRefusal = (
  facts: SaveFacts & {
    /** The open net's mode, or `null` while none is open. */
    mode: NetMode | null;
    /** The save was offered by the load the editor has open, not an earlier one. */
    fromOpenLoad: boolean;
  },
  documentId: string,
): string | null => {
  if (facts.mode?.kind !== "saved") {
    return "The net is an unsaved draft, which the user creates with the editor's Create.";
  }
  if (!facts.fromOpenLoad || documentId !== facts.mode.entityId) {
    return "That isn't the net open in the editor.";
  }
  const refusal = saveRefusal(facts);
  return refusal === null ? null : agentRefusalWording[refusal];
};
