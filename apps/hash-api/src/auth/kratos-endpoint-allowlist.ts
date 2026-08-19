import type { Logger } from "@local/hash-backend-utils/logger";
import type { RequestHandler } from "express";

/**
 * The HTTP methods any Kratos public endpoint we proxy is reached with.
 *
 * `GET` fetches or creates a self-service flow, `POST` submits one. Nothing
 * the frontend does needs `PUT`/`PATCH`/`DELETE`, and CORS preflights are
 * answered by the `cors` middleware registered ahead of this allow-list, so
 * `OPTIONS` never reaches Kratos either.
 */
type ProxiedMethod = "GET" | "POST";

type KratosProxyRule = {
  /**
   * The request path *relative to the `/auth` mount point* — i.e. exactly the
   * path that is forwarded to Kratos. Prefer an exact string. Use an anchored
   * `RegExp` only where Kratos puts a variable in a path segment, and keep the
   * segment charset as tight as possible.
   */
  readonly path: string | RegExp;
  /** The methods allowed on that path. Every other method is denied. */
  readonly methods: readonly ProxiedMethod[];
};

/**
 * The complete set of Ory Kratos public endpoints the `/auth` proxy will
 * forward. **Anything not listed here is answered with a 404 and never
 * reaches Kratos.**
 *
 * Kratos's public API exposes considerably more than we use, and it grows
 * across Kratos releases. Forwarding a whole path prefix means any endpoint
 * Ory adds in a future version becomes publicly reachable on our origin the
 * moment we bump the image. This list exists so that stops being true, and so
 * a reviewer can see the entire authenticated surface area in one place.
 *
 * Each entry cites the frontend call site that needs it. Endpoints reachable
 * only via a browser redirect (no `fetch` in our code) say so explicitly.
 *
 * Deliberately **not** listed — reachable today, denied after this change:
 *   - `GET  /self-service/{login,registration,recovery,verification,settings}/api`
 *     and `DELETE /self-service/logout/api` — the native/API-client
 *     counterparts of the browser flows. We only ship a browser client, and
 *     the API flows return bearer session tokens rather than cookies.
 *   - `GET    /sessions` / `DELETE /sessions` / `DELETE /sessions/{id}` —
 *     session listing and revocation. No frontend caller. Note password
 *     changes already revoke other sessions server-side via the
 *     `revoke_active_sessions` hook (infra/compose/kratos/kratos.yml:160).
 *   - `GET    /sessions/token-exchange` — native-app session exchange.
 *   - `GET    /self-service/errors` — Kratos's error store. Our error handling
 *     reads the error out of the response body instead
 *     (pages/shared/use-kratos-flow-error-handler.ts), and Kratos's error UI
 *     redirect points at the frontend (`SELFSERVICE_FLOWS_ERROR_UI_URL`).
 *   - `GET    /self-service/fed-cm/parameters`, `POST /self-service/fed-cm/token` —
 *     the FedCM strategy, which we do not enable.
 *   - `GET    /.well-known/ory/webauthn.js` — the WebAuthn helper script.
 *     WebAuthn is not among the enabled methods in kratos.yml.
 *   - `/self-service/methods/oidc/organization/...` — Ory Network enterprise
 *     SSO, not configured here.
 *   - Kratos's `/health/*` and `/version` endpoints, and anything Ory adds in
 *     a future release.
 */
