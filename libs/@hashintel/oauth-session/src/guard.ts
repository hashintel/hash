/**
 * The consumer half of the package: how a service decides who is calling.
 *
 * A service that only guards routes imports this and nothing else. It needs an
 * {@link OAuthSessionKeyring} — a secret, an issuer, an audience — and never
 * the provider credentials, so it can check a session without being able to
 * issue one.
 */

import { readCookie, sessionCookieName } from "./cookies";
import {
  readSessionToken,
  type OAuthSession,
  type OAuthSessionKeyring,
} from "./session";

const bearerPrefix = "bearer ";

const readBearerToken = (request: Request): string | null => {
  const header = request.headers.get("authorization");

  if (header === null || !header.toLowerCase().startsWith(bearerPrefix)) {
    return null;
  }

  const token = header.slice(bearerPrefix.length).trim();

  return token.length === 0 ? null : token;
};

/**
 * Who is calling, from either credential, or `null`.
 *
 * Two transports, because the services that consume a session do not share an
 * origin with the one that issues it. A same-origin route reads the cookie,
 * which the browser attaches by itself. A cross-origin service can never
 * receive that cookie — `SameSite=Lax` withholds it — and reads a bearer token
 * the page fetched for it instead.
 *
 * The bearer branch is checked first and answers on its own: a caller that
 * presents a token is asking to be judged on that token, and falling through to
 * a cookie would let a browser's ambient session stand in for a rejected one.
 */
export const createSessionReader =
  (keyring: OAuthSessionKeyring) =>
  async (request: Request): Promise<OAuthSession | null> => {
    const bearerToken = readBearerToken(request);

    if (bearerToken !== null) {
      return readSessionToken(keyring, bearerToken);
    }

    // A cookie is attached by the browser to requests our pages did not make,
    // so a cookie-authenticated request has to say where it came from. Browsers
    // forbid page code from setting a `Sec-` header, which is what makes this
    // worth reading. It is absent outside a browser — `curl` sends no such
    // header — so this rejects a known-bad value rather than requiring a
    // known-good one, and the session check behind it is what actually gates.
    if (request.headers.get("sec-fetch-site") === "cross-site") {
      return null;
    }

    return readSessionToken(keyring, readCookie(request, sessionCookieName));
  };

const unauthenticated = (message: string): Response =>
  Response.json(
    { error: message },
    { status: 401, headers: { "cache-control": "no-store" } },
  );

/**
 * Wrap a handler so it only runs for a signed-in caller.
 *
 * The session is passed through to the handler rather than left for it to read
 * again, so a guarded route cannot end up keyed on something other than the
 * identity that let it through.
 */
export const createSessionGuard = (options: {
  readonly keyring: OAuthSessionKeyring;
  /** Shown to a signed-out caller. Reaches the browser, so keep it useful. */
  readonly message: string;
}) => {
  const readSession = createSessionReader(options.keyring);

  return (
    handler: (
      request: Request,
      session: OAuthSession,
    ) => Promise<Response> | Response,
  ) =>
    async (request: Request): Promise<Response> => {
      const session = await readSession(request);

      return session === null
        ? unauthenticated(options.message)
        : handler(request, session);
    };
};
