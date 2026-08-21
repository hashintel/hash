import * as Sentry from "@sentry/node";

import type { Logger } from "@local/hash-backend-utils/logger";
import type { RequestHandler } from "express";

/**
 * `GET` fetches or creates a self-service flow, `POST` submits one. Nothing we
 * proxy needs any other method: CORS preflights are answered by the `cors`
 * middleware registered ahead of the guard, so `OPTIONS` never reaches Kratos.
 */
type ProxiedMethod = "GET" | "POST";

type KratosProxyRule = {
  /**
   * The request path relative to the `/auth` mount point — i.e. exactly the
   * path forwarded to Kratos. Prefer an exact string. Use an anchored `RegExp`
   * only where Kratos puts a variable in a path segment, anchored so that it
   * cannot match beyond that one segment.
   */
  readonly path: string | RegExp;
  /** The methods allowed on that path. Every other method is denied. */
  readonly methods: readonly ProxiedMethod[];
};

/**
 * The complete set of Ory Kratos public endpoints the `/auth` proxy will
 * forward. **Anything not listed here is answered with a 404 and never reaches
 * Kratos.**
 *
 * Kratos's public API exposes considerably more than we use, and it grows
 * across releases. Forwarding a whole path prefix means any endpoint Ory adds
 * in a future version becomes publicly reachable on our origin the moment we
 * bump the image. This list exists so that stops being true, and so a reviewer
 * can see the whole proxied surface in one place.
 */
export const KRATOS_PROXY_ALLOWLIST = [
  /** Session check. */
  { path: "/sessions/whoami", methods: ["GET"] },

  /** Sign-in. */
  { path: "/self-service/login/browser", methods: ["GET"] },
  { path: "/self-service/login/flows", methods: ["GET"] },
  { path: "/self-service/login", methods: ["POST"] },

  /** Signup. */
  { path: "/self-service/registration/browser", methods: ["GET"] },
  { path: "/self-service/registration/flows", methods: ["GET"] },
  { path: "/self-service/registration", methods: ["POST"] },

  /** Email verification. */
  { path: "/self-service/verification/browser", methods: ["GET"] },
  { path: "/self-service/verification/flows", methods: ["GET"] },
  { path: "/self-service/verification", methods: ["POST"] },

  /** Password recovery. */
  { path: "/self-service/recovery/browser", methods: ["GET"] },
  { path: "/self-service/recovery/flows", methods: ["GET"] },
  { path: "/self-service/recovery", methods: ["POST"] },

  /** Password change, and TOTP and lookup-secret management. */
  { path: "/self-service/settings/browser", methods: ["GET"] },
  { path: "/self-service/settings/flows", methods: ["GET"] },
  { path: "/self-service/settings", methods: ["POST"] },

  /** Logout: mints the logout token. */
  { path: "/self-service/logout/browser", methods: ["GET"] },
  /** Logout: spends the token. */
  { path: "/self-service/logout", methods: ["GET"] },

  /**
   * SSO callback. The identity provider redirects the browser here after
   * consent, and Kratos is configured to advertise this proxy as its OIDC
   * redirect base, so denying it would break sign-in on return from the
   * provider. `POST` is needed alongside `GET` for providers using the
   * `form_post` response mode.
   *
   * The provider id is operator-chosen and Kratos's config schema puts no
   * pattern on it, so `Google` and `okta.acme.com` are as valid as `google`.
   * Guessing a charset could only 404 a working SSO login, so this matches any
   * single segment; {@link canonicaliseKratosProxyPath} has already ruled out
   * escapes, backslashes and `.` / `..`, so it cannot reach past this route.
   * The length cap is a sanity bound, not validation — Kratos rejects an id it
   * has no provider for.
   */
  {
    path: /^\/self-service\/methods\/oidc\/callback\/[^/]{1,128}$/,
    methods: ["GET", "POST"],
  },
] as const satisfies readonly KratosProxyRule[];

/**
 * The path portion of a request URL, with any query string or fragment
 * removed.
 *
 * `new URL()` is not the alternative it looks like: it rejects a relative URL
 * outright, and the base needed to make it parse is what does the damage — it
 * resolves `..` and `%2e%2e` away and rewrites `\` to `/`, so we would match a
 * path Kratos never sees. Reading the bytes keeps matching aligned with what
 * `http-proxy-middleware` forwards, which takes `req.url` as it stands.
 */
