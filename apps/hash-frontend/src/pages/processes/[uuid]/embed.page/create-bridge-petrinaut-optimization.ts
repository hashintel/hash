import {
  petrinautOptimizationEventSchema,
  type PetrinautOptimization,
  type PetrinautOptimizationEvent,
  type PetrinautOptimizationInput,
} from "@hashintel/petrinaut-core";

import {
  type HostToIframeMessage,
  type IframeToHostMessage,
  nextRequestId,
} from "../../shared/messages";

/** Classification of an optimization transport failure. */
export type OptimizationErrorCategory =
  | "network"
  | "http"
  | "protocol"
  | "aborted";

/**
 * A classified optimization transport failure carrying the correlation ids
 * needed to trace it to the NodeAPI and optimizer logs. Consumers build a
 * user-facing message from `category` and progress rather than surfacing the
 * raw `message`.
 */
export class PetrinautOptimizationTransportError extends Error {
  readonly category: OptimizationErrorCategory;
  readonly hashRequestId: string | null;
  readonly optimizationRunId: string | null;
  readonly httpStatus: number | null;
  /** Seconds from a `Retry-After` header, when the service sent one (429). */
  readonly retryAfter: number | null;

  constructor(
    message: string,
    options: {
      category: OptimizationErrorCategory;
      hashRequestId?: string | null;
      optimizationRunId?: string | null;
      httpStatus?: number | null;
      retryAfter?: number | null;
    },
  ) {
    super(message);
    this.name = "PetrinautOptimizationTransportError";
    this.category = options.category;
    this.hashRequestId = options.hashRequestId ?? null;
    this.optimizationRunId = options.optimizationRunId ?? null;
    this.httpStatus = options.httpStatus ?? null;
    this.retryAfter = options.retryAfter ?? null;
  }
}

type PendingRequest = {
  stream: ReadableStream<Uint8Array>;
  controller: ReadableStreamDefaultController<Uint8Array>;
  resolveResponse: (response: Response) => void;
  rejectResponse: (error: Error) => void;
  responded: boolean;
  /** Correlation ids from the response-start header, for later stream errors. */
  hashRequestId: string | null;
  optimizationRunId: string | null;
  clearResponseStartTimeout: () => void;
  cleanup: () => void;
};

type OptimizationSignal = NonNullable<
  Parameters<PetrinautOptimization["createOptimizationRun"]>[1]
>["signal"];

/** A `createOptimizationRun` round-trip awaiting its `optimizationCreateResult`. */
type PendingCreate = {
  resolve: (result: { runId: string }) => void;
  reject: (error: Error) => void;
  cleanup: () => void;
};

const pendingRequests = new Map<string, PendingRequest>();
const pendingCreates = new Map<string, PendingCreate>();
const RESPONSE_START_TIMEOUT_MS = 45_000;

/**
 * Outcomes of already-settled create round-trips, kept briefly so a late
 * `optimizationCreateResult` can be told apart from an unknown one. A late
 * success for a create that was locally aborted or timed out names a live
 * run nobody will ever own — it must be cancelled — while a duplicated
 * success for an accepted create must NOT cancel the live run.
 */
const settledCreates = new Map<string, "accepted" | "rejected">();

const rememberSettledCreate = (
  requestId: string,
  outcome: "accepted" | "rejected",
) => {
  settledCreates.set(requestId, outcome);
  // Expire the tombstone once a late reply can no longer be expected.
  setTimeout(() => settledCreates.delete(requestId), RESPONSE_START_TIMEOUT_MS);
};

const postToHost = (message: IframeToHostMessage) => {
  // The sandboxed iframe has an opaque origin. This still targets only its
  // parent window; the host independently verifies `event.source`.
  // nosemgrep: javascript.browser.security.wildcard-postmessage-configuration.wildcard-postmessage-configuration
  window.parent.postMessage(message, "*");
};

const abortError = () =>
  new DOMException("The optimization was aborted.", "AbortError");

const rejectPendingRequest = (requestId: string, error: Error) => {
  const pending = pendingRequests.get(requestId);
  if (!pending) {
    return;
  }

  if (pending.responded) {
    try {
      pending.controller.error(error);
    } catch {
      // The consumer may already have closed or cancelled the stream.
    }
  } else {
    pending.rejectResponse(error);
  }
  pending.cleanup();
  pendingRequests.delete(requestId);
};

