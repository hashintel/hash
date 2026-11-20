/**
 * The Brunch panel's transport (`@hashintel/brunch-agent/client`) against the
 * durable agents server, in-process over SQLite: what each request carries,
 * and how a turn streams, resumes, stops and retries as the panel's chat
 * sees it.
 *
 * These tests build the server with `createDurableAgentsServer`, not
 * `startDurableAgentsServer`, so no host middleware runs: the conversation
 * header, the web header and the binding arrive unchecked.
 */
import { defineExtension } from "@earendil-works/pi-durable";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { expect, test, vi } from "vitest";

import { brunchTools } from "@hashintel/brunch-agent";
import { requestSuccessorStop } from "@hashintel/brunch-agent/client";
import { petrinautDiagnosticsContextMessageId } from "@hashintel/petrinaut-core";

import { browserToolName } from "../../src/browser-call/browser-call";
import { calls, holdTool } from "../platform/support";
import { fauxAssistantMessage } from "../scripted-model";
import {
  drain,
  openPanelChat,
  type PanelChat,
  type PanelMessage,
  textOf,
} from "./panel-chat";
import {
  answerAsBrowser,
  conversationId,
  documentId,
  openPanelServer,
} from "./panel-server";

import type { FauxResponseStep } from "@earendil-works/pi-ai/providers/faux";

/**
 * The server, whose model answers `responses` and may call `tools` beside
 * `setNetTitle`, which streams as a dynamic tool the browser runs; and the
 * panel's connection to it, recording every request body it sends.
 */
const openPanel = async (
  responses: FauxResponseStep[],
  tools: readonly ReturnType<typeof holdTool>["tool"][] = [],
) => {
  const panel = await openPanelServer(responses, {
    extensions: () => [defineExtension({ name: "ledger", tools: [...tools] })],
  });
  /** A panel tab's chat on the conversation, with its own tracker. */
  const openChat = (messages: PanelMessage[] = []) =>
    openPanelChat(panel.conversation, {
      messages,
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    });
  const chatPosts = () =>
    panel.requests.filter(
      ({ url, method }) => method === "POST" && url === panel.endpoints.chat,
    );
  return {
    ...panel,
    instanceId: panel.endpoints.instanceId,
    openChat,
    chatPosts,
  };
};

const lastMessage = (chat: PanelChat) => chat.messages.at(-1);

/** The panel's body as the server read it: one user message, and the binding. */
const expectPanelBody = (body: unknown) => {
  expect(body).toMatchObject({
    trigger: "submit-message",
    messages: [{ role: "user" }],
    binding: { conversationId, documentId },
  });
  const { messages } = body as { messages: unknown[] };
  expect(messages).toHaveLength(1);
  expect(JSON.stringify(body)).not.toContain(
    petrinautDiagnosticsContextMessageId,
  );
};

test("a first message creates the conversation under its instance ID and streams the answer", async () => {
  const panel = await openPanel([fauxAssistantMessage("A queue it is.")]);
  const { chat } = panel.openChat();

  await chat.sendMessage({ text: "Model a queue." });

  expect(chat.error).toBeUndefined();
  expect(chat.messages.map(({ role }) => role)).toEqual(["user", "assistant"]);
  expect(textOf(lastMessage(chat))).toBe("A queue it is.");
  const created = await panel.server.conversations.acquire(panel.instanceId);
  expect(created?.root.id).toBeDefined();
  const [post] = panel.chatPosts();
  expectPanelBody(post?.body);
  expect(post?.body).toMatchObject({ id: panel.instanceId });
});

test("a reconnect mid-turn shows the running turn once, over the history's copy of it", async () => {
  const commit = holdTool(brunchTools.ledgerCommit);
  const panel = await openPanel(
    [
      calls([brunchTools.ledgerCommit, "commit-1"]),
      fauxAssistantMessage("Committed."),
    ],
    [commit.tool],
  );
  const first = panel.openChat();
  const sent = first.chat.sendMessage({ text: "Record the queue." });
  await commit.started;

  // A second tab opens on the conversation's history, then follows the turn.
  const history = (await (
    await panel.fetch(panel.endpoints.messages)
  ).json()) as PanelMessage[];
  const second = panel.openChat(history);
  const resumed = second.chat.resumeStream();
  await vi.waitFor(() =>
    expect(second.chat.status).toMatch(/^(submitted|streaming)$/u),
  );
  commit.release();
  await Promise.all([sent, resumed]);

  for (const { chat } of [first, second]) {
    expect(chat.error).toBeUndefined();
    expect(chat.messages.map(({ role }) => role)).toEqual([
      "user",
      "assistant",
    ]);
    const parts = lastMessage(chat)?.parts ?? [];
    expect(
      parts.filter(({ type }) => type === `tool-${brunchTools.ledgerCommit}`),
    ).toHaveLength(1);
    expect(textOf(lastMessage(chat))).toBe("Committed.");
  }
  expect(lastMessage(second.chat)?.id).toBe(lastMessage(first.chat)?.id);
  expect(panel.chatPosts()).toHaveLength(1);
});

