import type { LiveToolBroadcaster } from "./live-tool-broadcaster.ts";
import type { Context, Handler } from "hono";

const submissionIdFrom = (context: Context): string | undefined => {
  const submissionId = context.req.query("submissionId")?.trim();
  return submissionId !== undefined &&
    submissionId.length > 0 &&
    submissionId.length <= 256
    ? submissionId
    : undefined;
};

export const createLiveToolRoute = (
  broadcaster: LiveToolBroadcaster,
): Handler => {
  return (context) => {
    const instanceId = context.req.param("id");
    const submissionId = submissionIdFrom(context);
    if (instanceId === undefined || submissionId === undefined) {
      return context.json({ error: "invalid-live-subscription" }, 400);
    }

    let subscription: ReturnType<LiveToolBroadcaster["subscribe"]>;
    try {
      subscription = broadcaster.subscribe(instanceId, submissionId);
    } catch {
      return context.json({ error: "live-subscription-unavailable" }, 503);
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
};
