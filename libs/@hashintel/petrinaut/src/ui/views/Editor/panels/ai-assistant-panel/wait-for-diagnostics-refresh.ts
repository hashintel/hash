/**
 * Whether the TypeScript diagnostics the panel holds describe the model after
 * the latest mutation (`current`) or still describe an earlier version
 * (`pending`). A bounded wait never turns pending into current.
 */
export type DiagnosticsRefreshOutcome = "current" | "pending";

/**
 * What the model is told instead of diagnostics when they are still pending.
 * It is deliberately not a diagnostics report: it neither says the model
 * compiles nor lists errors, so a stale "everything compiles" can never stand
 * in for the result of the change that was just applied.
 */
export const pendingDiagnosticsContext =
  "TypeScript diagnostics are still pending for the latest change to the model. Nothing about compilation can be concluded yet; call getNetCompilationErrors again before relying on the result.";

/**
 * The version a mutation left pending, and how to disarm it once diagnostics
 * have passed it. Disarming is the caller's, so the panel's ref stays the
 * single place that state lives.
 */
export interface PendingMutationDiagnosticsVersion {
  /** The version awaiting diagnostics, or `null` when nothing is pending. */
  readonly peek: () => number | null;
  /** Clear the pending version, but only if it is still `version`: a later mutation may have re-armed a newer one meanwhile. */
  readonly disarm: (version: number) => void;
}

/**
 * Wait, within a bound, for diagnostics to pass the version a mutation left
 * pending. The pending version is disarmed only once diagnostics have passed
 * it: a read that times out leaves it armed, so the next read waits again
 * instead of answering from the earlier version's diagnostics.
 */
export const waitForDiagnosticsRefresh = async ({
  pendingMutationDiagnosticsVersion,
  diagnosticsVersionRef,
  timeoutMs = 1_000,
  pollMs = 25,
  now = Date.now,
  schedule = (callback, delay) => {
    setTimeout(callback, delay);
  },
}: {
  pendingMutationDiagnosticsVersion: PendingMutationDiagnosticsVersion;
  diagnosticsVersionRef: { readonly current: number };
  timeoutMs?: number;
  pollMs?: number;
  now?: () => number;
  schedule?: (callback: () => void, delay: number) => void;
}): Promise<DiagnosticsRefreshOutcome> => {
  const pendingVersion = pendingMutationDiagnosticsVersion.peek();
  if (pendingVersion === null) return "current";

  const settle = (): DiagnosticsRefreshOutcome | undefined => {
    if (diagnosticsVersionRef.current > pendingVersion) {
      pendingMutationDiagnosticsVersion.disarm(pendingVersion);
      return "current";
    }
    return undefined;
  };

  const immediate = settle();
  if (immediate !== undefined) return immediate;

  return new Promise<DiagnosticsRefreshOutcome>((resolve) => {
    const timeoutAt = now() + timeoutMs;

    const check = () => {
      const settled = settle();
      if (settled !== undefined) {
        resolve(settled);
        return;
      }
      if (now() >= timeoutAt) {
        resolve("pending");
        return;
      }
      schedule(check, pollMs);
    };

    check();
  });
};
