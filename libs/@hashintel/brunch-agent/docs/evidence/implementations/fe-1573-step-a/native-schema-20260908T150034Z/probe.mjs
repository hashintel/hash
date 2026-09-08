// Executed from an isolated package copy by reproduce.mjs; never a product mount.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { pathToFileURL } from "node:url";
const context = JSON.parse(
  readFileSync(new URL("context.json", import.meta.url)),
);
let networkAttempts = 0;
const forbidden = () => {
  networkAttempts++;
  throw new Error("External network forbidden");
};
globalThis.fetch = forbidden;
http.request = forbidden;
http.get = forbidden;
https.request = forbidden;
https.get = forbidden;
net.connect = forbidden;
net.createConnection = forbidden;
net.Socket.prototype.connect = forbidden;

const { z } = await import("zod");
const v = await import("valibot");
const { petrinautAiTools, normalizePetrinautAiToolInput } =
  await import("@hashintel/petrinaut-core/ai");
const { anthropicProvider } =
  await import("@earendil-works/pi-ai/providers/anthropic");
const { defineTool, useTool, useModel, init, observe, instrument } =
  await import("@flue/runtime");
const { start } = await import("@flue/runtime/node");
const { createAgentRouter } = await import("@flue/runtime/routing");
const { AWAITING_CLIENT } =
  await import("@hashintel/brunch-agent/client-tools");
const { withBufferedToolAdmission } = await import(
  pathToFileURL(`${context.root}/apps/brunch-agent/src/provider-admission.ts`)
);
const native = anthropicProvider();
const model = native
  .getModels()
  .find((entry) => entry.id === "claude-sonnet-4-6");
assert(model);
const names = [
  "addArc",
  "addScenario",
  "addTransition",
  "updateTransition",
  "getLatestNetDefinition",
];
const projections = Object.fromEntries(
  names.map((name) => {
    const schema = petrinautAiTools[name].inputSchema;
    const input = z.toJSONSchema(schema, { io: "input" });
    const standard = schema["~standard"].jsonSchema.input({
      target: "draft-2020-12",
    });
    const output = z.toJSONSchema(schema, { io: "output" });
    assert.deepEqual(input, standard);
    assert.deepEqual(
      output,
      schema["~standard"].jsonSchema.output({ target: "draft-2020-12" }),
    );
    return [name, { input, output }];
  }),
);
assert.deepEqual(projections.addArc.input, projections.addArc.output);
assert.deepEqual(projections.addScenario.input.required, [
  "id",
  "name",
  "scenarioParameters",
  "initialState",
]);
assert(projections.addScenario.output.required.includes("parameterOverrides"));
const refs = (value) =>
  !value || typeof value !== "object"
    ? []
    : Object.entries(value).flatMap(([key, item]) =>
        key === "$ref" ? [item] : refs(item),
      );
const dangling = (schema) =>
  refs(schema).filter((ref) => {
    assert(ref.startsWith("#/"));
    let node = schema;
    for (const part of ref.slice(2).split("/"))
      node = node?.[part.replaceAll("~1", "/").replaceAll("~0", "~")];
    return node === undefined;
  });
for (const name of ["addTransition", "updateTransition"]) {
  assert(refs(projections[name].input).length > 0);
  assert.deepEqual(dangling(projections[name].input), []);
}
const validArc = {
  transitionId: "transition",
  arcDirection: "input",
  placeId: "place",
  weight: 2,
};
const controls = [
  {
    name: "two-endpoints",
    input: { ...validArc, endpoint: { kind: "place", placeId: "place" } },
  },
  {
    name: "output-type",
    input: { ...validArc, arcDirection: "output", type: "read" },
  },
  { name: "boolean-weight", input: { ...validArc, weight: true } },
];
for (const control of controls)
  assert.equal(
    petrinautAiTools.addArc.inputSchema.safeParse(control.input).success,
    false,
  );
const declaration = (() => {
  try {
    defineTool({
      name: "diagnostic",
      description: "No execution",
      input: petrinautAiTools.addArc.inputSchema,
      run() {
        throw Error("Must not run");
      },
    });
    return { accepted: true };
  } catch (error) {
    return { accepted: false, error: error.message };
  }
})();
assert.equal(declaration.accepted, context.mode !== "baseline");
if (context.mode === "baseline")
  assert.equal(
    declaration.error,
    "[flue] defineTool() input must be a Valibot schema.",
  );

