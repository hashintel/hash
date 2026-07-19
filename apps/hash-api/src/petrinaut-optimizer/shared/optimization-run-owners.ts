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
 * released when an attachment delivers the run's terminal event, when the
 * owner cancels the run, when the optimizer reports the run gone, or by the
 * lazy TTL sweep — a backstop for owners that never re-attach, comfortably
 * outlasting the optimizer's own detach-grace reaping. The sweep expires on
 * inactivity (`lastSeenAt`, refreshed by every run lookup) rather than age,
 * so a legitimately long run whose owner keeps attaching or re-attaching is
 * never swept mid-run.
 */

export const OPTIMIZATION_RUN_OWNER_TTL_MS = 45 * 60_000;

export type OptimizationRunOwner = {
  /** The authenticated account that created the run. */
  accountId: string;
  /** Epoch milliseconds at which the run was created. */
  createdAt: number;
  /** Epoch milliseconds at which the entry was last looked up by run id. */
  lastSeenAt: number;
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
  /** Return the live entry for a run id, refreshing its inactivity clock. */
  get: (runId: string) => OptimizationRunOwner | undefined;
  /** Forget a run (terminal event delivered, cancelled, or gone upstream). */
  release: (runId: string) => void;
  /** Return an account's live run, without refreshing its inactivity clock. */
  findLiveRunForAccount: (
    accountId: string,
  ) => { runId: string; owner: OptimizationRunOwner } | undefined;
  /** Return whether an account currently owns any live run. */
  hasLiveRunForAccount: (accountId: string) => boolean;
};

/** Create the run-ownership registry shared by the detached-run handlers. */
export const createOptimizationRunOwners = (
  now: () => number = Date.now,
): OptimizationRunOwners => {
  const owners = new Map<string, OptimizationRunOwner>();

  /** Drop inactive entries; runs untouched this long are long gone upstream. */
  const sweep = () => {
    const cutoff = now() - OPTIMIZATION_RUN_OWNER_TTL_MS;
    for (const [runId, owner] of owners) {
      if (owner.lastSeenAt <= cutoff) {
        owners.delete(runId);
      }
    }
  };

  const findLiveRunForAccount: OptimizationRunOwners["findLiveRunForAccount"] =
    (accountId) => {
      sweep();
      for (const [runId, owner] of owners) {
        if (owner.accountId === accountId) {
          return { runId, owner };
        }
      }
      return undefined;
    };

  return {
    register: (runId, { accountId, requestedTrials }) => {
      sweep();
      const createdAt = now();
      owners.set(runId, {
        accountId,
        createdAt,
        lastSeenAt: createdAt,
        requestedTrials,
      });
    },
    get: (runId) => {
      sweep();
      const owner = owners.get(runId);
      if (owner) {
        // Every attach and cancel goes through here, and attach cycles are
        // bounded by the per-attachment overall timeout, so an actively
        // consumed run keeps its entry alive for the whole study.
        owner.lastSeenAt = now();
      }
      return owner;
    },
    release: (runId) => {
      owners.delete(runId);
    },
    findLiveRunForAccount,
    hasLiveRunForAccount: (accountId) =>
      findLiveRunForAccount(accountId) !== undefined,
  };
};
