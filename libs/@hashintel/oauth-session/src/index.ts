/**
 * @layerRoot auth
 * @role Provider-agnostic OAuth sign-in and the stateless signed session that
 * every consuming service verifies
 */

export {
  clearCookie,
  handshakeCookieName,
  readCookie,
  sessionCookieName,
  setCookie,
} from "./cookies";
export { createSessionGuard, createSessionReader } from "./guard";
export {
  createOAuthSessionHandlers,
  type OAuthClientCredentials,
  type OAuthSessionSettings,
  type OAuthSessionState,
} from "./handlers";
export {
  isOAuthProviderId,
  oauthProviders,
  type OAuthProfile,
  type OAuthProvider,
  type OAuthProviderId,
} from "./providers";
export {
  mintSessionToken,
  readSessionToken,
  sessionAlgorithm,
  type OAuthSession,
  type OAuthSessionKeyring,
} from "./session";
