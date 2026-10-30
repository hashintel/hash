import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import type { UserId } from "@blockprotocol/type-system";
import type { Logger } from "@local/hash-backend-utils/logger";
import type { Express, Request, Response } from "express";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

/**
 * FE-2010 probe: an authenticated hop from a signed-in HASH user to the Brunch
 * agent server. NodeAPI authenticates the session and sets Brunch's owner key
 * from it; Brunch keeps its own ownership check, which derives the instance id
 * from that owner key plus the conversation id.
 *
 * Off unless `HASH_BRUNCH_AGENT_ORIGIN` is set. Brunch's identity headers are
 * only authentication when Brunch is reachable through this hop alone.
 */
const BRUNCH_AGENT_PROXY_PATH = "/api/brunch";

// Names from `brunchHeaders` in `@hashintel/brunch-agent`, inlined so the
// probe adds no workspace dependency.
const ownerKeyHeader = "x-brunch-principal";
const conversationHeader = "x-brunch-conversation";

/**
 * Request headers the browser may pass through. Everything else is dropped,
 * including the HASH session cookie, which Brunch must never see.
 */
const isForwardedRequestHeader = (name: string) =>
  ["accept", "content-type", "last-event-id", conversationHeader].includes(
    name,
  ) ||
  name.startsWith("stream-") ||
  name.startsWith("flue-");

/**
 * Response headers never passed back: hop-by-hop, cookies, and the length and
 * encoding that `fetch` has already consumed by decoding the body.
 */
const droppedResponseHeaders = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "set-cookie",
  "transfer-encoding",
]);

export const getBrunchAgentOrigin = (
  environment: NodeJS.ProcessEnv = process.env,
): URL | null => {
  const value = environment.HASH_BRUNCH_AGENT_ORIGIN;
  return value ? new URL(value) : null;
};

/** Brunch owner key for a HASH account: set by NodeAPI, never by the browser. */
const brunchOwnerKey = (accountId: UserId) => `hash:${accountId}`;

const requestBody = (request: Request): string | undefined => {
  if (request.method === "GET" || request.method === "HEAD") {
    return undefined;
  }
  // The JSON body parser has already consumed the stream; re-serialise it.
  // Brunch reads the JSON value, not its exact text. Non-JSON bodies
  // (attachments) are not proxied by this probe.
  return request.is("application/json") ? JSON.stringify(request.body) : "";
};

export const setupBrunchAgentProxy = (
  app: Express,
  {
    origin,
    publicOrigin,
    logger,
  }: {
    origin: URL | null;
    /** Where browsers reach this API; the hop's public URLs are built from it. */
    publicOrigin: string;
    logger: Pick<Logger, "warn">;
  },
) => {
  app.get(`${BRUNCH_AGENT_PROXY_PATH}/identity`, (request, response) => {
    if (!request.user) {
      response.status(401).json({ error: "Authentication required" });
      return;
    }
    response.json({ ownerKey: brunchOwnerKey(request.user.accountId) });
  });

  app.use(
    BRUNCH_AGENT_PROXY_PATH,
    async (request: Request, response: Response) => {
      if (!request.user) {
        response.status(401).json({ error: "Authentication required" });
        return;
      }
      if (!origin) {
        response.status(503).json({ error: "Brunch agent is not configured" });
        return;
      }
      // Check the URL that is forwarded, not the request path: URL parsing
      // resolves `..`, `%2e%2e` and `\`, which would otherwise reach Brunch
      // routes outside its agents.
      const upstreamUrl = new URL(
        request.originalUrl.slice(BRUNCH_AGENT_PROXY_PATH.length),
        origin,
      );
      if (
        upstreamUrl.origin !== origin.origin ||
        !upstreamUrl.pathname.startsWith("/agents/")
      ) {
        response.status(404).json({ error: "Not found" });
        return;
      }
      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers)) {
        if (typeof value === "string" && isForwardedRequestHeader(name)) {
          headers.set(name, value);
        }
      }
      // Overwrites anything the browser sent under this name.
      headers.set(ownerKeyHeader, brunchOwnerKey(request.user.accountId));

      const abort = new AbortController();
      response.on("close", () => {
        if (!response.writableFinished) {
          abort.abort();
        }
      });

      try {
        const upstream = await fetch(upstreamUrl, {
          method: request.method,
          headers,
          body: requestBody(request),
          signal: abort.signal,
        });
        response.status(upstream.status);
        // The durable-streams client reads its next offset, cursor and
        // up-to-date state from these headers; cross-origin JS cannot see
        // them unless they are exposed.
        response.setHeader(
          "access-control-expose-headers",
          "location, stream-next-offset, stream-cursor, stream-up-to-date, stream-closed, flue-error-ref",
        );
        // Flue builds `streamUrl` and `Location` from the URL it was reached
        // at, which names Brunch's internal origin. Point both back through
        // this hop.
        const internalBase = `${origin.origin}/agents/`;
        const publicBase = `${new URL(publicOrigin).origin}${BRUNCH_AGENT_PROXY_PATH}/agents/`;
        for (const [name, value] of upstream.headers) {
          if (
            !droppedResponseHeaders.has(name) &&
            !name.startsWith("access-control-")
          ) {
            response.setHeader(
              name,
              name === "location"
                ? value.replace(internalBase, publicBase)
                : value,
            );
          }
        }
        if (upstream.status === 202) {
          // An admission is a small JSON body, never a stream.
          const admission = await upstream.text();
          response.send(admission.replaceAll(internalBase, publicBase));
          return;
        }
        response.flushHeaders();
        if (upstream.body) {
          await pipeline(
            // The DOM and Node web-stream types differ only nominally.
            Readable.fromWeb(upstream.body as NodeReadableStream<Uint8Array>),
            response,
          );
        } else {
          response.end();
        }
      } catch (error) {
        if (abort.signal.aborted) {
          return;
        }
        logger.warn("Brunch agent proxy request failed", {
          error,
          path: request.path,
        });
        if (!response.headersSent) {
          response.status(502).json({ error: "Brunch agent unavailable" });
        } else {
          response.destroy();
        }
      }
    },
  );
};
