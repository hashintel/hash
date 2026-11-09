/**
 * Admission on the real wiring (`startDurableAgentsServer` over HTTP, on the
 * compose Postgres): only a `POST /chat` with a valid document binding
 * creates a conversation, every other route finds an unknown one absent
 * without creating its schema, and a known conversation refuses a malformed
 * binding (400) and a different one (409).
 */
import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, expect, test } from "vitest";

import { conversationSchema } from "../../src/server/conversation-storage";
import {
  browserCallsPrefix,
  startDurableAgentsServer,
} from "../../src/server/start-durable-agents-server";
import { postgresConfigFromEnvironment } from "../../src/storage/postgres/postgres-config";
import { fauxAssistantMessage, scriptedModel } from "../scripted-model";

import type { BrowserContext } from "@hashintel/brunch-agent";

const poolConfig = postgresConfigFromEnvironment();
const admin = new Pool({ ...poolConfig, max: 1 });
afterAll(() => admin.end());

const schemaExists = async (chatId: string) =>
  (
    await admin.query("SELECT 1 FROM pg_namespace WHERE nspname = $1", [
      conversationSchema(chatId),
    ])
  ).rowCount === 1;

/** One server process on the real wiring, its model answering `answers` in order. */
const startServer = async (answers: string[]) => {
  const pool = new Pool(poolConfig);
  const { models, model, state } = scriptedModel(
    answers.map((answer) => fauxAssistantMessage(answer)),
  );
  const server = await startDurableAgentsServer({
    port: 0,
    hostname: "127.0.0.1",
    pool,
    models,
    model,
  });
  const origin = `http://127.0.0.1:${server.port}`;
  const post = (path: string, body: unknown) =>
    fetch(`${origin}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  return {
    origin,
    post,
    /** A chat request as `DefaultChatTransport` sends it, with `extra` beside the messages. */
    chat: async (
      chatId: string,
      messageId: string,
      extra: Record<string, unknown>,
    ) => {
      const response = await post("/chat", {
        id: chatId,
        trigger: "submit-message",
        messages: [
          {
            id: messageId,
            role: "user",
            parts: [{ type: "text", text: "Hello." }],
          },
        ],
        ...extra,
      });
      return { status: response.status, text: await response.text() };
    },
    modelRequests: () => state.callCount,
    close: async () => {
      await server.close();
      await pool.end();
    },
  };
};

const bindingFor = (chatId: string): BrowserContext["binding"] => ({
  conversationId: chatId,
  documentId: `net-${randomUUID()}`,
});

test("an unknown conversation is created only by a chat request with a valid binding", async () => {
  const chatId = `admission-${randomUUID()}`;
  const server = await startServer(["Hello back."]);
  try {
    const stream = await fetch(`${server.origin}/chat/${chatId}/stream`);
    expect(stream.status).toBe(404);
    expect((await server.post(`/chat/${chatId}/abort`, {})).status).toBe(404);

    const call = `${browserCallsPrefix}/${chatId}/browser-calls/call-1`;
    const proof = { capability: "capability", binding: "binding" };
    const outcome = { ...proof, toolName: "addPlace", canonicalInput: {} };
    const browserCalls = await Promise.all([
      server.post(call, { claimant: "tab-1", binding: "binding" }),
      server.post(`${call}/start`, proof),
      server.post(`${call}/lease`, proof),
      server.post(`${call}/result`, { ...outcome, output: { ok: true } }),
      server.post(`${call}/fail`, { ...outcome, disposition: "failed" }),
    ]);
    expect(browserCalls.map(({ status }) => status)).toEqual([
      404, 404, 404, 404, 404,
    ]);

    // A chat request without a binding, or with a malformed one, creates nothing either.
    expect((await server.chat(chatId, "user-1", {})).status).toBe(404);
    expect(
      (await server.chat(chatId, "user-1", { binding: { documentId: 42 } }))
        .status,
    ).toBe(400);
    expect(await schemaExists(chatId)).toBe(false);
    expect(server.modelRequests()).toBe(0);

    const created = await server.chat(chatId, "user-1", {
      binding: bindingFor(chatId),
    });
    expect(created.status).toBe(200);
    expect(created.text).toContain("Hello back.");
    expect(await schemaExists(chatId)).toBe(true);
    // Known now: the idle conversation has nothing to reattach to.
    expect((await fetch(`${server.origin}/chat/${chatId}/stream`)).status).toBe(
      204,
    );
  } finally {
    await server.close();
    await admin.query(
      `DROP SCHEMA IF EXISTS "${conversationSchema(chatId)}" CASCADE`,
    );
  }
});

test("a known conversation refuses a malformed binding with 400 and a different one with 409", async () => {
  const chatId = `binding-${randomUUID()}`;
  const binding = bindingFor(chatId);
  const server = await startServer(["First answer.", "Second answer."]);
  try {
    const first = await server.chat(chatId, "user-1", { binding });
    expect(first.status).toBe(200);
    expect(first.text).toContain("First answer.");

    const malformed = await server.chat(chatId, "user-2", {
      binding: { conversationId: chatId },
    });
    expect(malformed).toEqual({
      status: 400,
      text: "Expected a Brunch document binding.",
    });
    const different = await server.chat(chatId, "user-2", {
      binding: bindingFor(chatId),
    });
    expect(different).toEqual({
      status: 409,
      text: "The conversation is bound to a different document.",
    });
    // Neither refusal submitted anything.
    expect(server.modelRequests()).toBe(1);

    // The same binding again is admitted.
    const same = await server.chat(chatId, "user-2", { binding });
    expect(same.status).toBe(200);
    expect(same.text).toContain("Second answer.");
    expect(server.modelRequests()).toBe(2);
  } finally {
    await server.close();
    await admin.query(
      `DROP SCHEMA IF EXISTS "${conversationSchema(chatId)}" CASCADE`,
    );
  }
});
