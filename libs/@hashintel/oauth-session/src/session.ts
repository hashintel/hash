import { SignJWT, jwtVerify, type JWTPayload } from "jose";

/**
 * The one signing algorithm this package mints and accepts.
 *
 * Pinned at both ends. Verification that infers the algorithm from the token's
 * own header accepts `alg: "none"`, and accepts a token symmetrically signed
 * with a public key it believed was for asymmetric verification.
 */
export const sessionAlgorithm = "HS256";

/**
 * Shortest secret accepted, in bytes.
 *
 * HS256 keys shorter than the hash output are worth brute-forcing offline: the
 * attacker holds a token, so they can check a guess without touching us.
 */
const minimumSecretBytes = 32;

const encoder = new TextEncoder();

/** Who a verified caller is. */
export type OAuthSession = {
  /**
   * Provider-scoped account id, e.g. `github:583231`.
   *
   * Built from the provider's immutable numeric id, never the handle: handles
   * are renameable and, once renamed, claimable by somebody else.
   */
  readonly sub: string;
  readonly provider: string;
  /** Handle as it read at sign-in. Display only — see {@link OAuthSession.sub}. */
  readonly login: string;
  readonly avatarUrl: string | null;
  /** Seconds since the epoch after which the token stops verifying. */
  readonly exp: number;
};

/**
 * What one service needs to mint or verify a session.
 *
 * A verifier holds exactly this and nothing else — no provider credentials, no
 * request context — which is what lets a second service check a session
 * without being able to start a sign-in.
 */
export type OAuthSessionKeyring = {
  readonly secret: string;
  /** Origin that mints sessions, e.g. `https://demo.petrinaut.org`. */
  readonly issuer: string;
  /** The surface this token is for. A token minted for another is rejected. */
  readonly audience: string;
};

const signingKey = (secret: string): Uint8Array => {
  const key = encoder.encode(secret);

  // Not defensive noise. `TextEncoder` turns a missing secret into the bytes of
  // some short string — `encode(String(undefined))` is the key `"undefined"` —
  // which every reader of this file then knows. Throwing here, with the throw
  // caught in `readSessionToken`, makes an unconfigured deployment reject every
  // session rather than accept forged ones.
  if (key.byteLength < minimumSecretBytes) {
    throw new Error(
      `OAuth session secret should be at least ${minimumSecretBytes} bytes, received ${key.byteLength}`,
    );
  }

  return key;
};

const readClaims = (payload: JWTPayload): OAuthSession | null => {
  const { sub, exp, provider, login, avatarUrl } = payload;

  if (
    typeof sub !== "string" ||
    typeof exp !== "number" ||
    typeof provider !== "string" ||
    typeof login !== "string"
  ) {
    return null;
  }

  return {
    sub,
    exp,
    provider,
    login,
    avatarUrl: typeof avatarUrl === "string" ? avatarUrl : null,
  };
};

/** Sign a session for {@link OAuthSessionKeyring.audience}. */
export const mintSessionToken = async (
  keyring: OAuthSessionKeyring,
  identity: Omit<OAuthSession, "exp">,
  ttlSeconds: number,
): Promise<string> =>
  new SignJWT({
    provider: identity.provider,
    login: identity.login,
    avatarUrl: identity.avatarUrl,
  })
    .setProtectedHeader({ alg: sessionAlgorithm })
    .setIssuedAt()
    .setIssuer(keyring.issuer)
    .setAudience(keyring.audience)
    .setSubject(identity.sub)
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(signingKey(keyring.secret));

/**
 * Verify a token and return who it says the caller is, or `null`.
 *
 * Every rejection is a `null` rather than a throw, so a caller cannot forget to
 * handle one branch and end up treating a bad token as good.
 */
export const readSessionToken = async (
  keyring: OAuthSessionKeyring,
  token: string | null,
): Promise<OAuthSession | null> => {
  if (token === null || token.length === 0) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, signingKey(keyring.secret), {
      algorithms: [sessionAlgorithm],
      issuer: keyring.issuer,
      audience: keyring.audience,
      // `exp` is checked only when it is present, and `iss`/`aud` only when the
      // option names them. Requiring all five means a token minted without an
      // expiry is rejected instead of verifying for ever.
      requiredClaims: ["iss", "aud", "sub", "exp", "iat"],
    });

    return readClaims(payload);
  } catch {
    return null;
  }
};

const hex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

/**
 * Whether two values are equal, without revealing where they diverge.
 *
 * For the OAuth `state`, where one side is attacker-supplied and the other is a
 * secret they are trying to learn. Web Crypto has no `timingSafeEqual`, so this
 * compares digests instead of the values.
 *
 * The final `===` short-circuits, and that is fine here: what it compares is
 * two SHA-256 outputs, so learning how many leading hex characters matched says
 * nothing about the `state` behind them — an attacker cannot pick an input
 * whose digest shares a prefix with the target's without inverting the hash.
 */
export const equalsWithoutTiming = async (
  left: string,
  right: string,
): Promise<boolean> => {
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);

  return hex(leftDigest) === hex(rightDigest);
};
