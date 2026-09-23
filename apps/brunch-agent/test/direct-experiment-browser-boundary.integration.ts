/** Canonical experiment through the built I-mode ChatAgent and real Petrinaut browser host. */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  type Context,
} from "@earendil-works/pi-ai";
import { createFlueClient } from "@flue/sdk";

import {
  parseClientToolResultMetadata,
  verifyExperimentRecord,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import { INTEGRATED_BRUNCH_MODE } from "@hashintel/brunch-agent-plugin-sdcpn/flue";
import { clientToolHistoryFrom } from "@hashintel/brunch-agent-transport-aisdk";
import { type SDCPN } from "@hashintel/petrinaut-core";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../src/conversation/identity.ts";
import { deriveNetFreshness } from "../src/conversation/net-freshness.ts";
import { deriveNetLedger } from "../src/conversation/net-ledger.ts";
import { installFauxProvider } from "../src/evaluations/install-faux-provider.ts";
import { loadBuiltBrunchApplication } from "../src/evaluations/runbook/load-built-application.ts";
import { openBrowserFixture } from "./browser-fixture.ts";
import { nativeSchemaProvider } from "./native-schema-provider.ts";

const output = mkdtempSync(join(tmpdir(), "direct-experiment-browser-"));
process.env.NODE_ENV = "test";
process.env.BRUNCH_CHAT_MODEL = "claude-sonnet-4-6";
process.env.BRUNCH_DEV_DB_PATH = join(output, "conversation.db");
delete process.env.HASH_OTLP_ENDPOINT;
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  assert.equal(
    new URL(input instanceof Request ? input.url : String(input)).hostname,
    "127.0.0.1",
  );
  return originalFetch(input, init);
};
const faux = fauxProvider({
  provider: "anthropic",
  models: [{ id: "claude-sonnet-4-6", reasoning: true }],
});
installFauxProvider(nativeSchemaProvider(faux.provider, [], []));
const app = await loadBuiltBrunchApplication();
let fixture: Awaited<ReturnType<typeof openBrowserFixture>> | undefined;
const definition: SDCPN = {
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
const tool = (name: string, args: Record<string, unknown>, id: string) =>
  fauxAssistantMessage([fauxToolCall(name, args, { id })], {
    stopReason: "toolUse",
  });
try {
  fixture = await openBrowserFixture(app, resolve("../petrinaut-website/dist"));
  const { page, origin, deliveries, errors, blocked } = fixture;
  const unexpectedHttpErrors: string[] = [];
  let initialHistoryAbsent = false;
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    // One history 404 before the first submission denotes a new conversation.
    if (
      response.status() === 404 &&
      /^\/agents\/chat\/[^/]+$/u.test(path) &&
      deliveries.length === 0 &&
      !initialHistoryAbsent
    ) {
      initialHistoryAbsent = true;
    } else if (response.status() >= 400) {
      unexpectedHttpErrors.push(`${response.status()} ${path}`);
    }
  });
  await page.addInitScript((definitionJson: string) => {
    localStorage.setItem("petrinaut-website:assistant", "brunch");
    localStorage.setItem(
      "petrinaut-sdcpn",
      JSON.stringify({
        "experiment-net": {
          id: "experiment-net",
          incarnationId: "experiment-incarnation",
          revisionId: "experiment-revision",
          title: "Queue",
          lastUpdated: "2020-01-01T00:00:00.000Z",
          sdcpn: JSON.parse(definitionJson) as unknown,
        },
      }),
    );
  }, JSON.stringify(definition));
  await page.goto(`${origin}/`);
  await page.getByRole("button", { name: "Skip tour" }).click();
  await page
    .getByRole("button", { name: "Show AI assistant", exact: true })
    .click();
  faux.setResponses([
    tool(
      "mutate_workpiece",
      {
        markdown:
          "# Queue baseline\n\nThe run is exploratory; no guarantee is established.",
        baseRevisionId: null,
      },
      "ledger-1",
    ),
    (context: Context) => {
      const settled = context.messages.findLast(
        (message) =>
          message.role === "toolResult" &&
          message.toolName === "mutate_workpiece",
      );
      assert(settled?.role === "toolResult" && !settled.isError);
      return tool("getLatestNetDefinition", {}, "read-1");
    },
    (context: Context) => {
      const read = context.messages.findLast(
        (message) =>
          message.role === "toolResult" &&
          message.toolName === "getLatestNetDefinition",
      );
      assert(read?.role === "toolResult" && !read.isError);
      return tool("createExperiment", experiment, "experiment-1");
    },
    (context: Context) => {
      const result = context.messages.findLast(
        (message) =>
          message.role === "toolResult" &&
          message.toolName === "createExperiment",
      );
      assert(result?.role === "toolResult" && !result.isError);
      return fauxAssistantMessage([fauxText("Direct experiment finished.")]);
    },
  ]);
  const composer = page.getByRole("textbox", {
    name: "Message AI assistant",
    exact: true,
  });
  await composer.fill(
    "Record that this is exploratory, read the current net, then immediately run the canonical baseline experiment for two runs and report its terminal result.",
  );
  await composer.press("Enter");
  await page
    .getByText("Direct experiment finished.", { exact: true })
    .waitFor({ timeout: 40_000 });

  const first = JSON.parse(deliveries[0]?.body ?? "null") as {
    kind?: string;
    initialData?: {
      mode?: string;
      construction?: {
        binding?: {
          conversationId: string;
          documentId: string;
          incarnationId: string;
        };
      };
    };
  } | null;
  assert.equal(first?.kind, "user");
  assert.equal(first.initialData?.mode, INTEGRATED_BRUNCH_MODE);
  const binding = first.initialData.construction?.binding;
  assert(binding, "Missing actual browser conversation binding");
  assert.equal(binding.documentId, "experiment-net");
  assert.equal(binding.incarnationId, "experiment-incarnation");
  const principalKey = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((entry) =>
      entry.includes("principal"),
    );
    const raw = key === undefined ? null : localStorage.getItem(key);
    return raw?.startsWith('"') ? (JSON.parse(raw) as string) : raw;
  });
  assert(principalKey, "Missing actual browser principal");
  const identity = { principalKey, conversationId: binding.conversationId };
  const client = createFlueClient({
    url: `${origin}/agents/chat/${flueConversationIdFrom(identity)}`,
    headers: agentOwnershipHeaders(identity),
  });
  const history = await client.history();
  const results = clientToolHistoryFrom(history.messages).results;
  const read = results.find(({ toolCallId }) => toolCallId === "read-1");
  const result = results.find(
    ({ toolCallId }) => toolCallId === "experiment-1",
  );
  assert(
    read && result,
    "Missing canonical browser read or experiment delivery",
  );
  assert.equal(read.toolName, "getLatestNetDefinition");
  assert.equal(result.toolName, "createExperiment");
  const issued = history.messages
    .flatMap((message) =>
      message.role === "assistant" && message.purpose === "assistant"
        ? message.parts
        : [],
    )
    .find(
      (part) =>
        part.type === "dynamic-tool" && part.toolCallId === "experiment-1",
    );
  assert(issued?.type === "dynamic-tool", "Missing issued canonical call");
  assert.deepEqual(issued.input, experiment);
  assert.equal(issued.state, "output-available");
  const ledgerRevision = history.messages
    .flatMap((message) =>
      message.role === "assistant" && message.purpose === "assistant"
        ? message.parts
        : [],
    )
    .find(
      (part) => part.type === "dynamic-tool" && part.toolCallId === "ledger-1",
    );
  assert(ledgerRevision?.type === "dynamic-tool");
  assert.equal(ledgerRevision.state, "output-available");
  const record = parseClientToolResultMetadata(
    result.metadata,
  )?.experimentRecord;
  assert(record, "Canonical experiment result lacks an experiment record");
  const verified = await verifyExperimentRecord({
    record,
    toolCallId: issued.toolCallId,
    canonicalInput: issued.input,
    canonicalOutput: result.output,
    binding,
  });
  assert.equal(verified.output.status, "complete");
  assert.equal(verified.output.runsCompleted, 2);
  assert.deepEqual(verified.output.metrics, [
    { id: "throughput", label: "Throughput", value: 1 },
  ]);
  assert.equal(verified.source.revisionId, "experiment-revision");
  assert.deepEqual(verified.source.definition, definition);
  assert.equal(
    parseClientToolResultMetadata(read.metadata)?.observation?.observed.sha256,
    verified.source.sha256,
  );
  const stored = await page.evaluate((documentId) => {
    const documents = JSON.parse(
      localStorage.getItem("petrinaut-sdcpn") ?? "{}",
    ) as Record<string, { revisionId: string; sdcpn: SDCPN }>;
    return documents[documentId];
  }, binding.documentId);
  assert.equal(stored?.revisionId, verified.source.revisionId);
  assert.deepEqual(
    stored.sdcpn,
    definition,
    "Experiment changed the saved net",
  );

  const events = await deriveNetLedger(history, { binding });
  assert.deepEqual(
    events.map(({ kind, toolCallId }) => ({ kind, toolCallId })),
    [
      { kind: "read", toolCallId: "read-1" },
      { kind: "experiment", toolCallId: "experiment-1" },
    ],
  );
  const experimentEvent = events.find((event) => event.kind === "experiment");
  assert(experimentEvent);
  assert.deepEqual(experimentEvent.output, verified.output);
  assert.equal(experimentEvent.source.sha256, verified.source.sha256);
  const beforeIndex = history.messages.findIndex(
    (message) =>
      message.role === "assistant" &&
      message.purpose === "assistant" &&
      message.parts.some(
        (part) =>
          part.type === "dynamic-tool" && part.toolCallId === "experiment-1",
      ),
  );
  assert(beforeIndex > 0, "Missing separate canonical experiment call");
  const before = {
    ...history,
    messages: history.messages.slice(0, beforeIndex),
  };
  assert.deepEqual(
    (await deriveNetLedger(before, { binding })).map(({ kind }) => kind),
    ["read"],
  );
  const freshness = await deriveNetFreshness(
    history,
    { binding },
    stored.revisionId,
  );
  assert.deepEqual(
    freshness,
    await deriveNetFreshness(before, { binding }, stored.revisionId),
  );
  assert.deepEqual(freshness, {
    kind: "current",
    hash: verified.source.sha256,
    revisionId: stored.revisionId,
  });
  assert.deepEqual(unexpectedHttpErrors, []);
  assert.deepEqual(errors, []);
  assert.deepEqual(blocked, []);
  process.stdout.write("DIRECT_EXPERIMENT_BROWSER_BOUNDARY_PASS\n");
} finally {
  if (fixture) {
    await fixture.browser.close();
    await new Promise<void>((done, reject) =>
      fixture?.server.close((error) => (error ? reject(error) : done())),
    );
  }
  await app.stop();
  globalThis.fetch = originalFetch;
}
