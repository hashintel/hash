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
import { Hono } from "hono";

import { brunchModes } from "@hashintel/brunch-agent";
import { clientToolHistoryFrom } from "@hashintel/brunch-agent-transport-aisdk";

import {
  isAppliedChange,
  netCalls,
} from "../../src/conversation/net-changes.ts";
import { createWorkedModelNetProjectionRouter } from "../../src/http/worked-models.ts";
import {
  createInMemoryWorkedModelStore,
  type WorkedModelFixture,
} from "../../src/worked-model-store.ts";
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

const workedModel: WorkedModelFixture = {
  bundleKey: "inventory-purchasing",
  fixtureVersion: "net-projection-tracer-v1",
  sourceManifestSha256: "f".repeat(64),
  title: "Inventory purchasing net-projection tracer",
  session: {
    v: 1,
    conversationId: "fixture-source",
    offset: "fixture-offset",
    messages: [],
    settlements: [],
  },
  workpiece: "# Net-projection tracer\n\nOne receiving place.",
  definition: {
    places: [],
    transitions: [],
    types: [],
    parameters: [],
    differentialEquations: [],
  },
  revisionId: "net-projection-tracer-fixture-revision",
};
let nextCopyId = 0;
const workedModels = createInMemoryWorkedModelStore(
  () => `net-projection-tracer-${nextCopyId++}`,
);
await workedModels.seed([workedModel]);
const workedModelRoutes = new Hono().route(
  "/api/worked-models",
  createWorkedModelNetProjectionRouter(workedModels),
);

const built = await loadBuiltBrunchApplication();
const fixture = await openBrowserFixture({
  fetch: (request) =>
    new URL(request.url).pathname.startsWith("/api/worked-models/")
      ? workedModelRoutes.fetch(request)
      : built.fetch(request),
  stop: () => built.stop(),
});

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
    toolCall(
      "mutate_workpiece",
      {
        markdown:
          "Decision: observe baseline throughput for one time unit; no guarantee is established.",
        baseRevisionId: null,
      },
      "ledger-1",
    ),
    (context: Context) => {
      settledResult(context, "mutate_workpiece");
      return toolCall("getLatestNetDefinition", {}, "read-1");
    },
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
    "Record the decision, read this saved net, then draft the baseline experiment for review.",
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
    [
      "mutate_workpiece",
      "getLatestNetDefinition",
      "draft_petrinaut_experiment",
    ],
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

/**
 * An injected worked model: net mutation, reopen, clean net and principal
 * isolation. It does not prove build discovery, Postgres, retained fixture
 * session/workpiece hydration or provenance remapping.
 */
const workedModelNetProjection = async () => {
  const lookup = (principalKey: string) =>
    workedModels.resolveNetProjection({
      bundleKey: workedModel.bundleKey,
      principalKey,
    });
  const bundlePath = `/?bundle=${workedModel.bundleKey}`;
  const reply = "Worked-model net projection mutation completed.";
  const page = await fixture.openAssistant(bundlePath);
  faux.setResponses([
    toolCall(
      "addPlace",
      {
        id: "receiving",
        name: "Receiving",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 0,
        y: 0,
      },
      "place-1",
    ),
    fauxAssistantMessage([fauxText(reply)]),
  ]);
  await fixture.ask(page, "Add the receiving place.", reply, 60_000);
  const principalKey = await fixture.principalOf(page);
  const changed = await lookup(principalKey);
  assert.equal(changed?.definition.places[0]?.id, "receiving");

  await page.reload();
  await page
    .getByRole("button", { name: "Show AI assistant", exact: true })
    .click();
  await page.getByText(reply, { exact: true }).waitFor({ timeout: 30_000 });
  const reopened = await lookup(principalKey);
  assert.equal(reopened?.copyId, changed.copyId);
  assert.equal(reopened.definition.places[0]?.id, "receiving");

  await page.keyboard.press("Meta+k");
  await page
    .getByRole("button", {
      name: /Create a fresh net projection from this template/u,
    })
    .click();
  await page.waitForFunction(
    () => localStorage.getItem("brunch-principal-v1") !== null,
  );
  const clean = await lookup(principalKey);
  assert(clean);
  assert.notEqual(clean.copyId, changed.copyId);
  assert.equal(clean.definition.places.length, 0);

  const siblingPage = await fixture.openPage();
  try {
    await siblingPage.goto(`${fixture.origin}${bundlePath}`);
    await siblingPage.waitForFunction(
      () => localStorage.getItem("brunch-principal-v1") !== null,
    );
    const siblingPrincipal = await fixture.principalOf(siblingPage);
    assert.notEqual(siblingPrincipal, principalKey);
    const sibling = await lookup(siblingPrincipal);
    assert(sibling);
    assert.notEqual(sibling.copyId, clean.copyId);
    assert.equal(sibling.definition.places.length, 0);
  } finally {
    await siblingPage.context().close();
  }
};

try {
  for (const witness of [
    canonicalConstruction,
    directExperiment,
    draftedExperiment,
    workedModelNetProjection,
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
    await built.stop();
  }
}
