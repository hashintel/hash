import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import express from "express";
import { rateLimit } from "express-rate-limit";

import {
  brunchCallerAuthorization,
  brunchExposedResponseHeaders,
  brunchHeaders,
  brunchRoutes,
} from "@local/brunch-configs/wire";

import { getActorIdFromRequest } from "../auth/get-actor-id";

import type { UserId } from "@blockprotocol/type-system";
import type { Logger } from "@local/hash-backend-utils/logger";
import type { Express, NextFunction, Request, Response } from "express";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

/**
 * The authenticated hop from a signed-in HASH user to the Brunch agent server.
 * NodeAPI authenticates the session and sets Brunch's actor key from it;
 * Brunch keeps its own ownership check, which derives the instance id from
 * that actor key plus the conversation id.
 *
 * Off unless `HASH_BRUNCH_AGENT_ORIGIN` and `HASH_BRUNCH_AGENT_SECRET` are
 * both set. Brunch admits only requests that present that secret, which this
 * hop alone holds, on its HASH agent's route; it trusts the identity headers
 * they carry.
 */
const brunchAgentProxyPath = "/api/brunch";

/**
 * The only agent this hop serves: HASH's process page talks to the HASH agent
 * alone, so Brunch's other agents stay unreachable from HASH sessions.
 */
const hashAgentPrefix = `${brunchRoutes.agents}/${brunchRoutes.hashAgent}/`;

/**
 * Turn submissions each signed-in user may make per minute. Every submission
 * starts a model turn, so this bounds the model spend one account can cause.
 * A person typing messages or answering the agent stays far below it; a
 * runaway script or loop does not.
 */
const turnSubmissionsPerMinute = 30;

/** As the app-wide JSON body parser in `index.ts`. */
const jsonBodyLimit = "16mb";

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

/** The secret this hop presents to Brunch; never sent to a browser. */
export const getBrunchAgentSecret = (
  environment: NodeJS.ProcessEnv = process.env,
): string | null => environment.HASH_BRUNCH_AGENT_SECRET ?? null;

/** Brunch actor key for a HASH account: set by NodeAPI, never by the browser. */
const brunchActorKey = (accountId: UserId) => `hash:${accountId}`;

const hasRequestBody = (request: Request) =>
  request.method !== "GET" &&
  request.method !== "HEAD" &&
  (request.headers["transfer-encoding"] !== undefined ||
    Number(request.headers["content-length"] ?? 0) > 0);

/**
 * The Brunch URL a request forwards to, or `null` when it falls outside the
 * HASH agent. Checks the URL that is forwarded, not the request path: URL
 * parsing resolves `..`, `%2e%2e` and `\`, which would otherwise reach other
 * Brunch routes.
 */
const hashAgentUrl = (request: Request, origin: URL): URL | null => {
  const upstreamUrl = new URL(
    request.originalUrl.slice(brunchAgentProxyPath.length),
    origin,
  );
  return upstreamUrl.origin === origin.origin &&
    upstreamUrl.pathname.startsWith(hashAgentPrefix)
    ? upstreamUrl
    : null;
};

/**
 * Whether a request submits a turn: Flue's `send` is a `POST` to the
 * conversation's instance URL itself. Its sub-routes (`abort`, browser-call
 * claims, leases and settlements) and every `GET` start no turn.
 */
const isTurnSubmission = (request: Request, upstreamUrl: URL) =>
  request.method === "POST" &&
  /^[^/]+\/?$/u.test(upstreamUrl.pathname.slice(hashAgentPrefix.length));

/**
 * The body to forward, or `null` when it cannot be forwarded. The hop's JSON
 * body parser has already consumed a JSON stream, so the parsed value is
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
    origin: configuredOrigin,
    secret,
    publicOrigin,
    logger,
  }: {
    origin: URL | null;
    /** Without it, the hop is off as if no origin were set. */
    secret: string | null;
    /**
     * Where browsers reach this API, as a bare origin with no path or trailing
     * slash (the shape of `apiOrigin`); the hop's public URLs are built from it.
     */
    publicOrigin: string;
    logger: Pick<Logger, "warn">;
  },
) => {
  /**
   * How this hop authenticates to Brunch. Without a secret Brunch would refuse
   * every request, so the hop is not configured at all.
   */
  const authorization = secret
    ? `${brunchCallerAuthorization.hashScheme} ${secret}`
    : null;
  const origin = authorization ? configuredOrigin : null;

  /**
   * The signed-in user's Brunch actor key, which is also how the frontend
   * learns whether to offer Brunch at all: 401 without a session, and 503 with
   * the agent routes' "not configured" body when `HASH_BRUNCH_AGENT_ORIGIN` or
   * `HASH_BRUNCH_AGENT_SECRET` is unset, so Brunch stays off unless it is
   * configured.
   */
  app.get(`${brunchAgentProxyPath}/identity`, (request, response) => {
    if (!request.user) {
      response.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!origin) {
      response.status(503).json(notConfiguredError);
      return;
    }
    response.json({ actorKey: brunchActorKey(request.user.accountId) });
  });

  const admitRequest = (
    request: Request,
    response: Response,
    next: NextFunction,
  ) => {
    if (!request.user) {
      response.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!origin) {
      response.status(503).json(notConfiguredError);
      return;
    }
    if (!hashAgentUrl(request, origin)) {
      response.status(404).json({ error: "Not found" });
      return;
    }
    next();
  };

  /** Counts turn submissions per signed-in account; admitted requests only. */
  const turnSubmissionRateLimiter = rateLimit({
    windowMs: 60_000,
    limit: turnSubmissionsPerMinute,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (request) => getActorIdFromRequest(request),
    skip: (request) => {
      const upstreamUrl = origin ? hashAgentUrl(request, origin) : null;
      return !upstreamUrl || !isTurnSubmission(request, upstreamUrl);
    },
    message: { error: "Too many Brunch agent turns, try again later" },
  });

  app.use(
    brunchAgentProxyPath,
    admitRequest,
    turnSubmissionRateLimiter,
    // The body is re-serialised below, so this hop parses it itself rather
    // than rely on the app mounting a JSON parser first. A body an earlier
    // parser already read is left as that parser set it.
    express.json({ limit: jsonBodyLimit }),
    async (request: Request, response: Response) => {
      const upstreamUrl = origin ? hashAgentUrl(request, origin) : null;
      if (!request.user || !origin || !authorization || !upstreamUrl) {
        // `admitRequest` has already answered anything this would refuse.
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
      // Overwrites anything the browser sent under this name; the actor
      // header's former name is never forwarded.
      headers.set(brunchHeaders.actor, brunchActorKey(request.user.accountId));
      // The browser's own `authorization` was never copied above.
      headers.set(brunchCallerAuthorization.header, authorization);

      const abort = new AbortController();
      response.on("close", () => {
        if (!response.writableFinished) {
          abort.abort();
        }
      });

      try {
        // Semgrep reports the admission `send` below from here; see the note
        // there for why it reflects nothing from the browser's request.
        // nosemgrep: ajinabraham.njsscan.xss.xss_node.express_xss
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
          brunchExposedResponseHeaders.join(", "),
        );
        // Flue builds `streamUrl` and `Location` from the URL it was reached
        // at, which names Brunch's internal origin. Point both back through
        // this hop.
        const internalBase = `${origin.origin}${brunchRoutes.agents}/`;
        const publicBase = `${publicOrigin}${brunchAgentProxyPath}${brunchRoutes.agents}/`;
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
