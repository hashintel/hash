import type { PreparedExperiment } from "./describe-draft";
import type { DraftPetrinautExperimentInput } from "@hashintel/brunch-agent-plugin-sdcpn";
import type {
  PetrinautExperimentProgress,
  PetrinautExperimentResult,
  SDCPN,
} from "@hashintel/petrinaut-core";

/** Editor-local memory only: neither the document nor Flue history stores Run or Dismiss. */
type EditorDraftRun =
  | { phase: "idle" }
  | {
      phase: "running";
      controller: AbortController;
      progress: PetrinautExperimentProgress | null;
    }
  | { phase: "finished"; result: PetrinautExperimentResult }
  | { phase: "failed"; message: string };

type EditorDraft = {
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
};

type EditorDraftsState = {
  currentToolCallId: string | null;
  drafts: ReadonlyMap<string, EditorDraft>;
};

const createEditorDrafts = () => {
  let state: EditorDraftsState = {
    currentToolCallId: null,
    drafts: new Map(),
  };
  const listeners = new Set<() => void>();
  const publish = (next: EditorDraftsState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  return {
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get: (): EditorDraftsState => state,
    /** Remounting an existing card must not revive it or supersede a newer one. */
    register: (draft: EditorDraft): EditorDraft => {
      const existing = state.drafts.get(draft.toolCallId);
      if (existing) return existing;
      const drafts = new Map(state.drafts);
      drafts.set(draft.toolCallId, draft);
      publish({ currentToolCallId: draft.toolCallId, drafts });
      return draft;
    },
    update: (
      toolCallId: string,
      patch: Partial<Omit<EditorDraft, "toolCallId">>,
    ) => {
      const existing = state.drafts.get(toolCallId);
      if (!existing) return;
      const drafts = new Map(state.drafts);
      drafts.set(toolCallId, { ...existing, ...patch });
      publish({ ...state, drafts });
    },
  };
};

// The definition store survives panel remounts, but belongs to one editor.
// Weak keys release drafts when that editor is disposed rather than retaining
// every model and run in a tab-wide singleton.
let editors = new WeakMap<object, ReturnType<typeof createEditorDrafts>>();
export const editorDraftsFor = (definitionStore: object) => {
  let drafts = editors.get(definitionStore);
  if (!drafts) {
    drafts = createEditorDrafts();
    editors.set(definitionStore, drafts);
  }
  return drafts;
};

/** Test seam: forget every editor's drafts, as a reload would. */
export const resetEditorDrafts = () => {
  editors = new WeakMap();
};
