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
   * only where Kratos puts a variable in a path segment, and keep the segment
   * charset as tight as possible.
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
  /**
   * Logout: spends the token.
   */
  { path: "/self-service/logout", methods: ["GET"] },

  /**
   * SSO callback. No frontend caller — the identity provider redirects the
   * browser here after consent, and Kratos advertises this proxy as its OIDC
   * redirect base, so denying it would break SSO sign-in at the point of
   * return. `POST` is needed alongside `GET` for providers using the
   * `form_post` response mode.
   *
   * The provider id is a configured, variable path segment, so this is the one
   * pattern entry in the list. A provider id outside the segment charset would
   * 404 and show up in the denial log.
   */
  {
    path: /^\/self-service\/methods\/oidc\/callback\/[a-z0-9][a-z0-9_-]{0,62}$/,
    methods: ["GET", "POST"],
  },
] as const satisfies readonly KratosProxyRule[];

/**
 * The path portion of a request URL, with any query string or fragment
 * removed. Deliberately hand-rolled rather than using `new URL()`, so matching
 * operates on the exact bytes `http-proxy-middleware` will forward (it reads
 * `req.url` too) rather than on a re-serialised URL.
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
 * Every allow-listed path is plain lowercase ASCII made of `/`, `-` and
 * letters, so percent-encoding is never legitimate here. Rather than decode and
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
    // Malformed escape sequence, e.g. a lone `%`.
    return undefined;
  }
  if (decoded !== pathname) {
    // The path contained a percent-escape. None of ours need one.
    return undefined;
  }

  // Some servers and proxies treat `\` as a path separator.
  if (pathname.includes("\\")) {
    return undefined;
  }

  const segments = pathname.split("/");
  // A mount-relative Express `req.url` always begins with `/`, so the first
  // segment is empty. Anything else is not a path we should be reasoning about.
  if (segments.shift() !== "") {
    return undefined;
  }
  // Rejects `//`, a trailing `/`, and `.` / `..` traversal segments.
  if (
    segments.some(
      (segment) => segment === "" || segment === "." || segment === "..",
    )
  ) {
    return undefined;
  }

  return pathname;
};

/**
 * Whether a request to the `/auth` proxy may be forwarded to Kratos.
 *
 * @param method the request's HTTP method
 * @param url the request URL relative to the `/auth` mount point, query string
 *   included — i.e. Express's `req.url` inside the `/auth` middleware chain.
 */
export const isAllowedKratosProxyRequest = (
  method: string,
  url: string,
): boolean => {
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
const logSafePath = (url: string): string =>
  pathnameOf(url)
    .replaceAll(/[^ -~]/g, "")
    .slice(0, 200);

/**
 * Wrap the Kratos proxy in {@link KRATOS_PROXY_ALLOWLIST}.
 *
 * The check runs ahead of the proxy rather than inside its `proxyReq` hook,
 * because that hook fires from the outgoing request's `socket` event — by then
 * a connection to Kratos is already established, and throwing there escapes the
 * proxy's `try`/`catch` as an uncaught exception rather than becoming a 404.
 *
 * Denials are counted and logged at `warn`, so an endpoint that should have
 * been listed surfaces as a log line naming the method and path instead of as a
 * silent breakage in an auth flow.
 */
export const guardKratosProxy = ({
  logger,
  proxy,
}: {
  logger: Logger;
  proxy: RequestHandler;
}): RequestHandler => {
  let deniedCount = 0;

  return (req, res, next) => {
    if (isAllowedKratosProxyRequest(req.method, req.url)) {
      proxy(req, res, next);
      return;
    }

    deniedCount += 1;

    logger.warn("Blocked non-allow-listed Kratos proxy request", {
      method: req.method,
      path: logSafePath(req.url),
      deniedCount,
    });

    res.sendStatus(404);
  };
};