const payloads = [];
let syntheticFetchCalls = 0;
// Before runtime assembly, capture every actual native projection in both modes.
for (const method of ["stream", "streamSimple"]) {
  for (const constrainedSampling of [undefined, false]) {
    let payload;
    const response = await native[method](
      model,
      {
        messages: [],
        tools: names.map((name) => ({
          name,
          description: "Diagnostic",
          parameters: projections[name].input,
          ...(constrainedSampling === undefined ? {} : { constrainedSampling }),
        })),
      },
      {
        apiKey: "synthetic-not-a-credential",
        maxTokens: 1,
        maxRetries: 0,
        onPayload(body) {
          payload = structuredClone(body);
        },
        fetch: async (_request, options) => {
          syntheticFetchCalls++;
          const serialized = JSON.parse(options.body);
          assert.deepEqual(serialized.tools, payload.tools);
          return new Response(
            JSON.stringify({
              type: "error",
              error: {
                type: "invalid_request_error",
                message: "Synthetic stop",
              },
            }),
            { status: 400, headers: { "content-type": "application/json" } },
          );
        },
      },
    ).result();
    assert.equal(response.stopReason, "error");
    const deltas = payload.tools.map((tool) => ({
      name: tool.name,
      equal:
        JSON.stringify(tool.input_schema) ===
        JSON.stringify(projections[tool.name].input),
      omittedRootKeys: Object.keys(projections[tool.name].input).filter(
        (key) => !Object.hasOwn(tool.input_schema, key),
      ),
      dangling: dangling(tool.input_schema),
      introducedEmptyRequired:
        !Object.hasOwn(projections[tool.name].input, "required") &&
        Object.hasOwn(tool.input_schema, "required"),
    }));
    for (const delta of deltas)
      assert.equal(
        delta.equal,
        ["candidate", "two-boundary"].includes(context.mode),
      );
    assert(payload.tools.every((tool) => tool.strict === undefined));
    payloads.push({
      method,
      constrainedSampling: constrainedSampling ?? "omitted",
      deltas,
      tools: payload.tools,
    });
  }
}

