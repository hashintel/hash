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

const getMastraApiOrigin = (): URL | null => {
  try {
    const url = new URL(MASTRA_API_ORIGIN);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url;
  } catch {
    return null;
  }
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { runId } = req.query;
  const upstreamOrigin = getMastraApiOrigin();

  if (!upstreamOrigin) {
    res.status(500).json({ error: "Invalid MASTRA_API_ORIGIN" });
    return;
  }

  if (typeof runId !== "string" || runId.trim().length === 0) {
    res.status(400).json({ error: "Missing runId" });
    return;
  }

  const upstreamUrl = new URL(
    `/ingest-runs/${encodeURIComponent(runId)}/events`,
    upstreamOrigin,
  );

  const headers: Record<string, string> = {
    Accept: "text/event-stream",
  };

  const lastEventId = req.headers["last-event-id"];
  if (typeof lastEventId === "string") {
    headers["Last-Event-ID"] = lastEventId;
  }

  const after = req.query.after;
  if (typeof after === "string") {
    upstreamUrl.searchParams.set("after", after);
  }

  const abortController = new AbortController();

  try {
    const upstream = await fetch(upstreamUrl, {
      headers,
      signal: abortController.signal,
    });

    if (!upstream.ok || !upstream.body) {
      res.status(upstream.status).json({ error: "Upstream error" });
      return;
    }

    const contentType = upstream.headers.get("content-type");
    if (!contentType?.includes("text/event-stream")) {
      await upstream.body.cancel();
      res.status(502).json({ error: "Unexpected upstream content type" });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Content-Type-Options": "nosniff",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    const reader = upstream.body.getReader();
    const abortUpstream = () => {
      if (abortController.signal.aborted) {
        return;
      }

      abortController.abort();
      reader.cancel().catch(() => {});
    };

    const pump = async () => {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- loop until stream ends
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        res.write(value);
      }
      res.end();
    };

    req.on("aborted", () => {
      abortUpstream();
    });

    res.on("close", () => {
      if (!res.writableEnded) {
        abortUpstream();
      }
    });

    await pump();
  } catch {
    if (abortController.signal.aborted) {
      if (!res.writableEnded) {
        res.end();
      }
      return;
    }

    if (!res.headersSent) {
      res.status(502).json({ error: "Failed to connect to upstream" });
      return;
    }

    if (!res.writableEnded) {
      res.end();
    }
  }
}
