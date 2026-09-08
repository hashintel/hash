/**
 * @layerRoot website.auth-client
 * @role Reads the current sign-in, builds the menu item for it, and fetches
 * bearer tokens for a chat endpoint on another origin
 */

import type { OAuthSessionState } from "@hashintel/oauth-session";
import type { MenuItem } from "@hashintel/petrinaut/ui";

export type OAuthSessionSnapshot =
  | { readonly status: "loading" }
  | ({ readonly status: "loaded" } & OAuthSessionState);

const sessionEndpoint = "/api/auth/session";
const signInEndpoint = "/api/auth/github";
const signOutEndpoint = "/api/auth/logout";
const tokenEndpoint = "/api/auth/token";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;

const readSessionState = (body: unknown): OAuthSessionState => {
  const record = asRecord(body);
  const user = asRecord(record?.["user"]);
  const sub = user?.["sub"];
  const login = user?.["login"];
  const avatarUrl = user?.["avatarUrl"];

  return {
    available: record?.["available"] === true,
    user:
      typeof sub === "string" && typeof login === "string"
        ? {
            sub,
            login,
            avatarUrl: typeof avatarUrl === "string" ? avatarUrl : null,
          }
        : null,
  };
};

/** Ask the server who the browser is signed in as. */
export const loadOAuthSession = async (
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<OAuthSessionState> => {
  try {
    const response = await fetchImpl(sessionEndpoint, {
      headers: { accept: "application/json" },
      signal,
    });

    return response.ok
      ? readSessionState(await response.json())
      : { user: null, available: false };
  } catch {
    // A failed probe is reported as signed out with sign-in unavailable, which
    // is the safe reading: the AI routes would refuse us anyway.
    return { user: null, available: false };
  }
};

/**
 * Forget the session, then reload.
 *
 * A reload rather than local state updates: the chat transport, the assistant's
 * message history and the voice session are all built around a signed-in
 * viewer, and re-deriving each of them from a sign-out is far more code than
 * starting the page again.
 */
export const signOut = async (fetchImpl: typeof fetch): Promise<void> => {
  await fetchImpl(signOutEndpoint, { method: "POST" });
  window.location.assign("/");
};

/**
 * What the burger menu shows for the current sign-in.
 *
 * Derived, never stored: the caller passes the snapshot it already has, so the
 * menu cannot disagree with the session the rest of the page is using.
 */
export const oauthSessionMenuItems = (
  snapshot: OAuthSessionSnapshot,
  onSignOut: () => void,
): MenuItem[] => {
  if (snapshot.status === "loading") {
    // Nothing, rather than a placeholder: the probe is a same-origin request
    // and an item that changes its own label a moment later reads as a glitch.
    return [];
  }

  if (snapshot.user !== null) {
    return [
      {
        id: "oauth-sign-out",
        icon: "user",
        text: `Sign out of ${snapshot.user.login}`,
        onClick: onSignOut,
      },
    ];
  }

  return snapshot.available
    ? [
        {
          id: "oauth-sign-in",
          icon: "user",
          text: "Sign in with GitHub",
          href: signInEndpoint,
        },
      ]
    : [
        {
          id: "oauth-sign-in-unavailable",
          icon: "user",
          text: "Sign-in unavailable here",
          description: "This deployment has no GitHub sign-in configured",
          disabled: true,
          // A menu item must carry exactly one of `href`, `onClick` or
          // `subItems`. This one is a label, so it gets the handler that can
          // never run rather than a link to a route that would answer 503.
          onClick: () => {},
        },
      ];
};

type CachedToken = { readonly token: string; readonly expiresAt: number };

let cachedDelegatedToken: CachedToken | null = null;

/** Re-fetch this long before expiry, so an in-flight request cannot age out. */
const renewalMarginMs = 30_000;

/**
 * A bearer token for a chat endpoint that is not on this origin.
 *
 * Needed only for that case. The session cookie is `SameSite=Lax`, so it
 * reaches this site's own routes and never a third-party endpoint; a token
 * fetched here is what carries the identity across.
 *
 * Cached in module scope and reused until it is nearly expired, so a
 * conversation does not mint one per message.
 */
export const delegatedAuthorizationHeader = async (
  fetchImpl: typeof fetch,
): Promise<Record<string, string>> => {
  const now = Date.now();

  if (cachedDelegatedToken !== null) {
    if (cachedDelegatedToken.expiresAt - renewalMarginMs > now) {
      return { authorization: `Bearer ${cachedDelegatedToken.token}` };
    }

    cachedDelegatedToken = null;
  }

  try {
    const response = await fetchImpl(tokenEndpoint, {
      headers: { accept: "application/json" },
    });

    if (!response.ok) {
      return {};
    }

    const record = asRecord(await response.json());
    const token = record?.["token"];
    const expiresInSeconds = record?.["expiresInSeconds"];

    if (typeof token !== "string" || typeof expiresInSeconds !== "number") {
      return {};
    }

    cachedDelegatedToken = {
      token,
      expiresAt: now + expiresInSeconds * 1000,
    };

    return { authorization: `Bearer ${token}` };
  } catch {
    // Send the request unauthenticated and let the endpoint answer. Failing
    // here would hide a network problem behind what looks like a sign-in one.
    return {};
  }
};

/**
 * Whether a chat endpoint is somewhere the session cookie cannot reach.
 *
 * A relative endpoint is this site. An absolute one is only cross-origin if it
 * actually resolves elsewhere — `VITE_BRUNCH_CHAT_ENDPOINT` may well name this
 * same origin, and attaching a bearer token then would be actively wrong: the
 * guard judges a request on its token when one is present, and a token minted
 * for another audience is refused even though the cookie beside it is good.
 */
export const isCrossOriginEndpoint = (endpoint: string): boolean => {
  try {
    return (
      new URL(endpoint, window.location.href).origin !== window.location.origin
    );
  } catch {
    return false;
  }
};
