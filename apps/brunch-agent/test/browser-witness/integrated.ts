/**
 * Manual witness: the built integrated-mode website in real Chrome against the
 * built Brunch app, with scripted OpenAI responses only. Each case runs its own
 * conversation in a fresh browser context.
 */
import assert from "node:assert/strict";

import {
  fauxAssistantMessage,
  fauxText,
  type Context,
} from "@earendil-works/pi-ai";

import { brunchModes } from "@hashintel/brunch-agent";
import { clientToolHistoryFrom } from "@hashintel/brunch-agent-transport-aisdk";

import {
  isAppliedChange,
  netCalls,
} from "../../src/conversation/net-changes.ts";
import { loadBuiltBrunchApplication } from "../load-built-application.ts";
import {
  installFauxOpenai,
  openaiCallId,
  openBrowserFixture,
  prepareWitnessProcess,
  toolCall,
} from "./browser-fixture.ts";

import type { SDCPN } from "@hashintel/petrinaut-core";

prepareWitnessProcess("integrated-browser-witness");
const faux = installFauxOpenai();

const app = await loadBuiltBrunchApplication();
const fixture = await openBrowserFixture(app);

const experimentNet: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
  scenarios: [
    {
      id: "baseline",
      name: "Baseline",
      scenarioParameters: [],
      parameterOverrides: {},
      initialState: { type: "per_place", content: {} },
    },
  ],
  metrics: [{ id: "throughput", name: "Throughput", code: "return 1;" }],
};
const savedDocument = (id: string, sdcpn: SDCPN) => ({
  [id]: {
    id,
    incarnationId: `${id}-incarnation`,
    revisionId: `${id}-revision`,
    title: "Queue",
    lastUpdated: "2020-01-01T00:00:00.000Z",
    sdcpn,
  },
});
const settledResult = (context: Context, toolName: string) => {
  const result = context.messages.findLast(
    (message) => message.role === "toolResult" && message.toolName === toolName,
  );
  assert(result?.role === "toolResult" && !result.isError);
};