const nativeLimitControls = [];
if (context.mode !== "baseline") {
  for (const [name, input] of [
    ["non-object", z.string()],
    ["unrepresentable-date", z.object({ date: z.date() })],
    [
      "validator-without-export",
      {
        "~standard": {
          version: 1,
          vendor: "synthetic",
          validate: (value) => ({ value }),
        },
      },
    ],
  ]) {
    let error;
    try {
      defineTool({
        name,
        description: "Must fail closed",
        input,
        run() {
          throw Error("Must not execute");
        },
      });
    } catch (caught) {
      error = caught.message;
    }
    assert(error, name);
    nativeLimitControls.push({ name, error });
  }
  assert.throws(
    () =>
      defineTool({
        name: "output-stays-valibot",
        description: "Not migrated",
        output: z.string(),
        run() {
          return "test";
        },
      }),
    /output must be a Valibot schema/,
  );
}
const runtimeCases = [];
const executions = [];
const requests = [];
const events = [];
const beforeObservations = [];
const afterObservations = [];
const sessions = new Set();
const { y: Session } = await import(
  new URL(
    "./conversation-stream-store-CXwRWonS.mjs",
    import.meta.resolve("@flue/runtime"),
  )
);
const originalCreateCustomTools = Session.prototype.createCustomTools;
Session.prototype.createCustomTools = function (...args) {
  sessions.add(this);
  return originalCreateCustomTools.apply(this, args);
};
const interceptedTools = [];
let transformParses = 0;
const { Agent } = await import("@earendil-works/pi-agent-core");
// Diagnostic installation of Pi's existing public callback on Flue-owned Agents.
// The original loop methods still perform all preparation/execution/history work.
const hooked = new WeakSet();
for (const method of ["prompt", "continue"]) {
  const original = Agent.prototype[method];
  Agent.prototype[method] = function (...args) {
    if (!hooked.has(this)) {
      hooked.add(this);
      this.afterToolCall = ({ toolCall, args: parsed }) => {
        afterObservations.push({
          id: toolCall.id,
          parsed: structuredClone(parsed),
        });
      };
      this.beforeToolCall = ({ toolCall, args: parsed }) => {
        beforeObservations.push({
          id: toolCall.id,
          raw: structuredClone(toolCall.arguments),
          parsed: structuredClone(parsed),
        });
        if (toolCall.id === "call_before-block")
          return { block: true, reason: "Synthetic beforeToolCall block" };
      };
    }
    return original.apply(this, args);
  };
}
let allowAsync;
let enteredAsync;
let lateValidationPassed = false;
const asyncGate = new Promise((resolve) => {
  allowAsync = resolve;
});
const asyncEntered = new Promise((resolve) => {
  enteredAsync = resolve;
});
if (context.mode !== "baseline") {
  const tools = names.map((name) =>
    defineTool({
      name,
      description: "Synthetic native schema diagnostic; no canonical mutation",
      input: petrinautAiTools[name].inputSchema,
      ...(context.mode === "candidate" && name === "addArc"
        ? {
            prepareArguments: (args) =>
              normalizePetrinautAiToolInput("addArc", args),
          }
        : {}),
      run({ data, toolCallId }) {
        executions.push({ name, data: structuredClone(data), toolCallId });
        return {
          output:
            name === "addArc"
              ? { awaiting: AWAITING_CLIENT }
              : { observed: data, toolCallId },
          terminate: true,
        };
      },
    }),
  );
  tools.push(
    defineTool({
      name: "legacyControl",
      description: "Unchanged Valibot",
      input: v.object({
        label: v.pipe(v.string(), v.trim()),
        count: v.optional(v.number(), 3),
      }),
      output: v.object({ label: v.string(), count: v.number() }),
      run({ data, toolCallId }) {
        executions.push({ name: "legacyControl", data, toolCallId });
        return { output: data, terminate: true };
      },
    }),
  );
  tools.push(
    defineTool({
      name: "transformedControl",
      description: "Native transform output",
      input: z.strictObject({ value: z.string() }).transform(({ value }) => {
        transformParses++;
        return { length: value.length };
      }),
      run({ data, toolCallId }) {
        executions.push({ name: "transformedControl", data, toolCallId });
        return { output: data, terminate: true };
      },
    }),
  );
  tools.push(
    defineTool({
      name: "asyncControl",
      description: "Native asynchronous validation",
      input: z.strictObject({ value: z.string() }).refine(
        async ({ value }) => {
          if (value === "hold") {
            enteredAsync();
            await asyncGate;
            lateValidationPassed = true;
          }
          return value === "ok" || value === "hold";
        },
        { path: ["value"], message: "Expected ok" },
      ),
      run({ data, toolCallId }) {
        executions.push({ name: "asyncControl", data, toolCallId });
        return { output: data, terminate: true };
      },
    }),
  );
  const Diagnostic = () => {
    useModel("anthropic/claude-sonnet-4-6", { compaction: false });
    for (const tool of tools) useTool(tool);
    return "Synthetic native schema diagnostic only; no execution outside the scripted tools.";
  };
  Diagnostic.agentName = "native-schema-diagnostic";
  let nextCalls = [];
  const sse = (event) =>
    new TextEncoder().encode(
      `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
    );
  const supply = (_selected, providerContext, options) =>
    native.streamSimple(model, providerContext, {
      ...options,
      apiKey: "synthetic-not-a-credential",
      maxTokens: 64,
      maxRetries: 0,
      fetch: async (_request, requestOptions) => {
        syntheticFetchCalls++;
        const request = JSON.parse(requestOptions.body);
        requests.push({ tools: request.tools, messages: request.messages });
        assert(request.tools.every((tool) => tool.strict === undefined));
        for (const name of names) {
          const sent = request.tools.find((tool) => tool.name === name);
          if (["candidate", "two-boundary"].includes(context.mode))
            assert.deepEqual(sent.input_schema, projections[name].input);
        }
        const calls = nextCalls;
        nextCalls = [];
        const frames = [
          {
            type: "message_start",
            message: {
              id: `synthetic_${requests.length}`,
              type: "message",
              role: "assistant",
              model: model.id,
              content: [],
              usage: { input_tokens: 1, output_tokens: 1 },
            },
          },
        ];
        for (const [index, call] of calls.entries())
          frames.push(
            {
              type: "content_block_start",
              index,
              content_block: {
                type: "tool_use",
                id: call.id,
                name: call.name,
                input: {},
              },
            },
            {
              type: "content_block_delta",
              index,
              delta: {
                type: "input_json_delta",
                partial_json: JSON.stringify(call.input),
              },
            },
            { type: "content_block_stop", index },
          );
        frames.push(
          {
            type: "message_delta",
            delta: { stop_reason: calls.length ? "tool_use" : "end_turn" },
            usage: { output_tokens: 4 },
          },
          { type: "message_stop" },
        );
        return new Response(
          new ReadableStream({
            start(controller) {
              for (const frame of frames) controller.enqueue(sse(frame));
              controller.close();
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        );
      },
    });
  const decorated = withBufferedToolAdmission(
    { ...native, stream: supply, streamSimple: supply },
    () => true,
    new Set(names),
  );
  const unobserve = observe((event) => {
    if (
      ["tool", "tool_start", "turn", "submission_settled"].includes(event.type)
    )
      events.push(event);
  });
  const disposeInstrument = instrument({
    observe() {},
    interceptor(operation, _scope, next) {
      if (operation.type === "tool")
        interceptedTools.push({
          toolName: operation.toolName,
          toolCallId: operation.toolCallId,
        });
      return next();
    },
    dispose() {},
  });
  const flue = await start({
    agents: [Diagnostic],
    providers: [decorated],
    env: {},
  });
  const router = createAgentRouter(Diagnostic);
  try {
    const cases = [
      { name: "valid-arc", tool: "addArc", input: validArc },
      ...controls.map((control) => ({ ...control, tool: "addArc" })),
      {
        name: "scenario-default",
        tool: "addScenario",
        input: {
          id: "scenario",
          name: "Scenario",
          scenarioParameters: [],
          initialState: { type: "per_place", content: { place: "1" } },
        },
      },
      { name: "empty-required", tool: "getLatestNetDefinition", input: {} },
      {
        name: "recursive-native",
        tool: "updateTransition",
        input: {
          transitionId: "t",
          update: { metadata: { nested: [true, null, { number: 2 }] } },
        },
      },
      {
        name: "valibot-default-transform",
        tool: "legacyControl",
        input: { label: "  kept  " },
      },
      {
        name: "valibot-generic-control",
        tool: "legacyControl",
        input: { label: "kept", count: true },
      },
      {
        name: "explicit-normalization",
        tool: "addArc",
        input: { ...validArc, weight: "2" },
      },
      {
        name: "transformed-output",
        tool: "transformedControl",
        input: { value: "abc" },
      },
      { name: "async-valid", tool: "asyncControl", input: { value: "ok" } },
      { name: "async-invalid", tool: "asyncControl", input: { value: "no" } },
      { name: "before-block", tool: "addArc", input: validArc },
    ];
    for (const sample of cases) {
      const beforeExecutions = executions.length;
      const beforeRequests = requests.length;
      const handle = init(Diagnostic, { id: sample.name });
      nextCalls = [
        { id: `call_${sample.name}`, name: sample.tool, input: sample.input },
      ];
      const receipt = await handle.dispatch("Synthetic diagnostic");
      let outcome;
      try {
        outcome = { success: true, reply: await handle.read(receipt) };
      } catch (error) {
        outcome = { success: false, error: error.message };
      }
      const response = await router.fetch(
        new Request(`http://diagnostic.invalid/${sample.name}?view=history`),
      );
      assert.equal(response.status, 200);
      const history = await response.json();
      const runs = executions.slice(beforeExecutions);
      const requestCount = requests.length - beforeRequests;
      if (
        [
          "two-endpoints",
          "output-type",
          "async-invalid",
          "before-block",
        ].includes(sample.name)
      )
        assert.equal(runs.length, 0);
      if (sample.name === "boolean-weight")
        assert.equal(runs.length, context.mode === "candidate" ? 0 : 1);
      const part = history.messages
        .flatMap((message) => message.parts)
        .find((entry) => entry.toolCallId === `call_${sample.name}`);
      assert(part, "History keeps original call identity");
      assert.deepEqual(
        part.input,
        sample.input,
        "History retains raw arguments without coercion",
      );
      if (!runs.length) {
        assert.equal(part.state, "output-error");
        assert(part.errorText);
      }
      if (sample.name === "valibot-generic-control") {
        assert.equal(runs.length, 1);
        assert.equal(runs[0].data.count, 1);
      }
      if (sample.name === "async-invalid")
        assert.match(part.errorText, /Expected ok.*value/);
      if (sample.name === "transformed-output") {
        assert.equal(transformParses, 1);
        assert.deepEqual(runs[0].data, { length: 3 });
      }
      if (context.mode === "candidate" && sample.name === "transformed-output")
        assert.deepEqual(
          beforeObservations.find((event) => event.id === `call_${sample.name}`)
            .parsed,
          { length: 3 },
        );
      if (sample.name === "explicit-normalization")
        assert.equal(
          beforeObservations.find((event) => event.id === `call_${sample.name}`)
            .raw.weight,
          "2",
        );
      if (
        [
          "valid-arc",
          "scenario-default",
          "empty-required",
          "valibot-default-transform",
          "explicit-normalization",
          "async-valid",
          "transformed-output",
        ].includes(sample.name)
      )
        assert.equal(runs.length, 1, JSON.stringify(outcome));
      if (sample.name === "scenario-default")
        assert.deepEqual(runs[0].data.parameterOverrides, {});
      if (context.mode === "candidate" && sample.name === "recursive-native") {
        assert.equal(runs.length, 1);
        assert.deepEqual(runs[0].data, sample.input);
      }
      if (sample.name === "valibot-default-transform")
        assert.deepEqual(runs[0].data, { label: "kept", count: 3 });
      if (runs.length) {
        assert.equal(runs[0].toolCallId, `call_${sample.name}`);
        assert.equal(requestCount, 1, "Terminate stops automatic continuation");
      }
      runtimeCases.push({
        name: sample.name,
        rawInput: sample.input,
        outcome,
        requestCount,
        executions: runs,
        history,
      });
      if (sample.name === "valid-arc") {
        assert.equal(requests.length - beforeRequests, 1);
        assert.deepEqual(part.output, { awaiting: AWAITING_CLIENT });
        const followup = await handle.dispatch({
          message: {
            kind: "signal",
            type: "client-tool-result",
            body: JSON.stringify([
              {
                toolCallId: "call_valid-arc",
                toolName: "addArc",
                output: { applied: true },
              },
            ]),
          },
        });
        await handle.read(followup);
        assert.equal(requests.length - beforeRequests, 2);
        assert.equal(
          executions.length - beforeExecutions,
          1,
          "Result continuation does not reexecute",
        );
        assert(
          JSON.stringify(requests.at(-1).messages).includes("call_valid-arc"),
        );
        runtimeCases.push({
          name: "client-result-continuation",
          executions: [],
          requestCount: 1,
          history: await (
            await router.fetch(
              new Request("http://diagnostic.invalid/valid-arc?view=history"),
            )
          ).json(),
        });
      }
    }
    if (context.mode === "candidate") {
      const handle = init(Diagnostic, { id: "validation-cancellation" });
      const before = executions.length;
      nextCalls = [
        { id: "call_cancel", name: "asyncControl", input: { value: "hold" } },
      ];
      const receipt = await handle.dispatch("Cancel validation");
      const rejected = assert.rejects(handle.read(receipt));
      await asyncEntered;
      await handle.abort();
      await rejected;
      assert.equal(executions.length, before);
      allowAsync();
      await new Promise((resolve) => setTimeout(resolve, 10));
      assert.equal(lateValidationPassed, true);
      assert.equal(executions.length, before);
      assert(!beforeObservations.some((event) => event.id === "call_cancel"));
      runtimeCases.push({
        name: "validation-cancellation",
        executions: [],
        lateValidationPassed,
        lateExecutionCount: executions.length - before,
      });
    }
    if (context.mode === "candidate") {
      // Exercise the actual durable-reexecution method on an actual runtime Session.
      // Synthetic partial records, not crash recovery or a fabricated lineage witness.
      const session = [...sessions].find((entry) =>
        entry.agentTools.some((tool) => tool.name === "addArc"),
      );
      assert(session);
      const durable = defineTool({
        name: "durableNative",
        description: "Durable parser diagnostic",
        input: petrinautAiTools.addArc.inputSchema,
        prepareArguments: (args) =>
          normalizePetrinautAiToolInput("addArc", args),
        durable: true,
        run({ data, toolCallId }) {
          executions.push({ name: "durableNative", data, toolCallId });
          return { output: data, terminate: true };
        },
      });
      for (const [name, input] of [
        ["durable-normalized", { ...validArc, weight: "2" }],
        ["durable-invalid", { ...validArc, weight: true }],
      ]) {
        const before = executions.length;
        const outcome = await session.reexecuteDurableToolCall(
          {
            entryId: "synthetic_partial",
            assistant: {
              content: [{ type: "toolCall", id: name, arguments: input }],
            },
          },
          name,
          durable,
          new AbortController().signal,
        );
        assert.equal(outcome.isError, name === "durable-invalid");
        assert.equal(outcome.toolCallId, name);
        assert.equal(
          executions.length - before,
          name === "durable-invalid" ? 0 : 1,
        );
        if (name === "durable-normalized") {
          assert.equal(outcome.output.weight, 2);
          assert.equal(outcome.terminate, true);
        }
        runtimeCases.push({
          name,
          executions: executions.slice(before),
          outcome,
          scope:
            "Direct real Session reexecution method, not crash/recovery integration",
        });
      }
      for (const id of [
        "call_boolean-weight",
        "call_two-endpoints",
        "call_output-type",
        "call_async-invalid",
      ]) {
        assert(!beforeObservations.some((entry) => entry.id === id));
        assert(!interceptedTools.some((entry) => entry.toolCallId === id));
      }
      assert.deepEqual(
        afterObservations.find(
          (entry) => entry.id === "call_transformed-output",
        ).parsed,
        { length: 3 },
      );
    }
    const before = executions.length;
    const handle = init(Diagnostic, { id: "mixed-rejection" });
    nextCalls = [
      { id: "mixed_arc", name: "addArc", input: validArc },
      { id: "mixed_server", name: "legacyControl", input: { label: "no" } },
    ];
    const receipt = await handle.dispatch("Mixed diagnostic");
    await assert.rejects(handle.read(receipt));
    assert.equal(executions.length, before);
    const mixedHistory = await (
      await router.fetch(
        new Request("http://diagnostic.invalid/mixed-rejection?view=history"),
      )
    ).json();
    assert(!JSON.stringify(mixedHistory).includes("mixed_arc"));
    runtimeCases.push({
      name: "mixed-rejection",
      executions: [],
      history: mixedHistory,
    });
  } finally {
    unobserve();
    await disposeInstrument();
    await flue.stop();
  }
}
assert.equal(networkAttempts, 0);
const sha = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const schemaSummary = (schema) => ({
  sha256: sha(schema),
  rootKeys: Object.keys(schema),
  required: schema.required,
  additionalProperties: schema.additionalProperties,
  description: schema.description,
  definitions: Object.keys(schema.$defs ?? {}),
  references: refs(schema),
  dangling: dangling(schema),
});
writeFileSync(
  `${context.evidence}/native-input-schemas.json`,
  `${JSON.stringify(Object.fromEntries(names.map((name) => [name, projections[name].input])), null, 2)}\n`,
);
const report = {
  mode: context.mode,
  applied: context.applied,
  model,
  networkAttempts,
  syntheticFetchCalls,
  declaration,
  nativeLimitControls,
  projections: Object.fromEntries(
    names.map((name) => [
      name,
      {
        input: schemaSummary(projections[name].input),
        output: schemaSummary(projections[name].output),
      },
    ]),
  ),
  payloads: payloads.map(({ tools, ...rest }) => ({
    ...rest,
    tools: tools.map((tool) => ({
      name: tool.name,
      strict: tool.strict,
      schema: schemaSummary(tool.input_schema),
    })),
  })),
  runtimeCases,
  executions,
  beforeObservations,
  afterObservations,
  interceptedTools,
  transformParses,
  requests: requests.map((request) => ({
    schemas: request.tools.map((tool) => ({
      name: tool.name,
      sha256: sha(tool.input_schema),
    })),
    clientResultCarried: request.messages
      .flatMap((message) =>
        typeof message.content === "string"
          ? [message.content]
          : message.content.map((part) => part.text ?? ""),
      )
      .some((text) => text.includes('"applied":true')),
  })),
  events: events.map((event) => ({
    type: event.type,
    toolName: event.toolName,
    toolCallId: event.toolCallId,
    isError: event.isError,
    error: event.errorInfo?.message,
    outcome: event.outcome,
    submissionId: event.submissionId,
  })),
};
writeFileSync(
  `${context.evidence}/${context.mode}.json`,
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(
  JSON.stringify({
    mode: context.mode,
    declaration,
    networkAttempts,
    syntheticFetchCalls,
    runtimeCases: runtimeCases.map((sample) => ({
      name: sample.name,
      runs: sample.executions?.length,
      requestCount: sample.requestCount,
    })),
  }),
);
