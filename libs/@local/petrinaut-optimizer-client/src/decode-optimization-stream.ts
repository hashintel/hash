import { createParser } from "eventsource-parser";

import {
  petrinautOptimizationEventSchema,
  type PetrinautOptimizationEvent,
  type PetrinautOptimizationInput,
} from "@hashintel/petrinaut-core";

import type { EventSourceMessage, ParseError } from "eventsource-parser";

type JsonRecord = Record<string, unknown>;

type StreamState = {
  requestedTrials: number;
  direction: PetrinautOptimizationInput["objective"]["direction"];
  completedTrials: number;
  prunedTrials: number;
  failedTrials: number;
  best: Extract<PetrinautOptimizationEvent, { type: "complete" }>["best"];
  terminal: boolean;
};

/** Configuration needed to adapt one upstream optimization stream. */
export type DecodePetrinautOptimizerStreamOptions = {
  /** Whether lower or higher objective values are considered better. */
  direction: PetrinautOptimizationInput["objective"]["direction"];
  /** Number of trials requested by the optimization manifest. */
  requestedTrials: number;
  /** Optional UTF-8 byte limit applied to each complete upstream event. */
  maxEventBytes?: number;
  /** Called whenever bytes arrive, including heartbeat-only chunks. */
  onActivity?: () => void;
};

const textEncoder = new TextEncoder();

/** Return whether an unknown value is a non-array JSON object. */
const isJsonRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Parse the JSON data carried by one upstream SSE event. */
const parseJson = (data: string): unknown => {
  try {
    return JSON.parse(data) as unknown;
  } catch {
    throw new Error("Petrinaut optimizer returned malformed SSE data");
  }
};

/** Measure a string's encoded UTF-8 size without relying on Node APIs. */
const utf8ByteLength = (value: string): number =>
  textEncoder.encode(value).byteLength;

/** Validate the flat parameter values returned for one Optuna trial. */
const parseParameters = (value: unknown): Record<string, number | boolean> => {
  if (!isJsonRecord(value)) {
    throw new Error("Petrinaut optimizer returned invalid trial parameters");
  }

  const parameters: Record<string, number | boolean> = {};
  for (const [identifier, parameterValue] of Object.entries(value)) {
    if (
      typeof parameterValue !== "boolean" &&
      (typeof parameterValue !== "number" || !Number.isFinite(parameterValue))
    ) {
      throw new Error("Petrinaut optimizer returned invalid trial parameters");
    }
    parameters[identifier] = parameterValue;
  }
  return parameters;
};

/** Convert one optimizer trial payload into the canonical trial fields. */
const parseTrial = (
  value: unknown,
): Omit<
  Extract<PetrinautOptimizationEvent, { type: "trial" }>,
  "type" | "best"
> => {
  if (!isJsonRecord(value)) {
    throw new Error("Petrinaut optimizer returned an invalid SSE event");
  }
  if (!Number.isInteger(value.step) || (value.step as number) < 0) {
    throw new Error("Petrinaut optimizer returned an invalid trial number");
  }
  if (typeof value.state !== "string") {
    throw new Error("Petrinaut optimizer returned an invalid trial state");
  }

  const upstreamState = value.state.toUpperCase();
  const state =
    upstreamState === "COMPLETE"
      ? "complete"
      : upstreamState === "PRUNED"
        ? "pruned"
        : upstreamState === "FAIL" || upstreamState === "FAILED"
          ? "failed"
          : null;
  if (!state) {
    throw new Error("Petrinaut optimizer returned an invalid trial state");
  }

  const objective =
    typeof value.metric === "number" && Number.isFinite(value.metric)
      ? value.metric
      : null;
  if (state === "complete" && objective === null) {
    throw new Error(
      "Petrinaut optimizer returned a completed trial without an objective",
    );
  }

  return {
    trial: value.step as number,
    parameters: parseParameters(value.params),
    objective,
    state,
  };
};