/** Canonical construction and compiler diagnostics, settled into browser storage and Flue history. */
const canonicalConstruction = async () => {
  const dirtyCode = "return definitelyNotDefined;";
  const repairedCode = "return tokens.map(({ level }) => ({ level: -level }));";
  const page = await fixture.openAssistant();
  const order = [
    "read-before",
    "type-1",
    "equation-dirty",
    "place-1",
    "diagnostics-dirty",
    "equation-repair",
    "diagnostics-clean",
    "read-after",
  ];
  faux.setResponses([
    toolCall("getLatestNetDefinition", {}, "read-before"),
    toolCall(
      "addType",
      {
        id: "item",
        name: "Item",
        iconSlug: "circle",
        displayColor: "#1E90FF",
        elements: [{ elementId: "level", name: "level", type: "real" }],
        targetSubnetId: null,
      },
      "type-1",
    ),
    toolCall(
      "addDifferentialEquation",
      {
        id: "decay",
        name: "Decay",
        colorId: "item",
        code: dirtyCode,
        targetSubnetId: null,
      },
      "equation-dirty",
    ),
    toolCall(
      "addPlace",
      {
        id: "store",
        name: "Store",
        colorId: "item",
        dynamicsEnabled: true,
        differentialEquationId: "decay",
        x: 0,
        y: 0,
        targetSubnetId: null,
      },
      "place-1",
    ),
    toolCall("getNetCompilationErrors", {}, "diagnostics-dirty"),
    toolCall(
      "updateDifferentialEquation",
      {
        equationId: "decay",
        update: { code: repairedCode },
        targetSubnetId: null,
      },
      "equation-repair",
    ),
    toolCall("getNetCompilationErrors", {}, "diagnostics-clean"),
    toolCall("getLatestNetDefinition", {}, "read-after"),
    fauxAssistantMessage([fauxText("Canonical construction finished.")]),
  ]);
  const delivery = await fixture.ask(
    page,
    "Add an item type, a deliberately invalid decay equation and a place using it; check diagnostics, repair the equation, check again and read the result.",
    "Canonical construction finished.",
    60_000,
  );
  assert.equal(delivery.kind, "user");
  assert.equal(delivery.initialData?.mode, brunchModes.integrated);
  const { binding, client } = await fixture.conversationOf(page, delivery);
  const calls = netCalls(await client.history());
  assert.deepEqual(
    calls.map(({ toolCallId }) => toolCallId),
    order.map(openaiCallId),
  );
  const call = (id: string) => {
    const found = calls.find(
      ({ toolCallId }) => toolCallId === openaiCallId(id),
    );
    assert(found, `Missing ${id}`);
    return found;
  };
  const before = call("read-before");
  const repair = call("equation-repair");
  const after = call("read-after");
  assert.equal(before.revisionAfter, undefined);
  assert.equal(call("type-1").revisionBefore, before.revisionBefore);
  assert.equal(isAppliedChange(call("place-1")), true);
  assert.match(
    String(call("diagnostics-dirty").output),
    /definitelyNotDefined/u,
  );
  assert.equal(
    call("diagnostics-clean").output,
    "No errors or warnings found in net function code. Scenario and metric compilation is checked when creating an experiment.",
  );
  assert(repair.revisionAfter);
  assert.equal(after.revisionBefore, repair.revisionAfter);
  assert.equal(after.revisionAfter, undefined);
  assert.deepEqual(
    (after.output as { definition: SDCPN }).definition.places.map(
      ({ id }) => id,
    ),
    ["store"],
  );
  const stored = await fixture.storedDocument<{
    revisionId: string;
    incarnationId: string;
    sdcpn: SDCPN;
  }>(page, binding.documentId);
  assert.equal(stored?.incarnationId, binding.incarnationId);
  assert.equal(stored.revisionId, repair.revisionAfter);
  assert.deepEqual(
    stored.sdcpn.differentialEquations.map(({ id, code }) => ({ id, code })),
    [{ id: "decay", code: repairedCode }],
  );
};

/** A canonical experiment runs without changing the saved document. */
const directExperiment = async () => {
  const experiment = {
    name: "Queue baseline",
    scenarioId: "baseline",
    scenarioParameterValues: {},
    runCount: 2,
    seed: 42,
    dt: 1,
    maxTime: 1,
    metricIds: ["throughput"],
    execution: { mode: "simulate" },
  };
  const page = await fixture.openAssistant(
    "/",
    savedDocument("experiment-net", experimentNet),
  );
  faux.setResponses([
    toolCall("getLatestNetDefinition", {}, "read-1"),
    toolCall("createExperiment", experiment, "experiment-1"),
    fauxAssistantMessage([fauxText("Direct experiment finished.")]),
  ]);
  const delivery = await fixture.ask(
    page,
    "Read the net, then run the canonical baseline experiment for two runs.",
    "Direct experiment finished.",
    40_000,
  );
  assert.equal(delivery.initialData?.mode, brunchModes.integrated);
  const { binding, client } = await fixture.conversationOf(page, delivery);
  const calls = netCalls(await client.history());
  const read = calls.find(
    ({ toolCallId }) => toolCallId === openaiCallId("read-1"),
  );
  const result = calls.find(
    ({ toolCallId }) => toolCallId === openaiCallId("experiment-1"),
  );
  assert(read && result);
  assert.equal(read.revisionBefore, "experiment-net-revision");
  assert.equal(result.revisionBefore, "experiment-net-revision");
  assert.equal(result.revisionAfter, undefined);
  assert.deepEqual(result.input, experiment);
  assert.equal((result.output as { status: string }).status, "complete");
  const stored = await fixture.storedDocument<{
    revisionId: string;
    sdcpn: SDCPN;
  }>(page, binding.documentId);
  assert.equal(stored?.revisionId, "experiment-net-revision");
  assert.deepEqual(stored.sdcpn, experimentNet);
};

