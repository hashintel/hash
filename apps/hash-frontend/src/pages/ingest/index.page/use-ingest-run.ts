/**
 * Ingest run hook: upload a PDF, then follow the run's SSE progress stream to
 * a terminal state.
 */
import { createParser, type EventSourceMessage } from "eventsource-parser";
import { useCallback, useEffect, useRef, useState } from "react";

import { getIngestRunApiPath } from "../shared/routing";

import type {
  ActiveRunStatus,
  RunStatus,
  TerminalRunStatus,
} from "../shared/types";

type StreamingIngestRunState = {
  phase: "streaming";
  runStatus: ActiveRunStatus;
};

export type DoneIngestRunState = {
  phase: "done";
  runStatus: TerminalRunStatus;
};

export type IngestRunState =
  | { phase: "idle" }
  | { phase: "uploading" }
  | StreamingIngestRunState
  | DoneIngestRunState
  | { phase: "error"; message: string };

const runStatusValues: ReadonlySet<unknown> = new Set<RunStatus["status"]>([
  "queued",
  "running",
  "succeeded",
  "failed",
]);

const isRunStatusValue = (value: unknown): value is RunStatus["status"] =>
  runStatusValues.has(value);

const isActiveRunStatus = (
  runStatus: RunStatus,
): runStatus is ActiveRunStatus =>
  runStatus.status === "queued" || runStatus.status === "running";

const isTerminalRunStatus = (
  runStatus: RunStatus,
): runStatus is TerminalRunStatus =>
  runStatus.status === "succeeded" || runStatus.status === "failed";

