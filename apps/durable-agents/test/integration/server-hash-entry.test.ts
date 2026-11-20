/**
 * HASH's entry on the real wiring (`startDurableAgentsServer` over HTTP, on
 * the compose Postgres, with a stand-in hash-api answering sessions): a
 * conversation is the instance of its creator's actor, records that actor
 * and the creating request's web, and refuses every other session, web or
 * binding on each route, the browser-call routes included; a refused request
 * creates nothing.
 */
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  createRegistry,
  Harness,
  ROOT_CONVERSATION_ID,
} from "@earendil-works/pi-durable";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, test } from "vitest";

import {
  brunchHeaders,
  brunchRoutes,
  flueConversationIdWeb,
} from "@hashintel/brunch-agent";
import { hashSessionCookie } from "@hashintel/brunch-agent/server";

import { createHashAgent } from "../../src/agent/hash-agent";
import { createHostBinding } from "../../src/agent/host-binding";
import {
  conversationSchema,
  postgresConversationStorage,
} from "../../src/server/conversation-storage";
import {
  browserCallsPrefix,
  startDurableAgentsServer,
} from "../../src/server/start-durable-agents-server";
import { ConversationActorDoc } from "../../src/server/start-durable-agents-server/hash-entry/conversation-actor-doc";
import { postgresConfigFromEnvironment } from "../../src/storage/postgres/postgres-config";
import { fauxAssistantMessage, scriptedModel } from "../scripted-model";

import type { AddressInfo } from "node:net";

const context = BACKGROUND_CONTEXT;
const poolConfig = postgresConfigFromEnvironment();
const admin = new Pool({ ...poolConfig, max: 1 });
const pageOrigin = "http://hash.test:3000";
const accounts = new Map([
  ["alice-session", "web-alice"],
  ["bob-session", "web-bob"],
]);

/** hash-api's `sessionAccount`, answering a known session cookie with its account. */
const hashApi = createServer((request, response) => {
  const session = request.headers.cookie?.split("=")[1] ?? "";
  const webId = accounts.get(session);
  response.setHeader("content-type", "application/json");
  response.end(
    JSON.stringify(
      webId === undefined
        ? { data: null, errors: [{ extensions: { code: "FORBIDDEN" } }] }
        : { data: { sessionAccount: { webId, accountSignupComplete: true } } },
    ),
  );
});
beforeAll(
  () =>
    new Promise<void>((resolve) => {
      hashApi.listen(0, "127.0.0.1", resolve);
    }),
);
afterAll(async () => {
  await new Promise((resolve) => {
    hashApi.close(resolve);
  });
  await admin.end();
});

const schemaExists = async (instanceId: string) =>
  (
    await admin.query("SELECT 1 FROM pg_namespace WHERE nspname = $1", [
      conversationSchema(instanceId),
    ])
  ).rowCount === 1;

type Caller = {
  readonly session: string;
  readonly conversation: string;
  readonly web: string;
};

test("a conversation admits only its creator's session and web, on every route", async () => {
  const pool = new Pool(poolConfig);
  const { models, model, state } = scriptedModel([
    () => fauxAssistantMessage("Hello."),
  ]);
  const server = await startDurableAgentsServer({
    port: 0,
    hostname: "127.0.0.1",
    hashEntry: {
      apiOrigin: `http://127.0.0.1:${(hashApi.address() as AddressInfo).port}`,
      allowedOrigins: [pageOrigin],
      logWarning: () => {},
    },
    pool,
    models,
    model,
  });
  const origin = `http://127.0.0.1:${server.port}`;
  const conversationId = randomUUID();
  const instanceId = await flueConversationIdWeb({
    actorKey: "hash:web-alice",
    conversationId,
  });
  const alice: Caller = {
    session: "alice-session",
    conversation: conversationId,
    web: "web-1",
  };
  const request = (
    path: string,
    caller: Caller,
    body?: Record<string, unknown>,
  ) =>
    fetch(`${origin}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        origin: pageOrigin,
        "content-type": "application/json",
        cookie: `${hashSessionCookie}=${caller.session}`,
        [brunchHeaders.conversation]: caller.conversation,
        [brunchHeaders.web]: caller.web,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const chat = (caller: Caller, conversationOfBinding = conversationId) =>
    request("/chat", caller, {
      id: instanceId,
      trigger: "submit-message",
      messages: [
        {
          id: `user-${randomUUID()}`,
          role: "user",
          parts: [{ type: "text", text: "Hello." }],
        },
      ],
      binding: { conversationId: conversationOfBinding, documentId: "net-1" },
    });
  const calls = `${browserCallsPrefix}/${instanceId}/${brunchRoutes.browserCalls}`;
  /** Each route's status for `caller`, the chat's last. */
  const statuses = async (caller: Caller) => {
    const reads = await Promise.all(
      [`/chat/${instanceId}/stream`, `/chat/${instanceId}/messages`, calls].map(
        async (path) => (await request(path, caller)).status,
      ),
    );
    const handEdit = await request(
      `${calls}/${brunchRoutes.handEdits}`,
      caller,
      {
        binding: "{}",
        episode: "episode-1",
        seq: 0,
        revision: "revision-1",
      },
    );
    const chatted = await chat(caller);
    await chatted.text();
    return [...reads, handEdit.status, chatted.status];
  };
  try {
    // Refused before anything is created: no session, and a binding of another conversation.
    const signedOut = await chat({ ...alice, session: "unknown" });
    expect(signedOut.status).toBe(401);
    expect(signedOut.headers.get("access-control-allow-origin")).toBe(
      pageOrigin,
    );
    expect((await chat(alice, randomUUID())).status).toBe(403);
    expect(await schemaExists(instanceId)).toBe(false);

    const created = await chat(alice);
    expect(created.status).toBe(200);
    await created.text();
    expect(state.callCount).toBe(1);

    // Another web, and Bob's session naming Alice's conversation, reach nothing.
    expect(await statuses({ ...alice, web: "web-2" })).toEqual(
      Array(5).fill(403),
    );
    expect(await statuses({ ...alice, session: "bob-session" })).toEqual(
      Array(5).fill(403),
    );
    expect(state.callCount).toBe(1);

    const own = await Promise.all(
      [`/chat/${instanceId}/stream`, `/chat/${instanceId}/messages`, calls].map(
        async (path) => (await request(path, alice)).status,
      ),
    );
    expect(own).toEqual([204, 200, 200]);
  } finally {
    await server.close();
  }
  try {
    // The creating request's actor and web, as the conversation recorded them.
    const { extensions } = createHashAgent();
    const registry = createRegistry();
    for (const extension of extensions(createHostBinding()))
      registry.install(extension);
    const harness = await Harness.open(
      await postgresConversationStorage(pool)(instanceId),
      { models, registry },
      context,
    );
    try {
      expect(
        await harness.snapshot(
          ConversationActorDoc,
          ROOT_CONVERSATION_ID,
          context,
        ),
      ).toEqual({ actorKey: "hash:web-alice", webId: "web-1" });
    } finally {
      await harness.close(context);
    }
  } finally {
    await pool.end();
    await admin.query(
      `DROP SCHEMA IF EXISTS "${conversationSchema(instanceId)}" CASCADE`,
    );
  }
});
