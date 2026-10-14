/**
 * Brunch's tool schemas must reach Anthropic whole, whether or not a tool asks
 * for strict generation (`.yarn/patches/@earendil-works-pi-ai-npm-1.2.0-*`).
 * Requests go from the providers the app registers, through Pi's own Anthropic
 * serialization, to a local HTTP endpoint; nothing is sent to a provider.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  normalizeContext,
  type Context,
  type Message,
  type Provider,
  type Tool,
} from "@earendil-works/pi-ai";
import { instrument, setProvider } from "@flue/runtime";
import { Hono } from "hono";
import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";

import { brunchEnv } from "@hashintel/brunch-agent";

import { STEP_A_MODEL_ID } from "../shared/chat-model.ts";

vi.mock("./telemetry-bootstrap.ts", () => ({}));
vi.mock("../agents/petrinaut/agent.ts", () => ({
  PetrinautAgent: { agentName: "brunch-chat-agent" },
}));
vi.mock("@flue/runtime/routing", () => ({
  createAgentRouter: () => new Hono(),
}));
vi.mock("@flue/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@flue/runtime")>()),
  instrument: vi.fn<typeof instrument>(),
  setProvider: vi.fn<typeof setProvider>(),
}));

/** A schema the former `{ type, properties, required }` collapse would truncate. */
const placeSchema = {
  type: "object",
  description: "Petri net places, by reference.",
  $defs: {
    place: {
      type: "object",
      properties: {
        id: { type: "string" },
        tokens: { type: "integer", minimum: 0 },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  properties: {
    places: { type: "array", items: { $ref: "#/$defs/place" } },
    note: { anyOf: [{ type: "string" }, { type: "null" }] },
  },
  required: ["places"],
  additionalProperties: false,
};
const construct: Tool = {
  name: "construct",
  description: "Construct places.",
  parameters: placeSchema,
};
const constructRedefined: Tool = {
  name: "construct",
  description: "Construct places, with a label.",
  parameters: {
    ...placeSchema,
    properties: { ...placeSchema.properties, label: { type: "string" } },
  },
};
const record: Tool = {
  name: "record",
  description: "Record claims.",
  parameters: {
    type: "object",
    $defs: { claim: { type: "string", minLength: 1 } },
    properties: { claims: { type: "array", items: { $ref: "#/$defs/claim" } } },
    required: ["claims"],
    additionalProperties: false,
  },
};
/** Accepted by Anthropic strict generation, so `prefer` sends it strict first. */
const strictable: Tool = {
  name: "strictable",
  description: "A tool that prefers strict generation.",
  parameters: {
    type: "object",
    properties: { query: { type: "string", description: "What to find." } },
    required: ["query"],
    additionalProperties: false,
  },
  constrainedSampling: { type: "json_schema", strict: "prefer" },
};
const user = (content: string): Message => ({
  role: "user",
  content,
  timestamp: 0,
});
/** Tools declared up front, then a later addition and a same-name redefinition. */
const changingTools: Context = {
  systemPrompt: "Base instructions.",
  tools: [construct],
  messages: [
    user("First."),
    {
      role: "system",
      content: "",
      toolsRemoved: [{ name: "construct" }],
      toolsAdded: [constructRedefined, record],
      timestamp: 0,
    },
    user("Second."),
  ],
};

type WireTool = {
  name: string;
  input_schema: unknown;
  strict?: boolean;
  defer_loading?: boolean;
};
type WireBlock = {
  type: string;
  tool?: { type: string; definition?: WireTool };
};
type WireBody = {
  model: string;
  max_tokens: number;
  metadata?: unknown;
  tools?: WireTool[];
  messages: { role: string; content: string | WireBlock[] }[];
};

const bodies: WireBody[] = [];
let rejectNextWith: string | undefined;
let server: Server;
let baseUrl: string;
const sse = (model: string) =>
  [
    {
      type: "message_start",
      message: {
        id: "msg_synthetic",
        type: "message",
        role: "assistant",
        model,
        content: [],
        stop_reason: null,
        usage: { input_tokens: 10, output_tokens: 0 },
      },
    },
    {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    },
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "Done." },
    },
    { type: "content_block_stop", index: 0 },
    {
      type: "message_delta",
      delta: { stop_reason: "end_turn" },
      usage: { output_tokens: 1 },
    },
    { type: "message_stop" },
  ]
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join("");

const directory = mkdtempSync(join(tmpdir(), "TEST-anthropic-schema-"));
let registered: Provider;
type Interceptor = Parameters<typeof instrument>[0]["interceptor"];
let admissionInterceptor: Interceptor;
let accountingInterceptor: Interceptor;

beforeAll(async () => {
  server = createServer((request, response) => {
    let raw = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      raw += chunk;
    });
    request.on("end", () => {
      const body = JSON.parse(raw) as WireBody;
      bodies.push(body);
      const rejection = rejectNextWith;
      rejectNextWith = undefined;
      if (rejection !== undefined) {
        response.writeHead(400, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            type: "error",
            error: { type: "invalid_request_error", message: rejection },
          }),
        );
        return;
      }
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end(sse(body.model));
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("Expected a TCP address.");
  baseUrl = `http://127.0.0.1:${address.port}`;

  // Opt the app into request accounting, as an evidence run does.
  const ledgerPath = join(directory, "usage-ledger.json");
  writeFileSync(
    ledgerPath,
    JSON.stringify({
      authority: "TEST INPUT/OUTPUT only",
      limits: { calls: 200, usd: 100 },
      reservation: {
        runId: "TEST-run",
        status: "active",
        calls: 10,
        usd: 70,
        perCall: { maxOutputTokens: 16, reservedUsd: 7 },
      },
      totals: {
        spentCalls: 0,
        spentUsd: 0,
        remainingCalls: 200,
        remainingUsd: 100,
        outstandingReservedCalls: 0,
        outstandingReservedUsd: 0,
      },
      calls: [],
    }),
  );
  writeFileSync(join(directory, "attempt-ledger.md"), "# TEST INPUT/OUTPUT\n");
  vi.stubEnv(
    brunchEnv.stepAAccounting,
    JSON.stringify({ ledgerPath, runId: "TEST-run" }),
  );
  await import("../app");

  const provider = vi
    .mocked(setProvider)
    .mock.calls.map(([entry]) => entry)
    .find((entry) => entry.id === "anthropic");
  const interceptorFor = (key: string) =>
    vi
      .mocked(instrument)
      .mock.calls.find(([entry]) => entry.key === Symbol.for(key))?.[0]
      .interceptor;
  const admission = interceptorFor("brunch.buffered-tool-admission");
  const accounting = interceptorFor("brunch.step-a-request-accounting");
  if (!provider || !admission || !accounting)
    throw new Error("Expected the app's Anthropic registration.");
  registered = provider;
  admissionInterceptor = admission;
  accountingInterceptor = accounting;
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
  rmSync(directory, { recursive: true });
});
beforeEach(() => {
  bodies.length = 0;
  rejectNextWith = undefined;
});

/** A catalogue model, addressed to the local endpoint. */
const local = (id: string) => {
  const model = registered.getModels().find((entry) => entry.id === id);
  if (model === undefined) throw new Error(`Missing model ${id}.`);
  return { ...model, baseUrl };
};
const apiKey = "sk-ant-api03-synthetic-not-a-credential";
const oauthKey = "sk-ant-oat01-synthetic-not-a-credential";
const toolNamed = (tools: WireTool[] | undefined, name: string) =>
  tools?.find((tool) => tool.name === name);
const inlineDefinitions = (body: WireBody | undefined) =>
  (body?.messages ?? []).flatMap(({ role, content }) =>
    role === "system" && typeof content !== "string"
      ? content.flatMap((block) =>
          block.type === "tool_addition" && block.tool?.definition
            ? [block.tool.definition]
            : [],
        )
      : [],
  );

test.each(["stream", "streamSimple"] as const)(
  "%s: the current tool set, after additions and a redefinition, carries complete schemas",
  async (method) => {
    const reply = await registered[method](
      local(STEP_A_MODEL_ID),
      normalizeContext(changingTools),
      { apiKey },
    ).result();

    expect(reply.stopReason).toBe("stop");
    expect(bodies).toHaveLength(1);
    const tools = bodies[0]?.tools;
    expect(tools?.map((tool) => tool.name).toSorted()).toEqual([
      "construct",
      "record",
    ]);
    expect(toolNamed(tools, "construct")?.input_schema).toEqual(
      constructRedefined.parameters,
    );
    expect(toolNamed(tools, "record")?.input_schema).toEqual(record.parameters);
  },
);

test("native tool changes define later tools inline with complete schemas", async () => {
  const model = local("claude-opus-4-8");
  expect(model.compat).toMatchObject({
    supportsMidConvoSystemMessages: true,
    supportsMidConvoToolChanges: true,
  });

  const reply = await registered
    .streamSimple(model, normalizeContext(changingTools), { apiKey })
    .result();

  expect(reply.stopReason).toBe("stop");
  const body = bodies[0];
  expect(toolNamed(body?.tools, "construct")?.input_schema).toEqual(
    construct.parameters,
  );
  expect(
    body?.tools?.filter((tool) => tool.defer_loading === true),
  ).toHaveLength(1);
  const inline = inlineDefinitions(body);
  expect(inline.map((tool) => tool.name).toSorted()).toEqual([
    "construct",
    "record",
  ]);
  expect(toolNamed(inline, "construct")?.input_schema).toEqual(
    constructRedefined.parameters,
  );
  expect(toolNamed(inline, "record")?.input_schema).toEqual(record.parameters);
});

test("OAuth tool names keep their complete schemas", async () => {
  const todo: Tool = { ...record, name: "todowrite" };
  const reply = await registered
    .streamSimple(
      local(STEP_A_MODEL_ID),
      normalizeContext({ messages: [user("Hi.")], tools: [todo] }),
      { apiKey: oauthKey },
    )
    .result();

  expect(reply.stopReason).toBe("stop");
  expect(bodies[0]?.tools).toMatchObject([
    { name: "TodoWrite", input_schema: record.parameters },
  ]);
});

test("a strict-prefer request rejected for strict limits is rebuilt without strict, still carrying complete schemas", async () => {
  rejectNextWith = "Too many strict tools (21 > 20)";

  const reply = await registered
    .streamSimple(
      local(STEP_A_MODEL_ID),
      normalizeContext({
        messages: [user("Hi.")],
        tools: [strictable, construct],
      }),
      { apiKey },
    )
    .result();

  expect(reply.stopReason).toBe("stop");
  expect(bodies).toHaveLength(2);
  const [strictRequest, fallback] = bodies;
  expect(toolNamed(strictRequest?.tools, "strictable")).toMatchObject({
    strict: true,
    input_schema: strictable.parameters,
  });
  expect(toolNamed(fallback?.tools, "strictable")?.strict).toBeUndefined();
  expect(toolNamed(fallback?.tools, "strictable")?.input_schema).toEqual(
    strictable.parameters,
  );
  for (const body of [strictRequest, fallback])
    expect(toolNamed(body?.tools, "construct")?.input_schema).toEqual(
      construct.parameters,
    );
});

let turn = 0;
/** Run as the app's runtime would: inside an admitted agent operation and an accounted model turn. */
const asAccountedTurn = <T>(run: () => Promise<T>) => {
  turn += 1;
  const turnId = `TEST-turn-${turn}`;
  return admissionInterceptor(
    { type: "agent", operationId: "TEST-operation", operationKind: "prompt" },
    { agentName: "brunch-chat-agent" },
    () =>
      accountingInterceptor(
        { type: "model", turnId },
        {
          instanceId: "TEST-instance",
          conversationId: "TEST-conversation",
          submissionId: "TEST-submission",
          operationId: "TEST-operation",
          turnId,
        },
        run,
      ),
  );
};
const withMetadata = (payload: unknown, maxTokens?: number) =>
  typeof payload === "object" && payload !== null
    ? {
        ...payload,
        metadata: { user_id: "TEST-user" },
        ...(maxTokens === undefined ? {} : { max_tokens: maxTokens }),
      }
    : payload;

test.each(["stream", "streamSimple"] as const)(
  "%s: accounting checks, and the endpoint receives, the final request body",
  async (method) => {
    const replacements: unknown[] = [];
    const accepted = await asAccountedTurn(() =>
      registered[method](
        local(STEP_A_MODEL_ID),
        normalizeContext({ messages: [user("Hi.")], tools: [construct] }),
        {
          apiKey,
          onPayload: (payload) => {
            const replacement = withMetadata(payload);
            replacements.push(replacement);
            return replacement;
          },
        },
      ).result(),
    );

    expect(accepted.stopReason).toBe("stop");
    expect(bodies).toHaveLength(1);
    expect(replacements).toHaveLength(1);
    expect(bodies[0]).toEqual(replacements[0]);
    expect(bodies[0]).toMatchObject({
      max_tokens: 16,
      metadata: { user_id: "TEST-user" },
    });
    expect(toolNamed(bodies[0]?.tools, "construct")?.input_schema).toEqual(
      construct.parameters,
    );

    const refused = await asAccountedTurn(() =>
      registered[method](
        local(STEP_A_MODEL_ID),
        normalizeContext({ messages: [user("Hi.")], tools: [construct] }),
        { apiKey, onPayload: (payload) => withMetadata(payload, 4_096) },
      ).result(),
    );

    expect(refused.stopReason).toBe("error");
    expect(refused.errorMessage).toMatch(
      /exceeds reserved model\/token bounds/,
    );
    expect(bodies).toHaveLength(1);
  },
);