test("a retry after stop runs a new turn, while the stopped message replays its abort", async () => {
  const panel = await openPanel([
    calls([browserToolName, "browser-1", { title: "Queue" }]),
    fauxAssistantMessage("Second try."),
  ]);
  const { chat, tracker, transport } = panel.openChat();
  const sent = chat.sendMessage({ text: "Name the net Queue." });
  // The turn waits on the browser call, which the panel never runs here.
  await vi.waitFor(() =>
    expect(lastMessage(chat)?.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "dynamic-tool" }),
      ]),
    ),
  );

  await expect(requestSuccessorStop(panel.conversation, tracker)).resolves.toBe(
    "stop-requested",
  );
  await sent;
  const stopped = chat.messages[0];

  // The panel's retry sends the prompt again under a new message ID.
  await chat.sendMessage({ text: "Name the net Queue." });

  expect(textOf(lastMessage(chat))).toBe("Second try.");
  const posts = panel.chatPosts();
  expect(posts).toHaveLength(2);
  for (const { body } of posts) expectPanelBody(body);
  const [stoppedId, retriedId] = posts.map(
    ({ body }) => (body as { messages: [{ id: string }] }).messages[0].id,
  );
  expect(stoppedId).toBe(stopped?.id);
  expect(retriedId).not.toBe(stoppedId);

  // Sent again, the stopped message follows its own submission: its abort.
  const replayed = await drain(
    await transport.sendMessages({
      trigger: "submit-message",
      chatId: conversationId,
      messageId: undefined,
      messages: [stopped!],
      abortSignal: undefined,
    }),
  );
  expect(replayed.at(-1)).toMatchObject({ type: "abort" });
});

test("no request carries the diagnostics message the panel keeps in its chat", async () => {
  const panel = await openPanel([fauxAssistantMessage("Noted.")]);
  const diagnostics = {
    id: petrinautDiagnosticsContextMessageId,
    role: "user",
    parts: [{ type: "text", text: "Petrinaut diagnostics context only." }],
  } as PanelMessage;
  const { chat } = panel.openChat([diagnostics]);

  await chat.sendMessage({ text: "Model a queue." });

  expect(textOf(lastMessage(chat))).toBe("Noted.");
  const posts = panel.chatPosts();
  expect(posts).toHaveLength(1);
  expectPanelBody(posts[0]?.body);
});

test("a browser tool streams as a dynamic part and a server tool as one the server ran, neither owed by the panel", async () => {
  const commit = holdTool(brunchTools.ledgerCommit);
  commit.release();
  const panel = await openPanel(
    [
      calls(
        [brunchTools.ledgerCommit, "commit-1"],
        [browserToolName, "browser-1", { title: "Queue" }],
      ),
      fauxAssistantMessage("Titled."),
    ],
    [commit.tool],
  );
  const { chat } = panel.openChat();
  const sent = chat.sendMessage({ text: "Name the net Queue." });

  await vi.waitFor(() =>
    expect(lastMessage(chat)?.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "dynamic-tool",
          toolName: browserToolName,
          toolCallId: "browser-1",
          state: "input-available",
        }),
      ]),
    ),
  );
  expect(lastMessage(chat)?.parts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: `tool-${brunchTools.ledgerCommit}`,
        toolCallId: "commit-1",
        providerExecuted: true,
      }),
    ]),
  );
  expect(
    lastAssistantMessageIsCompleteWithToolCalls({ messages: chat.messages }),
  ).toBe(false);

  await answerAsBrowser(panel, "browser-1", { ok: true, title: "Queue" });
  await sent;

  expect(chat.error).toBeUndefined();
  expect(textOf(lastMessage(chat))).toBe("Titled.");
  expect(
    lastAssistantMessageIsCompleteWithToolCalls({ messages: chat.messages }),
  ).toBe(false);
  // The server continued the turn itself; the panel sent nothing more.
  expect(panel.chatPosts()).toHaveLength(1);
});
