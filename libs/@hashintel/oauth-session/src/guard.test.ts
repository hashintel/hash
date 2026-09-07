import { describe, expect, test, vi } from "vitest";

import { sessionCookieName } from "./cookies";
import { createSessionGuard, createSessionReader } from "./guard";
import {
  mintSessionToken,
  type OAuthSession,
  type OAuthSessionKeyring,
} from "./session";

const keyring: OAuthSessionKeyring = {
  secret: "test-secret-that-is-long-enough-for-hs256",
  issuer: "https://petrinaut.test",
  audience: "petrinaut-ai",
};

const identity = {
  sub: "github:583231",
  provider: "github",
  login: "octocat",
  avatarUrl: null,
};

const readSession = createSessionReader(keyring);

const withCookie = (token: string, headers: Record<string, string> = {}) =>
  new Request("https://petrinaut.test/api/chat", {
    method: "POST",
    headers: { cookie: `${sessionCookieName}=${token}`, ...headers },
  });

describe("reading a session off a request", () => {
  test("accepts the cookie a browser attaches to our own pages", async () => {
    const token = await mintSessionToken(keyring, identity, 60);

    await expect(
      readSession(withCookie(token, { "sec-fetch-site": "same-origin" })),
    ).resolves.toMatchObject({ sub: identity.sub });
  });

  test("accepts a bearer token, which is how another origin is heard", async () => {
    const token = await mintSessionToken(keyring, identity, 60);

    const request = new Request("https://brunch.test/chat", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });

    await expect(readSession(request)).resolves.toMatchObject({
      sub: identity.sub,
    });
  });

  test("reads the bearer scheme case-insensitively", async () => {
    const token = await mintSessionToken(keyring, identity, 60);

    const request = new Request("https://brunch.test/chat", {
      headers: { authorization: `bearer ${token}` },
    });

    await expect(readSession(request)).resolves.not.toBeNull();
  });

  test("rejects a cookie sent with a cross-site request", async () => {
    const token = await mintSessionToken(keyring, identity, 60);

    // The browser attaches the cookie to a request our pages did not make.
    // `Sec-` headers cannot be set by page scripts, so this one is worth
    // reading — and page code cannot forge a friendlier value.
    await expect(
      readSession(withCookie(token, { "sec-fetch-site": "cross-site" })),
    ).resolves.toBeNull();
  });

  test("does not fall back to the cookie when a bearer token is rejected", async () => {
    const good = await mintSessionToken(keyring, identity, 60);
    const wrongAudience = await mintSessionToken(
      { ...keyring, audience: "somebody-else" },
      identity,
      60,
    );

    const request = new Request("https://petrinaut.test/api/chat", {
      method: "POST",
      headers: {
        cookie: `${sessionCookieName}=${good}`,
        authorization: `Bearer ${wrongAudience}`,
      },
    });

    await expect(readSession(request)).resolves.toBeNull();
  });

  test("treats an empty or malformed authorization header as no token", async () => {
    for (const authorization of ["Bearer", "Bearer   ", "Basic abc"]) {
      const request = new Request("https://petrinaut.test/api/chat", {
        headers: { authorization },
      });

      await expect(readSession(request)).resolves.toBeNull();
    }
  });

  test("reads the right cookie out of a crowded header", async () => {
    const token = await mintSessionToken(keyring, identity, 60);

    const request = new Request("https://petrinaut.test/api/chat", {
      headers: {
        cookie: `other=1; ${sessionCookieName}=${token}; trailing=2`,
      },
    });

    await expect(readSession(request)).resolves.toMatchObject({
      sub: identity.sub,
    });
  });
});

describe("guarding a route", () => {
  const guard = createSessionGuard({
    keyring,
    message: "Sign in with GitHub to use Petrinaut AI",
  });

  test("runs the handler with the identity that let it through", async () => {
    const handler = vi.fn(
      (_request: Request, _session: OAuthSession) => new Response("ok"),
    );
    const token = await mintSessionToken(keyring, identity, 60);

    const response = await guard(handler)(withCookie(token));

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[1]).toMatchObject({ sub: identity.sub });
  });

  test("answers 401 without running the handler when signed out", async () => {
    const handler = vi.fn(
      (_request: Request, _session: OAuthSession) => new Response("ok"),
    );

    const response = await guard(handler)(
      new Request("https://petrinaut.test/api/chat", { method: "POST" }),
    );

    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: "Sign in with GitHub to use Petrinaut AI",
    });
  });

  test("answers 401 without running the handler for a forged token", async () => {
    const handler = vi.fn(
      (_request: Request, _session: OAuthSession) => new Response("ok"),
    );
    const forged = await mintSessionToken(
      { ...keyring, secret: "a-completely-different-secret-32-bytes!!" },
      identity,
      60,
    );

    const response = await guard(handler)(withCookie(forged));

    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });
});
