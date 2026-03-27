/**
 * Ingest run hook: upload PDF → stream SSE progress → terminal state.
 *
 * Pure functions (isPdfFile, isTerminalStatus) are exported for testing.
 * The hook (useIngestRun) wires them to React state + SSE side effects.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  ActiveRunStatus,
  RunStatus,
  SucceededRunStatus,
  TerminalRunStatus,
} from "./types";

// ---------------------------------------------------------------------------
// Pure functions (functional core)
// ---------------------------------------------------------------------------

export function isPdfFile(file: File): boolean {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

export function isTerminalStatus(
  status: RunStatus["status"],
): status is "succeeded" | "failed" {
  return status === "succeeded" || status === "failed";
}

export function isTerminalRunStatus(
  runStatus: RunStatus,
): runStatus is TerminalRunStatus {
  return isTerminalStatus(runStatus.status);
}

export function isActiveRunStatus(
  runStatus: RunStatus,
): runStatus is ActiveRunStatus {
  return runStatus.status === "queued" || runStatus.status === "running";
}

export function shouldFetchResults(
  state: IngestRunState,
): state is DoneIngestRunState & { runStatus: SucceededRunStatus } {
  return state.phase === "done" && state.runStatus.status === "succeeded";
}

export function getStateForRunStatus(
  runStatus: RunStatus,
): StreamingIngestRunState | DoneIngestRunState {
  if (isTerminalRunStatus(runStatus)) {
    return { phase: "done", runStatus };
  }

  if (isActiveRunStatus(runStatus)) {
    return { phase: "streaming", runStatus };
  }

  throw new Error(`Unknown ingest run status: ${String(runStatus.status)}`);
}

export class IngestRunStatusError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "IngestRunStatusError";
  }
}

export async function loadIngestRunStatus(
  runId: string,
  fetchFn: typeof fetch = fetch,
): Promise<RunStatus> {
  const response = await fetchFn(
    `/api/ingest/${encodeURIComponent(runId)}/status`,
  );

  if (!response.ok) {
    throw new IngestRunStatusError(
      `Failed to load run status: ${response.status}`,
      response.status,
    );
  }

  return (await response.json()) as RunStatus;
}

export function getIngestRunEventsPath(
  runId: string,
  options?: { after?: number },
): string {
  const path = `/api/ingest/${encodeURIComponent(runId)}/events`;

  if (options?.after === undefined) {
    return path;
  }

  const searchParams = new URLSearchParams({
    after: String(options.after),
  });

  return `${path}?${searchParams.toString()}`;
}

export async function loadResumeTargetForRun(
  runId: string,
  fetchFn: typeof fetch = fetch,
): Promise<{
  state: StreamingIngestRunState | DoneIngestRunState;
  streamPath: string | null;
}> {
  const runStatus = await loadIngestRunStatus(runId, fetchFn);
  const state = getStateForRunStatus(runStatus);

  return {
    state,
    streamPath:
      state.phase === "streaming"
        ? getIngestRunEventsPath(runId, { after: 0 })
        : null,
  };
}

export async function recoverDoneStateFromStreamError(
  runId: string,
  fetchFn: typeof fetch = fetch,
): Promise<Extract<IngestRunState, { phase: "done" }> | null> {
  const { state } = await loadResumeTargetForRun(runId, fetchFn);

  return state.phase === "done" ? state : null;
}

export type IngestResumeOutcome =
  | "loaded"
  | "cleared-missing-run"
  | "failed"
  | "superseded";

export function getResumeAttemptDisposition({
  expectedRunId,
  currentResumingRunId,
  expectedSessionGeneration,
  currentSessionGeneration,
}: {
  expectedRunId: string;
  currentResumingRunId: string | null;
  expectedSessionGeneration: number;
  currentSessionGeneration: number;
}): "apply" | "superseded" {
  if (
    currentResumingRunId !== expectedRunId ||
    currentSessionGeneration !== expectedSessionGeneration
  ) {
    return "superseded";
  }

  return "apply";
}

export function getResumeFailureResolution(error: unknown): {
  nextState: Extract<IngestRunState, { phase: "idle" | "error" }>;
  clearRunId: boolean;
} {
  if (error instanceof IngestRunStatusError && error.status === 404) {
    return {
      nextState: { phase: "idle" },
      clearRunId: true,
    };
  }

  return {
    nextState: {
      phase: "error",
      message: error instanceof Error ? error.message : String(error),
    },
    clearRunId: false,
  };
}

const isRunStatus = (value: unknown): value is RunStatus["status"] =>
  value === "queued" ||
  value === "running" ||
  value === "succeeded" ||
  value === "failed";

const getPayloadRunId = (payload: Record<string, unknown>): string | null => {
  const payloadRunId = payload.runId;

  return typeof payloadRunId === "string" ? payloadRunId : null;
};

const getEffectiveEventKind = (
  eventKind: string,
  payload: Record<string, unknown>,
): string => {
  if (eventKind !== "message") {
    return eventKind;
  }

  const payloadEventKind = payload.event;

  return typeof payloadEventKind === "string" ? payloadEventKind : eventKind;
};

export type IngestRunStreamMessage = {
  event: string;
  data: string;
};

const normalizeSseChunkText = (chunk: string): string =>
  chunk.replaceAll("\r\n", "\n").replaceAll("\r", "\n");

const parseSseFrame = (frame: string): IngestRunStreamMessage | null => {
  let event = "message";
  const dataLines: string[] = [];

  for (const line of frame.split("\n")) {
    if (!line || line.startsWith(":")) {
      continue;
    }

    const separatorIndex = line.indexOf(":");
    const field = separatorIndex === -1 ? line : line.slice(0, separatorIndex);
    const rawValue =
      separatorIndex === -1 ? "" : line.slice(separatorIndex + 1);
    const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;

    if (field === "event") {
      event = value || "message";
    }

    if (field === "data") {
      dataLines.push(value);
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  return {
    event,
    data: dataLines.join("\n"),
  };
};

export function parseSseFrameBuffer(buffer: string): {
  messages: IngestRunStreamMessage[];
  remainder: string;
} {
  let remainder = normalizeSseChunkText(buffer);
  const messages: IngestRunStreamMessage[] = [];

  for (;;) {
    const separatorIndex = remainder.indexOf("\n\n");

    if (separatorIndex === -1) {
      return { messages, remainder };
    }

    const frame = remainder.slice(0, separatorIndex);
    remainder = remainder.slice(separatorIndex + 2);

    const parsedFrame = parseSseFrame(frame);

    if (parsedFrame) {
      messages.push(parsedFrame);
    }
  }
}

/** Normalize an SSE browser event into the current run's visible status. */
export function getRunStatusFromStreamEvent(
  runId: string,
  eventKind: string,
  payload: Record<string, unknown>,
): RunStatus | null {
  const payloadRunId = getPayloadRunId(payload);

  if (payloadRunId && payloadRunId !== runId) {
    return null;
  }

  const effectiveEventKind = getEffectiveEventKind(eventKind, payload);
  const status: RunStatus["status"] =
    effectiveEventKind === "run-succeeded"
      ? "succeeded"
      : effectiveEventKind === "run-failed"
        ? "failed"
        : isRunStatus(payload.status)
          ? payload.status
          : "running";

  return {
    runId,
    status,
    phase: payload.phase as string | undefined,
    step: payload.step as string | undefined,
    counts: payload.counts as RunStatus["counts"],
    error: payload.error ? (payload.error as string) : undefined,
    updatedAt: new Date().toISOString(),
  };
}

