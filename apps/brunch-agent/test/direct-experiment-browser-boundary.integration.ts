/** Canonical experiment through the built I-mode browser and server, with faux provider only. */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { createFlueClient } from "@flue/sdk";

import { INTEGRATED_BRUNCH_MODE } from "@hashintel/brunch-agent-plugin-sdcpn";
import { type SDCPN } from "@hashintel/petrinaut-core";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../src/conversation/identity.ts";
import { netCalls } from "../src/conversation/net-changes.ts";
import { installFauxProvider } from "../src/evaluations/install-faux-provider.ts";
import { openBrowserFixture } from "./browser-fixture.ts";
import { loadBuiltBrunchApplication } from "./load-built-application.ts";
import { nativeSchemaProvider } from "./native-schema-provider.ts";

process.env.NODE_ENV = "test";
process.env.BRUNCH_CHAT_MODEL = "claude-sonnet-4-6";
process.env.BRUNCH_DEV_DB_PATH = join(
  mkdtempSync(join(tmpdir(), "direct-experiment-browser-")),
  "conversation.db",
);
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
try {
  fixture = await openBrowserFixture(app, resolve("../petrinaut-website/dist"));
  const { page, origin, deliveries, errors, blocked } = fixture;
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
  const call = (name: string, args: Record<string, unknown>, id: string) =>
    fauxAssistantMessage([fauxToolCall(name, args, { id })], {
      stopReason: "toolUse",
    });
  faux.setResponses([
    call("getLatestNetDefinition", {}, "read-1"),
    call("createExperiment", experiment, "experiment-1"),
    fauxAssistantMessage([fauxText("Direct experiment finished.")]),
  ]);
  const composer = page.getByRole("textbox", {
    name: "Message AI assistant",
    exact: true,
  });
  await composer.fill(
    "Read the net, then run the canonical baseline experiment for two runs.",
  );
  await composer.press("Enter");
  await page
    .getByText("Direct experiment finished.", { exact: true })
    .waitFor({ timeout: 40_000 });
  const first = JSON.parse(deliveries[0]?.body ?? "null") as {
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
  };
  assert.equal(first.initialData?.mode, INTEGRATED_BRUNCH_MODE);
  const binding = first.initialData.construction?.binding;
  assert(binding);
  const principalKey = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((entry) =>
      entry.includes("principal"),
    );
    const raw = key === undefined ? null : localStorage.getItem(key);
    return raw?.startsWith('"') ? (JSON.parse(raw) as string) : raw;
  });
  assert(principalKey);
  const identity = { principalKey, conversationId: binding.conversationId };
  const client = createFlueClient({
    url: `${origin}/agents/chat/${flueConversationIdFrom(identity)}`,
    headers: agentOwnershipHeaders(identity),
  });
  const calls = netCalls(await client.history());
  const read = calls.find(({ toolCallId }) => toolCallId === "read-1");
  const result = calls.find(({ toolCallId }) => toolCallId === "experiment-1");
  assert(read && result);
  assert.equal(read.revisionBefore, "experiment-revision");
  assert.equal(result.revisionBefore, "experiment-revision");
  assert.equal(result.revisionAfter, undefined);
  assert.deepEqual(result.input, experiment);
  assert.equal((result.output as { status: string }).status, "complete");
  const stored = await page.evaluate(
    (documentId) =>
      (
        JSON.parse(localStorage.getItem("petrinaut-sdcpn") ?? "{}") as Record<
          string,
          { revisionId: string; sdcpn: SDCPN }
        >
      )[documentId],
    binding.documentId,
  );
  assert.equal(stored?.revisionId, "experiment-revision");
  assert.deepEqual(stored.sdcpn, definition);
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
