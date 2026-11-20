/**
 * How the real wiring (`startDurableAgentsServer` over HTTP, on the compose
 * Postgres) streams the HASH agent's tool calls: a browser tool as a dynamic
 * tool the client runs, a server tool as a static one the server ran, live
 * and in history alike.
 */
import { randomUUID } from "node:crypto";

import { DefaultChatTransport, type UIMessage, type UIMessageChunk } from "ai";
import { Pool } from "pg";
import { afterAll, expect, test } from "vitest";

import { brunchTools } from "@hashintel/brunch-agent";

import { conversationSchema } from "../../src/server/conversation-storage";
import { startDurableAgentsServer } from "../../src/server/start-durable-agents-server";
import { postgresConfigFromEnvironment } from "../../src/storage/postgres/postgres-config";
import {
  fauxAssistantMessage,
  fauxToolCall,
  scriptedModel,
} from "../scripted-model";

const poolConfig = postgresConfigFromEnvironment();
const admin = new Pool({ ...poolConfig, max: 1 });
afterAll(() => admin.end());

const browserTool = "petrinaut_get_diagnostics";

/** Read `stream` until `found` matches a chunk, then stop reading. */
const readUntil = async (
  stream: ReadableStream<UIMessageChunk>,
  found: (chunk: UIMessageChunk) => boolean,
) => {
  const chunks: UIMessageChunk[] = [];
  const reader = stream.getReader();
  for (;;) {
    // Each read depends on the one before.
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    if (found(value)) break;
  }
  await reader.cancel();
  return chunks;
};

test("a browser tool streams as a dynamic tool the client runs, a server tool as a static one the server ran", async () => {
  const chatId = `browser-tools-${randomUUID()}`;
  const pool = new Pool(poolConfig);
  const { models, model } = scriptedModel([
    fauxAssistantMessage(
      [
        fauxToolCall(brunchTools.ledgerQuery, {}, { id: "server-1" }),
        fauxToolCall(browserTool, {}, { id: "browser-1" }),
      ],
      { stopReason: "toolUse" },
    ),
  ]);
  const server = await startDurableAgentsServer({
    port: 0,
    hostname: "127.0.0.1",
    pool,
    models,
    model,
  });
  const origin = `http://127.0.0.1:${server.port}`;
  try {
    const transport = new DefaultChatTransport<UIMessage>({
      api: `${origin}/chat`,
      body: {
        binding: { conversationId: chatId, documentId: `net-${randomUUID()}` },
      },
    });
    const chunks = await readUntil(
      await transport.sendMessages({
        trigger: "submit-message",
        chatId,
        messageId: undefined,
        messages: [
          {
            id: "user-1",
            role: "user",
            parts: [{ type: "text", text: "Check the net." }],
          },
        ],
        abortSignal: undefined,
      }),
      (chunk) =>
        chunk.type === "tool-input-available" &&
        chunk.toolCallId === "browser-1",
    );
    const inputs = chunks.filter(
      (chunk) => chunk.type === "tool-input-available",
    );
    expect(inputs).toEqual([
      expect.objectContaining({
        toolCallId: "server-1",
        toolName: brunchTools.ledgerQuery,
        providerExecuted: true,
      }),
      expect.objectContaining({
        toolCallId: "browser-1",
        toolName: browserTool,
        dynamic: true,
      }),
    ]);
    const [serverInput, browserInput] = inputs;
    expect(serverInput).not.toHaveProperty("dynamic", true);
    expect(browserInput).not.toHaveProperty("providerExecuted", true);

    const stopped = await fetch(`${origin}/chat/${chatId}/abort`, {
      method: "POST",
    });
    expect(stopped.status).toBe(204);

    const history = (await (
      await fetch(`${origin}/chat/${chatId}/messages`)
    ).json()) as UIMessage[];
    const toolParts = history
      .flatMap(({ parts }) => parts)
      .flatMap((part) =>
        "toolCallId" in part
          ? [
              {
                type: part.type,
                toolCallId: part.toolCallId,
                ...("toolName" in part ? { toolName: part.toolName } : {}),
              },
            ]
          : [],
      );
    expect(toolParts).toEqual([
      { type: `tool-${brunchTools.ledgerQuery}`, toolCallId: "server-1" },
      { type: "dynamic-tool", toolCallId: "browser-1", toolName: browserTool },
    ]);
  } finally {
    await server.close();
    await pool.end();
    await admin.query(
      `DROP SCHEMA IF EXISTS "${conversationSchema(chatId)}" CASCADE`,
    );
  }
});
