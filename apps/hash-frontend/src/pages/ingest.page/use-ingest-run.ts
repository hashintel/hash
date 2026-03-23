/**
 * Ingest run hook: upload PDF → stream SSE progress → terminal state.
 *
 * Pure functions (isPdfFile, isTerminalStatus) are exported for testing.
 * The hook (useIngestRun) wires them to React state + SSE side effects.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { RunStatus } from "./types";

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

export function shouldFetchResults(
  state: IngestRunState,
): state is Extract<IngestRunState, { phase: "done" }> {
  return state.phase === "done" && state.runStatus.status === "succeeded";
}

/** Map an SSE event payload to a RunStatus shape for the UI. */
export function statusFromEvent(
  runId: string,
  eventKind: string,
  payload: Record<string, unknown>,
): RunStatus {
  const status: RunStatus["status"] =
    eventKind === "run-succeeded"
      ? "succeeded"
      : eventKind === "run-failed"
        ? "failed"
        : ((payload.status as RunStatus["status"] | undefined) ?? "running");
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

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

export type IngestRunState =
  | { phase: "idle" }
  | { phase: "uploading" }
  | { phase: "streaming"; runStatus: RunStatus }
  | { phase: "done"; runStatus: RunStatus }
  | { phase: "error"; message: string };

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useIngestRun() {
  const [state, setState] = useState<IngestRunState>({ phase: "idle" });
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    return () => {
      esRef.current?.close();
    };
  }, []);

  const stopStream = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  }, []);

  const startStream = useCallback(
    (runId: string) => {
      stopStream();

      const es = new EventSource(`/api/ingest/${runId}/events`);
      esRef.current = es;

      const handleEvent = (event: MessageEvent) => {
        try {
          const payload = JSON.parse(event.data) as Record<string, unknown>;
          const runStatus = statusFromEvent(runId, event.type, payload);

          if (isTerminalStatus(runStatus.status)) {
            stopStream();
            setState({ phase: "done", runStatus });
          } else {
            setState({ phase: "streaming", runStatus });
          }
        } catch {
          // Malformed event — ignore
        }
      };

      for (const kind of [
        "run-queued",
        "phase-start",
        "phase-complete",
        "step-start",
        "step-complete",
        "run-succeeded",
        "run-failed",
      ]) {
        es.addEventListener(kind, handleEvent);
      }

      es.onerror = () => {
        if (!esRef.current) {
          return;
        }
        stopStream();
        setState({
          phase: "error",
          message: "Lost connection to progress stream",
        });
      };
    },
    [stopStream],
  );

  const upload = useCallback(
    async (file: File) => {
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

        if (isTerminalStatus(status.status)) {
          setState({ phase: "done", runStatus: status });
        } else {
          setState({ phase: "streaming", runStatus: status });
          startStream(status.runId);
        }
      } catch (err) {
        setState({
          phase: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [startStream],
  );

  const reset = useCallback(() => {
    stopStream();
    setState({ phase: "idle" });
  }, [stopStream]);

  return { state, upload, reset };
}