/** A drafted experiment reaches the real card, and Dismiss stays in the browser. */
const draftedExperiment = async () => {
  const page = await fixture.openAssistant(
    "/",
    savedDocument("draft-net", experimentNet),
  );
  faux.setResponses([
    toolCall("getLatestNetDefinition", {}, "read-1"),
    (context: Context) => {
      settledResult(context, "getLatestNetDefinition");
      return toolCall(
        "draft_petrinaut_experiment",
        {
          experiment: {
            name: "Baseline trial",
            scenarioId: "baseline",
            scenarioParameterValues: {},
            runCount: 20,
            seed: 42,
            dt: 1,
            maxTime: 1,
            metricIds: ["throughput"],
            execution: { mode: "simulate" },
          },
          declarations: [
            {
              subject: "result",
              statement: "Twenty runs do not establish a guarantee.",
            },
          ],
          unsupported: [],
        },
        "draft-1",
      );
    },
    (context: Context) => {
      settledResult(context, "draft_petrinaut_experiment");
      return fauxAssistantMessage([fauxText("Draft prepared, not run.")]);
    },
  ]);
  const delivery = await fixture.ask(
    page,
    "Read this saved net, then draft the baseline experiment for review.",
    "Draft prepared, not run.",
    90_000,
  );
  const card = page.getByRole("region", { name: "Drafted experiment" });
  await card
    .getByText("Drafted — not run · not saved with the document")
    .waitFor({ timeout: 30_000 });
  assert.equal(delivery.kind, "user");
  assert.equal(delivery.initialData?.mode, brunchModes.integrated);
  const { binding, client } = await fixture.conversationOf(page, delivery);
  assert.equal(binding.documentId, "draft-net");
  assert.equal(binding.incarnationId, "draft-net-incarnation");
  const history = await client.history();
  const results = clientToolHistoryFrom(history.messages).results;
  assert.deepEqual(
    results.map(({ toolName }) => toolName),
    ["getLatestNetDefinition", "draft_petrinaut_experiment"],
  );
  const draftResult = results.find(
    ({ toolCallId }) => toolCallId === openaiCallId("draft-1"),
  );
  assert.equal(
    (draftResult?.output as { status?: string } | undefined)?.status,
    "drafted",
  );
  assert.deepEqual(
    history.messages
      .flatMap((message) => message.parts)
      .filter((part) => part.type === "dynamic-tool")
      .map((part) => part.toolName),
    ["getLatestNetDefinition", "draft_petrinaut_experiment"],
  );
  const postsBeforeDismiss = fixture.deliveries.length;
  await card.getByRole("button", { name: "Dismiss" }).click();
  await card.getByText("Dismissed", { exact: true }).waitFor();
  assert.equal(
    fixture.deliveries.length,
    postsBeforeDismiss,
    "Dismiss must not POST to Flue",
  );
  assert.equal(
    clientToolHistoryFrom((await client.history()).messages).results.length,
    results.length,
  );
};

try {
  for (const witness of [
    canonicalConstruction,
    directExperiment,
    draftedExperiment,
  ]) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- The cases share one scripted response queue.
    await witness();
    process.stdout.write(`PASS ${witness.name}\n`);
  }
  assert.deepEqual(fixture.errors, []);
  assert.deepEqual(fixture.blocked, []);
  process.stdout.write("INTEGRATED_BROWSER_WITNESS_PASS\n");
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      errors: fixture.errors,
      blocked: fixture.blocked,
      deliveries: fixture.deliveries.map(({ path, body }) => ({
        path,
        body: body.slice(0, 800),
      })),
    })}\n`,
  );
  throw error;
} finally {
  try {
    await fixture.close();
  } finally {
    await app.stop();
  }
}