export async function consumeIngestRunEventStream({
  runId,
  stream,
  onRunStatus,
}: {
  runId: string;
  stream: ReadableStream<Uint8Array>;
  onRunStatus: (runStatus: RunStatus) => "stop" | void;
}): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();

      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });

      const { messages, remainder } = parseSseFrameBuffer(buffer);
      buffer = remainder;

      for (const message of messages) {
        try {
          const payload = JSON.parse(message.data) as Record<string, unknown>;
          const runStatus = getRunStatusFromStreamEvent(
            runId,
            message.event,
            payload,
          );

          if (!runStatus) {
            continue;
          }

          if (onRunStatus(runStatus) === "stop") {
            await reader.cancel().catch(() => {});
            return;
          }
        } catch {
          // Malformed payload — ignore
        }
      }

      if (done) {
        return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

export type StreamingIngestRunState = {
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

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useIngestRun() {
  const [state, setState] = useState<IngestRunState>({ phase: "idle" });
  const streamRef = useRef<{
    controller: AbortController;
    requestId: number;
  } | null>(null);
  const isRecoveringRef = useRef(false);
  const currentRunIdRef = useRef<string | null>(null);
  const resumingRunIdRef = useRef<string | null>(null);
  const sessionGenerationRef = useRef(0);
  const nextStreamRequestIdRef = useRef(0);

  useEffect(() => {
    currentRunIdRef.current =
      "runStatus" in state ? state.runStatus.runId : null;
  }, [state]);

  useEffect(() => {
    return () => {
      streamRef.current?.controller.abort();
    };
  }, []);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.controller.abort();
      streamRef.current = null;
    }
  }, []);

  const isCurrentStreamRequest = useCallback(
    (requestId: number): boolean => streamRef.current?.requestId === requestId,
    [],
  );

  const supersedePendingResume = useCallback(() => {
    sessionGenerationRef.current += 1;
    resumingRunIdRef.current = null;
  }, []);

  const reconcileStreamError = useCallback(
    async (runId: string, requestId: number) => {
      if (
        isRecoveringRef.current ||
        streamRef.current?.requestId !== requestId
      ) {
        return;
      }

      isRecoveringRef.current = true;

      try {
        const recoveredState = await recoverDoneStateFromStreamError(runId);

        if (!isCurrentStreamRequest(requestId)) {
          return;
        }

        if (recoveredState) {
          stopStream();
          setState(recoveredState);
          return;
        }

        stopStream();
        setState({
          phase: "error",
          message: "Lost connection to progress stream",
        });
      } catch {
        if (!isCurrentStreamRequest(requestId)) {
          return;
        }

        stopStream();
        setState({
          phase: "error",
          message: "Lost connection to progress stream",
        });
      } finally {
        isRecoveringRef.current = false;
      }
    },
    [isCurrentStreamRequest, stopStream],
  );

  const startStream = useCallback(
    (runId: string, streamPath = getIngestRunEventsPath(runId)) => {
      stopStream();

      const controller = new AbortController();
      const requestId = nextStreamRequestIdRef.current + 1;
      nextStreamRequestIdRef.current = requestId;
      streamRef.current = { controller, requestId };

      void (async () => {
        try {
          const response = await fetch(streamPath, {
            headers: {
              Accept: "text/event-stream",
            },
            signal: controller.signal,
          });

          if (!response.ok || !response.body) {
            throw new Error("Failed to open ingest event stream");
          }

          const contentType = response.headers.get("content-type");

          if (!contentType?.includes("text/event-stream")) {
            throw new Error("Unexpected ingest event stream content type");
          }

          await consumeIngestRunEventStream({
            runId,
            stream: response.body,
            onRunStatus: (runStatus) => {
              if (!isCurrentStreamRequest(requestId)) {
                return "stop";
              }

              setState(getStateForRunStatus(runStatus));

              if (isTerminalRunStatus(runStatus)) {
                streamRef.current = null;
                return "stop";
              }
            },
          });

          if (!isCurrentStreamRequest(requestId)) {
            return;
          }

          await reconcileStreamError(runId, requestId);
        } catch {
          if (controller.signal.aborted || !isCurrentStreamRequest(requestId)) {
            return;
          }

          await reconcileStreamError(runId, requestId);
        }
      })();
    },
    [isCurrentStreamRequest, reconcileStreamError, stopStream],
  );

  const upload = useCallback(
    async (file: File) => {
      supersedePendingResume();

      if (!isPdfFile(file)) {
        setState({ phase: "error", message: "Only PDF files are accepted" });
        return;
      }

      setState({ phase: "uploading" });

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/ingest", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            (body as { error?: string }).error ??
              `Upload failed with status ${res.status}`,
          );
        }

        const status: RunStatus = (await res.json()) as RunStatus;

        const nextState = getStateForRunStatus(status);
        setState(nextState);

        if (nextState.phase === "streaming") {
          startStream(status.runId);
        }
      } catch (err) {
        setState({
          phase: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [startStream, supersedePendingResume],
  );

  const resume = useCallback(
    async (runId: string): Promise<IngestResumeOutcome> => {
      const normalizedRunId = runId.trim();

      if (!normalizedRunId) {
        return "loaded";
      }

      if (
        currentRunIdRef.current === normalizedRunId ||
        resumingRunIdRef.current === normalizedRunId
      ) {
        return "loaded";
      }

      resumingRunIdRef.current = normalizedRunId;
      const sessionGeneration = sessionGenerationRef.current;

      try {
        const resumeTarget = await loadResumeTargetForRun(normalizedRunId);

        if (
          getResumeAttemptDisposition({
            expectedRunId: normalizedRunId,
            currentResumingRunId: resumingRunIdRef.current,
            expectedSessionGeneration: sessionGeneration,
            currentSessionGeneration: sessionGenerationRef.current,
          }) === "superseded"
        ) {
          return "superseded";
        }

        stopStream();
        setState(resumeTarget.state);

        if (resumeTarget.streamPath) {
          startStream(normalizedRunId, resumeTarget.streamPath);
        }

        return "loaded";
      } catch (err) {
        if (
          getResumeAttemptDisposition({
            expectedRunId: normalizedRunId,
            currentResumingRunId: resumingRunIdRef.current,
            expectedSessionGeneration: sessionGeneration,
            currentSessionGeneration: sessionGenerationRef.current,
          }) === "superseded"
        ) {
          return "superseded";
        }

        const failure = getResumeFailureResolution(err);

        stopStream();
        setState(failure.nextState);
        return failure.clearRunId ? "cleared-missing-run" : "failed";
      } finally {
        if (resumingRunIdRef.current === normalizedRunId) {
          resumingRunIdRef.current = null;
        }
      }
    },
    [startStream, stopStream],
  );

  const reset = useCallback(() => {
    supersedePendingResume();
    stopStream();
    setState({ phase: "idle" });
  }, [stopStream, supersedePendingResume]);

  return { state, upload, reset, resume };
}
