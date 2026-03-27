import { getIngestResultsPath } from "./routing";
import type { IngestRunState } from "./use-ingest-run";

export type IngestNavigationAction =
  | { kind: "replace"; path: string }
  | { kind: "push"; path: string }
  | null;

export function getIngestPath(query?: { runId?: string }): string {
  const runId = query?.runId?.trim();

  if (!runId) {
    return "/ingest";
  }

  const params = new URLSearchParams({ runId });
  return `/ingest?${params.toString()}`;
}

export function getIngestNavigationAction(
  state: IngestRunState,
): IngestNavigationAction {
  if (state.phase === "streaming") {
    return {
      kind: "replace",
      path: getIngestPath({ runId: state.runStatus.runId }),
    };
  }

  if (state.phase === "done" && state.runStatus.status === "succeeded") {
    return {
      kind: "push",
      path: getIngestResultsPath({ kind: "run", runId: state.runStatus.runId }),
    };
  }

  return null;
}
