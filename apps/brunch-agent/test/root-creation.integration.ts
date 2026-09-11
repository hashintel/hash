/** Unpaid synthetic construction through the built ChatAgent, real Chrome and canonical browser callbacks. */
/* eslint-disable no-await-in-loop -- Browser calls and observations must be causally serial. */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  type Context,
} from "@earendil-works/pi-ai";
import {
  createFlueClient,
  FlueExecutionError,
  type DeliveredMessage,
} from "@flue/sdk";

import {
  canonicalContent,
  observedNodeInputSchema,
  observedNodeMutationNames,
  verifyMutationAttempt,
  verifyDefinitionObservation,
  type ConstructionMutationRecord,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import { conversationConstructionMode } from "@hashintel/brunch-agent-plugin-sdcpn/flue";
import {
  clientToolHistoryFrom,
  CLIENT_TOOL_RESULT_SIGNAL,
} from "@hashintel/brunch-agent-transport-aisdk";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../src/conversation/identity.ts";
import { installFauxProvider } from "../src/evaluations/install-faux-provider.ts";
import { loadBuiltBrunchApplication } from "../src/evaluations/runbook/load-built-application.ts";
import { openBrowserFixture } from "./browser-fixture.ts";
import { browserResultFrom, type BrowserResult } from "./browser-result.ts";
import {
  nativeSchemaProvider,
  type NativeRequestCapture,
} from "./native-schema-provider.ts";

import type { SDCPN } from "@hashintel/petrinaut-core";

const output =
  process.env.M7_ROOT_CREATION_OUTPUT ??
  mkdtempSync(join(tmpdir(), "m7-root-creation-"));
if (process.env.M7_ROOT_CREATION_OUTPUT) {
  assert(!existsSync(output));
  mkdirSync(output, { recursive: true });
}
const save = (name: string, value: unknown) =>
  writeFileSync(join(output, `${name}.json`), JSON.stringify(value, null, 2));
const website = resolve(
  process.env.M7_WEBSITE_DIST ?? "../petrinaut-website/dist",
);
process.env.NODE_ENV = "test";
process.env.BRUNCH_CHAT_MODEL = "claude-sonnet-4-6";
process.env.BRUNCH_DEV_DB_PATH = join(output, "conversation.db");
delete process.env.HASH_OTLP_ENDPOINT;
const fetchOriginal = globalThis.fetch;
globalThis.fetch = (input, init) => {
  assert.equal(
    new URL(input instanceof Request ? input.url : String(input)).hostname,
    "127.0.0.1",
  );
  return fetchOriginal(input, init);
};
const faux = fauxProvider({
  provider: "anthropic",
  models: [{ id: "claude-sonnet-4-6", reasoning: true }],
});
const captures: NativeRequestCapture[] = [];
const contexts: Context[] = [];
installFauxProvider(nativeSchemaProvider(faux.provider, captures, contexts));
const app = await loadBuiltBrunchApplication();
const { server, browser, page, origin, deliveries, errors, blocked } =
  await openBrowserFixture(app, website);
const callbackErrors: string[] = [];
const tool = (name: string, args: Record<string, unknown>, id: string) =>
  fauxAssistantMessage([fauxToolCall(name, args, { id })], {
    stopReason: "toolUse",
  });
const text = (value: string) => fauxAssistantMessage([fauxText(value)]);
let completed = 0;
const checked =
  (callback: (context: Context) => ReturnType<typeof tool>) =>
  (context: Context) => {
    try {
      const response = callback(context);
      completed++;
      return response;
    } catch (error) {
      callbackErrors.push(String(error));
      save("callback-errors", callbackErrors);
      throw error;
    }
  };
const toolOutput = (
  context: Context,
  name: string,
): Record<string, unknown> => {
  const result = context.messages.findLast(
    (message) => message.role === "toolResult" && message.toolName === name,
  );
  assert(result?.role === "toolResult" && !result.isError);
  return JSON.parse(
    result.content
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join(""),
  ) as Record<string, unknown>;
};
const browserResult = (context: Context, name: string): BrowserResult =>
  browserResultFrom(
    context.messages.flatMap((message) =>
      typeof message.content === "string"
        ? [message.content]
        : message.content.flatMap((part) =>
            part.type === "text" ? [part.text] : [],
          ),
    ),
    name,
    "Missing actual model-facing browser result",
  );
let basis: Record<string, unknown> | undefined;
const settle = (markdown: string, id: string) => [
  tool("mutate_workpiece", { markdown }, id),
  checked((context) => {
    assert.equal(toolOutput(context, "mutate_workpiece").revisionId, id);
    return tool("read_workpiece", { locateTexts: [markdown] }, `${id}-locate`);
  }),
  checked((context) => {
    const result = toolOutput(context, "read_workpiece");
    const current = result.currentWorkpiece as {
      revisionId: string;
      sha256: string;
    };
    const lookup = result.locatorLookup as {
      subject: { kind: string };
      queries: { occurrences: { start: number; end: number }[] }[];
    };
    assert.equal(lookup.subject.kind, "current-revision");
    const span = lookup.queries[0]?.occurrences[0];
    assert(span);
    basis = {
      kind: "declared",
      revisionId: current.revisionId,
      sha256: current.sha256,
      locators: [span],
      rationale:
        "Synthetic operation-level test basis; relevance and useful coverage are unassessed.",
      scope: "operation",
    };
    return tool("getLatestNetDefinition", {}, `${id}-read`);
  }),
];
const mutate = (
  name: string,
  id: string,
  input: (definition: SDCPN) => Record<string, unknown>,
) =>
  checked((context) => {
    const observation = browserResult(context, "getLatestNetDefinition")
      .metadata?.observation;
    assert(observation && basis);
    return tool(
      name,
      {
        ...input(observation.observed.definition),
        brunch: {
          basis,
          observationToolCallId: observation.toolCallId,
          requestedBaseHash: observation.observed.sha256,
        },
      },
      id,
    );
  });
const afterMutation = (name: string, id: string) =>
  checked((context) => {
    const result = browserResult(context, name);
    assert.partialDeepStrictEqual(result.output, { applied: true });
    assert.equal(result.metadata?.mutationRecord?.outcome, "applied");
    return tool("getLatestNetDefinition", {}, id);
  });
const queue = {
  id: "test-queue",
  name: "TestQueue",
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
  capacity: 2,
  x: 0,
  y: 0,
};
const completedPlace = {
  ...queue,
  id: "test-completed",
  name: "TestCompleted",
  capacity: null,
  x: 320,
};
const step = {
  id: "test-step",
  name: "Test operation",
  inputArcs: [],
  outputArcs: [],
  lambdaType: "predicate",
  lambdaCode: "export default Lambda(() => true);",
  transitionKernelCode: "",
  x: 160,
  y: 0,
};
const firstMarkdown =
  "# TEST synthetic workpiece\n\nItems wait in TestQueue with capacity two, then move individually through Test operation to TestCompleted. For this mechanical test only, the operation is enabled by a true predicate; execution timing is unknown. No actual inventory is claimed.";
const correctedMarkdown =
  "# TEST synthetic corrected workpiece\n\nTestQueue capacity is three, not two. Test operation is paused with a false predicate for this test condition. Items still move individually to TestCompleted when enabled. Execution timing and actual inventory remain unknown.";
const answers: Record<string, unknown>[] = [];
try {
  await page.goto(`${origin}/?brunchTracer=root-creation`);
  await page.getByRole("button", { name: "Skip tour" }).click();
  await page
    .getByRole("button", { name: "Show AI assistant", exact: true })
    .click();
  const send = async (body: string, done: string) => {
    const composer = page.getByRole("textbox", {
      name: "Message AI assistant",
      exact: true,
    });
    await composer.fill(body);
    await composer.press("Enter");
    try {
      await page.getByText(done, { exact: true }).waitFor({ timeout: 30_000 });
    } finally {
      assert.deepEqual(
        callbackErrors,
        [],
        "Callback assertions must reach the outer oracle",
      );
    }
  };
  assert.equal(
    deliveries.length,
    0,
    "No prepared bootstrap or initial workpiece",
  );
  faux.setResponses([
    ...settle(firstMarkdown, "creation-revision-one"),
    mutate("addPlace", "creation-queue", (definition) => {
      assert.equal(
        definition.places.length,
        process.env.M7_FALSIFY_EMPTY_ASSERTION === "1" ? 1 : 0,
        "Real first read must be empty",
      );
      assert.equal(definition.transitions.length, 0);
      return queue;
    }),
    afterMutation("addPlace", "creation-read-queue"),
    mutate("addPlace", "creation-completed", (definition) => {
      assert.equal(definition.places[0]?.id, queue.id);
      return completedPlace;
    }),
    afterMutation("addPlace", "creation-read-places"),
    mutate("addTransition", "creation-step", (definition) => {
      assert.equal(definition.places.length, 2);
      return step;
    }),
    afterMutation("addTransition", "creation-read-step"),
    mutate("addArc", "creation-input", (definition) => ({
      transitionId: definition.transitions[0]!.id,
      placeId: definition.places.find((entry) => entry.name === queue.name)!.id,
      arcDirection: "input",
      type: "standard",
      weight: "1",
    })),
    afterMutation("addArc", "creation-read-input"),
    mutate("addArc", "creation-output", (definition) => ({
      transitionId: definition.transitions[0]!.id,
      placeId: definition.places.find(
        (entry) => entry.name === completedPlace.name,
      )!.id,
      arcDirection: "output",
      weight: 1,
    })),
    afterMutation("addArc", "creation-read-connected"),
    checked((context) => {
      assert.equal(
        browserResult(context, "getLatestNetDefinition").metadata?.observation
          ?.observed.definition.transitions[0]?.outputArcs.length,
        1,
      );
      return tool("getNetCompilationErrors", {}, "creation-check");
    }),
    checked((context) => {
      const result = browserResult(context, "getNetCompilationErrors");
      save("compilation", result);
      assert.equal(
        result.output,
        "No errors detected in your model – everything compiles!",
      );
      return text("Native creation and canonical check completed.");
    }),
  ]);
  await send(
    "TEST synthetic account: waiting items have a limit of two and move one at a time to a completed state after an operation. For this test condition the operation is enabled. Timing and actual inventory are unknown.",
    "Native creation and canonical check completed.",
  );
  assert.equal(completed, 14);
  const stored = await page.evaluate(() => {
    const document = (
      JSON.parse(localStorage.getItem("petrinaut-sdcpn") ?? "{}") as Record<
        string,
        { id: string; incarnationId: string; sdcpn: unknown }
      >
    )["synthetic-root-creation-v1"];
    const key = Object.keys(localStorage).find((entry) =>
      entry.includes("principal"),
    );
    if (!document || !key) throw new Error("Missing actual host binding");
    const raw = localStorage.getItem(key) ?? "";
    return {
      document,
      principalKey: raw.startsWith('"') ? (JSON.parse(raw) as string) : raw,
    };
  });
  const identity = {
    principalKey: stored.principalKey,
    conversationId: `root-creation-candidate-v1:${stored.document.incarnationId}`,
  };
  const client = createFlueClient({
    url: `${origin}/agents/chat/${flueConversationIdFrom(identity)}`,
    headers: agentOwnershipHeaders(identity),
  });
  const firstRequest = JSON.parse(deliveries[0]!.body) as {
    kind: string;
    initialData: unknown;
  };
  assert.equal(firstRequest.kind, "user");
  assert.deepEqual(firstRequest.initialData, {
    mode: conversationConstructionMode,
    construction: {
      binding: {
        conversationId: identity.conversationId,
        documentId: stored.document.id,
        incarnationId: stored.document.incarnationId,
      },
    },
  });
  faux.setResponses([
    ...settle(correctedMarkdown, "creation-revision-two"),
    mutate("updatePlace", "creation-capacity", (definition) => ({
      placeId: definition.places.find((entry) => entry.name === queue.name)!.id,
      update: { capacity: 3 },
    })),
    afterMutation("updatePlace", "creation-read-capacity"),
    mutate("updateTransition", "creation-pause", (definition) => ({
      transitionId: definition.transitions[0]!.id,
      update: { lambdaCode: "export default Lambda(() => false);" },
    })),
    afterMutation("updateTransition", "creation-read-correction"),
    checked((context) =>
      tool(
        "brunch_why",
        {
          kind: "place",
          name: queue.name,
          field: "capacity",
          observationToolCallId: browserResult(
            context,
            "getLatestNetDefinition",
          ).metadata!.observation!.toolCallId,
        },
        "creation-why-capacity",
      ),
    ),
    checked((context) => {
      const answer = toolOutput(context, "brunch_why");
      answers.push(answer);
      assert.equal(answer.disposition, "partially-supported");
      assert.equal(answer.originToolCallId, "creation-queue");
      assert.equal(
        (answer.recordedChange as { toolCallId: string }).toolCallId,
        "creation-capacity",
      );
      assert.equal(
        (answer.governing as { revisionId: string }).revisionId,
        "creation-revision-two",
      );
      return tool(
        "brunch_why",
        { kind: "transition", name: step.name, field: "lambdaCode" },
        "creation-why-pause",
      );
    }),
    checked((context) => {
      const answer = toolOutput(context, "brunch_why");
      answers.push(answer);
      assert.equal(answer.disposition, "partially-supported");
      assert.equal(answer.originToolCallId, "creation-step");
      assert.equal(
        (answer.recordedChange as { toolCallId: string }).toolCallId,
        "creation-pause",
      );
      return tool(
        "brunch_why",
        { kind: "place", name: queue.name, field: "entity" },
        "creation-why-entity",
      );
    }),
    checked((context) => {
      const answer = toolOutput(context, "brunch_why");
      answers.push(answer);
      assert.equal(answer.originToolCallId, "creation-queue");
      assert.equal(answer.disposition, "refused");
      assert.equal(answer.governing, undefined);
      return tool(
        "brunch_why",
        { kind: "transition", name: step.name, field: "inputArcs" },
        "creation-why-input-arcs",
      );
    }),
    checked((context) => {
      const answer = toolOutput(context, "brunch_why");
      answers.push(answer);
      assert.equal(answer.disposition, "refused");
      assert.match(String(answer.reason), /aggregate.*descendant/iu);
      assert.equal(answer.originToolCallId, "creation-step");
      assert.equal(answer.governing, undefined);
      assert.equal(answer.recordedChange, undefined);
      return tool(
        "brunch_why",
        { kind: "transition", name: step.name, field: "outputArcs" },
        "creation-why-output-arcs",
      );
    }),
    checked((context) => {
      const answer = toolOutput(context, "brunch_why");
      answers.push(answer);
      assert.equal(answer.disposition, "refused");
      assert.match(String(answer.reason), /aggregate.*descendant/iu);
      assert.equal(answer.originToolCallId, "creation-step");
      assert.equal(answer.governing, undefined);
      assert.equal(answer.recordedChange, undefined);
      return text("Native correction and ordinary-name why completed.");
    }),
  ]);
  await send(
    "TEST synthetic correction: the waiting limit is three, not two, and the operation is paused for this test. Timing and actual inventory remain unknown.",
    "Native correction and ordinary-name why completed.",
  );
  assert.equal(completed, 26);
  const history = await client.history();
  save("history", history);
  save("why", answers);
  const results = clientToolHistoryFrom(history.messages).results;
  const records = results.filter(
    (result) =>
      (result.metadata as { mutationRecord?: unknown } | undefined)
        ?.mutationRecord,
  );
  assert.equal(records.length, 7);
  for (const result of records) {
    const record = (
      result.metadata as { mutationRecord: ConstructionMutationRecord }
    ).mutationRecord;
    assert.equal(record.outcome, "applied");
    for (const attempt of record.attempts) await verifyMutationAttempt(attempt);
  }
  save("records", records);
  for (const name of observedNodeMutationNames) {
    const tools = captures.flatMap((capture) =>
      capture.serialized.tools.filter((entry) => entry.name === name),
    );
    assert(tools.length > 0);
    for (const entry of tools)
      assert.deepEqual(
        entry.input_schema,
        observedNodeInputSchema(name).toJSONSchema({ io: "input" }),
      );
  }
  save("same-session-summary", {
    completed,
    requests: contexts.length,
    applied: records.length,
    schemaClasses: observedNodeMutationNames,
    compilation: "No errors detected in your model – everything compiles!",
    scope:
      "Same-session synthetic creation/correction only; reopen assertion follows.",
  });
  await page.screenshot({ path: join(output, "creation.png"), fullPage: true });
  const originalDelivery = deliveries
    .map(
      (entry) =>
        JSON.parse(entry.body) as DeliveredMessage & { idempotencyKey: string },
    )
    .find(
      (entry) =>
        entry.kind === "signal" &&
        entry.body.includes('"toolCallId":"creation-capacity"'),
    );
  assert(originalDelivery);
  const beforeDuplicate = contexts.length;
  const { idempotencyKey, ...duplicateMessage } = originalDelivery;
  await client.wait(
    await client.send({ idempotencyKey, message: duplicateMessage }),
  );
  assert.equal(
    contexts.length,
    beforeDuplicate,
    "Duplicate node result must not continue or execute again",
  );
  const afterDuplicate = clientToolHistoryFrom(
    (await client.history()).messages,
  ).results;
  assert.equal(
    afterDuplicate.filter((entry) => entry.toolCallId === "creation-capacity")
      .length,
    1,
  );
  save("duplicate-result", {
    toolCallId: "creation-capacity",
    idempotencyKey,
    beforeRequests: beforeDuplicate,
    afterRequests: contexts.length,
    canonicalResults: 1,
  });
  // New native names must remain browser-classified at the real admission registration.
  const beforeMixed = contexts.length;
  faux.setResponses([
    fauxAssistantMessage(
      [
        fauxToolCall("addPlace", queue, { id: "creation-mixed-place" }),
        fauxToolCall(
          "mutate_workpiece",
          { markdown: "TEST forbidden sibling" },
          { id: "creation-mixed-revision" },
        ),
      ],
      { stopReason: "toolUse" },
    ),
  ]);
  await assert.rejects(async () =>
    client.wait(
      await client.send({
        message: {
          kind: "user",
          body: "TEST reject node plus revision proposal.",
        },
      }),
    ),
  );
  assert.equal(contexts.length, beforeMixed + 1);
  assert(
    !(await client.history()).messages
      .flatMap((message) => message.parts)
      .some(
        (part) =>
          part.type === "dynamic-tool" &&
          part.toolCallId.startsWith("creation-mixed-"),
      ),
  );
  const beforeMultiple = contexts.length;
  faux.setResponses([
    fauxAssistantMessage(
      [
        fauxToolCall(
          "getLatestNetDefinition",
          {},
          { id: "creation-multiple-read" },
        ),
        fauxToolCall("addTransition", step, { id: "creation-multiple-node" }),
      ],
      { stopReason: "toolUse" },
    ),
  ]);
  await assert.rejects(
    async () =>
      client.wait(
        await client.send({
          message: {
            kind: "user",
            body: "TEST refuse a read and node mutation in one browser proposal.",
          },
        }),
      ),
    /browser/iu,
  );
  assert.equal(contexts.length, beforeMultiple + 1);
  const multipleHistory = await client.history();
  assert(
    !multipleHistory.messages
      .flatMap((message) => message.parts)
      .some(
        (part) =>
          part.type === "dynamic-tool" &&
          part.toolCallId.startsWith("creation-multiple-"),
      ),
  );
  save("multiple-browser-history", multipleHistory);
  // A real preceding read is retained for each refusal; no synthetic success/base IDs.
  let envelope: Record<string, unknown> | undefined;
  const readEnvelope = (id: string) => [
    tool("getLatestNetDefinition", {}, id),
    checked((context) => {
      const observation = browserResult(context, "getLatestNetDefinition")
        .metadata?.observation;
      assert(observation && basis);
      envelope = {
        basis,
        observationToolCallId: observation.toolCallId,
        requestedBaseHash: observation.observed.sha256,
      };
      save(id, observation);
      return text(`${id} complete.`);
    }),
  ];
  const rejected = (
    name: string,
    id: string,
    input: Record<string, unknown>,
    pattern: RegExp,
  ) => {
    assert(envelope);
    return [
      tool(name, { ...input, brunch: envelope }, id),
      checked((context) => {
        const result = context.messages.findLast(
          (message) =>
            message.role === "toolResult" && message.toolName === name,
        );
        assert(result?.role === "toolResult" && result.isError);
        assert.match(JSON.stringify(result.content), pattern);
        return text(`${id} refused.`);
      }),
    ];
  };
  faux.setResponses(readEnvelope("creation-controls-read"));
  await send("TEST read before controls.", "creation-controls-read complete.");
  faux.setResponses(
    rejected("addPlace", "creation-duplicate", queue, /Duplicate/),
  );
  await send(
    "TEST refuse duplicate node identity.",
    "creation-duplicate refused.",
  );
  const correctEnvelope = envelope;
  envelope = { ...envelope, observationToolCallId: "unknown-observation" };
  faux.setResponses(
    rejected(
      "updatePlace",
      "creation-unknown",
      { placeId: queue.id, update: { capacity: 4 } },
      /Unknown/,
    ),
  );
  await send("TEST refuse unknown read.", "creation-unknown refused.");
  envelope = correctEnvelope;
  faux.setResponses([
    tool(
      "updatePlace",
      { placeId: queue.id, update: { capacity: 3 }, brunch: envelope },
      "creation-no-op",
    ),
    checked((context) => {
      const result = browserResult(context, "updatePlace");
      assert.partialDeepStrictEqual(result.output, { applied: false });
      assert.equal(result.metadata?.mutationRecord?.outcome, "no-op");
      return text("Unchanged node is not a change.");
    }),
  ]);
  await send("TEST no-op correction.", "Unchanged node is not a change.");
  const selection = new URL(page.url());
  selection.searchParams.set("itemType", "place");
  selection.searchParams.set("itemId", queue.id);
  save(
    "storage-before-reopen",
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("petrinaut-sdcpn") ?? "{}") as unknown,
    ),
  );
  await page.goto(selection.href);
  await page
    .getByRole("button", { name: "Show AI assistant", exact: true })
    .click();
  faux.setResponses(readEnvelope("creation-pre-edit-read"));
  await send(
    "TEST read before external edit.",
    "creation-pre-edit-read complete.",
  );
  const reopenedHistory = await client.history();
  save("reopen-history", reopenedHistory);
  const rawReopenResult = clientToolHistoryFrom(
    reopenedHistory.messages,
  ).results.find((entry) => entry.toolCallId === "creation-pre-edit-read");
  assert(rawReopenResult);
  save("raw-reopen-result", rawReopenResult);
  const rawObservation = (rawReopenResult.metadata as BrowserResult["metadata"])
    ?.observation;
  assert(rawObservation);
  const verifiedReopen = await verifyDefinitionObservation(
    rawObservation.observed,
  );
  assert.equal(
    verifiedReopen.definition.places.find((entry) => entry.id === queue.id)
      ?.capacity,
    3,
    "Reopen must preserve the canonically created/corrected capacity before any deliberate hand edit",
  );
  const lastAppliedResult = records.find(
    (entry) => entry.toolCallId === "creation-pause",
  );
  assert(lastAppliedResult);
  const lastApplied = (
    lastAppliedResult.metadata as {
      mutationRecord: ConstructionMutationRecord;
    }
  ).mutationRecord.attempts[0]?.post;
  assert(lastApplied);
  assert.equal(
    canonicalContent(verifiedReopen.definition),
    canonicalContent(lastApplied.definition),
    "Reopening must preserve the complete observed definition, not just capacity",
  );
  save("reopen-equivalence", {
    recordedSha256: lastApplied.sha256,
    reopenedSha256: verifiedReopen.sha256,
    fullContentEqual: true,
  });
  const reopenedAnswers: Record<string, unknown>[] = [];
  let reopenedObservationId: string | undefined;
  faux.setResponses([
    tool("getLatestNetDefinition", {}, "creation-reopened-why-read"),
    checked((context) => {
      const observation = browserResult(context, "getLatestNetDefinition")
        .metadata?.observation;
      assert(observation);
      reopenedObservationId = observation.toolCallId;
      return tool(
        "brunch_why",
        {
          kind: "place",
          name: queue.name,
          field: "capacity",
          observationToolCallId: observation.toolCallId,
        },
        "creation-reopened-capacity-why",
      );
    }),
    checked((context) => {
      const answer = toolOutput(context, "brunch_why");
      reopenedAnswers.push(answer);
      assert.equal(answer.disposition, "partially-supported");
      assert.equal(answer.originToolCallId, "creation-queue");
      assert.equal(
        (answer.recordedChange as { toolCallId: string }).toolCallId,
        "creation-capacity",
      );
      assert.equal(
        (answer.governing as { revisionId: string }).revisionId,
        "creation-revision-two",
      );
      assert.deepEqual(
        (answer.appliedChanges as { toolCallId: string }[]).map(
          (entry) => entry.toolCallId,
        ),
        ["creation-queue", "creation-capacity"],
      );
      assert(
        (answer.attempts as { toolCallId: string; outcome: string }[]).some(
          (entry) =>
            entry.toolCallId === "creation-no-op" && entry.outcome === "no-op",
        ),
      );
      return tool(
        "brunch_why",
        {
          kind: "transition",
          name: step.name,
          field: "lambdaCode",
          observationToolCallId: reopenedObservationId,
        },
        "creation-reopened-code-why",
      );
    }),
    checked((context) => {
      const answer = toolOutput(context, "brunch_why");
      reopenedAnswers.push(answer);
      assert.equal(answer.disposition, "partially-supported");
      assert.equal(answer.originToolCallId, "creation-step");
      assert.equal(
        (answer.recordedChange as { toolCallId: string }).toolCallId,
        "creation-pause",
      );
      assert.equal(
        (answer.governing as { revisionId: string }).revisionId,
        "creation-revision-two",
      );
      return text(
        "Reopened node field explanations retain their original causes.",
      );
    }),
  ]);
  await send(
    "TEST explain the preserved capacity and paused operation after reopening, before any external edit.",
    "Reopened node field explanations retain their original causes.",
  );
  assert.equal(reopenedAnswers.length, 2);
  const positiveReopenHistory = await client.history();
  const positiveRead = clientToolHistoryFrom(
    positiveReopenHistory.messages,
  ).results.find((entry) => entry.toolCallId === reopenedObservationId);
  assert(positiveRead);
  const positiveObservation = (
    positiveRead.metadata as BrowserResult["metadata"]
  )?.observation;
  assert(positiveObservation);
  const verifiedPositive = await verifyDefinitionObservation(
    positiveObservation.observed,
  );
  assert.equal(
    canonicalContent(verifiedPositive.definition),
    canonicalContent(lastApplied.definition),
  );
  save("reopened-why", reopenedAnswers);
  save("positive-reopen-history", positiveReopenHistory);
  for (const [index, answer] of reopenedAnswers.entries()) {
    const reconciliation = answer.reconciliation as {
      status: string;
      sha256: string;
      recordedSha256: string;
      observationScope: string;
      observationToolCallId: string;
    };
    assert.equal(
      reconciliation.status,
      lastApplied.sha256 === verifiedPositive.sha256
        ? index === 0
          ? "live-observed"
          : "as-of"
        : "serialization-equivalent",
    );
    assert.equal(reconciliation.sha256, verifiedPositive.sha256);
    assert.equal(reconciliation.recordedSha256, lastApplied.sha256);
    assert.equal(reconciliation.observationToolCallId, reopenedObservationId);
    // Only the first query is in the active read-result delivery. Reusing that
    // observation in a subsequent server turn must retain its narrower as-of scope.
    assert.equal(
      reconciliation.observationScope,
      index === 0 ? "live-observed" : "as-of",
    );
  }
  await page.screenshot({
    path: join(output, "reopened-why.png"),
    fullPage: true,
  });
  const capacity = page.getByRole("spinbutton");
  await capacity.fill("4");
  await capacity.press("Tab");
  await page.getByText(/Live document hash differs/).waitFor();
  faux.setResponses([
    tool(
      "updatePlace",
      { placeId: queue.id, update: { capacity: 5 }, brunch: envelope },
      "creation-stale",
    ),
    checked((context) => {
      const result = browserResult(context, "updatePlace");
      assert.partialDeepStrictEqual(result.output, { applied: false });
      assert.equal(result.metadata?.mutationRecord?.outcome, "stale");
      return text("Stale node correction was not applied.");
    }),
  ]);
  await send(
    "TEST refuse stale node base.",
    "Stale node correction was not applied.",
  );
  assert.equal(await capacity.inputValue(), "4");
  await page
    .getByRole("button", { name: /Not applied.*requested base/ })
    .waitFor();
  await page.screenshot({ path: join(output, "stale.png"), fullPage: true });
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  faux.setResponses(readEnvelope("creation-retired-read"));
  await send(
    "TEST observe actual external deletion.",
    "creation-retired-read complete.",
  );
  faux.setResponses(rejected("addPlace", "creation-retired", queue, /retired/));
  await send(
    "TEST refuse reuse of verified retired identity.",
    "creation-retired refused.",
  );
  faux.setResponses([
    tool(
      "brunch_why",
      {
        kind: "place",
        name: queue.name,
        field: "capacity",
        observationToolCallId: envelope?.observationToolCallId,
      },
      "creation-external-why",
    ),
    checked((context) => {
      const answer = toolOutput(context, "brunch_why");
      save("external-why", answer);
      assert.equal(answer.disposition, "refused");
      assert.match(String(answer.reason), /Unrecorded/);
      return text("External changes and attempts are not conversation causes.");
    }),
  ]);
  await send(
    "TEST explain the externally changed/deleted node honestly.",
    "External changes and attempts are not conversation causes.",
  );
  const controlHistory = await client.history();
  save("control-history", controlHistory);
  const controlResults = clientToolHistoryFrom(controlHistory.messages).results;
  for (const id of [
    "creation-duplicate",
    "creation-unknown",
    "creation-retired",
  ])
    assert(
      !controlResults.some((result) => result.toolCallId === id),
      `${id} must refuse before browser execution`,
    );
  for (const id of ["creation-no-op", "creation-stale"]) {
    const result = controlResults.find((entry) => entry.toolCallId === id);
    assert(result);
    for (const attempt of (
      result.metadata as { mutationRecord: ConstructionMutationRecord }
    ).mutationRecord.attempts)
      await verifyMutationAttempt(attempt);
  }
  const controlRecords = controlResults.filter(
    (entry) =>
      (entry.metadata as { mutationRecord?: unknown } | undefined)
        ?.mutationRecord,
  );
  assert.equal(
    controlRecords.length,
    9,
    "Seven applied, one no-op and one stale record; rejected mutations never gain browser outcomes",
  );
  const original = records[0];
  assert(original);
  for (const variant of ["foreign", "conflicting"] as const) {
    const record = structuredClone(
      (original.metadata as { mutationRecord: ConstructionMutationRecord })
        .mutationRecord,
    );
    if (variant === "foreign")
      for (const attempt of record.attempts) {
        attempt.binding.incarnationId = "foreign";
        attempt.request.binding.incarnationId = "foreign";
      }
    else {
      record.outcome = "unknown";
      record.attempts[0]!.outcome = "unknown";
    }
    const before = contexts.length;
    await assert.rejects(
      async () =>
        client.wait(
          await client.send({
            message: {
              kind: "signal",
              type: CLIENT_TOOL_RESULT_SIGNAL,
              tagName: CLIENT_TOOL_RESULT_SIGNAL,
              body: JSON.stringify([
                { ...original, metadata: { mutationRecord: record } },
              ]),
            },
          }),
        ),
      (error: unknown) =>
        error instanceof FlueExecutionError && error.failure === "failed",
    );
    assert.equal(
      contexts.length,
      before,
      `${variant} result must not continue`,
    );
    save(`${variant}-result-verdict`, {
      beforeRequests: before,
      afterRequests: contexts.length,
      failedSubmission: true,
    });
    save(`${variant}-result-history`, await client.history());
  }
  assert.equal(completed, 38, "Every planned callback assertion must complete");
  assert.deepEqual(errors, []);
  assert.deepEqual(blocked, []);
  assert.deepEqual(callbackErrors, []);
  save("summary", {
    completed,
    requests: contexts.length,
    applied: records.length,
    errors,
    blocked,
    callbackErrors,
  });
  process.stdout.write(
    `${JSON.stringify({ output, completed, requests: contexts.length, applied: records.length })}\n`,
  );
} finally {
  save("requests", captures);
  save("deliveries", deliveries);
  save("errors", { errors, blocked, callbackErrors });
  await page
    .screenshot({ path: join(output, "final.png"), fullPage: true })
    .catch(() => undefined);
  await browser.close();
  await app.stop();
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  globalThis.fetch = fetchOriginal;
}
