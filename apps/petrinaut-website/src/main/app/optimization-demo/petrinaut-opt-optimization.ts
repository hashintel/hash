import { createParser } from "eventsource-parser";

import {
  petrinautOptimizationEventSchema,
  type PetrinautOptimization,
  type PetrinautOptimizationEvent,
  type PetrinautOptimizationInput,
} from "@hashintel/petrinaut-core";

import type { EventSourceMessage, ParseError } from "eventsource-parser";

const PETRINAUT_OPTIMIZE_ENDPOINT = "/api/petrinaut-opt/optimize/all";

type Fetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
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

const isJsonRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseJson = (data: string): unknown => {
  try {
    return JSON.parse(data) as unknown;
  } catch {
    throw new Error("Petrinaut Opt returned malformed SSE data");
  }
};

const parseParameters = (value: unknown): Record<string, number | boolean> => {
  if (!isJsonRecord(value)) {
    throw new Error("Petrinaut Opt returned invalid trial parameters");
  }

  const parameters: Record<string, number | boolean> = {};
  for (const [identifier, parameterValue] of Object.entries(value)) {
    if (
      typeof parameterValue !== "boolean" &&
      (typeof parameterValue !== "number" || !Number.isFinite(parameterValue))
    ) {
      throw new Error("Petrinaut Opt returned invalid trial parameters");
    }
    parameters[identifier] = parameterValue;
  }
  return parameters;
};

const parseTrial = (value: unknown) => {
  if (!isJsonRecord(value)) {
    throw new Error("Petrinaut Opt returned an invalid SSE event");
  }
  if (!Number.isInteger(value.step) || (value.step as number) < 0) {
    throw new Error("Petrinaut Opt returned an invalid trial number");
  }
  if (typeof value.state !== "string") {
    throw new Error("Petrinaut Opt returned an invalid trial state");
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
    throw new Error("Petrinaut Opt returned an invalid trial state");
  }

  const objective =
    typeof value.metric === "number" && Number.isFinite(value.metric)
      ? value.metric
      : null;
  if (state === "complete" && objective === null) {
    throw new Error(
      "Petrinaut Opt returned a completed trial without an objective",
    );
  }

  return {
    trial: value.step as number,
    parameters: parseParameters(value.params),
    objective,
    state,
  };
};

const adaptSseEvent = (
  event: EventSourceMessage,
  state: StreamState,
): { event: PetrinautOptimizationEvent; state: StreamState } => {
  if (state.terminal) {
    throw new Error("Petrinaut Opt returned data after a terminal event");
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
            : "Petrinaut Opt reported an error",
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
            : "Petrinaut Opt reported an error",
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

/** Translate Petrinaut Opt's SSE stream into Petrinaut's public event stream. */
export async function* decodePetrinautOptStream(
  stream: ReadableStream<Uint8Array>,
  input: Pick<PetrinautOptimizationInput, "objective" | "study">,
): AsyncIterable<PetrinautOptimizationEvent> {
  let state: StreamState = {
    requestedTrials: input.study.trials,
    direction: input.objective.direction,
    completedTrials: 0,
    prunedTrials: 0,
    failedTrials: 0,
    best: null,
    terminal: false,
  };
  yield petrinautOptimizationEventSchema.parse({
    type: "started",
    requestedTrials: state.requestedTrials,
  });

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

  const drainEvents = function* drainEvents() {
    if (parseError) {
      throw new Error(
        `Petrinaut Opt returned malformed SSE: ${parseError.message}`,
      );
    }
    while (events.length > 0) {
      const adapted = adaptSseEvent(events.shift()!, state);
      state = adapted.state;
      yield adapted.event;
    }
  };

  try {
    let result = await reader.read();
    while (!result.done) {
      parser.feed(decoder.decode(result.value, { stream: true }));
      yield* drainEvents();
      result = await reader.read();
    }
    parser.feed(decoder.decode());
    parser.reset({ consume: true });
    yield* drainEvents();

    if (!state.terminal) {
      throw new Error("Petrinaut Opt ended without returning a terminal event");
    }
    completed = true;
  } finally {
    if (!completed) {
      await reader.cancel().catch(() => undefined);
    }
    reader.releaseLock();
  }
}

const responseErrorMessage = async (response: Response): Promise<string> => {
  try {
    const payload: unknown = await response.json();
    if (isJsonRecord(payload)) {
      if (typeof payload.detail === "string") {
        return payload.detail;
      }
      if (typeof payload.message === "string") {
        return payload.message;
      }
    }
  } catch {
    // Fall back to the status below when the service did not return JSON.
  }
  return `Petrinaut Opt returned status ${response.status}`;
};

export const createPetrinautOptOptimization = (
  fetchImpl: Fetch = fetch,
): PetrinautOptimization => ({
  async *optimize(input, options) {
    const response = await fetchImpl(PETRINAUT_OPTIMIZE_ENDPOINT, {
      method: "POST",
      headers: {
        accept: "text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
      signal: options?.signal as AbortSignal | undefined,
    });
    if (!response.ok) {
      throw new Error(await responseErrorMessage(response));
    }
    if (!response.body) {
      throw new Error("Petrinaut Opt returned an empty response");
    }

    yield* decodePetrinautOptStream(response.body, input);
  },
});
