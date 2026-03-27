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

type IngestPageNavigationInput =
  | {
      kind: "state";
      currentRunId?: string;
      state: IngestRunState;
    }
  | {
      kind: "reset";
      currentRunId?: string;
      state: IngestRunState;
    }
  | {
      kind: "resume";
      currentRunId?: string;
      resumeOutcome: IngestResumeOutcome;
    };

export function getIngestPath(query?: { runId?: string }): string {
  const runId = query?.runId?.trim();

  if (!runId) {
    return "/ingest";
  }

  const params = new URLSearchParams({ runId });
  return `/ingest?${params.toString()}`;
}

function isFailedDoneState(
  state: IngestRunState,
): state is DoneIngestRunState & {
  runStatus: DoneIngestRunState["runStatus"] & { status: "failed" };
} {
  return state.phase === "done" && state.runStatus.status === "failed";
}

export function getIngestPageNavigationAction(
  input: IngestPageNavigationInput,
): IngestNavigationAction {
  const currentRunId = input.currentRunId?.trim();

  if (input.kind === "state") {
    if (input.state.phase === "streaming") {
      if (currentRunId === input.state.runStatus.runId) {
        return null;
      }

      return {
        kind: "replace",
        path: getIngestPath({ runId: input.state.runStatus.runId }),
      };
    }

    if (
      input.state.phase === "done" &&
      input.state.runStatus.status === "succeeded"
    ) {
      return {
        kind: "push",
        path: getIngestResultsPath({
          kind: "run",
          runId: input.state.runStatus.runId,
        }),
      };
    }

    return null;
  }

  if (input.kind === "reset") {
    if (!currentRunId) {
      return null;
    }

    if (input.state.phase === "error" || isFailedDoneState(input.state)) {
      return {
        kind: "replace",
        path: getIngestPath(),
      };
    }

    return null;
  }

  if (!currentRunId || input.resumeOutcome !== "cleared-missing-run") {
    return null;
  }

  return {
    kind: "replace",
    path: getIngestPath(),
  };
}