/** Adapt one parsed upstream SSE event and advance aggregate stream state. */
const adaptSseEvent = (
  event: EventSourceMessage,
  state: StreamState,
  maxEventBytes?: number,
): { event: PetrinautOptimizationEvent; state: StreamState } => {
  if (state.terminal) {
    throw new Error("Petrinaut optimizer returned data after a terminal event");
  }
  if (
    maxEventBytes !== undefined &&
    utf8ByteLength(event.data) > maxEventBytes
  ) {
    throw new Error("Petrinaut optimizer returned an oversized event");
  }

  const value = parseJson(event.data);
  if (event.event === "error") {
    return {
      event: petrinautOptimizationEventSchema.parse({
        type: "error",
        code: "optimization_failed",
        message:
          isJsonRecord(value) && typeof value.message === "string"
            ? value.message
            : "Petrinaut optimizer reported an error",
        retryable: false,
      }),
      state: { ...state, terminal: true },
    };
  }
  if (event.event === "done") {
    return {
      event: petrinautOptimizationEventSchema.parse({
        type: "complete",
        requestedTrials: state.requestedTrials,
        completedTrials: state.completedTrials,
        prunedTrials: state.prunedTrials,
        failedTrials: state.failedTrials,
        best: state.best,
      }),
      state: { ...state, terminal: true },
    };
  }
  if (
    isJsonRecord(value) &&
    typeof value.state === "string" &&
    value.state.toUpperCase() === "ERROR"
  ) {
    return {
      event: petrinautOptimizationEventSchema.parse({
        type: "error",
        code: "optimization_failed",
        message:
          typeof value.message === "string"
            ? value.message
            : "Petrinaut optimizer reported an error",
        retryable: false,
      }),
      state: { ...state, terminal: true },
    };
  }

  const trial = parseTrial(value);
  const best =
    trial.state === "complete" &&
    trial.objective !== null &&
    (state.best === null ||
      (state.direction === "maximize"
        ? trial.objective > state.best.objective
        : trial.objective < state.best.objective))
      ? {
          trial: trial.trial,
          parameters: trial.parameters,
          objective: trial.objective,
        }
      : state.best;
  const nextState: StreamState = {
    ...state,
    completedTrials:
      state.completedTrials + (trial.state === "complete" ? 1 : 0),
    prunedTrials: state.prunedTrials + (trial.state === "pruned" ? 1 : 0),
    failedTrials: state.failedTrials + (trial.state === "failed" ? 1 : 0),
    best,
  };

  return {
    event: petrinautOptimizationEventSchema.parse({
      type: "trial",
      ...trial,
      best,
    }),
    state: nextState,
  };
};

/**
 * Decode Petrinaut Optimizer's private SSE protocol into canonical events.
 *
 * The decoder is browser-safe so NodeAPI and local browser integrations use
 * exactly the same protocol validation, aggregation, and terminal semantics.
 */
export async function* decodePetrinautOptimizerStream(
  stream: ReadableStream<Uint8Array>,
  options: DecodePetrinautOptimizerStreamOptions,
): AsyncIterable<PetrinautOptimizationEvent> {
  let state: StreamState = {
    requestedTrials: options.requestedTrials,
    direction: options.direction,
    completedTrials: 0,
    prunedTrials: 0,
    failedTrials: 0,
    best: null,
    terminal: false,
  };
  const events: EventSourceMessage[] = [];
  let parseError: ParseError | null = null;
  const parser = createParser({
    onEvent: (event) => events.push(event),
    onError: (error) => {
      parseError ??= error;
    },
  });
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let completed = false;
  let pendingEventText = "";

  /** Enforce the event limit before an unterminated event can grow unbounded. */
  const trackPendingEventSize = (fragment: string): void => {
    if (options.maxEventBytes === undefined) {
      return;
    }

    pendingEventText += fragment;
    const eventSeparator = /(?:\r\n|\r|\n)(?:\r\n|\r|\n)/g;
    let lastSeparatorEnd = 0;
    for (let match = eventSeparator.exec(pendingEventText); match; ) {
      lastSeparatorEnd = eventSeparator.lastIndex;
      match = eventSeparator.exec(pendingEventText);
    }
    if (lastSeparatorEnd > 0) {
      pendingEventText = pendingEventText.slice(lastSeparatorEnd);
    }
    if (utf8ByteLength(pendingEventText) > options.maxEventBytes) {
      throw new Error("Petrinaut optimizer returned an oversized event");
    }
  };

  /** Yield all complete SSE events buffered by the parser. */
  const drainEvents = function* drainEvents() {
    if (parseError) {
      throw new Error(
        `Petrinaut optimizer returned malformed SSE: ${parseError.message}`,
      );
    }
    while (events.length > 0) {
      const event = events.shift();
      if (!event) {
        break;
      }
      const adapted = adaptSseEvent(event, state, options.maxEventBytes);
      state = adapted.state;
      yield adapted.event;
    }
  };

  try {
    yield petrinautOptimizationEventSchema.parse({
      type: "started",
      requestedTrials: state.requestedTrials,
    });

    let result = await reader.read();
    while (!result.done) {
      options.onActivity?.();
      const fragment = decoder.decode(result.value, { stream: true });
      trackPendingEventSize(fragment);
      parser.feed(fragment);
      yield* drainEvents();
      result = await reader.read();
    }
    const finalFragment = decoder.decode();
    trackPendingEventSize(finalFragment);
    parser.feed(finalFragment);
    parser.reset({ consume: true });
    yield* drainEvents();

    if (!state.terminal) {
      throw new Error(
        "Petrinaut optimizer ended without returning a terminal event",
      );
    }
    completed = true;
  } finally {
    if (!completed) {
      await reader.cancel().catch(() => undefined);
    }
    reader.releaseLock();
  }
}
