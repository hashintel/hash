import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { brunchHeaders, brunchRoutes } from "@hashintel/brunch-agent";

import type { UserId } from "@blockprotocol/type-system";
import type { Logger } from "@local/hash-backend-utils/logger";
import type { Express, Request, Response } from "express";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

/**
 * The authenticated hop from a signed-in HASH user to the Brunch agent server.
 * NodeAPI authenticates the session and sets Brunch's owner key from it;
 * Brunch keeps its own ownership check, which derives the instance id from
 * that owner key plus the conversation id.
 *
 * Off unless `HASH_BRUNCH_AGENT_ORIGIN` is set. Brunch's identity headers are
 * only authentication when Brunch is reachable through this hop alone.
 */
const BRUNCH_AGENT_PROXY_PATH = "/api/brunch";

const notConfiguredError = { error: "Brunch agent is not configured" };

/**
 * Request headers the browser may pass through. Everything else is dropped,
 * including the HASH session cookie, which Brunch must never see.
 */
const isForwardedRequestHeader = (name: string) =>
  [
    "accept",
    "content-type",
    "last-event-id",
    brunchHeaders.conversation,
  ].includes(name) ||
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

const hasRequestBody = (request: Request) =>
  request.method !== "GET" &&
  request.method !== "HEAD" &&
  (request.headers["transfer-encoding"] !== undefined ||
    Number(request.headers["content-length"] ?? 0) > 0);

/**
 * The body to forward, or `null` when it cannot be forwarded. The app-wide
 * JSON body parser has already consumed a JSON stream, so the parsed value is
 * re-serialised: Brunch reads the JSON value, not its exact text. Any other
 * body was left unread and is refused rather than dropped.
 */
const requestBody = (request: Request): string | undefined | null => {
  if (!hasRequestBody(request)) {
    return undefined;
  }
  return request.is("application/json") ? JSON.stringify(request.body) : null;
};

export const setupBrunchAgentProxy = (
  app: Express,
  {
    origin,
    publicOrigin,
    logger,
  }: {
    origin: URL | null;
    /**
     * Where browsers reach this API, as a bare origin with no path or trailing
     * slash (the shape of `apiOrigin`); the hop's public URLs are built from it.
     */
    publicOrigin: string;
    logger: Pick<Logger, "warn">;
  },
) => {
  const agentsPrefix = `${brunchRoutes.agents}/`;

  /**
   * The signed-in user's Brunch owner key, which is also how the frontend
   * learns whether to offer Brunch at all: 401 without a session, and 503 with
   * the agent routes' "not configured" body when `HASH_BRUNCH_AGENT_ORIGIN` is
   * unset, so Brunch stays off unless it is configured.
   */
  app.get(`${BRUNCH_AGENT_PROXY_PATH}/identity`, (request, response) => {
    if (!request.user) {
      response.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!origin) {
      response.status(503).json(notConfiguredError);
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
        response.status(503).json(notConfiguredError);
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
        !upstreamUrl.pathname.startsWith(agentsPrefix)
      ) {
        response.status(404).json({ error: "Not found" });
        return;
      }
      const body = requestBody(request);
      if (body === null) {
        response.status(415).json({
          error: "Brunch agent requests must be JSON",
        });
        return;
      }
      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers)) {
        if (typeof value === "string" && isForwardedRequestHeader(name)) {
          headers.set(name, value);
        }
      }
      // Overwrites anything the browser sent under this name.
      headers.set(
        brunchHeaders.ownerKey,
        brunchOwnerKey(request.user.accountId),
      );

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
          body,
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
        const internalBase = `${origin.origin}${agentsPrefix}`;
        const publicBase = `${publicOrigin}${BRUNCH_AGENT_PROXY_PATH}${agentsPrefix}`;
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
          response.type("json");
          // Brunch's own admission JSON, served as JSON, with only its URLs
          // rewritten; nothing from the browser's request is reflected.
          // nosemgrep: ajinabraham.njsscan.xss.xss_node.express_xss
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
