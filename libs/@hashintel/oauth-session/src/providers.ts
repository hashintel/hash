/**
 * The providers sign-in can run against.
 *
 * A provider is data, not code: four endpoints, the scope to ask for, and how
 * to read an account out of its profile response. Adding one is a new entry in
 * {@link oauthProviders} — the flow in `./flow` and the handlers in
 * `./handlers` never name a provider.
 */

/** The only three facts about an account this package carries. */
export type OAuthProfile = {
  /** The provider's own immutable id for the account. */
  readonly accountId: string;
  readonly login: string;
  readonly avatarUrl: string | null;
};

export type OAuthProvider = {
  readonly id: string;
  readonly authorizeEndpoint: string;
  readonly tokenEndpoint: string;
  readonly profileEndpoint: string;
  /**
   * Space-delimited scopes, or empty.
   *
   * Empty is the goal: the profile endpoint still identifies the account, so an
   * access token that leaked between the exchange and the profile read grants
   * the holder nothing at all.
   */
  readonly scope: string;
  /** Headers the profile request needs beyond the bearer token. */
  readonly profileHeaders: Readonly<Record<string, string>>;
  readonly readProfile: (body: unknown) => OAuthProfile | null;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;

const githubProvider: OAuthProvider = {
  id: "github",
  authorizeEndpoint: "https://github.com/login/oauth/authorize",
  tokenEndpoint: "https://github.com/login/oauth/access_token",
  profileEndpoint: "https://api.github.com/user",
  scope: "",
  profileHeaders: {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    // GitHub rejects an API request that identifies no client.
    "user-agent": "hash-oauth-session",
  },
  readProfile: (body) => {
    const record = asRecord(body);

    if (record === null) {
      return null;
    }

    const accountId = record["id"];
    const login = record["login"];
    const avatarUrl = record["avatar_url"];

    // `id` is a JSON number here and a string in other providers' payloads;
    // accept either and carry it as a string, so `sub` has one shape.
    if (typeof accountId !== "number" && typeof accountId !== "string") {
      return null;
    }

    if (typeof login !== "string" || login.length === 0) {
      return null;
    }

    return {
      accountId: String(accountId),
      login,
      avatarUrl: typeof avatarUrl === "string" ? avatarUrl : null,
    };
  },
};

export const oauthProviders = {
  github: githubProvider,
} as const satisfies Readonly<Record<string, OAuthProvider>>;

export type OAuthProviderId = keyof typeof oauthProviders;

export const isOAuthProviderId = (value: string): value is OAuthProviderId =>
  Object.hasOwn(oauthProviders, value);
