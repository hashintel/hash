import { createReadableStore } from "@hashintel/petrinaut-core";

import type { DraftPetrinautExperimentInput } from "@hashintel/brunch-agent-plugin-sdcpn";
import type {
  PetrinautExperimentProgress,
  PetrinautExperimentResult,
  SDCPN,
} from "@hashintel/petrinaut-core";
import type { prepareExperiment } from "@hashintel/petrinaut/ui/plugin";

export type PreparedExperiment = ReturnType<typeof prepareExperiment>;

/** Editor-local memory only: neither the document nor Flue history stores Run or Dismiss. */
type EditorDraftRun =
  | { phase: "idle" }
  | {
      phase: "running";
      controller: AbortController;
      progress: PetrinautExperimentProgress | null;
    }
  | { phase: "finished"; result: PetrinautExperimentResult }
  | {
      phase: "failed";
      message: string;
      /** The host's error result, when it reported one rather than throwing. */
      result?: PetrinautExperimentResult;
    };

export type EditorDraft = {
  toolCallId: string;
  input: DraftPetrinautExperimentInput;
  /** Frozen model the person reviewed, including simulation-only inputs. */
  definition: SDCPN;
  /** What the card prepared against the model at draft time; null if refused. */
  prepared: PreparedExperiment | null;
  /** Why preparation refused, when it did. */
  invalid: string | null;
  dismissed: boolean;
  run: EditorDraftRun;
  /** One completion turn per local run, independent of the original tool output. */
  followUp?: "pending" | "sent" | "failed";
};

type EditorDraftsState = {
  currentToolCallId: string | null;
  drafts: ReadonlyMap<string, EditorDraft>;
};

/**
 * The experiments Brunch drafted in this editor, with what the person did
 * with each. Create one per plugin: the drafts live as long as it runs.
 */
export const createEditorDrafts = () => {
  const store = createReadableStore<EditorDraftsState>({
    currentToolCallId: null,
    drafts: new Map(),
  });
  return {
    subscribe: (listener: () => void) => store.subscribe(listener),
    get: () => store.get(),
    /** Remounting an existing card must not revive it or supersede a newer one. */
    register: (draft: EditorDraft): EditorDraft => {
      const state = store.get();
      const existing = state.drafts.get(draft.toolCallId);
      if (existing) return existing;
      const drafts = new Map(state.drafts);
      drafts.set(draft.toolCallId, draft);
      store.set({ currentToolCallId: draft.toolCallId, drafts });
      return draft;
    },
    update: (
      toolCallId: string,
      patch: Partial<Omit<EditorDraft, "toolCallId">>,
    ) => {
      const state = store.get();
      const existing = state.drafts.get(toolCallId);
      if (!existing) return;
      const drafts = new Map(state.drafts);
      drafts.set(toolCallId, { ...existing, ...patch });
      store.set({ ...state, drafts });
    },
  };
};

export type EditorDrafts = ReturnType<typeof createEditorDrafts>;
