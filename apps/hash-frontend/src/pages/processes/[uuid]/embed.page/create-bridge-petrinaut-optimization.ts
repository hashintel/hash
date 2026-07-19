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

  constructor(
    message: string,
    options: {
      category: OptimizationErrorCategory;
      hashRequestId?: string | null;
      optimizationRunId?: string | null;
      httpStatus?: number | null;
    },
  ) {
    super(message);
    this.name = "PetrinautOptimizationTransportError";
    this.category = options.category;
    this.hashRequestId = options.hashRequestId ?? null;
    this.optimizationRunId = options.optimizationRunId ?? null;
    this.httpStatus = options.httpStatus ?? null;
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
  Parameters<PetrinautOptimization["optimize"]>[1]
>["signal"];

const pendingRequests = new Map<string, PendingRequest>();
const RESPONSE_START_TIMEOUT_MS = 45_000;

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

const bridgeFetch = (
  input: PetrinautOptimizationInput,
  signal?: OptimizationSignal,
): Promise<Response> => {
  ensureListener();

  const requestId = nextRequestId();
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

  postToHost({ kind: "optimizationRequest", requestId, input });
  return response;
};

const readHttpError = async (
  response: Response,
): Promise<PetrinautOptimizationTransportError> => {
  const correlation = {
    category: "http" as const,
    hashRequestId: response.headers.get("x-hash-request-id"),
    optimizationRunId: response.headers.get("x-optimization-run-id"),
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

/** A protocol violation while decoding the optimizer's NDJSON stream. */
const protocolError = (message: string) =>
  new PetrinautOptimizationTransportError(message, { category: "protocol" });

const parseEventLine = (line: string): PetrinautOptimizationEvent => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw protocolError("The optimizer returned malformed NDJSON");
  }
  return petrinautOptimizationEventSchema.parse(parsed);
};

/** Validate and decode the optimizer's public NDJSON protocol. */
export async function* parsePetrinautOptimizationResponse(
  response: Response,
): AsyncGenerator<PetrinautOptimizationEvent> {
  if (!response.ok) {
    throw await readHttpError(response);
  }
  if (!response.body) {
    throw protocolError("The optimizer returned an empty response body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminalEventSeen = false;
  let reachedEnd = false;

  const parseAndTrack = (line: string, terminalSeen: boolean) => {
    if (terminalSeen) {
      throw protocolError("The optimizer returned data after a terminal event");
    }
    const event = parseEventLine(line);
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
      );
    }
  } finally {
    if (!reachedEnd) {
      await reader.cancel().catch(() => undefined);
    }
  }
}

async function* streamOptimization(
  input: PetrinautOptimizationInput,
  signal?: OptimizationSignal,
): AsyncGenerator<PetrinautOptimizationEvent> {
  const response = await bridgeFetch(input, signal);
  yield* parsePetrinautOptimizationResponse(response);
}

/**
 * HASH implementation of Petrinaut's host capability. The sandboxed editor
 * never receives API credentials or an upstream URL; its parent owns both.
 */
export const createBridgePetrinautOptimization = (): PetrinautOptimization => ({
  optimize: (input, options) => streamOptimization(input, options?.signal),
});
