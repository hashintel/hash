import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import {
  type Conversation,
  createRegistry,
  defineExtension,
  defineTool,
  Harness,
  MemoryStorage,
  ROOT_CONVERSATION_ID,
  type ToolTaskInput,
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { obj } from "@earendil-works/pi-schema";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { createConversationRegistry } from "../server/durable-agents-server/conversation-registry";
import { createRequestSlots } from "../server/durable-agents-server/request-slots";
import { createHostBinding, type HostBinding } from "./host-binding";

import type { OwnedStorage } from "../server/conversation-storage";
import type { Message } from "@earendil-works/pi-ai";

const context = BACKGROUND_CONTEXT;

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "durable-host-binding-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

/** What one call of the tool saw: which registry's instance ran, and the context at its assistant entry. */
type Peek = {
  readonly generation: number;
  readonly toolCallId: string;
  readonly toolCallIds: readonly string[];
  /** Each tool result as `[toolCallId, text]`: Pi synthesizes an error result for a call whose result is not yet in it. */
  readonly toolResults: readonly (readonly [string, string])[];
};

/**
 * The extension a host installs per Harness: a tool that reads its
 * conversation's context as of its assistant entry through `host`, tagged
 * with the registry generation that built it.
 */
const peekExtension = (host: HostBinding, generation: number, peeks: Peek[]) =>
  defineExtension({
    name: "test.peek",
    tools: [
      defineTool({
        name: "peek",
        description: "Reports the context at its call.",
        parameters: obj({}),
        execute: async (_args, api, toolContext) => {
          const input = (await api.getTask(api.taskId, toolContext))?.input as
            | ToolTaskInput
            | undefined;
          if (input?.kind !== "model") throw new Error("Not a model call.");
          const conversation = await host.conversation(
            api.conversationId,
            toolContext,
          );
          const { messages } = await conversation.context(toolContext, {
            at: input.assistant,
          });
          peeks.push({
            generation,
            toolCallId: input.callId,
            toolCallIds: messages.flatMap((message) =>
              message.role === "assistant"
                ? message.content.flatMap((part) =>
                    part.type === "toolCall" ? [part.id] : [],
                  )
                : [],
            ),
            toolResults: messages.flatMap((message) =>
              message.role === "toolResult"
                ? [[message.toolCallId, textOf(message)] as const]
                : [],
            ),
          });
          return { output: [{ type: "text", text: "peeked" }] };
        },
      }),
    ],
  });

const textOf = (message: Message) =>
  typeof message.content === "string"
    ? message.content
    : message.content
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join("");

const missing =
  "Tool result unavailable: history ends before this call completed.";

const peekCall = (id: string) =>
  fauxAssistantMessage(fauxToolCall("peek", {}, { id }), {
    stopReason: "toolUse",
  });

const turn = async (root: Conversation, content: string) => {
  const submission = await root.submit({ type: "input", content }, context);
  expect((await submission.wait(context)).status).toBe("done");
};

describe("the host binding", () => {
  test("a per-Harness tool extension, selected by name, resolves after a reopen and reads context({ at }) through the host", async () => {
    const file = join(directory, "conversation.sqlite");
    const faux = fauxProvider();
    faux.setResponses([
      peekCall("p1"),
      fauxAssistantMessage("first"),
      peekCall("p2"),
      fauxAssistantMessage("second"),
    ]);
    const models = createModels();
    models.setProvider(faux.provider);
    const peeks: Peek[] = [];
    /** Each registry the conversation registry asks for, with the binding it got. */
    const hosts: HostBinding[] = [];
    const selected = peekExtension(createHostBinding(), 0, []);
    const openRegistry = () =>
      createConversationRegistry(
        {
          openStorage: async (): Promise<OwnedStorage> =>
            Object.assign(await openNodeSqliteStorage(file), {
              isOwner: async () => true,
            }),
          storageExists: async () => existsSync(file),
          createRegistry: (host) => {
            hosts.push(host);
            const registry = createRegistry();
            registry.install(peekExtension(host, hosts.length, peeks));
            return registry;
          },
          models,
          agent: {
            model: { provider: faux.provider.id, modelId: faux.getModel().id },
            // Only the name of this instance is stored.
            extensions: [selected],
          },
        },
        {
          maxTurns: 8,
          crashLoopRestarts: Infinity,
          requestSlots: createRequestSlots(1),
        },
        context,
      );

    const first = openRegistry();
    await turn((await first.create("chat")).root, "Peek.");
    await first.close();

    const second = openRegistry();
    const reopened = await second.acquire("chat");
    expect(reopened).toBeDefined();
    await turn(reopened!.root, "Peek again.");
    await second.close();

    expect(hosts).toHaveLength(2);
    expect(peeks).toEqual([
      {
        generation: 1,
        toolCallId: "p1",
        toolCallIds: ["p1"],
        toolResults: [["p1", missing]],
      },
      {
        // The reopened Harness ran the instance its own registry installed, over its own binding.
        generation: 2,
        toolCallId: "p2",
        // As of p2's assistant entry: the first turn whole, p2 issued, its result not yet.
        toolCallIds: ["p1", "p2"],
        toolResults: [
          ["p1", "peeked"],
          ["p2", missing],
        ],
      },
    ]);
  });

  test("an unbound host refuses every conversation", async () => {
    const host = createHostBinding();
    await expect(
      host.conversation(ROOT_CONVERSATION_ID, context),
    ).rejects.toThrow("Host is not bound.");
  });

  test("a bound host refuses a conversation its Harness doesn't have", async () => {
    // A Harness with no root yet.
    const host = createHostBinding();
    const harness = await Harness.open(
      new MemoryStorage(),
      { models: createModels(), registry: createRegistry() },
      context,
    );
    host.bind(harness);
    await expect(
      host.conversation(ROOT_CONVERSATION_ID, context),
    ).rejects.toThrow(`No conversation ${ROOT_CONVERSATION_ID}.`);
    await harness.close(context);
  });
});
