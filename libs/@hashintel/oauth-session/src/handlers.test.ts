import { describe, expect, test, vi } from "vitest";

import { handshakeCookieName, sessionCookieName } from "./cookies";
import {
  createOAuthSessionHandlers,
  type OAuthSessionSettings,
} from "./handlers";
import { readSessionToken } from "./session";

const settings: OAuthSessionSettings = {
  keyring: {
    secret: "test-secret-that-is-long-enough-for-hs256",
    issuer: "https://petrinaut.test",
    audience: "petrinaut-ai",
  },
  sessionTtlSeconds: 28_800,
  callbackUrl: "https://petrinaut.test/api/auth/callback",
  signedInPath: "/",
  clients: {
    github: { clientId: "client-id", clientSecret: "client-secret" },
  },
  delegation: { audience: "brunch", ttlSeconds: 300 },
};

const githubProfile = {
  id: 583_231,
  login: "octocat",
  avatar_url: "https://avatars.test/octocat.png",
};

/** The target of a `fetch` call, however the caller expressed it. */
const urlOf = (input: RequestInfo | URL): string =>
  typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;

/** The form-encoded body of a `fetch` call, which is all this package sends. */
const bodyOf = (init: RequestInit | undefined): string =>
  init?.body instanceof URLSearchParams ? init.body.toString() : "";

/** A provider that answers both legs of the exchange successfully. */
const workingProvider = () =>
  vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = urlOf(input);

    if (url.startsWith("https://github.com/login/oauth/access_token")) {
      return Response.json({ access_token: "gho_token", token_type: "bearer" });
    }

    if (url.startsWith("https://api.github.com/user")) {
      return Response.json(githubProfile);
    }

    throw new Error(`unexpected request to ${url}`);
  });

const setCookieValues = (response: Response): string[] =>
  response.headers.getSetCookie();

const cookieHeaderFrom = (response: Response): string =>
  setCookieValues(response)
    .map((cookie) => cookie.split(";")[0] ?? "")
    .filter((pair) => !pair.endsWith("="))
    .join("; ");

/** Drive `start`, then feed its handshake cookie back into `callback`. */
const completeSignIn = async (fetchImpl: typeof fetch) => {
  const handlers = createOAuthSessionHandlers({ settings, fetchImpl });

  const started = await handlers.start(
    new Request("https://petrinaut.test/api/auth/github"),
  );

  const authorize = new URL(started.headers.get("location") ?? "");
  const state = authorize.searchParams.get("state") ?? "";

  const callback = await handlers.callback(
    new Request(
      `https://petrinaut.test/api/auth/callback?code=the-code&state=${encodeURIComponent(state)}`,
      { headers: { cookie: cookieHeaderFrom(started) } },
    ),
  );

  return { authorize, callback, handlers, started };
};

describe("starting a sign-in", () => {
  test("sends the browser to the provider with PKCE and an exact callback", async () => {
    const { authorize } = await completeSignIn(workingProvider());

    expect(authorize.origin + authorize.pathname).toBe(
      "https://github.com/login/oauth/authorize",
    );
    expect(authorize.searchParams.get("client_id")).toBe("client-id");
    expect(authorize.searchParams.get("redirect_uri")).toBe(
      settings.callbackUrl,
    );
    expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorize.searchParams.get("code_challenge")).toMatch(
      /^[\w-]{43}$/u,
    );
    // No scope at all: the profile endpoint still identifies the account, so a
    // leaked access token would grant its holder nothing.
    expect(authorize.searchParams.get("scope")).toBeNull();
  });

  test("uses a fresh state of at least 32 bytes each time", async () => {
    const handlers = createOAuthSessionHandlers({ settings });
    const request = new Request("https://petrinaut.test/api/auth/github");

    const [first, second] = await Promise.all([
      handlers.start(request),
      handlers.start(request),
    ]);

    const stateOf = (response: Response) =>
      new URL(response.headers.get("location") ?? "").searchParams.get(
        "state",
      ) ?? "";

    expect(stateOf(first)).not.toBe(stateOf(second));
    // 32 random bytes, base64url-encoded without padding.
    expect(stateOf(first)).toMatch(/^[\w-]{43}$/u);
  });

  test("says so when the provider is not configured here", async () => {
    const handlers = createOAuthSessionHandlers({
      settings: { ...settings, clients: {} },
    });

    const response = await handlers.start(
      new Request("https://petrinaut.test/api/auth/github"),
    );

    expect(response.status).toBe(503);
  });

  test("refuses an unknown provider", async () => {
    const handlers = createOAuthSessionHandlers({ settings });

    const response = await handlers.start(
      new Request("https://petrinaut.test/api/auth/github?provider=myspace"),
    );

    expect(response.status).toBe(400);
  });
});