export const KRATOS_PROXY_ALLOWLIST = [
  /* ── Session ─────────────────────────────────────────────────────────── */

  /**
   * `toSession` — pages/shared/auth-info-context.tsx:216,
   * pages/_app.page.tsx:321, pages/signin.page.tsx:351, and server-side from
   * the frontend's own API route pages/api/petrinaut-ai-chat.api.ts:143
   * (`fetch(\`${apiOrigin}/auth/sessions/whoami\`)`).
   */
  { path: "/sessions/whoami", methods: ["GET"] },

  /* ── Login (`/signin`) ───────────────────────────────────────────────── */

  /** `createBrowserLoginFlow` — pages/signin.page.tsx:153 */
  { path: "/self-service/login/browser", methods: ["GET"] },
  /** `getLoginFlow` — pages/signin.page.tsx:146 (`?id=<flow>`) */
  { path: "/self-service/login/flows", methods: ["GET"] },
  /**
   * `updateLoginFlow` — pages/signin.page.tsx:317 (password) and
   * pages/shared/sso-provider-buttons.tsx:64 (OIDC) (`?flow=<flow>`)
   */
  { path: "/self-service/login", methods: ["POST"] },

  /* ── Registration (`/signup`) ────────────────────────────────────────── */

  /**
   * `createBrowserRegistrationFlow` —
   * pages/signup.page/signup-registration-form.tsx:101
   */
  { path: "/self-service/registration/browser", methods: ["GET"] },
  /**
   * `getRegistrationFlow` — pages/signup.page/signup-registration-form.tsx:92
   */
  { path: "/self-service/registration/flows", methods: ["GET"] },
  /**
   * `updateRegistrationFlow` —
   * pages/signup.page/signup-registration-form.tsx:138 (password) and
   * pages/shared/sso-provider-buttons.tsx:68 (OIDC)
   */
  { path: "/self-service/registration", methods: ["POST"] },

  /* ── Email verification (`/verification`) ────────────────────────────── */

  /**
   * Required, and deliberately so. HASH treats a verified email address as an
   * authorization signal (this is what INC-27 was about), which makes the
   * verification flow load-bearing rather than optional — omitting these
   * entries would break verification, not harden it.
   *
   * The verification email sends the user to the *frontend* `/verification`
   * page (see infra/compose/kratos/templates/verification_code/valid/
   * email.body.gotmpl), which then drives the flow through these endpoints.
   *
   * `createBrowserVerificationFlow` — pages/shared/verify-email-step.tsx:92
   */
  { path: "/self-service/verification/browser", methods: ["GET"] },
  /**
   * `getVerificationFlow` — pages/verification.page.tsx:99,
   * pages/shared/verify-email-step.tsx:141
   */
  { path: "/self-service/verification/flows", methods: ["GET"] },
  /**
   * `updateVerificationFlow` (submits the emailed code) —
   * pages/verification.page.tsx:101,
   * pages/shared/verify-email-step.tsx:94 and :149
   */
  { path: "/self-service/verification", methods: ["POST"] },

  /* ── Account recovery (`/recovery`) ──────────────────────────────────── */

  /** `createBrowserRecoveryFlow` — pages/recovery.page.tsx:83 */
  { path: "/self-service/recovery/browser", methods: ["GET"] },
  /** `getRecoveryFlow` — pages/recovery.page.tsx:69 */
  { path: "/self-service/recovery/flows", methods: ["GET"] },
  /** `updateRecoveryFlow` — pages/recovery.page.tsx:116 and :139 */
  { path: "/self-service/recovery", methods: ["POST"] },

  /* ── Settings (`/settings/security`, `/change-password`) ─────────────── */

  /**
   * Password changes plus TOTP and lookup-secret management.
   *
   * This flow cannot be used to swap in an unverified email: Kratos's
   * `selfservice.methods.profile` strategy is disabled precisely so identity
   * traits are immutable here (infra/compose/kratos/kratos.yml:27-30).
   *
   * `createBrowserSettingsFlow` — pages/settings/security.page.tsx:185,
   * pages/change-password.page.tsx:54
   */
  { path: "/self-service/settings/browser", methods: ["GET"] },
  /**
   * `getSettingsFlow` — pages/settings/security.page.tsx:178,
   * pages/change-password.page.tsx:46
   */
  { path: "/self-service/settings/flows", methods: ["GET"] },
  /**
   * `updateSettingsFlow` — pages/settings/security.page.tsx:142,
   * pages/change-password.page.tsx:82
   */
  { path: "/self-service/settings", methods: ["POST"] },

  /* ── Logout ──────────────────────────────────────────────────────────── */

  /**
   * `createBrowserLogoutFlow` (mints the logout token) —
   * components/hooks/use-logout-flow.ts:20
   */
  { path: "/self-service/logout/browser", methods: ["GET"] },
  /**
   * `updateLogoutFlow` — components/hooks/use-logout-flow.ts:23.
   *
   * Note this is a `GET` in the Ory API (`?token=<logout token>`), not a
   * `POST`, despite being the state-changing half of the flow.
   */
  { path: "/self-service/logout", methods: ["GET"] },

  /* ── OIDC / SSO callback — browser redirect, no frontend caller ───────── */

  /**
   * The identity provider redirects the *browser* here after consent, so no
   * frontend code fetches it. It has to be allowed anyway because Kratos is
   * configured to advertise this proxy as its OIDC redirect base:
   * `SELFSERVICE_METHODS_OIDC_CONFIG_BASE_REDIRECT_URI: "http://localhost:5001/auth"`
   * (infra/compose/compose.yml:124, with the reasoning at
   * infra/compose/kratos/kratos.yml:56-59). Denying it would break SSO
   * sign-in at the point of return from Google/Microsoft.
   *
   * `POST` is needed alongside `GET` because providers using the `form_post`
   * response mode (e.g. Apple) post the authorization response back.
   *
   * The provider id is a configured, variable path segment, so this is the one
   * pattern entry in the list. It is scoped to a single path segment of
   * lowercase alphanumerics, `-` and `_`, which covers the ids configured in
   * kratos.yml (`google`, `microsoft`). A provider id outside that charset
   * would 404 and show up in the denial log below.
   */
  {
    path: /^\/self-service\/methods\/oidc\/callback\/[a-z0-9][a-z0-9_-]{0,62}$/,
    methods: ["GET", "POST"],
  },
] as const satisfies readonly KratosProxyRule[];

