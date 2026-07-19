/**
 * In-memory ownership registry for detached optimization runs.
 *
 * NodeAPI is the only party allowed to talk to the optimizer, so it must
 * remember which authenticated account started each run: attachment and
 * cancellation requests are only honoured for the run's owner, and unknown
 * run ids answer 404 without revealing whether the run exists.
 *
 * The registry is deliberately process-local, mirroring the optimizer's own
 * in-memory run registry (both reset together on restart). Entries are
 * released when an attachment forwards the run's terminal event, when the
 * owner cancels the run, when the optimizer reports the run gone, or by the
 * lazy TTL sweep — a backstop for owners that never re-attach, comfortably
 * outlasting the optimizer's own detach-grace reaping.
 */

export const OPTIMIZATION_RUN_OWNER_TTL_MS = 45 * 60_000;

export type OptimizationRunOwner = {
  /** The authenticated account that created the run. */
  accountId: string;
  /** Epoch milliseconds at which the run was created. */
  createdAt: number;
  /**
   * Trials requested by the run's manifest, kept so attachments can
   * synthesize a schema-legal `complete` summary without the manifest.
   */
  requestedTrials: number;
};

export type OptimizationRunOwners = {
  /** Record a freshly created run for its owning account. */
  register: (
    runId: string,
    owner: { accountId: string; requestedTrials: number },
  ) => void;
  /** Return the live entry for a run id, if any. */
  get: (runId: string) => OptimizationRunOwner | undefined;
  /** Forget a run (terminal event observed, cancelled, or gone upstream). */
  release: (runId: string) => void;
  /** Return whether an account currently owns any live run. */
  hasLiveRunForAccount: (accountId: string) => boolean;
};

/** Create the run-ownership registry shared by the detached-run handlers. */
export const createOptimizationRunOwners = (
  now: () => number = Date.now,
): OptimizationRunOwners => {
  const owners = new Map<string, OptimizationRunOwner>();

  /** Drop expired entries; runs this old are long gone upstream. */
  const sweep = () => {
    const cutoff = now() - OPTIMIZATION_RUN_OWNER_TTL_MS;
    for (const [runId, owner] of owners) {
      if (owner.createdAt <= cutoff) {
        owners.delete(runId);
      }
    }
  };

  return {
    register: (runId, { accountId, requestedTrials }) => {
      sweep();
      owners.set(runId, { accountId, createdAt: now(), requestedTrials });
    },
    get: (runId) => {
      sweep();
      return owners.get(runId);
    },
    release: (runId) => {
      owners.delete(runId);
    },
    hasLiveRunForAccount: (accountId) => {
      sweep();
      for (const owner of owners.values()) {
        if (owner.accountId === accountId) {
          return true;
        }
      }
      return false;
    },
  };
};
