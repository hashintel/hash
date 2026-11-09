import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import express from "express";
import { rateLimit } from "express-rate-limit";

import {
  brunchExposedResponseHeaders,
  brunchHeaders,
  brunchRoutes,
  hashSessionCredential,
} from "@local/brunch-configs/wire";

import { getActorIdFromRequest } from "../auth/get-actor-id";

import type { UserId } from "@blockprotocol/type-system";
import type { Logger } from "@local/hash-backend-utils/logger";
import type { Express, NextFunction, Request, Response } from "express";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

/**
 * The authenticated hop from a signed-in HASH user to the Brunch agent server.
 * Like the atlas proxy (`atlas-proxy.ts`), it states no identity of its own:
 * the caller's Kratos session credential crosses the hop, and Brunch asks
 * Kratos who it belongs to and resolves the actor itself, so it can only act
 * as the user making the request. Brunch keeps its own ownership check, which
 * derives the instance id from that actor key plus the conversation id.
 *
 * The hop still authenticates the session first, so it can carry the cookie
 * (browsers send it only to HASH's origin), limit each user's turns, and
 * reach Brunch's HASH agent alone. Off unless `HASH_BRUNCH_AGENT_ORIGIN` is
 * set.
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
 * including any `authorization` or actor header; the session credential is
 * added separately by {@link sessionCredentialHeaders}.
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

/**
 * The browser's Brunch actor key for a HASH account, which it needs to
 * address its conversations. Brunch derives the same key from the session's
 * graph actor, which HASH provisions as the account id.
 */
const brunchActorKey = (accountId: UserId) => `hash:${accountId}`;

/**
 * The request's Kratos session credential and nothing else: the session-token
 * header if sent, and from the `cookie` header only the session cookie's pair,
 * so the browser's other HASH cookies stay here.
 */
const sessionCredentialHeaders = (request: Request): Headers => {
  const headers = new Headers();
  const token = request.headers[hashSessionCredential.tokenHeader];
  if (typeof token === "string" && token.length > 0) {
    headers.set(hashSessionCredential.tokenHeader, token);
  }
  const prefix = `${hashSessionCredential.cookie}=`;
  const sessionCookie = (request.headers.cookie ?? "")
    .split(";")
    .map((pair) => pair.trim())
    .find((pair) => pair.startsWith(prefix));
  if (sessionCookie !== undefined) {
    headers.set("cookie", sessionCookie);
  }
  return headers;
};

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
  /**
   * Authenticates the session and checks that Brunch is configured before
   * handing the handler the account's Brunch actor key and upstream config:
   * 401 without a session or before signup is complete, and 503 when
   * `HASH_BRUNCH_AGENT_ORIGIN` is unset.
   */
  const withConfiguredActor =
    (
      handler: (
        request: Request,
        response: Response,
        next: NextFunction,
        configured: {
          readonly actorKey: string;
          readonly origin: URL;
        },
      ) => void,
    ) =>
    (request: Request, response: Response, next: NextFunction) => {
      // Registered before NodeAPI drops incomplete users outside GraphQL, so
      // apply that rule here: an account mid-signup is treated as anonymous.
      if (!request.user?.isAccountSignupComplete) {
        response.status(401).json({ error: "Authentication required" });
        return;
      }
      if (!origin) {
        response.status(503).json(notConfiguredError);
        return;
      }
      handler(request, response, next, {
        actorKey: brunchActorKey(request.user.accountId),
        origin,
      });
    };

  /**
   * The signed-in user's Brunch actor key, which is also how the frontend
   * learns whether to offer Brunch at all.
   */
  app.get(
    `${brunchAgentProxyPath}/identity`,
    withConfiguredActor((_request, response, _next, { actorKey }) => {
      response.json({ actorKey });
    }),
  );

  /** Counts turn submissions per signed-in account; admitted requests only. */
  const turnSubmissionRateLimiter = rateLimit({
    windowMs: 60_000,
    limit: turnSubmissionsPerMinute,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (request) => getActorIdFromRequest(request),
    message: { error: "Too many Brunch agent turns, try again later" },
  });
  // The body is re-serialised below, so this hop parses it itself rather
  // than rely on the app mounting a JSON parser first. A body an earlier
  // parser already read is left as that parser set it.
  const parseJsonBody = express.json({ limit: jsonBodyLimit });

  const forwardToBrunch = async (
    request: Request,
    response: Response,
    upstreamUrl: URL,
    configured: {
      readonly origin: URL;
    },
  ) => {
    const body = requestBody(request);
    if (body === null) {
      response.status(415).json({
        error: "Brunch agent requests must be JSON",
      });
      return;
    }
    // Brunch resolves the actor from this credential; no actor header is
    // forwarded, whatever the browser sent.
    const headers = sessionCredentialHeaders(request);
    for (const [name, value] of Object.entries(request.headers)) {
      if (typeof value === "string" && isForwardedRequestHeader(name)) {
        headers.set(name, value);
      }
    }

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
      const internalBase = `${configured.origin.origin}${brunchRoutes.agents}/`;
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
  };

  app.use(
    brunchAgentProxyPath,
    withConfiguredActor((request, response, next, configured) => {
      const upstreamUrl = hashAgentUrl(request, configured.origin);
      if (!upstreamUrl) {
        response.status(404).json({ error: "Not found" });
        return;
      }
      const forward = () => {
        parseJsonBody(request, response, (error?: unknown) => {
          if (error !== undefined) {
            next(error);
            return;
          }
          void forwardToBrunch(request, response, upstreamUrl, configured);
        });
      };
      if (isTurnSubmission(request, upstreamUrl)) {
        void turnSubmissionRateLimiter(request, response, (error?: unknown) => {
          if (error !== undefined) {
            next(error);
            return;
          }
          forward();
        });
        return;
      }
      forward();
    }),
  );
};
