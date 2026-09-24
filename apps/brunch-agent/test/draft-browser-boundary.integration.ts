/** One built ChatAgent -> real Petrinaut panel draft, without a paid provider. */
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

import { INTEGRATED_BRUNCH_MODE } from "@hashintel/brunch-agent-plugin-sdcpn/flue";
import { clientToolHistoryFrom } from "@hashintel/brunch-agent-transport-aisdk";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../src/conversation/identity.ts";
import { installFauxProvider } from "../src/evaluations/install-faux-provider.ts";
import { openBrowserFixture } from "./browser-fixture.ts";
import { loadBuiltBrunchApplication } from "./load-built-application.ts";

const output = mkdtempSync(join(tmpdir(), "brunch-draft-browser-"));
const website = resolve(
  process.env.M7_WEBSITE_DIST ?? "../petrinaut-website/dist",
);
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
installFauxProvider(faux.provider);
const app = await loadBuiltBrunchApplication();
const { server, browser, page, origin, deliveries, errors, blocked } =
  await openBrowserFixture(app, website);
const tool = (name: string, args: Record<string, unknown>, id: string) =>
  fauxAssistantMessage([fauxToolCall(name, args, { id })], {
    stopReason: "toolUse",
  });
const markdown =
  "Decision: observe baseline throughput for one time unit; no guarantee is established.";
const proposal = {
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
};
try {
  await page.addInitScript(() => {
    localStorage.setItem("petrinaut-website:assistant", "brunch");
    localStorage.setItem(
      "petrinaut-sdcpn",
      JSON.stringify({
        "draft-net": {
          id: "draft-net",
          incarnationId: "draft-incarnation",
          revisionId: "draft-revision",
          title: "Queue",
          lastUpdated: "2020-01-01T00:00:00.000Z",
          sdcpn: {
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
            metrics: [
              { id: "throughput", name: "Throughput", code: "return 1;" },
            ],
          },
        },
      }),
    );
  });
  await page.goto(`${origin}/`);
  await page.getByRole("button", { name: "Skip tour" }).click();
  await page
    .getByRole("button", { name: "Show AI assistant", exact: true })
    .click();
  faux.setResponses([
    tool("mutate_workpiece", { markdown, baseRevisionId: null }, "ledger-1"),
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
      return tool("draft_petrinaut_experiment", proposal, "draft-1");
    },
    (context: Context) => {
      const draft = context.messages.findLast(
        (message) =>
          message.role === "toolResult" &&
          message.toolName === "draft_petrinaut_experiment",
      );
      assert(draft?.role === "toolResult" && !draft.isError);
      return fauxAssistantMessage([fauxText("Draft prepared, not run.")]);
    },
  ]);
  const composer = page.getByRole("textbox", {
    name: "Message AI assistant",
    exact: true,
  });
  await composer.fill(
    "Record the decision, read this saved net, then draft the baseline experiment for review.",
  );
  await composer.press("Enter");
  await page
    .getByText("Draft prepared, not run.", { exact: true })
    .waitFor({ timeout: 90_000 });
  const card = page.getByRole("region", { name: "Drafted experiment" });
  await card
    .getByText("Drafted — not run · not saved with the document")
    .waitFor({ timeout: 30_000 });
  const firstRequest = JSON.parse(deliveries[0]?.body ?? "null") as {
    kind: string;
    initialData: {
      mode: string;
      construction: {
        binding: {
          conversationId: string;
          documentId: string;
          incarnationId: string;
        };
      };
    };
  };
  assert.equal(firstRequest.kind, "user");
  assert.equal(firstRequest.initialData.mode, INTEGRATED_BRUNCH_MODE);
  const binding = firstRequest.initialData.construction.binding;
  assert.equal(binding.documentId, "draft-net");
  assert.equal(binding.incarnationId, "draft-incarnation");
  const principalKey = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((entry) =>
      entry.includes("principal"),
    );
    if (!key) throw new Error("Missing browser principal key");
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error("Missing browser principal");
    return raw.startsWith('"') ? (JSON.parse(raw) as string) : raw;
  });
  const identity = { principalKey, conversationId: binding.conversationId };
  const client = createFlueClient({
    url: `${origin}/agents/chat/${flueConversationIdFrom(identity)}`,
    headers: agentOwnershipHeaders(identity),
  });
  const history = await client.history();
  const results = clientToolHistoryFrom(history.messages).results;
  assert.deepEqual(
    results.map(({ toolName }) => toolName),
    ["getLatestNetDefinition", "draft_petrinaut_experiment"],
  );
  const draftResult = results.find(
    ({ toolCallId }) => toolCallId === "draft-1",
  );
  assert.deepEqual(
    {
      toolName: draftResult?.toolName,
      status: (draftResult?.output as { status?: string } | undefined)?.status,
    },
    { toolName: "draft_petrinaut_experiment", status: "drafted" },
  );
  const issued = history.messages
    .flatMap((message) => message.parts)
    .filter((part) => part.type === "dynamic-tool");
  assert.deepEqual(
    issued.map((part) => part.toolName),
    [
      "mutate_workpiece",
      "getLatestNetDefinition",
      "draft_petrinaut_experiment",
    ],
  );
  const postsBeforeDismiss = deliveries.length;
  await card.getByRole("button", { name: "Dismiss" }).click();
  await card.getByText("Dismissed", { exact: true }).waitFor();
  assert.equal(
    deliveries.length,
    postsBeforeDismiss,
    "Dismiss must not POST to Flue",
  );
  assert.equal(
    clientToolHistoryFrom((await client.history()).messages).results.length,
    results.length,
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(blocked, []);
  process.stdout.write(`DRAFT_BROWSER_BOUNDARY_PASS ${output}\n`);
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({ errors, blocked, deliveries: deliveries.map(({ path, body }) => ({ path, body: body.slice(0, 800) })) })}\n`,
  );
  throw error;
} finally {
  await browser.close();
  await new Promise<void>((done, reject) =>
    server.close((error) => (error ? reject(error) : done())),
  );
  await app.stop();
}
