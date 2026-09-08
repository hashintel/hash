/**
 * The authorization-code flow, with PKCE, carrying no server-side state.
 *
 * Nothing here is remembered between the two requests. A serverless deployment
 * has no memory to remember it in: instances start cold and do not share a map,
 * so a pending-`state` table kept in the process would reject the very callback
 * it had just issued. Both halves of the handshake travel in a cookie instead.
 */

import type { OAuthProfile, OAuthProvider } from "./providers";

/** What the start of a sign-in must hand to its own callback. */
export type OAuthHandshake = {
  readonly provider: string;
  /** CSRF nonce echoed by the provider and compared against the cookie. */
  readonly state: string;
  /** PKCE verifier, sent only in the token exchange. */
  readonly codeVerifier: string;
};

const encoder = new TextEncoder();

const base64Url = (bytes: Uint8Array): string => {
  let binary = "";

  // Built a byte at a time rather than with a spread into `fromCharCode`, which
  // passes one argument per byte and overflows the argument limit on long input.
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
};

const randomBase64Url = (byteLength: number): string =>
  base64Url(crypto.getRandomValues(new Uint8Array(byteLength)));

export const createHandshake = (providerId: string): OAuthHandshake => ({
  provider: providerId,
  state: randomBase64Url(32),
  codeVerifier: randomBase64Url(32),
});

/**
 * The handshake as a cookie value.
 *
 * Dot-joined rather than JSON: all three fields are base64url or a provider id,
 * so there is nothing that needs escaping, and reading it back cannot fail in a
 * way that needs reporting.
 */
export const encodeHandshake = (handshake: OAuthHandshake): string =>
  `${handshake.provider}.${handshake.state}.${handshake.codeVerifier}`;

export const decodeHandshake = (
  value: string | null,
): OAuthHandshake | null => {
  const parts = value?.split(".") ?? [];
  const [provider, state, codeVerifier] = parts;

  if (
    parts.length !== 3 ||
    provider === undefined ||
    state === undefined ||
    codeVerifier === undefined ||
    provider.length === 0 ||
    state.length === 0 ||
    codeVerifier.length === 0
  ) {
    return null;
  }

  return { provider, state, codeVerifier };
};

const codeChallengeFor = async (codeVerifier: string): Promise<string> =>
  base64Url(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(codeVerifier)),
    ),
  );

/**
 * Where to send the browser to start a sign-in.
 *
 * `redirect_uri` is passed explicitly and must equal a registered callback
 * exactly. Providers that offer wildcard matching on a registration will
 * otherwise accept a redirect to any subdomain or subpath of it, which hands
 * the authorization code to whoever controls one.
 */
export const authorizeUrl = async (options: {
  readonly provider: OAuthProvider;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly handshake: OAuthHandshake;
}): Promise<string> => {
  const url = new URL(options.provider.authorizeEndpoint);

  url.searchParams.set("client_id", options.clientId);
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("state", options.handshake.state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set(
    "code_challenge",
    await codeChallengeFor(options.handshake.codeVerifier),
  );
  url.searchParams.set("code_challenge_method", "S256");

  if (options.provider.scope.length > 0) {
    url.searchParams.set("scope", options.provider.scope);
  }

  return url.toString();
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;

/**
 * Trade an authorization code for the account it identifies.
 *
 * The access token exists only inside this function. It is never returned,
 * stored, logged, or put in a cookie, so there is no later request in which a
 * stolen one could be replayed, and the session that comes out of a sign-in
 * grants no access to the provider at all.
 */
export const exchangeCodeForProfile = async (options: {
  readonly provider: OAuthProvider;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
  readonly code: string;
  readonly codeVerifier: string;
  readonly fetchImpl: typeof fetch;
}): Promise<OAuthProfile | null> => {
  const tokenResponse = await options.fetchImpl(
    options.provider.tokenEndpoint,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: options.clientId,
        client_secret: options.clientSecret,
        code: options.code,
        redirect_uri: options.redirectUri,
        code_verifier: options.codeVerifier,
      }),
    },
  );

  if (!tokenResponse.ok) {
    return null;
  }

  // GitHub answers a rejected code with HTTP 200 and an `error` field, so the
  // status alone does not say whether the exchange worked.
  const accessToken = asRecord(await tokenResponse.json())?.["access_token"];

  if (typeof accessToken !== "string" || accessToken.length === 0) {
    return null;
  }

  const profileResponse = await options.fetchImpl(
    options.provider.profileEndpoint,
    {
      headers: {
        ...options.provider.profileHeaders,
        authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!profileResponse.ok) {
    return null;
  }

  return options.provider.readProfile(await profileResponse.json());
};
