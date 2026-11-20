import { Hono } from "hono";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import {
  hashSessionActor,
  hashSessionCookie,
  type SessionActorCache,
} from "./hash-session-actor";

const apiOrigin = "https://hash-api.test";
const sessionCookie = (value: string) => `${hashSessionCookie}=${value}`;

/** hash-api's answer to `sessionAccount` for a user in `webId`. */
const account = (webId: string, accountSignupComplete = true) =>
  Response.json({
    data: { sessionAccount: { webId, accountSignupComplete } },
  });
/** hash-api's answer without a session it signs in. */
const signedOut = () =>
  Response.json({
    data: null,
    errors: [
      {
        message: "You must be logged in to perform this action.",
        extensions: { code: "FORBIDDEN" },
      },
    ],
  });

/** A stand-in for hash-api's GraphQL endpoint, answering by the cookie it receives. */
const hashApi = {
  calls: [] as { url: string; cookie: string | null; query: unknown }[],
  answers: new Map<string, () => Response | Promise<Response>>(),
};

beforeEach(() => {
  hashApi.calls.length = 0;
  hashApi.answers.clear();
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const cookie = headers.get("cookie");
      hashApi.calls.push({
        url: input instanceof Request ? input.url : input.toString(),
        cookie,
        query: (
          JSON.parse(typeof init?.body === "string" ? init.body : "{}") as {
            query?: unknown;
          }
        ).query,
      });
      return (hashApi.answers.get(cookie ?? "") ?? signedOut)();
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const serve = (
  options: {
    readonly apiOrigin?: string | undefined;
    readonly cache?: SessionActorCache;
    readonly logWarning?: (
      message: string,
      fields?: Record<string, unknown>,
    ) => void;
  } = {},
) => {
  const app = new Hono()
    .use(
      hashSessionActor({
        apiOrigin: "apiOrigin" in options ? options.apiOrigin : apiOrigin,
        cache: options.cache,
        logWarning: options.logWarning ?? (() => {}),
      }),
    )
    .get("/", (context) => context.text(context.get("hashSessionActorKey")));
  return async (cookie?: string) => {
    const response = await app.fetch(
      new Request("https://agents.test/", {
        headers: cookie === undefined ? {} : { cookie },
      }),
    );
    return { status: response.status, body: await response.text() };
  };
};

test("a completed account's session names its actor, and only the session cookie reaches hash-api's sessionAccount", async () => {
  hashApi.answers.set(sessionCookie("alice"), () => account("web-alice"));
  const request = serve({ apiOrigin: `${apiOrigin}/` });
  expect(
    await request(`other=1; ${sessionCookie("alice")}; csrf_token_x=2`),
  ).toEqual({ status: 200, body: "hash:web-alice" });
  expect(hashApi.calls.map(({ url, cookie }) => ({ url, cookie }))).toEqual([
    { url: `${apiOrigin}/graphql`, cookie: sessionCookie("alice") },
  ]);
  expect(hashApi.calls[0]?.query).toMatch(/\bsessionAccount \{/u);
});

test("no session, a signed-out session, an account mid-signup and an unconfigured hash-api are each refused with 401", async () => {
  hashApi.answers.set(sessionCookie("mid-signup"), () =>
    account("web-new", false),
  );
  hashApi.answers.set(sessionCookie("alice"), () => account("web-alice"));
  const unauthorized = { status: 401, body: '{"error":"unauthorized"}' };
  const request = serve();
  expect(await request()).toEqual(unauthorized);
  expect(await request("other=1")).toEqual(unauthorized);
  expect(await request(`${hashSessionCookie}=`)).toEqual(unauthorized);
  expect(await request(sessionCookie("unknown"))).toEqual(unauthorized);
  expect(await request(sessionCookie("mid-signup"))).toEqual(unauthorized);
  expect(hashApi.calls).toHaveLength(2);
  for (const configured of [undefined, ""])
    expect(
      await serve({ apiOrigin: configured })(sessionCookie("alice")),
      String(configured),
    ).toEqual(unauthorized);
  expect(hashApi.calls).toHaveLength(2);
});

test("hash-api failing or answering unexpectedly is a 503, logged without the session", async () => {
  const warnings: unknown[] = [];
  const faults: Record<string, () => Response | Promise<Response>> = {
    "hash-api-error": () =>
      Response.json({ error: "internal" }, { status: 500 }),
    "not-json": () => new Response("<html>", { status: 200 }),
    "graphql-error": () =>
      Response.json({
        data: null,
        errors: [{ extensions: { code: "INTERNAL_SERVER_ERROR" } }],
      }),
    "no-account": () => Response.json({ data: { me: null } }),
    unreachable: () => Promise.reject(new TypeError("fetch failed")),
  };
  for (const [session, answer] of Object.entries(faults))
    hashApi.answers.set(sessionCookie(session), answer);
  const request = serve({
    logWarning: (message, fields) => warnings.push([message, fields]),
  });
  for (const session of Object.keys(faults))
    expect(await request(sessionCookie(session)), session).toEqual({
      status: 503,
      body: '{"error":"session check unavailable"}',
    });
  expect(warnings).toHaveLength(Object.keys(faults).length);
  const logged = JSON.stringify(warnings);
  for (const session of Object.keys(faults))
    expect(logged).not.toContain(session);
  expect(logged).not.toContain(hashSessionCookie);
});

test("a completed account's answer is reused for 30 seconds under a digest of its session; a refusal is never reused", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  hashApi.answers.set(sessionCookie("alice-session"), () =>
    account("web-alice"),
  );
  hashApi.answers.set(sessionCookie("mid-signup"), () =>
    account("web-new", false),
  );
  const cache: SessionActorCache = new Map();
  const request = serve({ cache });
  await request(sessionCookie("alice-session"));
  await request(sessionCookie("alice-session"));
  expect(hashApi.calls).toHaveLength(1);
  expect([...cache.keys()]).toEqual([expect.stringMatching(/^[0-9a-f]{64}$/u)]);
  expect(JSON.stringify([...cache])).not.toContain("alice-session");

  vi.setSystemTime(Date.now() + 30_000);
  expect(await request(sessionCookie("alice-session"))).toEqual({
    status: 200,
    body: "hash:web-alice",
  });
  expect(hashApi.calls).toHaveLength(2);

  hashApi.calls.length = 0;
  for (const session of ["unknown", "mid-signup"]) {
    await request(sessionCookie(session));
    await request(sessionCookie(session));
  }
  expect(hashApi.calls).toHaveLength(4);
  // Finishing signup takes effect on the next request.
  hashApi.answers.set(sessionCookie("mid-signup"), () => account("web-new"));
  expect(await request(sessionCookie("mid-signup"))).toEqual({
    status: 200,
    body: "hash:web-new",
  });
});
