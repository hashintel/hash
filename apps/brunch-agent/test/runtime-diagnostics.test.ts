import { describe, expect, test, vi } from "vitest";

import {
  classifyError,
  createRuntimeDiagnostics,
} from "../src/runtime-diagnostics.ts";

import type { FlueObservation } from "@flue/runtime";

const SENTINEL = "SENTINEL-user-content-must-not-leak";

const envelope = {
  v: 3 as const,
  eventIndex: 7,
  timestamp: "2026-09-10T00:00:00.000Z",
  instanceId: "instance-hash",
  submissionId: "submission-1",
};

const createSink = () => {
  const error =
    vi.fn<(message: string, meta: Record<string, unknown>) => void>();
  const warn =
    vi.fn<(message: string, meta: Record<string, unknown>) => void>();
  return { error, warn };
};

const toolObservation = (
  isError: boolean,
  overrides: Partial<Pick<FlueObservation, "errorInfo">> & {
    result?: unknown;
  } = {},
): FlueObservation => ({
  ...envelope,
  type: "tool",
  toolName: "brunch_why",
  toolCallId: "call-1",
  isError,
  durationMs: 12,
  turnId: "turn-1",
  args: { secret: SENTINEL },
  effectiveResult: SENTINEL,
  errorInfo: {
    type: "ToolExecutionError",
    name: "Error",
    message: `failed with ${SENTINEL}`,
    stack: `Error: failed with ${SENTINEL}\n    at run (why.ts:1:1)`,
  },
  ...overrides,
});

describe("classifyError", () => {
  test("keeps message and stack only when verbose", () => {
    const error = Object.assign(new Error(`boom ${SENTINEL}`), {
      code: "ECONNRESET",
    });
    expect(classifyError(error, true)).toMatchObject({
      type: "ECONNRESET",
      code: "ECONNRESET",
      name: "Error",
      message: `boom ${SENTINEL}`,
    });
    expect(classifyError(error, true).stack).toContain("boom");
    const quiet = classifyError(error, false);
    expect(quiet).toEqual({
      type: "ECONNRESET",
      code: "ECONNRESET",
      name: "Error",
    });
    expect(JSON.stringify(quiet)).not.toContain(SENTINEL);
  });

  test("classifies Flue error records and primitives", () => {
    expect(
      classifyError(
        { type: "submission_failed", message: SENTINEL, details: SENTINEL },
        false,
      ),
    ).toEqual({ type: "submission_failed" });
    expect(
      classifyError(
        { type: "submission_failed", message: "primary", details: "secondary" },
        true,
      ),
    ).toMatchObject({ message: "primary" });
    expect(
      classifyError({ type: "submission_failed", details: "only" }, true),
    ).toMatchObject({ message: "only" });
    expect(classifyError(SENTINEL, false)).toEqual({ type: "string" });
    expect(classifyError(undefined, true)).toEqual({ type: "undefined" });
  });
});

