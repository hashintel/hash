/**
 * The five routes a sign-in needs, as Web fetch handlers.
 *
 * The host mounts them; it does not implement them. Each returns a `Response`
 * and reads only its `Request`, so a host wires them to whatever its platform
 * calls a function, and a test calls them directly.
 */

import {
  clearCookie,
  handshakeCookieName,
  handshakeTtlSeconds,
  readCookie,
  sessionCookieName,
  setCookie,
} from "./cookies";
import {
  authorizeUrl,
  createHandshake,
  decodeHandshake,
  encodeHandshake,
  exchangeCodeForProfile,
} from "./flow";
import { createSessionReader } from "./guard";
import {
  isOAuthProviderId,
  oauthProviders,
  type OAuthProviderId,
} from "./providers";
import {
  equalsWithoutTiming,
  mintSessionToken,
  readSessionToken,
  type OAuthSession,
  type OAuthSessionKeyring,
} from "./session";

export type OAuthClientCredentials = {
  readonly clientId: string;
  readonly clientSecret: string;
};

export type OAuthSessionSettings = {
  readonly keyring: OAuthSessionKeyring;
  readonly sessionTtlSeconds: number;
  /**
   * Absolute URL the provider returns the browser to.
   *
   * Absolute and configured rather than derived from the request, because the
   * value has to equal a registered callback byte for byte, and anything read
   * off the incoming request is ultimately a `Host` header the caller chose.
   */
  readonly callbackUrl: string;
  /** Same-origin path a finished sign-in lands on. Never caller-supplied. */
  readonly signedInPath: string;
  readonly clients: Readonly<
    Partial<Record<OAuthProviderId, OAuthClientCredentials>>
  >;
  /**
   * Audience and lifetime for tokens minted for a different origin.
   *
   * Omitted when no other service consumes these sessions, which removes the
   * mint route rather than leaving it answering.
   */
  readonly delegation?: {
    readonly audience: string;
    readonly ttlSeconds: number;
  };
};

/** What the sign-in UI needs to know before it draws anything. */
export type OAuthSessionState = {
  readonly user: Pick<OAuthSession, "sub" | "login" | "avatarUrl"> | null;
  /**
   * Whether sign-in can run at all here.
   *
   * False on a deployment with no provider credentials — a preview host whose
   * URL no callback registration covers, for instance — so the UI can say so
   * instead of offering a button that leads to a provider error page.
   */
  readonly available: boolean;
};

const noStore = { "cache-control": "no-store" } as const;

const badRequest = (message: string): Response =>
  Response.json({ error: message }, { status: 400, headers: noStore });

const redirect = (location: string, cookies: string[]): Response => {
  const headers = new Headers({ location, ...noStore });

  for (const cookie of cookies) {
    headers.append("set-cookie", cookie);
  }

  return new Response(null, { status: 302, headers });
};

const methodNotAllowed = (allow: string): Response =>
  Response.json(
    { error: "Method not allowed" },
    { status: 405, headers: { allow, ...noStore } },
  );