const rejectPendingCreate = (requestId: string, error: Error) => {
  const pending = pendingCreates.get(requestId);
  if (!pending) {
    return;
  }
  pending.cleanup();
  pendingCreates.delete(requestId);
  rememberSettledCreate(requestId, "rejected");
  pending.reject(error);
};

let listenerInstalled = false;

const ensureListener = () => {
  if (listenerInstalled || typeof window === "undefined") {
    return;
  }
  listenerInstalled = true;

  // The iframe's opaque origin cannot be compared as a string. Authenticating
  // the exact parent Window is the applicable origin boundary here.
  // nosemgrep: javascript.browser.security.insufficient-postmessage-origin-validation.insufficient-postmessage-origin-validation
  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) {
      return;
    }

    const data = event.data as unknown;
    if (
      typeof data !== "object" ||
      data === null ||
      typeof (data as { kind?: unknown }).kind !== "string"
    ) {
      return;
    }

    const message = data as HostToIframeMessage;
    if (message.kind === "optimizationCreateResult") {
      const pendingCreate = pendingCreates.get(message.requestId);
      if (!pendingCreate) {
        // A late reply for a create that already timed out or aborted
        // locally (or an unknown request id): a successful one names a live
        // run nobody will ever own, so ask the host to cancel it.
        if (
          message.ok &&
          typeof message.runId === "string" &&
          settledCreates.get(message.requestId) !== "accepted"
        ) {
          postToHost({ kind: "optimizationCancel", runId: message.runId });
        }
        return;
      }
      pendingCreate.cleanup();
      pendingCreates.delete(message.requestId);
      if (message.ok && typeof message.runId === "string") {
        rememberSettledCreate(message.requestId, "accepted");
        pendingCreate.resolve({ runId: message.runId });
      } else {
        rememberSettledCreate(message.requestId, "rejected");
        pendingCreate.reject(
          new PetrinautOptimizationTransportError(
            message.message ?? "The optimization request failed",
            {
              category: message.category ?? "http",
              httpStatus: message.status,
              retryAfter: message.retryAfter,
              hashRequestId: message.hashRequestId,
              optimizationRunId: message.optimizationRunId,
            },
          ),
        );
      }
      return;
    }

    if (
      message.kind !== "optimizationResponseStart" &&
      message.kind !== "optimizationChunk" &&
      message.kind !== "optimizationEnd" &&
      message.kind !== "optimizationError"
    ) {
      return;
    }

    const pending = pendingRequests.get(message.requestId);
    if (!pending) {
      return;
    }

    switch (message.kind) {
      case "optimizationResponseStart": {
        if (pending.responded) {
          rejectPendingRequest(
            message.requestId,
            new PetrinautOptimizationTransportError(
              "The optimizer sent more than one response header",
              { category: "protocol" },
            ),
          );
          return;
        }
        pending.responded = true;
        pending.hashRequestId = message.hashRequestId;
        pending.optimizationRunId = message.optimizationRunId;
        pending.clearResponseStartTimeout();
        const headers = new Headers({
          "content-type": "application/x-ndjson",
        });
        // Carry the correlation ids on the synthesized response so the HTTP
        // error path (`readHttpError`) can attach them too.
        if (message.hashRequestId !== null) {
          headers.set("x-hash-request-id", message.hashRequestId);
        }
        if (message.optimizationRunId !== null) {
          headers.set("x-optimization-run-id", message.optimizationRunId);
        }
        pending.resolveResponse(
          new Response(pending.stream, {
            headers,
            status: message.status,
            statusText: message.statusText,
          }),
        );
        break;
      }
      case "optimizationChunk": {
        try {
          pending.controller.enqueue(message.bytes);
        } catch {
          // The consumer may already have cancelled the stream.
        }
        break;
      }
      case "optimizationEnd": {
        if (!pending.responded) {
          rejectPendingRequest(
            message.requestId,
            new PetrinautOptimizationTransportError(
              "The optimizer ended before sending a response",
              { category: "protocol" },
            ),
          );
          return;
        }
        try {
          pending.controller.close();
        } catch {
          // The stream is already settled.
        }
        pending.cleanup();
        pendingRequests.delete(message.requestId);
        break;
      }
      case "optimizationError":
        rejectPendingRequest(
          message.requestId,
          new PetrinautOptimizationTransportError(message.message, {
            category: message.category,
            hashRequestId: message.hashRequestId ?? pending.hashRequestId,
            optimizationRunId:
              message.optimizationRunId ?? pending.optimizationRunId,
            httpStatus: message.httpStatus,
          }),
        );
        break;
    }
  });
};

