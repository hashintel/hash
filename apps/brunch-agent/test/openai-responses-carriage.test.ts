/** OpenAI Responses adapter acceptance of native Brunch schemas. Independent of Anthropic count-tokens. */
import http from "node:http";
import https from "node:https";
import net from "node:net";

import {
  convertResponsesMessages,
  convertResponsesTools,
} from "@earendil-works/pi-ai/api/openai-responses-shared";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { expect, test } from "vitest";

import {
  mutatePetrinetInputSchema,
  mutatePetrinetToolName,
  queryWorkpieceInputSchema,
} from "@hashintel/brunch-agent-plugin-sdcpn";

import type { Tool } from "@earendil-works/pi-ai";

let networkAttempts = 0;
const forbidden = () => {
  networkAttempts++;
  throw new Error("External requests forbidden");
};
globalThis.fetch = forbidden;
http.request = forbidden;
https.request = forbidden;
net.Socket.prototype.connect = forbidden;

const jsonSchema = (schema: {
  readonly ["~standard"]: {
    readonly jsonSchema: {
      readonly input: (options: { target: "draft-2020-12" }) => unknown;
    };
  };
}) =>
  schema["~standard"].jsonSchema.input({
    target: "draft-2020-12",
  }) as Tool["parameters"];

const zeroUsage = {
  input: 1,
  output: 1,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 2,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

test("OpenAI Responses conversion accepts the native construction catalogue schemas", () => {
  const model = openaiProvider()
    .getModels()
    .find((entry) => entry.id === "gpt-5.6-sol");
  expect(model).toBeDefined();
  expect(model!.compat?.supportsStrictMode).toBe(true);
  const tools: Tool[] = [
    {
      name: "query_workpiece",
      description: "Query the current workpiece",
      parameters: jsonSchema(queryWorkpieceInputSchema(true)),
    },
    {
      name: mutatePetrinetToolName,
      description: "Mutate the bound net",
      parameters: jsonSchema(mutatePetrinetInputSchema),
    },
  ];
  const converted = convertResponsesTools(tools, {
    supportsStrictMode: model!.compat?.supportsStrictMode ?? true,
    supportsOpenAIGrammarTools: model!.compat?.supportsOpenAIGrammarTools,
  });
  expect(converted).toHaveLength(2);
  for (const tool of converted) {
    expect(tool.type).toBe("function");
    if (tool.type !== "function") continue;
    expect(tool.parameters).toBeTypeOf("object");
    expect(tool.parameters).not.toBeNull();
    expect(Array.isArray(tool.parameters)).toBe(false);
    const root = tool.parameters as { type?: string };
    expect(root.type).toBe("object");
    for (const keyword of ["oneOf", "allOf", "anyOf"]) {
      expect(root, `${tool.name} top-level ${keyword}`).not.toHaveProperty(
        keyword,
      );
    }
    expect("strict" in tool).toBe(true);
  }
  const history = convertResponsesMessages(
    model!,
    {
      systemPrompt: "Synthetic interviewer",
      messages: [
        { role: "user", content: "Please continue.", timestamp: 1 },
        {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: "call_query",
              name: "query_workpiece",
              arguments: { selector: { kind: "place", name: "Waiting" } },
            },
          ],
          api: "openai-responses",
          provider: "openai",
          model: "gpt-5.6-sol",
          usage: zeroUsage,
          stopReason: "toolUse",
          timestamp: 2,
        },
        {
          role: "toolResult",
          toolCallId: "call_query",
          toolName: "query_workpiece",
          content: [{ type: "text", text: "Current workpiece is empty." }],
          isError: false,
          timestamp: 3,
        },
      ],
      tools,
    },
    new Set(["openai"]),
  );
  expect(history.length).toBeGreaterThan(1);
  const serialized = JSON.stringify(history);
  expect(serialized).toContain("query_workpiece");
  expect(serialized).toContain("Please continue.");
  expect(serialized).toContain("Current workpiece is empty.");
  expect(networkAttempts).toBe(0);
});
