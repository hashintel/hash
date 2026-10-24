/**
 * SSE proxy for ingest run events.
 *
 * Next.js rewrites buffer responses, which breaks SSE streaming, so this
 * route streams the Mastra API's event stream through instead.
 */
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import type { NextApiRequest, NextApiResponse } from "next";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

const isPrematureClose = (error: unknown): boolean =>
  error instanceof Error &&
  "code" in error &&
  error.code === "ERR_STREAM_PREMATURE_CLOSE";

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const mastraApiOrigin = process.env.MASTRA_API_ORIGIN;

  if (!mastraApiOrigin) {
    res.status(404).end();
    return;
  }

  const upstreamUrl = new URL(
    `/ingest-runs/${encodeURIComponent(String(req.query.runId))}/events`,
    mastraApiOrigin,
  );

  if (typeof req.query.after === "string") {
    upstreamUrl.searchParams.set("after", req.query.after);
  }

  const lastEventId = req.headers["last-event-id"];

  const upstream = await fetch(upstreamUrl, {
    headers: {
      Accept: "text/event-stream",
      ...(typeof lastEventId === "string"
        ? { "Last-Event-ID": lastEventId }
        : {}),
    },
  });

  if (!upstream.ok || !upstream.body) {
    res
      .status(upstream.status)
      .json({ error: `Upstream responded with ${upstream.status}` });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Content-Type-Options": "nosniff",
  });

  // `fetch` is typed with the DOM's ReadableStream; at runtime it is Node's
  const upstreamBody = upstream.body as NodeReadableStream<Uint8Array>;

  await pipeline(Readable.fromWeb(upstreamBody), res).catch(
    (error: unknown) => {
      // A client that leaves the page closes the response before the run ends
      if (!isPrematureClose(error)) {
        throw error;
      }
    },
  );
};

export default handler;
