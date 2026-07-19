import type { OptimizationRunOwners } from "./optimization-run-owners";

/**
 * Per-account single-flight state shared by every optimization entry point.
 *
 * An account may drive at most one optimization at a time regardless of the
 * route family it uses: a live legacy stream, an in-flight detached-run
 * creation, and an owned detached run all occupy the account, and both the
 * legacy `POST …/optimize` handler and the detached `POST …/optimize/runs`
 * handler admit against this same superset.
 */
export type OptimizationAccountOccupancy = {
  /** Mark an account as streaming a legacy attached optimization. */
  beginStreaming: (accountId: string) => void;
  /** Clear an account's legacy streaming mark. */
  endStreaming: (accountId: string) => void;
  /** Mark an account's detached-run creation as in flight. */
  beginPendingRun: (accountId: string) => void;
  /** Clear an account's in-flight detached-run creation mark. */
  endPendingRun: (accountId: string) => void;
  /**
   * Whether the account has a live legacy stream or an in-flight create —
   * activity that no liveness probe can ever prove stale.
   */
  isAccountActive: (accountId: string) => boolean;
  /** The full superset: active per {@link isAccountActive} or owning a run. */
  isAccountBusy: (accountId: string) => boolean;
};

/** Create the occupancy tracker shared by both optimization route families. */
export const createOptimizationAccountOccupancy = (
  runOwners: OptimizationRunOwners,
): OptimizationAccountOccupancy => {
  const streamingAccountIds = new Set<string>();
  const pendingRunAccountIds = new Set<string>();

  const isAccountActive = (accountId: string): boolean =>
    streamingAccountIds.has(accountId) || pendingRunAccountIds.has(accountId);

  return {
    beginStreaming: (accountId) => {
      streamingAccountIds.add(accountId);
    },
    endStreaming: (accountId) => {
      streamingAccountIds.delete(accountId);
    },
    beginPendingRun: (accountId) => {
      pendingRunAccountIds.add(accountId);
    },
    endPendingRun: (accountId) => {
      pendingRunAccountIds.delete(accountId);
    },
    isAccountActive,
    isAccountBusy: (accountId) =>
      isAccountActive(accountId) || runOwners.hasLiveRunForAccount(accountId),
  };
};
