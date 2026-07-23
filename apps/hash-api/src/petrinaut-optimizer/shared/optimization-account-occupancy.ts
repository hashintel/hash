/**
 * Per-account single-flight state for optimization-run creation.
 *
 * An account may drive at most one optimization at a time: an in-flight
 * detached-run creation occupies the account until the optimizer has
 * answered, at which point ownership (tracked separately in
 * `OptimizationRunOwners`) takes over.
 */
export type OptimizationAccountOccupancy = {
  /** Mark an account's detached-run creation as in flight. */
  beginPendingRun: (accountId: string) => void;
  /** Clear an account's in-flight detached-run creation mark. */
  endPendingRun: (accountId: string) => void;
  /**
   * Whether the account has an in-flight create — activity that no liveness
   * probe can ever prove stale.
   */
  isAccountActive: (accountId: string) => boolean;
};

/** Create the occupancy tracker guarding optimization-run creation. */
export const createOptimizationAccountOccupancy =
  (): OptimizationAccountOccupancy => {
    const pendingRunAccountIds = new Set<string>();

    return {
      beginPendingRun: (accountId) => {
        pendingRunAccountIds.add(accountId);
      },
      endPendingRun: (accountId) => {
        pendingRunAccountIds.delete(accountId);
      },
      isAccountActive: (accountId) => pendingRunAccountIds.has(accountId),
    };
  };
