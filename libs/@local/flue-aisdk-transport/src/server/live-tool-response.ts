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
 * How long the stream may go without a byte before it writes a heartbeat, by
 * default: well inside the 125 s after which Cloudflare closes a response
 * that has sent nothing, as it would while the model thinks before a tool.
 */
const defaultLiveToolHeartbeatMs = 30_000;

/** An SSE comment, which the client's reader skips as a frame without data. */
const heartbeatComment = ": heartbeat\n\n";

/**
 * Serve one submission's live tool events as SSE, with a heartbeat comment
 * after each `heartbeatMs` without an event. The caller owns routing and
 * must authorize the conversation before calling this.
 */
export const liveToolResponse = (
  broadcaster: LiveToolBroadcaster,
  input: {
    readonly instanceId: string;
    readonly request: Request;
    readonly heartbeatMs?: number;
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
  const heartbeatMs = input.heartbeatMs ?? defaultLiveToolHeartbeatMs;
  const iterator = subscription.events[Symbol.asyncIterator]();
  let closed = false;
  let quietTimer: ReturnType<typeof setTimeout> | undefined;
  const close = () => {
    closed = true;
    clearTimeout(quietTimer);
  };
  // Each write is a whole event, so a heartbeat always falls between events.
  const restartQuietInterval = (
    controller: ReadableStreamDefaultController<Uint8Array>,
  ) => {
    clearTimeout(quietTimer);
    quietTimer = setTimeout(() => {
      if (closed) return;
      controller.enqueue(heartbeat);
      restartQuietInterval(controller);
    }, heartbeatMs);
  };
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
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
