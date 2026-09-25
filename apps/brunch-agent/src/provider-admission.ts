import { AsyncLocalStorage } from "node:async_hooks";
import { isDeepStrictEqual } from "node:util";

import { EventStream } from "@earendil-works/pi-ai";
import { RETRYABLE_INTERRUPTION_MARKER } from "@flue/runtime";

import type {
  Api,
  AssistantMessage,
  AssistantMessageEvent,
  AssistantMessageEventStream,
  Provider,
} from "@earendil-works/pi-ai";

// Limits cover the entire proposal, not each individual chunk. Errors
// deliberately do not resemble Flue's retryable provider/network failures.
export const admissionBufferLimits = {
  bytes: 8 * 1024 * 1024,
  events: 16_384,
} as const;
const bufferLimitError = () =>
  new Error("Brunch response exceeded the admission buffering limit.");
const cancelled = () =>
  new DOMException("Brunch response cancelled before admission.", "AbortError");

type ModelStreamIdlePhase =
  | "active_reasoning"
  | "active_text"
  | "output_transition"
  | "reasoning_start"
  | "request_dispatch"
  | "tool_arguments"
  | "tool_complete";

class ModelStreamIdleError extends Error {
  public readonly code = "model_stream_idle";
  public readonly idleMs: number;
  public readonly lastEventType: AssistantMessageEvent["type"] | undefined;
  public readonly phase: ModelStreamIdlePhase;

  constructor(
    idleMs: number,
    retryable: boolean,
    phase: ModelStreamIdlePhase,
    lastEventType: AssistantMessageEvent["type"] | undefined,
  ) {
    super(
      `model_stream_idle: phase=${phase}; last=${lastEventType ?? "none"}; no meaningful provider event for ${idleMs / 1_000} seconds.${
        retryable ? ` ${RETRYABLE_INTERRUPTION_MARKER}` : ""
      }`,
    );
    this.idleMs = idleMs;
    this.lastEventType = lastEventType;
    this.name = "ModelStreamIdleError";
    this.phase = phase;
  }
}

class ModelStreamCancellationUnacknowledgedError extends Error {
  public readonly code = "model_stream_cancellation_unacknowledged";

  constructor() {
    super(
      "model_stream_cancellation_unacknowledged: the incomplete provider invocation did not stop.",
    );
    this.name = "ModelStreamCancellationUnacknowledgedError";
  }
}

export type ModelStreamIdleRetryScope = {
  idleRetryAvailable: boolean;
  asyncBrowserTools?: boolean;
};
export const modelAdmissionScope = new AsyncLocalStorage<
  ModelStreamIdleRetryScope | false
>();

/**
 * Reasoning streams can legitimately pause after opening a thinking part and
 * between thinking deltas. A production trace crossed the former 15-second
 * reasoning-start limit, then crossed the former 10-second active-reasoning
 * limit on its sole retry, without completing a tool call. Keep dispatch
 * tighter, but give supported reasoning models two minutes between progress
 * events before bounded cancellation and the existing safe single retry.
 */
export const modelStreamIdleTimeoutDefaults = {
  cancellationTimeoutMs: 2_000,
  firstEventTimeoutMs: 60_000,
  idleTimeoutMs: 120_000,
  reasoningStartTimeoutMs: 120_000,
} as const;

export const claimModelStreamIdleRetry = (
  scope: ModelStreamIdleRetryScope | false | undefined,
): boolean => {
  if (scope === undefined || scope === false || !scope.idleRetryAvailable) {
    return false;
  }
  const availableScope = scope;
  availableScope.idleRetryAvailable = false;
  return true;
};

type StreamIdleRecovery = {
  /** Only these independent I-mode calls may share a browser/server proposal. */
  readonly mixedToolNames?: ReadonlySet<string>;
  /** Tool name to the tools whose results it reads; none may share its proposal. */
  readonly dependentToolNames?: ReadonlyMap<string, readonly string[]>;
  readonly cancellationTimeoutMs: number;
  readonly claimRetry: () => boolean;
  readonly firstEventTimeoutMs: number;
  readonly idleTimeoutMs: number;
  readonly reasoningStartTimeoutMs: number;
};

