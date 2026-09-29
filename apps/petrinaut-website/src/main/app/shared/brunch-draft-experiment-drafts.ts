import type { PreparedExperiment } from "./brunch-draft-experiment-summary";
import type { DraftPetrinautExperimentInput } from "@hashintel/brunch-agent-plugin-sdcpn";
import type {
  PetrinautExperimentProgress,
  PetrinautExperimentResult,
  SDCPN,
} from "@hashintel/petrinaut-core";

/**
 * The one place a drafted experiment lives: this browser session, keyed by the
 * tool call that drafted it. Nothing here is written to the document or to
 * the conversation; a reload forgets every draft, which the card says.
 */
export type SessionDraftRun =
  | { phase: "idle" }
  | {
      phase: "running";
      controller: AbortController;
      progress: PetrinautExperimentProgress | null;
    }
  | { phase: "finished"; result: PetrinautExperimentResult }
  | { phase: "failed"; message: string };

export type SessionDraft = {
  toolCallId: string;
  input: DraftPetrinautExperimentInput;
  /** Frozen model the person reviewed, including simulation-only inputs. */
  definition: SDCPN;
  /** What the card prepared against the model at draft time; null if refused. */
  prepared: PreparedExperiment | null;
  /** Why preparation refused, when it did. */
  invalid: string | null;
  dismissed: boolean;
  run: SessionDraftRun;
};

export type SessionDraftsState = {
  currentToolCallId: string | null;
  drafts: ReadonlyMap<string, SessionDraft>;
};

const createSessionDrafts = () => {
  let state: SessionDraftsState = {
    currentToolCallId: null,
    drafts: new Map(),
  };
  const listeners = new Set<() => void>();
  const publish = (next: SessionDraftsState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  return {
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get: (): SessionDraftsState => state,
    /** Remounting an existing card must not revive it or supersede a newer one. */
    register: (draft: SessionDraft): SessionDraft => {
      const existing = state.drafts.get(draft.toolCallId);
      if (existing) return existing;
      const drafts = new Map(state.drafts);
      drafts.set(draft.toolCallId, draft);
      publish({ currentToolCallId: draft.toolCallId, drafts });
      return draft;
    },
    update: (
      toolCallId: string,
      patch: Partial<Omit<SessionDraft, "toolCallId">>,
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
let sessions = new WeakMap<object, ReturnType<typeof createSessionDrafts>>();
export const sessionDraftsFor = (definitionStore: object) => {
  let drafts = sessions.get(definitionStore);
  if (!drafts) {
    drafts = createSessionDrafts();
    sessions.set(definitionStore, drafts);
  }
  return drafts;
};

/** Test seam: forget every editor's drafts, as a reload would. */
export const resetSessionDrafts = () => {
  sessions = new WeakMap();
};
