import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
} from "@earendil-works/pi-ai";
import { init, useDelivery, useModel } from "@flue/runtime";
import { sqlite, start } from "@flue/runtime/node";
import { createAgentRouter } from "@flue/runtime/routing";
import { createFlueClient } from "@flue/sdk";
import { expect, test } from "vitest";

// Deliberately pin private recovery seams: this test owns the local 2.0.3
// package patch and must fail on an upgrade until that patch is re-evaluated.
const runtimeRoot = new URL("./", import.meta.resolve("@flue/runtime"));
const { y: Session } = (await import(
  new URL("conversation-stream-store-CXwRWonS.mjs", runtimeRoot).href
)) as {
  y: {
    prototype: {
      buildSubmissionInputRecord: (
        input: unknown,
        parentId: string,
      ) => Promise<{ context?: unknown; messageId: string }>;
      restoreDeliveryCursor: () => Promise<void>;
    };
  };
};
const { st: reduceConversationRecords } = (await import(
  new URL("dispatch-nU3cIlT-.mjs", runtimeRoot).href
)) as {
  st: (
    state: Record<string, unknown>,
    records: unknown,
  ) => {
    conversations: Map<string, { entries: Map<string, { message: unknown }> }>;
  };
};

test("delivery context survives HTTP admission without becoming public or model text", async () => {
  const deliveries: unknown[] = [];
  const modelInputs: unknown[] = [];
  const provider = fauxProvider({
    provider: "anthropic",
    models: [{ id: "context-test" }],
  });
  provider.setResponses(
    Array.from({ length: 3 }, () => (context) => {
      modelInputs.push(context);
      return fauxAssistantMessage([fauxText("Canonical answer.")]);
    }),
  );
  const agent = () => {
    useModel("anthropic/context-test");
    deliveries.push(useDelivery());
    return "Answer the user. Context is not automatically included here.";
  };
  const directory = await mkdtemp(join(tmpdir(), "flue-delivery-context-"));
  const boot = () =>
    start({
      agents: [{ agent, name: "delivery-context-test" }],
      providers: [provider.provider],
      db: sqlite(join(directory, "conversation.db")),
    });
  let runtime = await boot();
  try {
    const router = createAgentRouter(agent);
    const client = createFlueClient({
      url: "http://local.test/conversation",
      fetch: async (input, options) =>
        router.fetch(
          input instanceof Request ? input : new Request(input, options),
        ),
    });
    const message = {
      kind: "user" as const,
      body: "Unchanged user text.",
      context: {
        responseMode: "voice",
        sentinel: [null, true, 3, "private-context"],
      },
    };
    const request = { message, idempotencyKey: "voice-input" };
    const receipt = await client.send(request);
    await client.wait(receipt);
    expect(deliveries.at(-1)).toEqual(message);
    expect(await client.send(request)).toMatchObject({
      submissionId: receipt.submissionId,
    });
    await expect(
      client.send({
        ...request,
        message: { ...message, context: { responseMode: "text" } },
      }),
    ).rejects.toMatchObject({ status: 409 });
    await runtime.stop();
    runtime = await boot();
    expect(await client.send(request)).toMatchObject({
      submissionId: receipt.submissionId,
    });
    await expect(
      client.send({
        ...request,
        message: { kind: "user", body: message.body },
      }),
    ).rejects.toMatchObject({ status: 409 });
    const followup = {
      kind: "signal" as const,
      type: "client-tool-result",
      body: "Existing result body.",
      context: { responseMode: "voice" },
    };
    await client.wait(await client.send({ message: followup }));
    expect(deliveries.at(-1)).toEqual(followup);
    await client.wait(
      await client.send({ message: { kind: "user", body: "Typed next." } }),
    );
    expect(deliveries.at(-1)).toEqual({ kind: "user", body: "Typed next." });
    expect(JSON.stringify(await client.history())).not.toContain(
      "private-context",
    );
    expect(JSON.stringify(await client.history())).not.toContain(
      "responseMode",
    );
    expect(JSON.stringify(await client.history())).toContain(
      "Unchanged user text.",
    );
    expect(modelInputs).toHaveLength(3);
    expect(JSON.stringify(modelInputs)).not.toContain("private-context");
    expect(JSON.stringify(modelInputs)).not.toContain("responseMode");
  } finally {
    await runtime.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test("direct dispatch rejects non-JSON context before admission", async () => {
  const agent = () => "Unused";
  const runtime = await start({
    agents: [{ agent, name: "invalid-context-test" }],
    providers: [],
  });
  try {
    const handle = init(agent, { id: "invalid-context" });
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    await Promise.all(
      [
        () => undefined,
        Number.NaN,
        new Date(),
        cyclic,
        { nested: undefined },
      ].map(async (context) => {
        const message = {
          kind: "user" as const,
          body: "Never admitted.",
          context,
        };
        await expect(handle.dispatch({ message })).rejects.toThrow(
          "Request is malformed.",
        );
      }),
    );
  } finally {
    await runtime.stop();
  }
});

test.each(["user", "signal"] as const)(
  "joined %s context is restored from private canonical records",
  async (kind) => {
    const context = {
      responseMode: "voice",
      nested: [null, "private-context"],
    };
    const message =
      kind === "user"
        ? { kind, body: "Canonical body.", context }
        : {
            kind,
            type: "client-tool-result",
            body: "Canonical body.",
            context,
          };
    const scope = {
      conversationId: "conversation",
      harness: "agent",
      session: "main",
      timestamp: new Date(0).toISOString(),
      v: 1,
    };
    const inputRecord = await Session.prototype.buildSubmissionInputRecord.call(
      {
        canonicalEnvelope: (type: string, id: string) => ({
          ...scope,
          type,
          id,
        }),
        persistCanonicalAttachments: async () => [],
      },
      { kind: "direct", submissionId: "joined", message },
      "entry_original",
    );
    expect(inputRecord.context).toEqual(context);
    const records = [
      {
        ...scope,
        type: "conversation_created",
        id: "root",
        kind: "root",
      },
      {
        ...scope,
        type: "user_message",
        id: "original-record",
        messageId: "entry_original",
        parentId: null,
        content: [{ type: "text", text: "Original input." }],
      },
      inputRecord,
    ];
    const state = reduceConversationRecords(
      {
        recordsThroughOffset: "-1",
        conversations: new Map(),
        conversationScopes: new Map(),
        recordsById: new Map(),
        state: new Map(),
      },
      JSON.parse(JSON.stringify(records)),
    );
    const restored: unknown[] = [];
    await Session.prototype.restoreDeliveryCursor.call({
      activeInputEntryId: "entry_original",
      requireConversation: async () => state.conversations.get("conversation"),
      advanceDelivery: (delivery: unknown) => restored.push(delivery),
    });
    expect(restored).toEqual([message]);
    const entry = state.conversations
      .get("conversation")!
      .entries.get(inputRecord.messageId);
    expect(entry).toBeDefined();
    expect(JSON.stringify(entry!.message)).not.toContain("private-context");
  },
);
