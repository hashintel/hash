import { describe, expect, test, vi } from "vitest";

import { brunchTools } from "@hashintel/brunch-agent";

import {
  followSuccessorStream,
  readSuccessorHistory,
} from "./successor-history";

import type { UIMessageChunk } from "ai";

const conversation = {
  endpoint: "http://durable.test",
  actorKey: "actor-1",
  conversationId: "conversation-1",
  web: "web-1",
};

const streamOf = (chunks: readonly UIMessageChunk[]) =>
  new ReadableStream<UIMessageChunk>({
    start: (controller) => {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });

const drain = async (stream: ReadableStream<UIMessageChunk>) => {
  const chunks: UIMessageChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
};

describe("readSuccessorHistory", () => {
  test("reads the conversation's messages as the conversation, without caching", async () => {
    const messages = [
      { id: "req-1", role: "user", parts: [{ type: "text", text: "One." }] },
    ];
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(messages),
    );

    await expect(
      readSuccessorHistory({ ...conversation, fetch }),
    ).resolves.toEqual({ found: true, messages });

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toMatch(/^http:\/\/durable\.test\/chat\/[^/]+\/messages$/u);
    expect(init).toMatchObject({ credentials: "include", cache: "no-store" });
    const headers = new Headers(init?.headers);
    expect(headers.get("x-brunch-conversation")).toBe("conversation-1");
    expect(headers.get("x-brunch-web")).toBe("web-1");
  });

  test("answers that an unknown conversation has no history", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response("Unknown conversation.", { status: 404 }),
    );
    await expect(
      readSuccessorHistory({ ...conversation, fetch }),
    ).resolves.toEqual({ found: false });
  });

  test("rejects a refusal with the server's reason, and a body that is no history", async () => {
    const refusing = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ error: "Not your conversation." }, { status: 403 }),
    );
    await expect(
      readSuccessorHistory({ ...conversation, fetch: refusing }),
    ).rejects.toThrow(/403.*Not your conversation\./u);

    const malformed = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json([{ id: 1 }]),
    );
    await expect(
      readSuccessorHistory({ ...conversation, fetch: malformed }),
    ).rejects.toThrow();
  });
});

describe("followSuccessorStream", () => {
  test("passes every chunk through, telling of each Ledger commit's result and how the turn ended", async () => {
    const onLedgerCommit = vi.fn();
    const onEnd = vi.fn();
    const chunks: UIMessageChunk[] = [
      { type: "start", messageId: "durable:2" },
      {
        type: "tool-input-available",
        toolCallId: "commit-1",
        toolName: brunchTools.ledgerCommit,
        input: {},
        providerExecuted: true,
      },
      {
        type: "tool-input-available",
        toolCallId: "browser-1",
        toolName: "setNetTitle",
        input: {},
        dynamic: true,
      },
      {
        type: "tool-output-available",
        toolCallId: "browser-1",
        output: {},
      },
      {
        type: "tool-output-available",
        toolCallId: "commit-1",
        output: {},
        providerExecuted: true,
      },
      { type: "abort" },
    ];

    await expect(
      drain(followSuccessorStream(streamOf(chunks), { onLedgerCommit, onEnd })),
    ).resolves.toEqual(chunks);
    expect(onLedgerCommit).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledWith({
      ending: "aborted",
      responseId: "durable:2",
    });
  });

  test("names each ending, and none for a stream cut off before its end", async () => {
    const endingOf = async (chunks: UIMessageChunk[]) => {
      const onEnd = vi.fn();
      await drain(followSuccessorStream(streamOf(chunks), { onEnd }));
      return onEnd.mock.calls;
    };
    await expect(endingOf([{ type: "finish" }])).resolves.toEqual([
      [{ ending: "completed" }],
    ]);
    await expect(
      endingOf([{ type: "error", errorText: "run_failed" }]),
    ).resolves.toEqual([[{ ending: "failed" }]]);
    await expect(
      endingOf([{ type: "start", messageId: "durable:2" }]),
    ).resolves.toEqual([]);
  });
});
