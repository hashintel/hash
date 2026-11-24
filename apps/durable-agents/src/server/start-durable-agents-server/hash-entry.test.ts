import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  createRegistry,
  Harness,
  MemoryStorage,
} from "@earendil-works/pi-durable";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  brunchHeaders,
  brunchRoutes,
  flueConversationIdWeb,
} from "@hashintel/brunch-agent";
import {
  hashSessionCookie,
  turnSubmissionsPerMinute,
} from "@hashintel/brunch-agent/server";

import { scriptedModel } from "../../../test/scripted-model";
import { createHashEntry, hashEntryFromEnvironment } from "./hash-entry";

const context = BACKGROUND_CONTEXT;
const apiOrigin = "https://hash-api.test";
const pageOrigin = "https://app.hash.test";
const conversationId = "conversation-1";
const webId = "web-alice";
const alice = { actorKey: "hash:web-alice", cookie: "alice-session" };
const bob = { actorKey: "hash:web-bob", cookie: "bob-session" };

/** hash-api's GraphQL endpoint, answering a known session with its account. */
beforeEach(() => {
  const accounts = new Map([
    [`${hashSessionCookie}=${alice.cookie}`, "web-alice"],
    [`${hashSessionCookie}=${bob.cookie}`, "web-bob"],
  ]);
  vi.stubGlobal("fetch", async (_input: unknown, init?: RequestInit) => {
    const account = accounts.get(
      new Headers(init?.headers).get("cookie") ?? "",
    );
    return Response.json(
      account === undefined
        ? { data: null, errors: [{ extensions: { code: "FORBIDDEN" } }] }
        : {
            data: {
              sessionAccount: { webId: account, accountSignupComplete: true },
            },
          },
    );
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** The entry in front of routes that answer which one ran, as the server's would. */
const openEntry = () => {
  const reached: string[] = [];
  const entry = createHashEntry({
    apiOrigin,
    allowedOrigins: [pageOrigin],
    browserCallsPrefix: "/conversations",
    logWarning: () => {},
  });
  const app = new Hono();
  entry.mount(app);
  const answer =
    (route: string) => (request: { text: (body: string) => Response }) => {
      reached.push(route);
      return request.text(route);
    };
  app.post("/chat", async (request) => {
    // The ownership check left the body for the route.
    const body = (await request.req.json()) as { id: string };
    reached.push(`chat ${body.id}`);
    return request.text("chat");
  });
  app.get("/chat/:id/stream", answer("stream"));
  app.post("/chat/:id/abort", answer("abort"));
  app.get("/chat/:id/messages", answer("messages"));
  app.get(`/conversations/:id/${brunchRoutes.browserCalls}`, answer("calls"));
  app.post(
    `/conversations/:id/${brunchRoutes.browserCalls}/${brunchRoutes.handEdits}`,
    answer("hand-edits"),
  );
  app.post(
    `/conversations/:id/${brunchRoutes.browserCalls}/:callId`,
    answer("claim"),
  );
  app.post(
    `/conversations/:id/${brunchRoutes.browserCalls}/:callId/start`,
    answer("start"),
  );
  return { app, entry, reached };
};

type Caller = {
  readonly session?: string;
  readonly conversation?: string;
  readonly web?: string;
};

const headersOf = ({
  session = alice.cookie,
  conversation = conversationId,
  web = webId,
}: Caller) => ({
  origin: pageOrigin,
  "content-type": "application/json",
  cookie: `${hashSessionCookie}=${session}`,
  ...(conversation === ""
    ? {}
    : { [brunchHeaders.conversation]: conversation }),
  ...(web === "" ? {} : { [brunchHeaders.web]: web }),
});

const instanceOf = (actorKey: string, id = conversationId) =>
  flueConversationIdWeb({ actorKey, conversationId: id });

/** Each route that names a conversation, as a request for instance `id`. */
const routesFor = (id: string) => [
  {
    name: "chat",
    method: "POST",
    path: "/chat",
    body: { id, messages: [], trigger: "submit-message" },
  },
  { name: "stream", method: "GET", path: `/chat/${id}/stream` },
  { name: "abort", method: "POST", path: `/chat/${id}/abort` },
  { name: "messages", method: "GET", path: `/chat/${id}/messages` },
  {
    name: "calls",
    method: "GET",
    path: `/conversations/${id}/${brunchRoutes.browserCalls}`,
  },
  {
    name: "hand-edits",
    method: "POST",
    path: `/conversations/${id}/${brunchRoutes.browserCalls}/${brunchRoutes.handEdits}`,
    body: {},
  },
  {
    name: "claim",
    method: "POST",
    path: `/conversations/${id}/${brunchRoutes.browserCalls}/call-1`,
    body: {},
  },
  {
    name: "start",
    method: "POST",
    path: `/conversations/${id}/${brunchRoutes.browserCalls}/call-1/start`,
    body: {},
  },
];

const send = (
  app: Hono,
  route: ReturnType<typeof routesFor>[number],
  caller: Caller = {},
) =>
  app.request(route.path, {
    method: route.method,
    headers: headersOf(caller),
    ...("body" in route ? { body: JSON.stringify(route.body) } : {}),
  });

describe("HASH entry", () => {
  test("a preflight from a HASH origin may send the session and the Brunch headers, and is cached", async () => {
    const { app, reached } = openEntry();
    const preflight = (origin: string) =>
      app.request("/chat", {
        method: "OPTIONS",
        headers: {
          origin,
          "access-control-request-method": "POST",
          "access-control-request-headers": `content-type,${brunchHeaders.conversation},${brunchHeaders.web}`,
        },
      });
    const allowed = await preflight(pageOrigin);
    expect(allowed.status).toBe(204);
    expect(Object.fromEntries(allowed.headers)).toMatchObject({
      "access-control-allow-origin": pageOrigin,
      "access-control-allow-credentials": "true",
      "access-control-max-age": "600",
    });
    expect(
      allowed.headers
        .get("access-control-allow-headers")
        ?.toLowerCase()
        .split(","),
    ).toEqual(["content-type", brunchHeaders.conversation, brunchHeaders.web]);
    const elsewhere = await preflight("https://evil.test");
    expect(elsewhere.headers.get("access-control-allow-origin")).toBeNull();
    expect(reached).toEqual([]);
  });

  test("a request without a session is refused with 401 the page can read, before any route", async () => {
    const { app, reached } = openEntry();
    const id = await instanceOf(alice.actorKey);
    for (const route of routesFor(id)) {
      const response = await send(app, route, { session: "unknown" });
      expect(response.status, route.name).toBe(401);
      expect(response.headers.get("access-control-allow-origin")).toBe(
        pageOrigin,
      );
      expect(response.headers.get("access-control-allow-credentials")).toBe(
        "true",
      );
    }
    expect(reached).toEqual([]);
  });

  test("the identity route names the session's actor, uncached, without a conversation", async () => {
    const { app } = openEntry();
    const identity = await app.request(brunchRoutes.hashIdentity, {
      headers: headersOf({ conversation: "", web: "" }),
    });
    expect(identity.status).toBe(200);
    expect(identity.headers.get("cache-control")).toBe("no-store");
    expect(identity.headers.get("access-control-allow-origin")).toBe(
      pageOrigin,
    );
    expect(await identity.json()).toEqual({ actorKey: alice.actorKey });
    const signedOut = await app.request(brunchRoutes.hashIdentity, {
      headers: headersOf({ session: "unknown" }),
    });
    expect(signedOut.status).toBe(401);
  });

  test("every route that names a conversation admits only the session's own instance of the named conversation", async () => {
    const { app, reached } = openEntry();
    const own = await instanceOf(alice.actorKey);
    for (const route of routesFor(own)) {
      expect((await send(app, route)).status, route.name).toBe(200);
    }
    expect(reached).toEqual([
      `chat ${own}`,
      "stream",
      "abort",
      "messages",
      "calls",
      "hand-edits",
      "claim",
      "start",
    ]);
    reached.length = 0;

    const refusals = [
      // Bob's session on Alice's instance.
      { caller: { session: bob.cookie }, id: own, status: 403 },
      // Alice's session naming another conversation than the instance's.
      { caller: { conversation: "conversation-2" }, id: own, status: 403 },
      { caller: {}, id: "not-an-instance", status: 403 },
      { caller: { conversation: "" }, id: own, status: 401 },
      { caller: { web: "" }, id: own, status: 401 },
      { caller: { web: "w".repeat(257) }, id: own, status: 400 },
      { caller: { conversation: "c".repeat(257) }, id: own, status: 400 },
    ];
    for (const { caller, id, status } of refusals)
      for (const route of routesFor(id))
        expect(
          (await send(app, route, caller)).status,
          `${route.name} ${JSON.stringify(caller).slice(0, 80)}`,
        ).toBe(status);
    expect(reached).toEqual([]);
  });

  test("a chat request's binding must name the conversation its header names", async () => {
    const { app, reached } = openEntry();
    const id = await instanceOf(alice.actorKey);
    const chat = (binding: unknown) =>
      app.request("/chat", {
        method: "POST",
        headers: headersOf({}),
        body: JSON.stringify({
          id,
          messages: [],
          trigger: "submit-message",
          binding,
        }),
      });
    expect(
      (await chat({ conversationId: "conversation-2", documentId: "net-1" }))
        .status,
    ).toBe(403);
    expect(reached).toEqual([]);
    expect((await chat({ conversationId, documentId: "net-1" })).status).toBe(
      200,
    );
    expect(reached).toEqual([`chat ${id}`]);
  });

  test("only POST /chat counts toward the turn limit, per actor", async () => {
    const { app } = openEntry();
    const own = await instanceOf(alice.actorKey);
    const [chat, stream] = routesFor(own);
    const statuses = [];
    for (let i = 0; i <= turnSubmissionsPerMinute; i++)
      // Each turn waits for the one before, as the limit counts in order.
      // eslint-disable-next-line no-await-in-loop
      statuses.push((await send(app, chat!)).status);
    expect(statuses.filter((status) => status === 200)).toHaveLength(
      turnSubmissionsPerMinute,
    );
    const limited = await send(app, chat!);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).not.toBeNull();
    expect((await send(app, stream!)).status).toBe(200);
    const bobs = routesFor(await instanceOf(bob.actorKey));
    expect((await send(app, bobs[0]!, { session: bob.cookie })).status).toBe(
      200,
    );
  });

  test("a conversation admits only the actor and web its creating request recorded", async () => {
    const { app, entry } = openEntry();
    const { models, model } = scriptedModel([]);
    const harness = await Harness.open(
      new MemoryStorage(),
      { models, registry: createRegistry(), now: Date.now },
      context,
    );
    try {
      const root = await harness.root(context, { agent: { model } });
      const conversation = { harness, root };
      app.post("/record/:id", async (request) => {
        await harness.commit(
          (tx) => entry.recordActor(request)(tx, root.id),
          context,
        );
        return request.text("recorded");
      });
      app.get(
        "/admit/:id",
        async (request) =>
          (await entry.admitConversation(conversation, request)) ??
          request.text("admitted"),
      );
      const id = await instanceOf(alice.actorKey);
      const admit = async (caller: Caller, instance = id) =>
        (
          await app.request(`/admit/${instance}`, {
            headers: headersOf(caller),
          })
        ).status;

      // A conversation with no recorded actor is nobody's.
      expect(await admit({})).toBe(403);
      expect(
        (
          await app.request(`/record/${id}`, {
            method: "POST",
            headers: headersOf({}),
          })
        ).status,
      ).toBe(200);
      expect(await admit({})).toBe(200);
      expect(await admit({ web: "web-other" })).toBe(403);
    } finally {
      await harness.close(context);
    }
  });
});

describe("hashEntryFromEnvironment", () => {
  test("reads hash-api's origin and the exact page origins", () => {
    expect(
      hashEntryFromEnvironment({
        API_ORIGIN: "https://api.hash.ai/",
        BRUNCH_HASH_CORS_ALLOWED_ORIGINS:
          " https://app.hash.ai, http://localhost:3000 ",
      }),
    ).toEqual({
      apiOrigin: "https://api.hash.ai",
      allowedOrigins: ["https://app.hash.ai", "http://localhost:3000"],
    });
  });

  test.each([
    [{ BRUNCH_HASH_CORS_ALLOWED_ORIGINS: "https://app.hash.ai" }, "API_ORIGIN"],
    [{ API_ORIGIN: "https://api.hash.ai" }, "BRUNCH_HASH_CORS_ALLOWED_ORIGINS"],
    [
      { API_ORIGIN: "not a url", BRUNCH_HASH_CORS_ALLOWED_ORIGINS: pageOrigin },
      "API_ORIGIN",
    ],
    [
      {
        API_ORIGIN: "https://api.hash.ai",
        BRUNCH_HASH_CORS_ALLOWED_ORIGINS: "https://*.hash.ai",
      },
      "BRUNCH_HASH_CORS_ALLOWED_ORIGINS",
    ],
    [
      {
        API_ORIGIN: "https://api.hash.ai",
        BRUNCH_HASH_CORS_ALLOWED_ORIGINS: "https://app.hash.ai/path",
      },
      "BRUNCH_HASH_CORS_ALLOWED_ORIGINS",
    ],
    [
      {
        API_ORIGIN: "https://api.hash.ai",
        BRUNCH_HASH_CORS_ALLOWED_ORIGINS: "https://app.hash.ai,,",
      },
      "BRUNCH_HASH_CORS_ALLOWED_ORIGINS",
    ],
  ])("refuses %j, naming %s", (environment, variable) => {
    expect(() => hashEntryFromEnvironment(environment)).toThrow(variable);
  });
});
