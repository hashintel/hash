import type { SavedSnapshot } from "../petrinaut-editor";
import type { HashSaveOutcome } from "@hashintel/brunch-agent";
import type {
  BrunchHostSave,
  ReadBrunchDocumentSaveState,
} from "@hashintel/brunch-agent/ui";

type Snapshot = NonNullable<SavedSnapshot>;

/**
 * Starts the editor's own Save of the open load, returning `null` when it
 * starts none. Its promise settles when the host's save does, rejecting when
 * that failed; `hostSaved` is called first with the snapshot the load is
 * about to hold, only while the load is still open.
 */
export type StartEditorSave = (
  hostSaved: (snapshot: Snapshot) => void,
) => Promise<void> | null;

const abandonErrors = {
  reloaded: "The editor reloaded before the save was confirmed.",
  closed: "The editor closed before the save was confirmed.",
} as const;

const abortReasonOf = (signal: AbortSignal): Error =>
  signal.reason instanceof Error
    ? signal.reason
    : new Error("The agent's save was aborted.");

/**
 * The agent's saves through the editor's own Save, from the person's approval
 * to the outcome Brunch reports, for an editor whose loads are told apart by
 * `Load` identity. A save is refused, as not started, when its `read` gives a
 * refusal; otherwise it runs the editor's Save and waits. A saved result
 * settles once the editor commits its snapshot in the same load, so its dirty
 * state is the one the editor then shows. An editor that commits another load
 * or closes first settles it as `abandon` says.
 *
 * Brunch runs one save at a time, and the editor refuses the agent's save of
 * a load whose earlier save still waits here, so at most one waits.
 */
export const createAgentSave = <Load>() => {
  let waiting: {
    load: Load;
    /** What the host's save wrote, once it resolved, compared with the committed snapshot by identity. */
    snapshot: Snapshot | null;
    settle: (outcome: HashSaveOutcome) => void;
  } | null = null;

  /**
   * The editor will never confirm the waiting save: one whose host save had
   * resolved settles as saved, with the convention that nothing is left
   * unsaved, otherwise as unconfirmed. A result arriving afterwards settles
   * nothing.
   */
  const abandon = (cause: keyof typeof abandonErrors) => {
    const abandoned = waiting;
    if (!abandoned) {
      return;
    }
    waiting = null;
    abandoned.settle(
      abandoned.snapshot
        ? {
            status: "saved",
            decisionTime: abandoned.snapshot.decisionTime,
            title: abandoned.snapshot.title,
            stillDirty: false,
          }
        : { status: "unconfirmed", error: abandonErrors[cause] },
    );
  };

  return {
    /**
     * The host save Brunch gets for `load`: its `read`, and running `start`
     * once the person approves. Aborting rejects without cancelling a save
     * already submitted.
     */
    hostSaveFor: (
      load: Load,
      {
        read,
        start,
      }: { read: ReadBrunchDocumentSaveState; start: StartEditorSave },
    ): BrunchHostSave => ({
      read,
      save: (documentId, signal) => {
        if (signal.aborted) {
          return Promise.reject(abortReasonOf(signal));
        }
        const { refusal } = read(documentId);
        if (refusal !== null) {
          return Promise.resolve({ status: "not-started", reason: refusal });
        }
        return new Promise<HashSaveOutcome>((resolve, reject) => {
          /** Ends listening for the abort once the save settles. */
          const listening = new AbortController();
          const started: NonNullable<typeof waiting> = {
            load,
            snapshot: null,
            settle: (outcome) => {
              listening.abort();
              resolve(outcome);
            },
          };
          const saving = start((snapshot) => {
            if (waiting === started) {
              started.snapshot = snapshot;
            }
          });
          if (!saving) {
            // Nothing was sent, but a rejection reaches the agent as a save
            // whose effect is unknown, so it is told not to save again until
            // asked.
            reject(new Error("The editor did not start the save."));
            return;
          }
          waiting = started;
          signal.addEventListener(
            "abort",
            () => {
              if (waiting === started) {
                waiting = null;
              }
              reject(abortReasonOf(signal));
            },
            { once: true, signal: listening.signal },
          );
          saving.catch((error: unknown) => {
            if (waiting !== started) {
              return;
            }
            waiting = null;
            started.settle({
              status: "unconfirmed",
              error: error instanceof Error ? error.message : String(error),
            });
          });
        });
      },
    }),
    /** An agent's save of `load` waits for the editor to confirm it. */
    occupies: (load: Load) => waiting !== null && waiting.load === load,
    /**
     * The editor committed `load`, holding `snapshot` as saved and dirty or
     * not against it: the waiting save of that snapshot settles as saved
     * with that dirty state, and one of another load is abandoned.
     */
    committed: (
      load: Load | undefined,
      snapshot: SavedSnapshot,
      isDirty: boolean,
    ) => {
      const current = waiting;
      if (!current) {
        return;
      }
      if (current.load !== load) {
        abandon("reloaded");
        return;
      }
      if (!current.snapshot || current.snapshot !== snapshot) {
        return;
      }
      waiting = null;
      current.settle({
        status: "saved",
        decisionTime: current.snapshot.decisionTime,
        title: current.snapshot.title,
        stillDirty: isDirty,
      });
    },
    abandon,
  };
};