export const createOAuthSessionHandlers = (options: {
  readonly settings: OAuthSessionSettings;
  /** Injected so tests drive the provider without a network. */
  readonly fetchImpl?: typeof fetch;
}) => {
  const { settings } = options;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const readSession = createSessionReader(settings.keyring);

  const clientFor = (
    providerId: OAuthProviderId,
  ): OAuthClientCredentials | null => settings.clients[providerId] ?? null;

  const signedInRedirect = (query?: string): Response =>
    redirect(`${settings.signedInPath}${query ?? ""}`, [
      clearCookie(handshakeCookieName),
    ]);

  /** `GET` — send the browser to the provider. */
  const start = async (request: Request): Promise<Response> => {
    if (request.method !== "GET") {
      return methodNotAllowed("GET");
    }

    const requested =
      new URL(request.url).searchParams.get("provider") ?? "github";

    if (!isOAuthProviderId(requested)) {
      return badRequest(`Unknown sign-in provider "${requested}"`);
    }

    const client = clientFor(requested);

    if (client === null) {
      return Response.json(
        { error: `Sign-in with ${requested} is not configured here` },
        { status: 503, headers: noStore },
      );
    }

    const handshake = createHandshake(requested);

    return redirect(
      await authorizeUrl({
        provider: oauthProviders[requested],
        clientId: client.clientId,
        redirectUri: settings.callbackUrl,
        handshake,
      }),
      [
        setCookie(
          handshakeCookieName,
          encodeHandshake(handshake),
          handshakeTtlSeconds,
        ),
      ],
    );
  };

  /** `GET` — the provider's return leg. */
  const callback = async (request: Request): Promise<Response> => {
    if (request.method !== "GET") {
      return methodNotAllowed("GET");
    }

    const query = new URL(request.url).searchParams;

    // The user pressed Cancel on the provider's consent screen. Not a failure
    // to report, just a sign-in that did not happen.
    if (query.get("error") !== null) {
      return signedInRedirect("?signIn=denied");
    }

    const handshake = decodeHandshake(readCookie(request, handshakeCookieName));
    const state = query.get("state");
    const code = query.get("code");

    if (handshake === null || state === null || code === null) {
      return badRequest("Sign-in did not start here, or took too long");
    }

    if (!(await equalsWithoutTiming(handshake.state, state))) {
      return badRequest("Sign-in state did not match");
    }

    // The provider is read from the cookie we wrote, never from the query, so a
    // callback cannot be replayed against a provider other than the one whose
    // authorization it carries.
    if (!isOAuthProviderId(handshake.provider)) {
      return badRequest("Sign-in state named an unknown provider");
    }

    const client = clientFor(handshake.provider);

    if (client === null) {
      return badRequest("Sign-in state named an unconfigured provider");
    }

    const profile = await exchangeCodeForProfile({
      provider: oauthProviders[handshake.provider],
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      redirectUri: settings.callbackUrl,
      code,
      codeVerifier: handshake.codeVerifier,
      fetchImpl,
    });

    if (profile === null) {
      return signedInRedirect("?signIn=failed");
    }

    const token = await mintSessionToken(
      settings.keyring,
      {
        sub: `${handshake.provider}:${profile.accountId}`,
        provider: handshake.provider,
        login: profile.login,
        avatarUrl: profile.avatarUrl,
      },
      settings.sessionTtlSeconds,
    );

    return redirect(settings.signedInPath, [
      setCookie(sessionCookieName, token, settings.sessionTtlSeconds),
      clearCookie(handshakeCookieName),
    ]);
  };

  /** `GET` — what the UI asks on load. */
  const session = async (request: Request): Promise<Response> => {
    if (request.method !== "GET") {
      return methodNotAllowed("GET");
    }

    const current = await readSession(request);
    const available = Object.keys(settings.clients).length > 0;

    const state: OAuthSessionState = {
      available,
      user:
        current === null
          ? null
          : {
              sub: current.sub,
              login: current.login,
              avatarUrl: current.avatarUrl,
            },
    };

    return Response.json(state, { headers: noStore });
  };

  /**
   * `POST` — forget the session.
   *
   * `POST` so a link or an image cannot sign a reader out, which `SameSite=Lax`
   * would otherwise permit on a top-level GET.
   */
  const logout = (request: Request): Response => {
    if (request.method !== "POST") {
      return methodNotAllowed("POST");
    }

    return new Response(null, {
      status: 204,
      headers: new Headers({
        ...noStore,
        "set-cookie": clearCookie(sessionCookieName),
      }),
    });
  };

  /**
   * `GET` — a short-lived token for a service on another origin.
   *
   * Minted from the cookie session on demand rather than handed to the page at
   * sign-in: the long-lived session stays `HttpOnly` and out of reach of page
   * scripts, and what a script can hold is scoped to one audience and expires
   * in minutes.
   */
  const delegatedToken = async (request: Request): Promise<Response> => {
    if (request.method !== "GET") {
      return methodNotAllowed("GET");
    }

    const { delegation } = settings;

    if (delegation === undefined) {
      return Response.json(
        { error: "Delegated tokens are not configured here" },
        { status: 404, headers: noStore },
      );
    }

    // Read from the cookie only. Honouring a bearer token here would let one
    // delegated token be exchanged for another and refreshed without limit.
    const current = await readSessionToken(
      settings.keyring,
      readCookie(request, sessionCookieName),
    );

    if (current === null) {
      return Response.json(
        { error: "Sign in to obtain a token" },
        { status: 401, headers: noStore },
      );
    }

    const token = await mintSessionToken(
      { ...settings.keyring, audience: delegation.audience },
      {
        sub: current.sub,
        provider: current.provider,
        login: current.login,
        avatarUrl: current.avatarUrl,
      },
      delegation.ttlSeconds,
    );

    return Response.json(
      { token, expiresInSeconds: delegation.ttlSeconds },
      { headers: noStore },
    );
  };

  return { start, callback, session, logout, delegatedToken };
};