const pathnameOf = (url: string): string => {
  const separatorIndex = url.search(/[?#]/);
  return separatorIndex === -1 ? url : url.slice(0, separatorIndex);
};

/**
 * Reduce a request URL to the canonical path to match against
 * {@link KRATOS_PROXY_ALLOWLIST}, or `undefined` if it is not in canonical
 * form at all.
 *
 * Every path we allow is spellable without percent-encoding, so an escape is
 * never something we need to accept. Rather than decode and
 * then compare — which would let `%2e%2e%2f` or `%2f` smuggle a separator past
 * the comparison, or let us match a different path than the one Kratos
 * ultimately resolves — we reject any URL carrying an escape sequence, a
 * backslash, an empty segment, or a relative (`.` / `..`) segment.
 */
export const canonicaliseKratosProxyPath = (
  url: string,
): string | undefined => {
  const pathname = pathnameOf(url);

  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // We cannot know what Kratos would resolve a malformed escape to, so we
    // must not be the one deciding it is safe.
    return undefined;
  }
  if (decoded !== pathname) {
    // Nothing we allow needs an escape, so one can only be an attempt to have
    // us and Kratos read the path differently.
    return undefined;
  }

  // Some servers and proxies treat `\` as a path separator, so leaving it in
  // would slip a separator through a comparison that cannot see it as one.
  if (pathname.includes("\\")) {
    return undefined;
  }

  const segments = pathname.split("/");
  if (segments.shift() !== "") {
    // Not mount-relative, so this is not the path Express hands to the proxy —
    // we would be reasoning about a different request than the one served.
    return undefined;
  }
  if (
    segments.some(
      (segment) => segment === "" || segment === "." || segment === "..",
    )
  ) {
    // `//`, a trailing `/` and `.` / `..` are where path parsers disagree.
    // Refusing them is what earns the byte-for-byte comparison below.
    return undefined;
  }

  return pathname;
};

/**
 * Whether a request to the `/auth` proxy may be forwarded to Kratos.
 */
export const isAllowedKratosProxyRequest = ({
  method,
  url,
}: {
  /** The request's HTTP method. */
  method: string;
  /**
   * The request URL relative to the `/auth` mount point, query string
   * included — i.e. Express's `req.url` inside the `/auth` middleware chain.
   */
  url: string;
}): boolean => {
  const path = canonicaliseKratosProxyPath(url);
  if (path === undefined) {
    return false;
  }

  return KRATOS_PROXY_ALLOWLIST.some(
    ({ path: allowedPath, methods }) =>
      (methods as readonly string[]).includes(method) &&
      (typeof allowedPath === "string"
        ? allowedPath === path
        : allowedPath.test(path)),
  );
};

/**
 * Strip a denied path down to something safe to log: printable ASCII only, so a
 * crafted path cannot forge log structure, and bounded in length. The query
 * string is dropped entirely, as `/auth` query strings carry flow ids and
 * recovery/verification codes.
 */
const logSafe = (value: string): string =>
  value.replaceAll(/[^ -~]/g, "").slice(0, 200);

const logSafePath = (url: string): string => logSafe(pathnameOf(url));

/**
 * How many distinct denied endpoints one process reports to Sentry. Reporting
 * each endpoint once keeps a missing allow-list entry a single issue, and the
 * cap stops an enumeration turning our Sentry quota — and the memory behind
 * this set — into something an unauthenticated caller controls. Every denial is
 * logged either way.
 */
const MAX_SENTRY_REPORTED_ENDPOINTS = 20;

const DENIAL_MESSAGE = "Blocked non-allow-listed Kratos proxy request";

/**
 * Wrap the Kratos proxy in {@link KRATOS_PROXY_ALLOWLIST}.
 *
 * The check runs ahead of the proxy rather than inside its `proxyReq` hook,
 * because that hook fires from the outgoing request's `socket` event — by then
 * a connection to Kratos is already established, and throwing there escapes the
 * proxy's `try`/`catch` as an uncaught exception rather than becoming a 404.
 *
 * A denial means either that an endpoint we depend on is missing from the list,
 * or that someone is asking for one we never served. Both want an alert rather
 * than a log line nobody reads, so denials go to Sentry as well as the log, at
 * `error`. The origin and client IP go with them because they are what tells
 * the two apart — our own frontend's origin points at the first, an unfamiliar
 * IP with no origin at the second. Origin is absent on non-browser requests and
 * trivially forged, so the IP is the more dependable of the two.
 */
export const guardKratosProxy = ({
  logger,
  proxy,
}: {
  logger: Logger;
  proxy: RequestHandler;
}): RequestHandler => {
  let deniedCount = 0;
  const reportedEndpoints = new Set<string>();

  return (req, res, next) => {
    if (isAllowedKratosProxyRequest({ method: req.method, url: req.url })) {
      proxy(req, res, next);
      return;
    }

    deniedCount += 1;

    const method = logSafe(req.method);
    const path = logSafePath(req.url);
    const { origin } = req.headers;
    const denial = {
      method,
      path,
      origin: origin === undefined ? undefined : logSafe(origin),
      ip: req.ip,
      deniedCount,
    };

    logger.error(DENIAL_MESSAGE, denial);

    const endpoint = `${method} ${path}`;
    if (
      !reportedEndpoints.has(endpoint) &&
      reportedEndpoints.size < MAX_SENTRY_REPORTED_ENDPOINTS
    ) {
      reportedEndpoints.add(endpoint);
      Sentry.captureMessage(DENIAL_MESSAGE, {
        level: "error",
        // Group by endpoint, so a missing allow-list entry is one issue to act
        // on rather than one more event on a pile of unrelated probes.
        fingerprint: ["kratos-proxy-denied", method, path],
        extra: denial,
      });
    }

    res.sendStatus(404);
  };
};
