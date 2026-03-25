/**
 * SSE proxy for ingest run events.
 *
 * Next.js rewrites buffer responses, breaking SSE streaming. This API route
 * manually proxies the EventSource connection to the Mastra API with proper
 * streaming headers.
 */
import type { NextApiRequest, NextApiResponse } from "next";

const MASTRA_API_ORIGIN =
  process.env.MASTRA_API_ORIGIN ?? "http://localhost:4111";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { runId } = req.query;

  if (typeof runId !== "string") {
    res.status(400).json({ error: "Missing runId" });
    return;
  }

  const upstreamUrl = `${MASTRA_API_ORIGIN}/ingest-runs/${runId}/events`;

  const headers: Record<string, string> = {
    Accept: "text/event-stream",
  };

  const lastEventId = req.headers["last-event-id"];
  if (typeof lastEventId === "string") {
    headers["Last-Event-ID"] = lastEventId;
  }

  const after = req.query.after;
  const url =
    typeof after === "string" ? `${upstreamUrl}?after=${after}` : upstreamUrl;

  try {
    const upstream = await fetch(url, { headers });

    if (!upstream.ok || !upstream.body) {
      res.status(upstream.status).json({ error: "Upstream error" });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();

    const pump = async () => {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- loop until stream ends
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk);
      }
      res.end();
    };

    req.on("close", () => {
      reader.cancel().catch(() => {});
    });

    await pump();
  } catch {
    if (!res.headersSent) {
      res.status(502).json({ error: "Failed to connect to upstream" });
    }
  }
}
