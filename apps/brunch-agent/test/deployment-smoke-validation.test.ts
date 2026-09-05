import { describe, expect, test, vi } from "vitest";

import {
  validatePersistedHistory,
  validateUiMessageStream,
} from "../src/deployment-smoke-validation.ts";

const streamOf = (...values: string[]): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const value of values) controller.enqueue(encoder.encode(value));
      controller.close();
    },
  });
};

describe("deployment history smoke validation", () => {
  test("requires the expected persisted text", () => {
    expect(
      validatePersistedHistory(
        {
          messages: [
            {
              parts: [{ type: "text", text: "persisted marker" }],
            },
          ],
        },
        "persisted marker",
      ),
    ).toBe(1);

    expect(() =>
      validatePersistedHistory({ messages: [] }, "persisted marker"),
    ).toThrow("expected persisted text");
  });
});

describe("deployment turn smoke validation", () => {
  test("requires a successful terminal event", async () => {
    const onFirstChunk = vi.fn<() => void>();
    await expect(
      validateUiMessageStream(
        streamOf(
          'data: {"type":"start"}\n\n',
          'data: {"type":"finish","finishReason":"stop"}\n\n',
          "data: [DONE]\n\n",
        ),
        onFirstChunk,
      ),
    ).resolves.toMatchObject({ chunks: 3 });
    expect(onFirstChunk).toHaveBeenCalledOnce();
  });

  test.each(["error", "abort"])("rejects a terminal %s event", async (type) => {
    await expect(
      validateUiMessageStream(
        streamOf(`data: {"type":"${type}"}\n\n`, "data: [DONE]\n\n"),
        () => undefined,
      ),
    ).rejects.toThrow(`ended with ${type}`);
  });

  test("rejects a stream without a finish event", async () => {
    await expect(
      validateUiMessageStream(
        streamOf('data: {"type":"start"}\n\n', "data: [DONE]\n\n"),
        () => undefined,
      ),
    ).rejects.toThrow("without a finish event");
  });
});
