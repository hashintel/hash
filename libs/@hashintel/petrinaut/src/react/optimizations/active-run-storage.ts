/**
 * The detached runs this tab may re-attach to after a reload, recorded in
 * sessionStorage as a JSON object mapping run id to its manifest and creation
 * time. Session-scoped on purpose — a run belongs to the tab that started it.
 *
 * When storage is unavailable (e.g. Petrinaut runs in a sandboxed iframe with
 * an opaque origin) every helper degrades to a no-op: reload re-attachment is
 * lost, while in-page reconnection keeps working.
 */

import type { PetrinautOptimizationInput } from "@hashintel/petrinaut-core";

export const ACTIVE_RUNS_STORAGE_KEY = "petrinaut:active-optimization-runs";

export type StoredActiveRun = { input: unknown; createdAt: number };

export const readStoredActiveRuns = (): Record<string, StoredActiveRun> => {
  try {
    const raw = sessionStorage.getItem(ACTIVE_RUNS_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return {};
    }
    const runs: Record<string, StoredActiveRun> = {};
    for (const [runId, value] of Object.entries(parsed)) {
      if (typeof value === "object" && value !== null && "input" in value) {
        const createdAt = (value as { createdAt?: unknown }).createdAt;
        runs[runId] = {
          input: (value as { input: unknown }).input,
          createdAt: typeof createdAt === "number" ? createdAt : Date.now(),
        };
      }
    }
    return runs;
  } catch {
    // Unavailable or corrupted storage; see the module comment.
    return {};
  }
};

const writeStoredActiveRuns = (runs: Record<string, StoredActiveRun>): void => {
  try {
    sessionStorage.setItem(ACTIVE_RUNS_STORAGE_KEY, JSON.stringify(runs));
  } catch {
    // Unavailable storage or exceeded quota; see the module comment.
  }
};

export const storeActiveRun = (
  runId: string,
  input: PetrinautOptimizationInput,
): void => {
  const runs = readStoredActiveRuns();
  runs[runId] = { input, createdAt: Date.now() };
  writeStoredActiveRuns(runs);
};

export const removeStoredActiveRun = (runId: string): void => {
  const runs = readStoredActiveRuns();
  if (runId in runs) {
    delete runs[runId];
    writeStoredActiveRuns(runs);
  }
};
