/**
 * @layerRoot website.auth
 * @role Binds the shared OAuth session package to this site's environment and
 * guards the routes that spend money on a model
 *
 * This site's use of {@link @hashintel/oauth-session}: which environment
 * variables configure it, and the guard the paid routes share.
 *
 * The package knows nothing about env var names or about Petrinaut. This module
 * is where those two meet, so the routes below it take a settings object and
 * stay testable without touching `process`.
 */

import {
  createOAuthSessionHandlers,
  createSessionGuard,
  type OAuthSessionSettings,
} from "@hashintel/oauth-session";

export type PetrinautAuthEnvironment = {
  readonly GITHUB_CLIENT_ID?: string;
  readonly GITHUB_CLIENT_SECRET?: string;
  readonly PETRINAUT_SESSION_SECRET?: string;
  /**
   * Origin this deployment is reached on, e.g. `https://demo.petrinaut.org`.
   *
   * Also the session issuer and the base of the OAuth callback, so a token
   * minted by one deployment does not verify on another, and the callback this
   * site sends matches what the provider has registered.
   */
  readonly PETRINAUT_PUBLIC_ORIGIN?: string;
};

/** Where the dev server listens, and the only origin a default build signs in on. */
const developmentOrigin = "http://localhost:5173";

/**
 * Audience of the cookie session, which only this site's own routes read.
 *
 * A token is minted for exactly one audience and rejected by every other, so
 * the short-lived token handed to a browser for Brunch cannot be turned around
 * and replayed against Petrinaut AI.
 */
export const petrinautAiAudience = "petrinaut-ai";

/** Audience of the token minted for Brunch, which runs on another origin. */
export const brunchAudience = "brunch";

const sessionTtlSeconds = 8 * 60 * 60;

/**
 * Lifetime of a token minted for another origin.
 *
 * Short because it is the one credential a page script can hold: a copy that
 * leaks is worth minutes, and the page mints another when it needs one.
 */
const delegatedTtlSeconds = 5 * 60;

export const resolvePetrinautAuthSettings = (
  environment: PetrinautAuthEnvironment,
): OAuthSessionSettings => {
  const origin = environment.PETRINAUT_PUBLIC_ORIGIN ?? developmentOrigin;
  const secret = environment.PETRINAUT_SESSION_SECRET ?? "";
  const clientId = environment.GITHUB_CLIENT_ID;
  const clientSecret = environment.GITHUB_CLIENT_SECRET;

  // Sign-in needs all three. Missing any of them leaves `clients` empty, which
  // is what makes `/api/auth/session` report sign-in unavailable instead of the
  // UI offering a button that leads to a provider error page. A branch preview
  // is the ordinary case: its hostname is on a different registrable domain
  // from production, so no callback registration can cover it.
  const clients =
    secret.length > 0 && clientId !== undefined && clientSecret !== undefined
      ? { github: { clientId, clientSecret } }
      : {};

  return {
    keyring: { secret, issuer: origin, audience: petrinautAiAudience },
    sessionTtlSeconds,
    callbackUrl: `${origin}/api/auth/callback`,
    signedInPath: "/",
    clients,
    delegation: {
      audience: brunchAudience,
      ttlSeconds: delegatedTtlSeconds,
    },
  };
};

export const createPetrinautAuthHandlers = (
  environment: PetrinautAuthEnvironment,
) =>
  createOAuthSessionHandlers({
    settings: resolvePetrinautAuthSettings(environment),
  });

/**
 * The guard every route that spends money on a model wraps itself in.
 *
 * One guard rather than a check per route: an endpoint that forgot to call it
 * bills us, and a single wrapper is visible in the route file.
 */
export const createPetrinautAiGuard = (environment: PetrinautAuthEnvironment) =>
  createSessionGuard({
    keyring: resolvePetrinautAuthSettings(environment).keyring,
    message: "Sign in with GitHub to use Petrinaut AI",
  });