/**
 * The path portion of a request URL, with any query string or fragment
 * removed. Deliberately hand-rolled rather than using `new URL()`, so that
 * matching operates on the exact bytes `http-proxy-middleware` will forward
 * (it reads `req.url` too) rather than on a re-serialised URL.
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
 * letters, so percent-encoding is never legitimate here. Rather than decode
 * and then compare — which would let `%2e%2e%2f` or `%2f` smuggle a separator
 * past the comparison, or let us match a different path than the one Kratos
 * ultimately resolves — we reject any URL that carries an escape sequence,
 * a backslash, an empty segment, or a relative (`.` / `..`) segment.
 *
 * The result is that the allow-list can be compared byte-for-byte, and there
 * is no parser differential between what we check and what we forward.
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
 * Strip a denied path down to something safe to put in a log line: printable
 * ASCII only, so a crafted path cannot forge log structure, and bounded in
 * length. The query string is dropped entirely — `/auth` query strings carry
 * flow ids and recovery/verification codes (cf. `redactAuthQueryParams` in
 * index.ts).
 */
const logSafePath = (url: string): string =>
  pathnameOf(url)
    .replaceAll(/[^ -~]/g, "")
    .slice(0, 200);

/**
 * Guard the Kratos proxy with {@link KRATOS_PROXY_ALLOWLIST}: default deny,
 * responding `404` (rather than `403`, which would confirm that an endpoint
 * exists) and never calling through to the proxy.
 *
 * Denials are counted and logged at `warn`, so an endpoint that should have
 * been on the list surfaces as a log line naming the method and path instead
 * of as a silent breakage in an auth flow.
 */
export const createKratosProxyAllowlist = ({
  logger,
}: {
  logger: Logger;
}): RequestHandler => {
  let deniedCount = 0;

  return (req, res, next) => {
    if (isAllowedKratosProxyRequest(req.method, req.url)) {
      next();
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
