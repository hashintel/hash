import { isDeepStrictEqual } from "node:util";

import { EventStream } from "@earendil-works/pi-ai";

import type {
  Api,
  AssistantMessage,
  AssistantMessageEvent,
  AssistantMessageEventStream,
  Provider,
} from "@earendil-works/pi-ai";

// Limits cover the entire buffered proposal, not each individual chunk. Errors
// deliberately do not resemble Flue's retryable provider/network failures.
export const admissionBufferLimits = {
  bytes: 8 * 1024 * 1024,
  events: 16_384,
  milliseconds: 120_000,
} as const;
const bufferLimitError = () =>
  new Error("Brunch response exceeded the admission buffering limit.");
const cancelled = () =>
  new DOMException("Brunch response cancelled before admission.", "AbortError");

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
    this.#admitted = this.#collect(start, parentSignal, browserToolNames);
    // Providers start eagerly; a caller may not yet have attached its iterator.
    // Keep rejection observable through both read surfaces, without an unhandled
    // rejection if cancellation wins before the caller starts reading.
    void this.#admitted.catch(() => {});
  }

  async #collect(
    start: (signal: AbortSignal) => AssistantMessageEventStream,
    parentSignal: AbortSignal | undefined,
    browserToolNames: ReadonlySet<string>,
  ) {
    const controller = new AbortController();
    const signal = parentSignal
      ? AbortSignal.any([parentSignal, controller.signal])
      : controller.signal;
    const events: BufferedEvent[] = [];
    let bytes = 0;
    let rejectAbort: () => void = () => {};
    let iterator: AsyncIterator<AssistantMessageEvent> | undefined;
    const interrupted = new Promise<never>((_resolve, reject) => {
      rejectAbort = () =>
        reject(parentSignal?.aborted ? cancelled() : controller.signal.reason);
      signal.addEventListener("abort", rejectAbort, { once: true });
    });
    void interrupted.catch(() => {});
    const timer = setTimeout(
      () => controller.abort(bufferLimitError()),
      admissionBufferLimits.milliseconds,
    );
    const count = (value: unknown) => {
      bytes += Buffer.byteLength(JSON.stringify(value), "utf8");
      if (
        bytes > admissionBufferLimits.bytes ||
        events.length >= admissionBufferLimits.events
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
        // eslint-disable-next-line no-await-in-loop -- Provider events are an ordered stream.
        const next = await Promise.race([iterator.next(), interrupted]);
        if (next.done) break;
        const event = next.value;
        const compact: BufferedEvent =
          "partial" in event
            ? (({ partial: _partial, ...rest }) => rest)(event)
            : event;
        count(compact);
        events.push(structuredClone(compact));
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
        names.some((name) => !browserToolNames.has(name))
      ) {
        throw new Error(
          "Mixed browser/server proposal refused before admission. Submit revision or server work separately from browser work.",
        );
      }
      const browserCalls = finalCalls.filter((call) =>
        browserToolNames.has(call.name),
      );
      const streamedBrowserCalls = streamedCalls.filter((call) =>
        browserToolNames.has(call.name),
      );
      const browserCallIds = new Set(
        [...browserCalls, ...streamedBrowserCalls].map((call) => call.id),
      );
      if (browserCalls.length > 1 || browserCallIds.size > 1) {
        throw new Error(
          "Multiple browser calls refused before admission. Submit one browser call per proposal and wait for its correlated result.",
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
      return { events, message: structuredClone(message) };
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
      clearTimeout(timer);
      signal.removeEventListener("abort", rejectAbort);
    }
  }

  override async *[Symbol.asyncIterator]() {
    const { events, message } = await this.#admitted;
    for (const event of events) {
      if (this.#parentSignal?.aborted) throw cancelled();
      // The complete approved message is the partial snapshot during replay.
      // Keeping every upstream growing partial would require quadratic memory;
      // deltas, call arguments, signatures and terminal results stay unchanged.
      yield event.type === "done" || event.type === "error"
        ? event
        : { ...event, partial: message };
    }
  }

  override async result() {
    const { message } = await this.#admitted;
    if (this.#parentSignal?.aborted) throw cancelled();
    return message;
  }
}

/** Decorate both provider entrypoints; unrelated execution keeps its original stream. */
export const withBufferedToolAdmission = (
  provider: Provider,
  isActive: () => boolean,
  browserToolNames: ReadonlySet<string>,
): Provider => ({
  ...provider,
  stream(model, context, options) {
    return isActive()
      ? new AdmittedStream(
          (signal) =>
            provider.stream<Api>(model, context, { ...options, signal }),
          options?.signal,
          browserToolNames,
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
        )
      : provider.streamSimple(model, context, options);
  },
});