describe("runtime diagnostics observer", () => {
  test("reports a failed tool once with its runtime IDs and, in development, the original error", () => {
    const sink = createSink();
    const diagnostics = createRuntimeDiagnostics(sink, "development");
    void diagnostics.observe(toolObservation(true), undefined as never);
    expect(sink.error).toHaveBeenCalledTimes(1);
    const [message, meta] = sink.error.mock.calls[0]!;
    expect(message).toBe("[brunch] flue.tool failed: ToolExecutionError");
    expect(meta).toMatchObject({
      stage: "flue.tool",
      event: "tool",
      instanceId: "instance-hash",
      submissionId: "submission-1",
      turnId: "turn-1",
      toolCallId: "call-1",
      toolName: "brunch_why",
      eventIndex: 7,
    });
    const error = meta.error as Record<string, unknown>;
    expect(error.message).toContain(SENTINEL);
    expect(error.stack).toContain("why.ts");
    // Arguments and results are content, never logged in any environment.
    expect(JSON.stringify(meta)).not.toContain("secret");
    expect(JSON.stringify(meta).split(SENTINEL).length - 1).toBe(2);
  });

  test("development surfaces a failed tool's returned error text when errorInfo is bare", () => {
    const sink = createSink();
    const validationFailure = toolObservation(true, {
      errorInfo: { type: "_OTHER" },
      result: {
        content: [
          {
            type: "text",
            text: 'Arguments for tool "mutate_petrinet" do not match the required schema',
          },
        ],
      },
    });
    void createRuntimeDiagnostics(sink, "development").observe(
      validationFailure,
      undefined as never,
    );
    expect(sink.error.mock.calls[0]![1]).toMatchObject({
      error: { type: "_OTHER" },
      errorText:
        'Arguments for tool "mutate_petrinet" do not match the required schema',
    });
    const production = createSink();
    void createRuntimeDiagnostics(production, "production").observe(
      validationFailure,
      undefined as never,
    );
    expect(production.error.mock.calls[0]![1]).not.toHaveProperty("errorText");
  });

  test("production keeps type and correlation only", () => {
    const sink = createSink();
    const diagnostics = createRuntimeDiagnostics(sink, "production");
    void diagnostics.observe(toolObservation(true), undefined as never);
    expect(sink.error).toHaveBeenCalledTimes(1);
    const [, meta] = sink.error.mock.calls[0]!;
    expect(meta.error).toEqual({ type: "ToolExecutionError", name: "Error" });
    expect(JSON.stringify(meta)).not.toContain(SENTINEL);
    expect(meta).toMatchObject({
      toolCallId: "call-1",
      submissionId: "submission-1",
    });
  });

  test("ignores successful events and reports each failure-carrying kind", () => {
    const sink = createSink();
    const diagnostics = createRuntimeDiagnostics(sink, "development");
    const context = undefined as never;
    void diagnostics.observe(toolObservation(false), context);
    void diagnostics.observe(
      {
        ...envelope,
        type: "submission_settled",
        submissionId: "submission-1",
        outcome: "completed",
      },
      context,
    );
    void diagnostics.observe(
      { ...envelope, type: "text_delta", text: SENTINEL },
      context,
    );
    // The submission's own `prompt` operation repeats the settlement failure.
    void diagnostics.observe(
      {
        ...envelope,
        type: "operation",
        operationId: "operation-prompt",
        operationKind: "prompt",
        durationMs: 1,
        isError: true,
        error: new Error("duplicate of settlement"),
      },
      context,
    );
    expect(sink.error).not.toHaveBeenCalled();

    void diagnostics.observe(
      {
        ...envelope,
        type: "turn",
        turnId: "turn-2",
        purpose: "agent",
        durationMs: 5,
        isError: true,
        request: {
          providerId: "anthropic",
          providerName: "Anthropic",
          requestedModel: "claude",
          api: "messages",
        },
        response: {
          error: { type: "overloaded_error", message: SENTINEL },
          finishReason: "error",
        },
      },
      context,
    );
    void diagnostics.observe(
      {
        ...envelope,
        type: "task",
        taskId: "task-1",
        isError: true,
        durationMs: 1,
        errorInfo: { type: "TaskFailed" },
      },
      context,
    );
    void diagnostics.observe(
      {
        ...envelope,
        type: "compaction",
        messagesBefore: 10,
        messagesAfter: 10,
        durationMs: 1,
        isError: true,
        error: new Error("compaction"),
      },
      context,
    );
    void diagnostics.observe(
      {
        ...envelope,
        type: "operation",
        operationId: "operation-1",
        operationKind: "skill",
        durationMs: 1,
        isError: true,
        error: new Error("operation"),
      },
      context,
    );
    void diagnostics.observe(
      {
        ...envelope,
        type: "submission_settled",
        submissionId: "submission-1",
        outcome: "failed",
        error: { type: "agent_error", message: SENTINEL },
      },
      context,
    );
    void diagnostics.observe(
      {
        ...envelope,
        type: "submission_recovery",
        operation: "finalize_settlement",
        outcome: "deferred",
        error: { message: SENTINEL, name: "StorageError" },
      },
      context,
    );
    expect(sink.error.mock.calls.map(([, meta]) => meta.stage)).toEqual([
      "flue.turn",
      "flue.task",
      "flue.compaction",
      "flue.operation",
      "flue.submission",
      "flue.recovery",
    ]);
    expect(sink.error.mock.calls[0]![1]).toMatchObject({
      turnId: "turn-2",
      requestedModel: "claude",
      error: { type: "overloaded_error" },
    });
    expect(sink.error.mock.calls[4]![1]).toMatchObject({
      outcome: "failed",
      error: { type: "agent_error" },
    });
  });

  test("agent error logs are noted without a thrown value", () => {
    const sink = createSink();
    const diagnostics = createRuntimeDiagnostics(sink, "production");
    void diagnostics.observe(
      { ...envelope, type: "log", level: "error", message: "agent gave up" },
      undefined as never,
    );
    void diagnostics.observe(
      { ...envelope, type: "log", level: "info", message: "fine" },
      undefined as never,
    );
    expect(sink.error).not.toHaveBeenCalled();
    expect(sink.warn).toHaveBeenCalledTimes(1);
    expect(sink.warn.mock.calls[0]![1]).toMatchObject({
      stage: "flue.log",
      message: "agent gave up",
    });
  });

  test("notes classify dropped external data without carrying it", () => {
    const sink = createSink();
    const diagnostics = createRuntimeDiagnostics(sink, "production");
    diagnostics.note("client-tool-result.parse", {
      kind: "dropped-members",
      dropped: 1,
      total: 3,
      instanceId: undefined,
    });
    expect(sink.warn).toHaveBeenCalledWith(
      "[brunch] client-tool-result.parse",
      {
        stage: "client-tool-result.parse",
        kind: "dropped-members",
        dropped: 1,
        total: 3,
      },
    );
  });
});
