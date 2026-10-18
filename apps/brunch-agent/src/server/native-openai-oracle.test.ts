/**
 * The faux native-OpenAI oracle drives Pi's real OpenAI serialization and checks
 * each request against the tools mounted in Pi's transcript. Exercise it with the
 * transcript shapes Pi 1.2 sends: leading declarations, later inline additions,
 * and a same-name redefinition.
 */
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  normalizeContext,
  type Message,
  type Tool,
} from "@earendil-works/pi-ai";
import { expect, test } from "vitest";

import { nativeOpenaiProvider } from "@local/pi-faux-providers/native-openai-provider";

import { openaiProviderWithAddedModels } from "./openai-provider.ts";

const lookup: Tool = {
  name: "lookup",
  description: "Look up one fact.",
  parameters: {
    type: "object",
    properties: { q: { type: "string" } },
    required: ["q"],
    additionalProperties: false,
  },
};
const lookupWithLimit: Tool = {
  ...lookup,
  description: "Look up facts, at most `limit`.",
  parameters: {
    type: "object",
    properties: { q: { type: "string" }, limit: { type: "integer" } },
    required: ["q", "limit"],
    additionalProperties: false,
  },
};
const record: Tool = {
  name: "record",
  description: "Record a claim.",
  parameters: {
    type: "object",
    properties: { claim: { type: "string" } },
    required: ["claim"],
  },
};
const user = (content: string): Message => ({
  role: "user",
  content,
  timestamp: 0,
});

type SentTool = { type: string; name: string; parameters: unknown };
const requestTools = (request: Record<string, unknown> | undefined) =>
  (request?.tools ?? []) as SentTool[];
const inlineTools = (request: Record<string, unknown> | undefined) =>
  ((request?.input ?? []) as { type?: string; tools?: SentTool[] }[]).flatMap(
    (item) => (item.type === "additional_tools" ? (item.tools ?? []) : []),
  );

const setup = () => {
  const faux = fauxProvider({ provider: "openai" });
  const requests: Record<string, unknown>[] = [];
  const oracle = nativeOpenaiProvider(faux.provider, requests, async () => {});
  const model = openaiProviderWithAddedModels()
    .getModels()
    .find((entry) => entry.id === "gpt-5.5-2026-04-23");
  if (model === undefined) throw new Error("Default model missing.");
  return { faux, requests, oracle, model };
};

test("accepts later tool additions, which Pi sends inline after the leading declarations", async () => {
  const { faux, requests, oracle, model } = setup();
  faux.setResponses([fauxAssistantMessage([fauxText("Added.")])]);
  const context = normalizeContext({
    systemPrompt: "Base instructions.",
    tools: [lookup],
    messages: [
      user("First."),
      { role: "system", content: "", toolsAdded: [record], timestamp: 0 },
      user("Second."),
    ],
  });

  const reply = await oracle.streamSimple(model, context).result();

  expect(reply.errorMessage).toBeUndefined();
  expect(reply.content).toMatchObject([{ type: "text", text: "Added." }]);
  expect(requests).toHaveLength(1);
  expect(requestTools(requests[0]).map((tool) => tool.name)).toEqual([
    "lookup",
  ]);
  expect(inlineTools(requests[0])).toMatchObject([
    { type: "function", name: "record", parameters: record.parameters },
  ]);
});

test("accepts a same-name redefinition, which Pi sends as the current tool set", async () => {
  const { faux, requests, oracle, model } = setup();
  faux.setResponses([fauxAssistantMessage([fauxText("Redefined.")])]);
  const context = normalizeContext({
    systemPrompt: "Base instructions.",
    tools: [lookup, record],
    messages: [
      user("First."),
      {
        role: "system",
        content: "",
        toolsRemoved: [{ name: "lookup" }],
        toolsAdded: [lookupWithLimit],
        timestamp: 0,
      },
      user("Second."),
    ],
  });

  const reply = await oracle.streamSimple(model, context).result();

  expect(reply.errorMessage).toBeUndefined();
  expect(requests).toHaveLength(1);
  expect(inlineTools(requests[0])).toEqual([]);
  const sent = requestTools(requests[0]);
  expect(sent.map((tool) => tool.name).toSorted()).toEqual([
    "lookup",
    "record",
  ]);
  expect(sent.find((tool) => tool.name === "lookup")?.parameters).toEqual(
    lookupWithLimit.parameters,
  );
});