/**
 * Ask the host to open an optimizer NDJSON stream and synthesize a `Response`
 * from the relayed response-start/chunk/end/error messages. `initiate` is the
 * `optimizationAttach` message naming the detached run's event stream, and
 * must carry `requestId` so the relayed replies correlate back to this call.
 */
const openBridgeStream = (
  requestId: string,
  initiate: IframeToHostMessage,
  signal?: OptimizationSignal,
): Promise<Response> => {
  ensureListener();

  let streamController!: ReadableStreamDefaultController<Uint8Array>;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
    },
    cancel() {
      postToHost({ kind: "optimizationAbort", requestId });
      const pending = pendingRequests.get(requestId);
      pending?.cleanup();
      pendingRequests.delete(requestId);
    },
  });

  const onAbort = () => {
    postToHost({ kind: "optimizationAbort", requestId });
    rejectPendingRequest(requestId, abortError());
  };
  const responseStartTimeout = setTimeout(() => {
    postToHost({ kind: "optimizationAbort", requestId });
    rejectPendingRequest(
      requestId,
      new PetrinautOptimizationTransportError(
        "The optimization service did not respond in time",
        { category: "network" },
      ),
    );
  }, RESPONSE_START_TIMEOUT_MS);
  const clearResponseStartTimeout = () => clearTimeout(responseStartTimeout);

  const response = new Promise<Response>((resolve, reject) => {
    pendingRequests.set(requestId, {
      stream,
      controller: streamController,
      resolveResponse: resolve,
      rejectResponse: reject,
      responded: false,
      hashRequestId: null,
      optimizationRunId: null,
      clearResponseStartTimeout,
      cleanup: () => {
        clearResponseStartTimeout();
        signal?.removeEventListener("abort", onAbort);
      },
    });
  });

  if (signal?.aborted) {
    onAbort();
    return response;
  }
  signal?.addEventListener("abort", onAbort, { once: true });

  postToHost(initiate);
  return response;
};

/**
 * Ask the host to create a detached optimization run and resolve its
 * server-issued run id. Rejects with a classified
 * {@link PetrinautOptimizationTransportError} (carrying the HTTP status and
 * any `Retry-After` seconds) when the host reports a failure, or with an
 * `AbortError` when `signal` fires first.
 */
const requestOptimizationRunCreation = (
  input: PetrinautOptimizationInput,
  signal?: OptimizationSignal,
): Promise<{ runId: string }> => {
  ensureListener();

  const requestId = nextRequestId();

  return new Promise<{ runId: string }>((resolve, reject) => {
    const timeout = setTimeout(() => {
      rejectPendingCreate(
        requestId,
        new PetrinautOptimizationTransportError(
          "The optimization service did not respond in time",
          { category: "network" },
        ),
      );
    }, RESPONSE_START_TIMEOUT_MS);
    const onAbort = () => rejectPendingCreate(requestId, abortError());

    pendingCreates.set(requestId, {
      resolve,
      reject,
      cleanup: () => {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", onAbort);
      },
    });

    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });

    postToHost({ kind: "optimizationCreate", requestId, input });
  });
};

/** The correlation ids NodeAPI mirrors onto every proxied response. */
type ResponseCorrelation = {
  hashRequestId: string | null;
  optimizationRunId: string | null;
};

const responseCorrelation = (response: Response): ResponseCorrelation => ({
  hashRequestId: response.headers.get("x-hash-request-id"),
  optimizationRunId: response.headers.get("x-optimization-run-id"),
});

const readHttpError = async (
  response: Response,
): Promise<PetrinautOptimizationTransportError> => {
  const correlation = {
    category: "http" as const,
    ...responseCorrelation(response),
    httpStatus: response.status,
  };
  const body = await response.text();
  if (body) {
    try {
      const json = JSON.parse(body) as { error?: unknown; message?: unknown };
      const message =
        typeof json.error === "string"
          ? json.error
          : typeof json.message === "string"
            ? json.message
            : null;
      if (message) {
        return new PetrinautOptimizationTransportError(message, correlation);
      }
    } catch {
      // Fall through and include the plain response body.
    }
  }
  return new PetrinautOptimizationTransportError(
    body ||
      `Optimization request failed with status ${response.status} ${response.statusText}`,
    correlation,
  );
};

