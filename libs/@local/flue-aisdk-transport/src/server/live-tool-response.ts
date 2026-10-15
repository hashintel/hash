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
 * Serve one submission's live tool events as SSE. The caller owns routing and
 * must authorize the conversation before calling this.
 */
export const liveToolResponse = (
  broadcaster: LiveToolBroadcaster,
  input: { readonly instanceId: string; readonly request: Request },
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
  const iterator = subscription.events[Symbol.asyncIterator]();
  let closed = false;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await iterator.next();
      if (closed) return;
      if (next.done) {
        closed = true;
        controller.close();
        return;
      }
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(next.value)}\n\n`),
      );
      if (next.value.kind === "submission-finished") {
        closed = true;
        subscription.close();
        controller.close();
      }
    },
    async cancel() {
      if (closed) return;
      closed = true;
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
