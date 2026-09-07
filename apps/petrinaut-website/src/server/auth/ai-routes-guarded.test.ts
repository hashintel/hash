/**
 * The routes that spend money, asked directly whether they are guarded.
 *
 * These live here rather than beside the handlers because the modules under
 * test are in `api/`, where every file is deployed as its own function and the
 * default `{ fetch }` object is the only export.
 *
 * The proof each one turns on: no `OPENAI_API_KEY` is set in this environment,
 * so a request that got past the guard would fail *later* and differently — 500
 * for chat, 404 for voice. A 401 is therefore evidence that nothing downstream
 * ran, not merely that the response was unhappy.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { mintSessionToken } from "@hashintel/oauth-session";

const sessionSecret = "a-session-secret-of-at-least-32-bytes!!!";
const origin = "https://demo.petrinaut.test";

const routes = [
  {
    name: "/api/chat",
    module: "../../../api/chat",
    request: () =>
      new Request(`${origin}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [] }),
      }),
  },
  {
    name: "/api/voice/realtime-call",
    module: "../../../api/voice/realtime-call",
    request: () =>
      new Request(`${origin}/api/voice/realtime-call`, {
        method: "POST",
        headers: { "content-type": "application/sdp", origin },
        body: "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\n",
      }),
  },
  {
    name: "/api/voice/config",
    module: "../../../api/voice/config",
    request: () => new Request(`${origin}/api/voice/config`),
  },
] as const;

type FetchHandler = { fetch: (request: Request) => Promise<Response> };

const loadRoute = async (modulePath: string): Promise<FetchHandler> => {
  vi.resetModules();
  return (await import(modulePath)).default as FetchHandler;
};

beforeEach(() => {
  vi.stubEnv("PETRINAUT_SESSION_SECRET", sessionSecret);
  vi.stubEnv("PETRINAUT_PUBLIC_ORIGIN", origin);
  vi.stubEnv("GITHUB_CLIENT_ID", "client-id");
  vi.stubEnv("GITHUB_CLIENT_SECRET", "client-secret");
  vi.stubEnv("OPENAI_API_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe.each(routes)("$name", ({ module, request }) => {
  test("refuses a caller with no session", async () => {
    const route = await loadRoute(module);

    const response = await route.fetch(request());

    expect(response.status).toBe(401);
  });

  test("refuses a session signed with the wrong secret", async () => {
    const route = await loadRoute(module);
    const forged = await mintSessionToken(
      {
        secret: "a-completely-different-secret-32-bytes!!",
        issuer: origin,
        audience: "petrinaut-ai",
      },
      {
        sub: "github:1",
        provider: "github",
        login: "octocat",
        avatarUrl: null,
      },
      60,
    );

    const response = await route.fetch(
      new Request(request(), {
        headers: {
          ...Object.fromEntries(request().headers),
          cookie: `__Host-hash_oauth_session=${forged}`,
        },
      }),
    );

    expect(response.status).toBe(401);
  });

  test("refuses a token minted for the delegated audience", async () => {
    const route = await loadRoute(module);
    // A token the page holds for Brunch must not open this site's own routes.
    const delegated = await mintSessionToken(
      { secret: sessionSecret, issuer: origin, audience: "brunch" },
      {
        sub: "github:1",
        provider: "github",
        login: "octocat",
        avatarUrl: null,
      },
      60,
    );

    const response = await route.fetch(
      new Request(request(), {
        headers: {
          ...Object.fromEntries(request().headers),
          authorization: `Bearer ${delegated}`,
        },
      }),
    );

    expect(response.status).toBe(401);
  });

  test("lets a valid session through to the handler behind it", async () => {
    const route = await loadRoute(module);
    const token = await mintSessionToken(
      { secret: sessionSecret, issuer: origin, audience: "petrinaut-ai" },
      {
        sub: "github:583231",
        provider: "github",
        login: "octocat",
        avatarUrl: null,
      },
      60,
    );

    const response = await route.fetch(
      new Request(request(), {
        headers: {
          ...Object.fromEntries(request().headers),
          cookie: `__Host-hash_oauth_session=${token}`,
        },
      }),
    );

    // Whatever happens next, it is no longer an authentication problem — which
    // is what makes the 401s above meaningful rather than incidental.
    expect(response.status).not.toBe(401);
  });
});

describe("/api/chat method handling", () => {
  test("answers a preflight without asking anyone to sign in", async () => {
    const route = await loadRoute("../../../api/chat");

    const response = await route.fetch(
      new Request(`${origin}/api/chat`, { method: "OPTIONS" }),
    );

    expect(response.status).toBe(204);
  });

  test("rejects a wrong verb as a wrong verb", async () => {
    const route = await loadRoute("../../../api/chat");

    const response = await route.fetch(new Request(`${origin}/api/chat`));

    expect(response.status).toBe(405);
  });
});
