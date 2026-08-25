import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

type MessagePart = {
  readonly input?: unknown;
  readonly output?: { readonly applied?: boolean };
  readonly providerExecuted?: boolean;
  readonly state?: string;
  readonly text?: string;
  readonly toolCallId?: string;
  readonly toolName?: string;
  readonly type: string;
};

type PanelMessage = {
  readonly id: string;
  readonly parts: MessagePart[];
  readonly role: string;
};

type PanelPostBody = {
  readonly id: string;
  readonly messageId?: string;
  readonly messages: PanelMessage[];
  readonly trigger: string;
};

type StreamChunk = MessagePart & {
  readonly delta?: string;
  readonly finishReason?: string;
  readonly messageId?: string;
};

const FIXTURES = join(import.meta.dirname, "fixtures");

const readPostBody = (name: string): PanelPostBody =>
  JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as PanelPostBody;

const readSseChunks = (name: string): StreamChunk[] => {
  const frames = readFileSync(join(FIXTURES, name), "utf8")
    .trim()
    .split("\n\n");
  expect(frames.at(-1)).toBe("data: [DONE]");
  return frames.slice(0, -1).map((frame) => {
    expect(frame.startsWith("data: ")).toBe(true);
    return JSON.parse(frame.slice("data: ".length)) as StreamChunk;
  });
};

describe("FE-1435 real-panel wire transcript", () => {
  test("validates the load-bearing fields in the complete initial panel POST fixture", () => {
    const body = readPostBody("panel-initial.post.json");
    expect(body.trigger).toBe("submit-message");
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]?.role).toBe("user");
    expect(body.messages[0]?.parts).toEqual([
      { type: "text", text: "Run the FE-1435 transport probe." },
    ]);
  });

  test("validates one batched follow-up with both client outputs and diagnostics decoration", () => {
    const body = readPostBody("panel-tool-results.post.json");
    expect(body.messageId).toBe("assistant-fe1435-1");
    expect(body.messages).toHaveLength(3);

    const assistant = body.messages[1]!;
    const clientToolOutputs = assistant.parts.filter(
      (part) =>
        part.type === "tool-addPlace" || part.type === "tool-addTransition",
    );
    expect(clientToolOutputs).toHaveLength(2);
    expect(clientToolOutputs.map((part) => part.state)).toEqual([
      "output-available",
      "output-available",
    ]);
    expect(clientToolOutputs.map((part) => part.output?.applied)).toEqual([
      true,
      true,
    ]);

    const serverTool = assistant.parts.find(
      (part) => part.type === "tool-serverProbe",
    );
    expect(serverTool).toMatchObject({
      providerExecuted: true,
      state: "output-available",
      toolCallId: "tool-server-fe1435",
    });

    const diagnostics = body.messages[2]!;
    expect(diagnostics.id).toBe("petrinaut-diagnostics-context");
    expect(
      diagnostics.parts[0]?.text?.startsWith(
        "Petrinaut diagnostics context only; this is not a user request.",
      ),
    ).toBe(true);
  });

  test("validates streamed reasoning, text, server tool, and client calls", () => {
    const chunks = readSseChunks("panel-initial.sse");
    expect(chunks.some((chunk) => chunk.type === "reasoning-delta")).toBe(true);
    expect(chunks.some((chunk) => chunk.type === "text-delta")).toBe(true);
    expect(
      chunks.some(
        (chunk) =>
          chunk.type === "tool-output-available" &&
          chunk.toolCallId === "tool-server-fe1435" &&
          chunk.providerExecuted === true,
      ),
    ).toBe(true);
    expect(
      chunks
        .filter(
          (chunk) =>
            chunk.type === "tool-input-available" &&
            chunk.providerExecuted !== true,
        )
        .map((chunk) => chunk.toolName),
    ).toEqual(["addPlace", "addTransition"]);
    expect(chunks.at(-1)).toMatchObject({
      type: "finish",
      finishReason: "tool-calls",
    });
  });

  test("validates the follow-up stream produced after the panel posts tool outputs", () => {
    const chunks = readSseChunks("panel-follow-up.sse");
    expect(chunks.find((chunk) => chunk.type === "text-delta")?.delta).toBe(
      "The live editor applied both client tools, returned both outputs in one follow-up, and the wrapped transport added diagnostics context.",
    );
    expect(chunks.at(-1)).toMatchObject({
      type: "finish",
      finishReason: "stop",
    });
  });
});
