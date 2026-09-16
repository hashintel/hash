import type { PreparedExperiment } from "./describe-draft";
import type { DraftPetrinautExperimentInput } from "@hashintel/brunch-agent-plugin-sdcpn";
import type {
  PetrinautExperimentProgress,
  PetrinautExperimentResult,
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
  /** What the card prepared against the model at draft time; null if refused. */
  prepared: PreparedExperiment | null;
  /** Why preparation refused, when it did. */
  invalid: string | null;
  dismissed: boolean;
  run: SessionDraftRun;
};

type SessionDraftsState = {
  currentToolCallId: string | null;
  drafts: ReadonlyMap<string, SessionDraft>;
};

let state: SessionDraftsState = { currentToolCallId: null, drafts: new Map() };
const listeners = new Set<() => void>();

const publish = (next: SessionDraftsState) => {
  state = next;
  for (const listener of listeners) listener();
};

export const sessionDrafts = {
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get: (): SessionDraftsState => state,
  /** A new draft supersedes whichever draft was current. */
  register: (draft: SessionDraft) => {
    const drafts = new Map(state.drafts);
    drafts.set(draft.toolCallId, draft);
    publish({ currentToolCallId: draft.toolCallId, drafts });
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
  /** Test seam: forget every draft, as a reload would. */
  reset: () => publish({ currentToolCallId: null, drafts: new Map() }),
};
