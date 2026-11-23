import type { LiveToolBroadcaster } from "./live-tool-broadcaster";

const submissionIdFrom = (request: Request): string | undefined => {
  const submissionId = new URL(request.url).searchParams
    .get("submissionId")
    ?.trim();
  return submissionId !== undefined &&
    submissionId.length > 0 &&
    submissionId.length <= 256
    ? submissionId
    : undefined;
};

/**
 * How long the stream may go without a byte before it writes a heartbeat: well
 * inside the 125 s after which Cloudflare closes a response that has sent
 * nothing, as it would while the model thinks before a tool.
 */
const liveToolHeartbeatMs = 30_000;

/** An SSE comment, which the client's reader skips as a frame without data. */
const heartbeatComment = ": heartbeat\n\n";

/**
 * Serve one submission's live tool events as SSE, with a heartbeat comment
 * after each 30 s without an event. The caller owns routing and must authorize
 * the conversation before calling this.
 */
export const liveToolResponse = (
  broadcaster: LiveToolBroadcaster,
  input: {
    readonly instanceId: string;
    readonly request: Request;
  },
): Response => {
  const submissionId = submissionIdFrom(input.request);
  if (input.instanceId.length === 0 || submissionId === undefined) {
    return Response.json(
      { error: "invalid-live-subscription" },
      { status: 400 },
    );
  }

  let subscription: ReturnType<LiveToolBroadcaster["subscribe"]>;
  try {
    subscription = broadcaster.subscribe(input.instanceId, submissionId);
  } catch {
    return Response.json(
      { error: "live-subscription-unavailable" },
      { status: 503 },
    );
  }

  const encoder = new TextEncoder();
  const heartbeat = encoder.encode(heartbeatComment);
  const iterator = subscription.events[Symbol.asyncIterator]();
  const signal = input.request.signal;
  let closed = false;
  let quietTimer: ReturnType<typeof setTimeout> | undefined;
  let releaseAbort: (() => void) | undefined;
  const close = () => {
    closed = true;
    clearTimeout(quietTimer);
    quietTimer = undefined;
    releaseAbort?.();
    releaseAbort = undefined;
  };
  // Each write is a whole event, so a heartbeat always falls between events.
  // Skip writing when the stream is backpressured, but keep checking on the
  // next interval so heartbeats resume once the reader drains.
  const restartQuietInterval = (
    controller: ReadableStreamDefaultController<Uint8Array>,
  ) => {
    clearTimeout(quietTimer);
    quietTimer = setTimeout(() => {
      if ((controller.desiredSize ?? 0) > 0) {
        controller.enqueue(heartbeat);
      }
      restartQuietInterval(controller);
    }, liveToolHeartbeatMs);
  };
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const finishStream = () => {
        if (closed) return;
        close();
        subscription.close();
        controller.close();
      };
      if (signal.aborted) {
        finishStream();
        return;
      }
      signal.addEventListener("abort", finishStream, { once: true });
      releaseAbort = () => signal.removeEventListener("abort", finishStream);
      void subscription.closed.then(finishStream);
      restartQuietInterval(controller);
    },
    async pull(controller) {
      const next = await iterator.next();
      if (closed) return;
      if (next.done) {
        close();
        controller.close();
        return;
      }
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(next.value)}\n\n`),
      );
      if (next.value.kind === "submission-finished") {
        close();
        subscription.close();
        controller.close();
        return;
      }
      restartQuietInterval(controller);
    },
    async cancel() {
      if (closed) return;
      close();
      subscription.close();
      await iterator.return?.();
    },
  });

  return new Response(body, {
    headers: {
      "cache-control": "no-cache, no-transform",
      "content-type": "text/event-stream",
      "x-accel-buffering": "no",
    },
  });
};