const getStateForRunStatus = (
  runStatus: RunStatus,
): StreamingIngestRunState | DoneIngestRunState => {
  if (isTerminalRunStatus(runStatus)) {
    return { phase: "done", runStatus };
  }

  if (isActiveRunStatus(runStatus)) {
    return { phase: "streaming", runStatus };
  }

  throw new Error(`Unknown ingest run status: ${String(runStatus.status)}`);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const optionalNumber = (value: unknown): number | undefined =>
  typeof value === "number" ? value : undefined;

const getCounts = (value: unknown): RunStatus["counts"] =>
  isRecord(value)
    ? {
        pages: optionalNumber(value.pages),
        chunks: optionalNumber(value.chunks),
        mentions: optionalNumber(value.mentions),
        claims: optionalNumber(value.claims),
      }
    : undefined;

const parsePayload = (data: string): Record<string, unknown> | null => {
  try {
    const payload: unknown = JSON.parse(data);
    return isRecord(payload) ? payload : null;
  } catch {
    return null;
  }
};

/** Normalize an SSE event into the run's visible status. */
export const getRunStatusFromStreamEvent = (
  runId: string,
  eventKind: string | undefined,
  payload: Record<string, unknown>,
): RunStatus | null => {
  const payloadRunId = optionalString(payload.runId);

  if (payloadRunId && payloadRunId !== runId) {
    return null;
  }

  const effectiveEventKind =
    eventKind === undefined || eventKind === "message"
      ? optionalString(payload.event)
      : eventKind;

  const status: RunStatus["status"] =
    effectiveEventKind === "run-succeeded"
      ? "succeeded"
      : effectiveEventKind === "run-failed"
        ? "failed"
        : isRunStatusValue(payload.status)
          ? payload.status
          : "running";

  return {
    runId,
    status,
    phase: optionalString(payload.phase),
    step: optionalString(payload.step),
    counts: getCounts(payload.counts),
    error: optionalString(payload.error),
    updatedAt: new Date().toISOString(),
  };
};

/**
 * Read a run's event stream until `onRunStatus` returns "stop". A connection
 * that drops after delivering events is reopened with `Last-Event-ID`, as
 * `EventSource` would; one that delivers nothing is treated as lost.
 */
export const followRunEvents = async ({
  runId,
  path,
  signal,
  onRunStatus,
}: {
  runId: string;
  path: string;
  signal: AbortSignal;
  onRunStatus: (runStatus: RunStatus) => "stop" | undefined;
}): Promise<void> => {
  let lastEventId: string | undefined;

  for (;;) {
    const response = await fetch(
      lastEventId ? `${getIngestRunApiPath(runId)}/events` : path,
      {
        headers: {
          Accept: "text/event-stream",
          ...(lastEventId ? { "Last-Event-ID": lastEventId } : {}),
        },
        signal,
      },
    );

    if (!response.ok || !response.body) {
      throw new Error(`Failed to open the progress stream: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const messages: EventSourceMessage[] = [];
    const parser = createParser({
      onEvent: (message) => {
        messages.push(message);
      },
    });

    let receivedEvent = false;

    try {
      for (;;) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        parser.feed(decoder.decode(value, { stream: true }));

        for (const message of messages.splice(0)) {
          receivedEvent = true;
          lastEventId = message.id ?? lastEventId;

          const payload = parsePayload(message.data);
          const runStatus =
            payload &&
            getRunStatusFromStreamEvent(runId, message.event, payload);

          if (runStatus && onRunStatus(runStatus) === "stop") {
            await reader.cancel();
            return;
          }
        }
      }
    } catch (error) {
      if (signal.aborted) {
        throw error;
      }
    }

    if (!receivedEvent) {
      throw new Error("Lost connection to the progress stream");
    }
  }
};

/** What one upload or resume may do while it is still the current session. */
type IngestSessionContext = {
  signal: AbortSignal;
  setState: (nextState: IngestRunState) => void;
  claimRun: (runId: string) => void;
};

const followRun = async (
  { signal, setState }: IngestSessionContext,
  runStatus: RunStatus,
  eventsPath: string,
): Promise<void> => {
  const initialState = getStateForRunStatus(runStatus);
  setState(initialState);

  if (initialState.phase !== "streaming") {
    return;
  }

  await followRunEvents({
    runId: runStatus.runId,
    path: eventsPath,
    signal,
    onRunStatus: (nextRunStatus) => {
      const nextState = getStateForRunStatus(nextRunStatus);
      setState(nextState);
      return nextState.phase === "done" ? "stop" : undefined;
    },
  });
};

export const useIngestRun = () => {
  const [state, setState] = useState<IngestRunState>({ phase: "idle" });
  const sessionRef = useRef<{
    controller: AbortController;
    runId: string | null;
  } | null>(null);

  useEffect(() => () => sessionRef.current?.controller.abort(), []);

  const runSession = useCallback(
    (
      runId: string | null,
      work: (context: IngestSessionContext) => Promise<void>,
    ) => {
      sessionRef.current?.controller.abort();
      const session = { controller: new AbortController(), runId };
      sessionRef.current = session;

      const setSessionState = (nextState: IngestRunState) => {
        if (sessionRef.current === session) {
          setState(nextState);
        }
      };

      void work({
        signal: session.controller.signal,
        setState: setSessionState,
        claimRun: (claimedRunId) => {
          session.runId = claimedRunId;
        },
      }).catch((error: unknown) => {
        setSessionState({
          phase: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      });
    },
    [],
  );

  const upload = useCallback(
    (file: File) => {
      runSession(null, async (context) => {
        context.setState({ phase: "uploading" });

        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/api/ingest", {
          method: "POST",
          body: formData,
          signal: context.signal,
        });

        if (!response.ok) {
          const body: unknown = await response.json().catch(() => null);
          throw new Error(
            (isRecord(body) ? optionalString(body.error) : undefined) ??
              `Upload failed with status ${response.status}`,
          );
        }

        const runStatus = (await response.json()) as RunStatus;
        context.claimRun(runStatus.runId);

        await followRun(
          context,
          runStatus,
          `${getIngestRunApiPath(runStatus.runId)}/events`,
        );
      });
    },
    [runSession],
  );

  const resume = useCallback(
    (runId: string) => {
      if (sessionRef.current?.runId === runId) {
        return;
      }

      runSession(runId, async (context) => {
        const runApiPath = getIngestRunApiPath(runId);
        const response = await fetch(`${runApiPath}/status`, {
          signal: context.signal,
        });

        if (!response.ok) {
          throw new Error(`Failed to load run status: ${response.status}`);
        }

        await followRun(
          context,
          (await response.json()) as RunStatus,
          `${runApiPath}/events?after=0`,
        );
      });
    },
    [runSession],
  );

  const reset = useCallback(() => {
    sessionRef.current?.controller.abort();
    sessionRef.current = null;
    setState({ phase: "idle" });
  }, []);

  return { state, upload, reset, resume };
};
