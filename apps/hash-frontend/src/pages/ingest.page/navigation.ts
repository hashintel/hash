import { getIngestResultsPath } from "./routing";
import type {
  DoneIngestRunState,
  IngestResumeOutcome,
  IngestRunState,
} from "./use-ingest-run";

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

function isFailedDoneState(
  state: IngestRunState,
): state is DoneIngestRunState & {
  runStatus: DoneIngestRunState["runStatus"] & { status: "failed" };
} {
  return state.phase === "done" && state.runStatus.status === "failed";
}

export function getIngestResetNavigationAction(
  state: IngestRunState,
  query?: { runId?: string },
): Extract<IngestNavigationAction, { kind: "replace" }> | null {
  const runId = query?.runId?.trim();

  if (!runId) {
    return null;
  }

  if (state.phase === "error" || isFailedDoneState(state)) {
    return {
      kind: "replace",
      path: getIngestPath(),
    };
  }

  return null;
}

export function getIngestResumeNavigationAction(
  outcome: IngestResumeOutcome,
  query?: { runId?: string },
): Extract<IngestNavigationAction, { kind: "replace" }> | null {
  const runId = query?.runId?.trim();

  if (!runId || outcome !== "cleared-missing-run") {
    return null;
  }

  return {
    kind: "replace",
    path: getIngestPath(),
  };
}
