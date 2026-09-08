/**
 * The two cookies a sign-in needs, and the attributes they carry.
 *
 * Both names take the `__Host-` prefix, which a browser accepts only when the
 * cookie is `Secure`, has `Path=/`, and names no `Domain`. That last part is
 * the reason for the prefix: without it a sibling host on a shared parent
 * domain can write a cookie our origin then reads, which is how session
 * fixation and `state` fixation both start. Browsers treat `localhost` as a
 * secure origin, so `Secure` costs nothing in development.
 */

/** Carries the signed session. Long-lived, read on every guarded request. */
export const sessionCookieName = "__Host-hash_oauth_session";

/**
 * Carries the `state` and PKCE verifier between the start of a sign-in and the
 * provider's callback. Short-lived and cleared on every exit from the callback.
 */
export const handshakeCookieName = "__Host-hash_oauth_handshake";

/** Seconds a handshake may sit unfinished before the callback refuses it. */
export const handshakeTtlSeconds = 600;

const attributes = "Path=/; HttpOnly; Secure; SameSite=Lax";

/**
 * `SameSite=Lax`, not `Strict`.
 *
 * The provider's callback is a cross-site top-level GET. `Strict` withholds the
 * cookie on exactly that navigation, so the callback could never read the
 * handshake it just wrote. `Lax` sends cookies on top-level GETs and withholds
 * them on cross-site POSTs, which is the shape the guarded routes need — they
 * are POST-only, so a cross-site form cannot reach them with a session
 * attached.
 */
export const setCookie = (
  cookieName: string,
  value: string,
  maxAgeSeconds: number,
): string => `${cookieName}=${value}; ${attributes}; Max-Age=${maxAgeSeconds}`;

/** A `Set-Cookie` that removes `cookieName`, whatever it held. */
export const clearCookie = (cookieName: string): string =>
  `${cookieName}=; ${attributes}; Max-Age=0`;

/**
 * One cookie's value from a request, or `null`.
 *
 * Hand-parsed rather than pulled from a dependency: the header is a
 * `; `-delimited list, our two names are fixed, and the values are base64url,
 * so there is nothing to unescape.
 */
export const readCookie = (
  request: Request,
  cookieName: string,
): string | null => {
  const header = request.headers.get("cookie");

  if (header === null) {
    return null;
  }

  for (const entry of header.split(";")) {
    const separator = entry.indexOf("=");

    if (separator === -1) {
      continue;
    }

    if (entry.slice(0, separator).trim() === cookieName) {
      return entry.slice(separator + 1).trim();
    }
  }

  return null;
};