describe("the provider's callback", () => {
  test("sets a session and clears the handshake on the happy path", async () => {
    const fetchImpl = workingProvider();
    const { callback } = await completeSignIn(fetchImpl);

    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("/");

    const cookies = setCookieValues(callback);
    const session = cookies.find((cookie) =>
      cookie.startsWith(sessionCookieName),
    );
    const handshake = cookies.find((cookie) =>
      cookie.startsWith(handshakeCookieName),
    );

    expect(session).toMatch(
      new RegExp(
        `^${sessionCookieName}=[\\w.-]+; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800$`,
        "u",
      ),
    );
    expect(session).not.toMatch(/Domain=/u);
    expect(handshake).toContain("Max-Age=0");
  });

  test("keys the session on the provider's numeric id, not the handle", async () => {
    const { callback } = await completeSignIn(workingProvider());

    const token =
      setCookieValues(callback)
        .find((cookie) => cookie.startsWith(sessionCookieName))
        ?.split(";")[0]
        ?.slice(sessionCookieName.length + 1) ?? null;

    await expect(
      readSessionToken(settings.keyring, token),
    ).resolves.toMatchObject({
      sub: "github:583231",
      provider: "github",
      login: "octocat",
    });
  });

  test("keeps the same subject when the handle is renamed", async () => {
    const renamed = vi.fn(async (input: RequestInfo | URL) =>
      urlOf(input).startsWith("https://api.github.com/user")
        ? Response.json({ ...githubProfile, login: "not-octocat" })
        : Response.json({ access_token: "gho_token" }),
    );

    const { callback } = await completeSignIn(renamed);
    const token =
      setCookieValues(callback)
        .find((cookie) => cookie.startsWith(sessionCookieName))
        ?.split(";")[0]
        ?.slice(sessionCookieName.length + 1) ?? null;

    await expect(
      readSessionToken(settings.keyring, token),
    ).resolves.toMatchObject({ sub: "github:583231", login: "not-octocat" });
  });

  test("puts neither the session nor the provider token in the body", async () => {
    const { callback } = await completeSignIn(workingProvider());
    const body = await callback.text();

    expect(body).toBe("");
    expect(body).not.toContain("gho_token");
  });

  test("refuses a callback that did not start here, without exchanging", async () => {
    const fetchImpl = workingProvider();
    const handlers = createOAuthSessionHandlers({ settings, fetchImpl });

    const response = await handlers.callback(
      new Request(
        "https://petrinaut.test/api/auth/callback?code=the-code&state=invented",
      ),
    );

    expect(response.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("refuses a state that does not match the cookie, without exchanging", async () => {
    const fetchImpl = workingProvider();
    const handlers = createOAuthSessionHandlers({ settings, fetchImpl });

    const started = await handlers.start(
      new Request("https://petrinaut.test/api/auth/github"),
    );

    const response = await handlers.callback(
      new Request(
        "https://petrinaut.test/api/auth/callback?code=the-code&state=somebody-elses-state",
        { headers: { cookie: cookieHeaderFrom(started) } },
      ),
    );

    expect(response.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("treats a declined consent screen as a sign-in that did not happen", async () => {
    const fetchImpl = workingProvider();
    const handlers = createOAuthSessionHandlers({ settings, fetchImpl });

    const response = await handlers.callback(
      new Request(
        "https://petrinaut.test/api/auth/callback?error=access_denied",
      ),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/?signIn=denied");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("sets no session when the provider rejects the code", async () => {
    // GitHub answers a bad code with HTTP 200 and an `error` field.
    const rejecting = vi.fn(async () =>
      Response.json({ error: "bad_verification_code" }),
    );

    const { callback } = await completeSignIn(rejecting);

    expect(callback.headers.get("location")).toBe("/?signIn=failed");
    expect(
      setCookieValues(callback).some((cookie) =>
        cookie.startsWith(`${sessionCookieName}=ey`),
      ),
    ).toBe(false);
  });

  test("sets no session when the profile read fails", async () => {
    const noProfile = vi.fn(async (input: RequestInfo | URL) =>
      urlOf(input).startsWith("https://api.github.com/user")
        ? new Response(null, { status: 401 })
        : Response.json({ access_token: "gho_token" }),
    );

    const { callback } = await completeSignIn(noProfile);

    expect(callback.headers.get("location")).toBe("/?signIn=failed");
  });

  test("sends the PKCE verifier and the client secret in the exchange", async () => {
    const fetchImpl = workingProvider();
    await completeSignIn(fetchImpl);

    const exchange = fetchImpl.mock.calls.find(([input]) =>
      urlOf(input).includes("access_token"),
    );
    const body = bodyOf(exchange?.[1]);

    expect(body).toContain("client_secret=client-secret");
    expect(body).toContain("code_verifier=");
    expect(body).toContain(
      `redirect_uri=${encodeURIComponent(settings.callbackUrl)}`,
    );
  });
});

describe("reporting the current session", () => {
  test("reports nobody, but says sign-in is available", async () => {
    const handlers = createOAuthSessionHandlers({ settings });

    const response = await handlers.session(
      new Request("https://petrinaut.test/api/auth/session"),
    );

    await expect(response.json()).resolves.toEqual({
      user: null,
      available: true,
    });
  });

  test("reports sign-in unavailable where no provider is configured", async () => {
    const handlers = createOAuthSessionHandlers({
      settings: { ...settings, clients: {} },
    });

    const response = await handlers.session(
      new Request("https://petrinaut.test/api/auth/session"),
    );

    await expect(response.json()).resolves.toEqual({
      user: null,
      available: false,
    });
  });

  test("reports the signed-in handle without leaking the token", async () => {
    const { callback, handlers } = await completeSignIn(workingProvider());

    const response = await handlers.session(
      new Request("https://petrinaut.test/api/auth/session", {
        headers: { cookie: cookieHeaderFrom(callback) },
      }),
    );

    const body: unknown = await response.json();

    expect(body).toEqual({
      available: true,
      user: {
        sub: "github:583231",
        login: "octocat",
        avatarUrl: "https://avatars.test/octocat.png",
      },
    });
  });
});

describe("signing out", () => {
  test("clears the session cookie", () => {
    const handlers = createOAuthSessionHandlers({ settings });

    const response = handlers.logout(
      new Request("https://petrinaut.test/api/auth/logout", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toBe(
      `${sessionCookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    );
  });

  test("refuses a GET, so a link cannot sign somebody out", () => {
    const handlers = createOAuthSessionHandlers({ settings });

    const response = handlers.logout(
      new Request("https://petrinaut.test/api/auth/logout"),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });
});

describe("minting a token for another origin", () => {
  test("mints a short-lived token for the delegated audience", async () => {
    const { callback, handlers } = await completeSignIn(workingProvider());

    const response = await handlers.delegatedToken(
      new Request("https://petrinaut.test/api/auth/token", {
        headers: { cookie: cookieHeaderFrom(callback) },
      }),
    );

    const body = (await response.json()) as { token: string };

    expect(body.token).toBeTypeOf("string");

    // Verifiable by the delegated audience...
    await expect(
      readSessionToken({ ...settings.keyring, audience: "brunch" }, body.token),
    ).resolves.toMatchObject({ sub: "github:583231" });

    // ...and not by the first-party one, so the two cannot be swapped.
    await expect(
      readSessionToken(settings.keyring, body.token),
    ).resolves.toBeNull();
  });

  test("refuses a signed-out caller", async () => {
    const handlers = createOAuthSessionHandlers({ settings });

    const response = await handlers.delegatedToken(
      new Request("https://petrinaut.test/api/auth/token"),
    );

    expect(response.status).toBe(401);
  });

  test("will not mint from a delegated token, so one cannot refresh itself", async () => {
    const { callback, handlers } = await completeSignIn(workingProvider());

    const first = (await (
      await handlers.delegatedToken(
        new Request("https://petrinaut.test/api/auth/token", {
          headers: { cookie: cookieHeaderFrom(callback) },
        }),
      )
    ).json()) as { token: string };

    const again = await handlers.delegatedToken(
      new Request("https://petrinaut.test/api/auth/token", {
        headers: { authorization: `Bearer ${first.token}` },
      }),
    );

    expect(again.status).toBe(401);
  });

  test("is absent where delegation is not configured", async () => {
    const handlers = createOAuthSessionHandlers({
      settings: { ...settings, delegation: undefined },
    });

    const response = await handlers.delegatedToken(
      new Request("https://petrinaut.test/api/auth/token"),
    );

    expect(response.status).toBe(404);
  });
});