/**
 * A protocol violation while decoding the optimizer's NDJSON stream. The
 * correlation ids come from the response being decoded, so a stream that goes
 * wrong mid-flight is as traceable as one that fails its status line.
 */
const protocolError = (message: string, correlation?: ResponseCorrelation) =>
  new PetrinautOptimizationTransportError(message, {
    category: "protocol",
    ...correlation,
  });

const parseEventLine = (
  line: string,
  correlation: ResponseCorrelation,
): PetrinautOptimizationEvent => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw protocolError("The optimizer returned malformed NDJSON", correlation);
  }
  // A syntactically valid line can still be the wrong shape. Classify that as
  // a protocol violation too, so it takes the same reconnect path and the
  // schema's validation detail never reaches the user.
  const event = petrinautOptimizationEventSchema.safeParse(parsed);
  if (!event.success) {
    throw protocolError(
      "The optimizer returned an unrecognized event",
      correlation,
    );
  }
  return event.data;
};

/** Validate and decode the optimizer's public NDJSON protocol. */
export async function* parsePetrinautOptimizationResponse(
  response: Response,
): AsyncGenerator<PetrinautOptimizationEvent> {
  if (!response.ok) {
    throw await readHttpError(response);
  }
  const correlation = responseCorrelation(response);
  if (!response.body) {
    throw protocolError(
      "The optimizer returned an empty response body",
      correlation,
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminalEventSeen = false;
  let reachedEnd = false;

  const parseAndTrack = (line: string, terminalSeen: boolean) => {
    if (terminalSeen) {
      throw protocolError(
        "The optimizer returned data after a terminal event",
        correlation,
      );
    }
    const event = parseEventLine(line, correlation);
    return {
      event,
      terminal: event.type === "complete" || event.type === "error",
    };
  };

  try {
    let result = await reader.read();
    while (!result.done) {
      buffer += decoder.decode(result.value, { stream: true });

      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line) {
          const parsed = parseAndTrack(line, terminalEventSeen);
          terminalEventSeen = parsed.terminal;
          yield parsed.event;
        }
        newlineIndex = buffer.indexOf("\n");
      }
      result = await reader.read();
    }
    reachedEnd = true;
    buffer += decoder.decode();

    const finalLine = buffer.trim();
    if (finalLine) {
      const parsed = parseAndTrack(finalLine, terminalEventSeen);
      terminalEventSeen = parsed.terminal;
      yield parsed.event;
    }
    if (!terminalEventSeen) {
      throw protocolError(
        "The optimizer stream ended without a terminal event",
        correlation,
      );
    }
  } finally {
    if (!reachedEnd) {
      await reader.cancel().catch(() => undefined);
    }
  }
}

async function* streamOptimizationRun(
  runId: string,
  options: {
    cursor: number;
    signal?: OptimizationSignal;
    onAttached?: () => void;
  },
): AsyncGenerator<PetrinautOptimizationEvent> {
  const requestId = nextRequestId();
  const response = await openBridgeStream(
    requestId,
    { kind: "optimizationAttach", requestId, runId, cursor: options.cursor },
    options.signal,
  );
  if (response.ok) {
    // The attachment was accepted; events may still be a long way off on a
    // quiet run, so consumers get an explicit "connected" signal.
    options.onAttached?.();
  }
  yield* parsePetrinautOptimizationResponse(response);
}

/**
 * HASH implementation of Petrinaut's host capability. The sandboxed editor
 * never receives API credentials or an upstream URL; its parent owns both.
 */
export const createBridgePetrinautOptimization = (): PetrinautOptimization => {
  // Installed at bridge creation, not lazily on the first optimization call:
  // a late `optimizationCreateResult` arriving right after an iframe reload
  // must be heard so its orphaned run can be cancelled.
  ensureListener();
  return {
    createOptimizationRun: (input, options) =>
      requestOptimizationRunCreation(input, options?.signal),
    attachOptimizationRun: (runId, options) =>
      streamOptimizationRun(runId, {
        cursor: options?.cursor ?? 0,
        signal: options?.signal,
        onAttached: options?.onAttached,
      }),
    cancelOptimizationRun: (runId) => {
      // Fire-and-forget by design: the host DELETEs the run and only logs
      // failures, so there is no reply to await.
      postToHost({ kind: "optimizationCancel", runId });
      return Promise.resolve();
    },
  };
};