type BufferedEvent = {
  [Kind in AssistantMessageEvent["type"]]: Omit<
    Extract<AssistantMessageEvent, { type: Kind }>,
    "partial"
  >;
}[AssistantMessageEvent["type"]];

class AdmittedStream extends EventStream<
  AssistantMessageEvent,
  AssistantMessage
> {
  readonly #admitted;
  readonly #parentSignal;

  constructor(
    start: (signal: AbortSignal) => AssistantMessageEventStream,
    parentSignal: AbortSignal | undefined,
    browserToolNames: ReadonlySet<string>,
    idleRecovery: StreamIdleRecovery | undefined,
    allowMixed: boolean,
  ) {
    super(
      (event) => event.type === "done" || event.type === "error",
      (event) => {
        if (event.type === "done") return event.message;
        if (event.type === "error") return event.error;
        throw new Error("Expected a terminal provider event.");
      },
    );
    this.#parentSignal = parentSignal;
    this.#admitted = this.#collect(
      start,
      parentSignal,
      browserToolNames,
      idleRecovery,
      allowMixed,
    );
    // Providers start eagerly; a caller may not yet have attached its iterator.
    // Keep rejection observable through both read surfaces, without an unhandled
    // rejection if cancellation wins before the caller starts reading.
    void this.#admitted.catch(() => this.end());
  }

  async #collect(
    start: (signal: AbortSignal) => AssistantMessageEventStream,
    parentSignal: AbortSignal | undefined,
    browserToolNames: ReadonlySet<string>,
    idleRecovery: StreamIdleRecovery | undefined,
    allowMixed: boolean,
  ) {
    const controller = new AbortController();
    const signal = parentSignal
      ? AbortSignal.any([parentSignal, controller.signal])
      : controller.signal;
    const events: BufferedEvent[] = [];
    let bytes = 0;
    let eventCount = 0;
    let receivedModelEvent = false;
    let awaitingReasoningProgress = false;
    let lastEventType: AssistantMessageEvent["type"] | undefined;
    let phase: ModelStreamIdlePhase = "request_dispatch";
    let rejectAbort: () => void = () => {};
    let iterator: AsyncIterator<AssistantMessageEvent> | undefined;
    const interrupted = new Promise<never>((_resolve, reject) => {
      rejectAbort = () =>
        reject(parentSignal?.aborted ? cancelled() : controller.signal.reason);
      signal.addEventListener("abort", rejectAbort, { once: true });
    });
    void interrupted.catch(() => {});
    const count = (value: unknown) => {
      bytes += Buffer.byteLength(JSON.stringify(value), "utf8");
      if (
        bytes > admissionBufferLimits.bytes ||
        eventCount > admissionBufferLimits.events
      )
        throw bufferLimitError();
    };
    try {
      if (signal.aborted) throw cancelled();
      const upstream = start(signal);
      iterator = upstream[Symbol.asyncIterator]();
      for (;;) {
        // Do not trust an upstream implementation to honor cancellation while
        // waiting for a chunk. Late results cannot reopen this admission.
        const nextPending = iterator.next();
        let idleTimer: ReturnType<typeof setTimeout> | undefined;
        const idle = Symbol("provider-stream-idle");
        const idleTimeoutMs = !receivedModelEvent
          ? idleRecovery?.firstEventTimeoutMs
          : awaitingReasoningProgress
            ? idleRecovery?.reasoningStartTimeoutMs
            : idleRecovery?.idleTimeoutMs;
        const idlePending =
          idleTimeoutMs === undefined
            ? new Promise<never>(() => {})
            : new Promise<typeof idle>((resolve) => {
                idleTimer = setTimeout(() => resolve(idle), idleTimeoutMs);
              });
        let next: IteratorResult<AssistantMessageEvent> | typeof idle;
        try {
          // eslint-disable-next-line no-await-in-loop -- Provider events are an ordered stream.
          next = await Promise.race([nextPending, interrupted, idlePending]);
        } finally {
          if (idleTimer !== undefined) clearTimeout(idleTimer);
        }
        if (next === idle) {
          if (idleRecovery === undefined || idleTimeoutMs === undefined) {
            throw new Error(
              "Provider idle timer resolved without recovery policy.",
            );
          }
          controller.abort(
            new ModelStreamIdleError(
              idleTimeoutMs,
              false,
              phase,
              lastEventType,
            ),
          );
          let cancellationTimer: ReturnType<typeof setTimeout> | undefined;
          // eslint-disable-next-line no-await-in-loop -- A retry must not overlap the provider invocation being cancelled.
          const acknowledged = await Promise.race([
            nextPending.then(
              () => true,
              () => true,
            ),
            new Promise<false>((resolve) => {
              cancellationTimer = setTimeout(
                () => resolve(false),
                idleRecovery.cancellationTimeoutMs,
              );
            }),
          ]);
          if (cancellationTimer !== undefined) clearTimeout(cancellationTimer);
          if (!acknowledged) {
            throw new ModelStreamCancellationUnacknowledgedError();
          }
          const toolCallCompleted = events.some(
            (event) => event.type === "toolcall_end",
          );
          throw new ModelStreamIdleError(
            idleTimeoutMs,
            !toolCallCompleted && idleRecovery.claimRetry(),
            phase,
            lastEventType,
          );
        }
        if (next.done) break;
        const event = next.value;
        const compact: BufferedEvent =
          "partial" in event
            ? (({ partial: _partial, ...rest }) => rest)(event)
            : event;
        eventCount += 1;
        if (event.type === "thinking_start") {
          receivedModelEvent = true;
          awaitingReasoningProgress = true;
          lastEventType = event.type;
          phase = "reasoning_start";
        } else if (event.type !== "start") {
          receivedModelEvent = true;
          awaitingReasoningProgress = false;
          lastEventType = event.type;
          switch (event.type) {
            case "thinking_delta":
              phase = "active_reasoning";
              break;
            case "thinking_end":
            case "text_end":
              phase = "output_transition";
              break;
            case "text_start":
            case "text_delta":
              phase = "active_text";
              break;
            case "toolcall_start":
            case "toolcall_delta":
              phase = "tool_arguments";
              break;
            case "toolcall_end":
              phase = "tool_complete";
              break;
            case "done":
            case "error":
              break;
          }
        }
        count(compact);
        // Flue publishes executable inputs only at toolcall_end. Text and
        // thinking can stream without admitting a call or completing a turn.
        if (
          event.type === "toolcall_end" ||
          event.type === "done" ||
          event.type === "error"
        )
          events.push(structuredClone(compact));
        else this.push(event);
      }
      const message = await Promise.race([upstream.result(), interrupted]);
      count(message);
      // Flue publishes toolcall_end inputs, then executes final-message calls.
      // Neither representation may smuggle a mixed proposal past admission.
      const finalCalls = message.content.flatMap((part) =>
        part.type === "toolCall" ? [part] : [],
      );
      const streamedCalls = events.flatMap((event) =>
        event.type === "toolcall_end" ? [event.toolCall] : [],
      );
      const names = [...finalCalls, ...streamedCalls].map((call) => call.name);
      if (
        names.some((name) => browserToolNames.has(name)) &&
        names.some((name) => !browserToolNames.has(name)) &&
        (!allowMixed ||
          names.some((name) => !idleRecovery?.mixedToolNames?.has(name)))
      ) {
        throw new Error(
          "Mixed browser/server proposal refused before admission. Submit revision or server work separately from browser work.",
        );
      }
      for (const [
        dependent,
        dependencies,
      ] of idleRecovery?.dependentToolNames ?? []) {
        const dependency = dependencies.find((name) => names.includes(name));
        if (names.includes(dependent) && dependency !== undefined)
          throw new Error(
            `Dependent proposal refused before admission: ${dependent} reads the result of ${dependency}. Call ${dependency} first, then ${dependent} after its result returns.`,
          );
      }
      const browserCalls = finalCalls.filter((call) =>
        browserToolNames.has(call.name),
      );
      const streamedBrowserCalls = streamedCalls.filter((call) =>
        browserToolNames.has(call.name),
      );
      const hasDuplicateIds = (calls: readonly { id: string }[]) =>
        new Set(calls.map((call) => call.id)).size !== calls.length;
      if (
        hasDuplicateIds(browserCalls) ||
        hasDuplicateIds(streamedBrowserCalls)
      ) {
        throw new Error(
          "Duplicate browser tool-call IDs refused before admission. Each call in a proposal representation must have a unique ID.",
        );
      }
      if (
        streamedBrowserCalls.some(
          (streamedCall) =>
            !browserCalls.some(
              (finalCall) =>
                finalCall.id === streamedCall.id &&
                finalCall.name === streamedCall.name &&
                isDeepStrictEqual(finalCall.arguments, streamedCall.arguments),
            ),
        )
      ) {
        throw new Error(
          "Inconsistent browser proposal refused before admission: published inputs must match the final call.",
        );
      }
      const approved = structuredClone(message);
      for (const event of events) {
        this.push(
          event.type === "done" || event.type === "error"
            ? event
            : { ...event, partial: approved },
        );
      }
      this.end();
      return approved;
    } catch (error) {
      events.length = 0;
      controller.abort(error);
      // return() may itself wait on a signal-ignoring provider. Never await it
      // on the cancellation path, and never consume any later output.
      void Promise.resolve()
        .then(() => iterator?.return?.())
        .catch(() => {});
      throw error;
    } finally {
      signal.removeEventListener("abort", rejectAbort);
    }
  }

  override async *[Symbol.asyncIterator]() {
    const iterator = super[Symbol.asyncIterator]();
    for (;;) {
      // eslint-disable-next-line no-await-in-loop -- Preserve provider event order.
      const next = await iterator.next();
      if (next.done) break;
      if (this.#parentSignal?.aborted) throw cancelled();
      yield next.value;
    }
    // Closing the queue wakes a waiting reader on failure; it must still see
    // the refusal, not interpret a truncated stream as successful completion.
    await this.#admitted;
  }

  override async result() {
    const message = await this.#admitted;
    if (this.#parentSignal?.aborted) throw cancelled();
    return message;
  }
}

const asyncBrowserToolAdmission = () => {
  const scope = modelAdmissionScope.getStore();
  return scope !== false && scope?.asyncBrowserTools === true;
};

/** Decorate both provider entrypoints; unrelated execution keeps its original stream. */
export const withBufferedToolAdmission = (
  provider: Provider,
  isActive: () => boolean,
  browserToolNames: ReadonlySet<string>,
  idleRecovery?: StreamIdleRecovery,
): Provider => ({
  ...provider,
  stream(model, context, options) {
    return isActive()
      ? new AdmittedStream(
          (signal) =>
            provider.stream<Api>(model, context, { ...options, signal }),
          options?.signal,
          browserToolNames,
          idleRecovery,
          asyncBrowserToolAdmission(),
        )
      : provider.stream(model, context, options);
  },
  streamSimple(model, context, options) {
    return isActive()
      ? new AdmittedStream(
          (signal) =>
            provider.streamSimple(model, context, { ...options, signal }),
          options?.signal,
          browserToolNames,
          idleRecovery,
          asyncBrowserToolAdmission(),
        )
      : provider.streamSimple(model, context, options);
  },
});
