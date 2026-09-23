/** TRANSITIONAL: canonical I-mode diagnostics witness; retire after the final manual tour-and-review. */
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

import {
  parseClientToolResultMetadata,
  verifyCanonicalMutationRecord,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import { INTEGRATED_BRUNCH_MODE } from "@hashintel/brunch-agent-plugin-sdcpn/flue";
import { clientToolHistoryFrom } from "@hashintel/brunch-agent-transport-aisdk";
import { type SDCPN } from "@hashintel/petrinaut-core";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../src/conversation/identity.ts";
import { retainedSettledRevision } from "../src/conversation/workpiece.ts";
import { installFauxProvider } from "../src/evaluations/install-faux-provider.ts";
import { loadBuiltBrunchApplication } from "../src/evaluations/runbook/load-built-application.ts";
import { openBrowserFixture } from "./browser-fixture.ts";
import { nativeSchemaProvider } from "./native-schema-provider.ts";

const output = mkdtempSync(join(tmpdir(), "canonical-compiler-feedback-"));
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
const dirtyCode = "return definitelyNotDefined;";
const repairedCode = "return tokens.map(({ level }) => ({ level: -level }));";
const cleanCompilation =
  "No errors or warnings found in net function code. Scenario and metric compilation is checked when creating an experiment.";
const tool = (name: string, args: Record<string, unknown>, id: string) =>
  fauxAssistantMessage([fauxToolCall(name, args, { id })], {
    stopReason: "toolUse",
  });
try {
  fixture = await openBrowserFixture(app, resolve("../petrinaut-website/dist"));
  const { page, origin, deliveries, errors, blocked } = fixture;
  await page.addInitScript(() => {
    localStorage.setItem("petrinaut-website:assistant", "brunch");
  });
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
          "# Compiler feedback\n\nModel inventory decay; repair the broken equation.",
        baseRevisionId: null,
      },
      "ledger-1",
    ),
    tool(
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
    tool(
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
    tool(
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
    tool("getNetCompilationErrors", {}, "diagnostics-dirty"),
    tool(
      "updateDifferentialEquation",
      {
        equationId: "decay",
        update: { code: repairedCode },
        targetSubnetId: null,
      },
      "equation-repair",
    ),
    tool("getNetCompilationErrors", {}, "diagnostics-clean"),
    fauxAssistantMessage([
      fauxText("Canonical diagnostics dirty then clean completed."),
    ]),
  ]);
  const composer = page.getByRole("textbox", {
    name: "Message AI assistant",
    exact: true,
  });
  await composer.fill(
    "Record this inventory decay model. Add the item type, a deliberately invalid decay equation and a place using it; check diagnostics, repair the equation, and check diagnostics again.",
  );
  await composer.press("Enter");
  await page
    .getByText("Canonical diagnostics dirty then clean completed.", {
      exact: true,
    })
    .waitFor({ timeout: 45_000 });

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
  assert(binding, "Missing actual browser binding");
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
  const issued = history.messages.flatMap((message) =>
    message.role === "assistant" && message.purpose === "assistant"
      ? message.parts.filter((part) => part.type === "dynamic-tool")
      : [],
  );
  assert.deepEqual(
    issued.map(({ toolName }) => toolName),
    [
      "mutate_workpiece",
      "addType",
      "addDifferentialEquation",
      "addPlace",
      "getNetCompilationErrors",
      "updateDifferentialEquation",
      "getNetCompilationErrors",
    ],
  );
  assert(issued.every(({ state }) => state === "output-available"));
  assert(retainedSettledRevision(history, "ledger-1"));
  const results = clientToolHistoryFrom(history.messages).results;
  assert.deepEqual(
    results.map(({ toolName }) => toolName),
    issued.slice(1).map(({ toolName }) => toolName),
  );
  const dirty = results.find(
    ({ toolCallId }) => toolCallId === "diagnostics-dirty",
  );
  const clean = results.find(
    ({ toolCallId }) => toolCallId === "diagnostics-clean",
  );
  assert(dirty && clean, "Both canonical diagnostic results must be delivered");
  assert.equal(dirty.toolName, "getNetCompilationErrors");
  assert.equal(clean.toolName, "getNetCompilationErrors");
  assert.match(String(dirty.output), /definitelyNotDefined/u);
  assert.equal(clean.output, cleanCompilation);
  const root = results.find(({ toolCallId }) => toolCallId === "place-1");
  const rootCall = issued.find(({ toolCallId }) => toolCallId === "place-1");
  assert(root && rootCall);
  const record = parseClientToolResultMetadata(
    root.metadata,
  )?.canonicalMutationRecord;
  assert(record, "The root place did not deliver its canonical record");
  const verified = await verifyCanonicalMutationRecord({
    record,
    toolCallId: rootCall.toolCallId,
    toolName: rootCall.toolName,
    canonicalInput: rootCall.input,
    canonicalOutput: root.output,
    binding,
  });
  assert.equal(verified.outcome, "applied");
  assert.equal(verified.settlement.status, "settled");
  const stored = await page.evaluate((documentId) => {
    const documents = JSON.parse(
      localStorage.getItem("petrinaut-sdcpn") ?? "{}",
    ) as Record<
      string,
      { revisionId: string; incarnationId: string; sdcpn: SDCPN }
    >;
    return documents[documentId];
  }, binding.documentId);
  assert(stored, "The bound browser document was not persisted");
  assert.equal(stored.incarnationId, binding.incarnationId);
  assert.notEqual(stored.revisionId, record.pre.revisionId);
  assert.deepEqual(
    stored.sdcpn.types.map(({ id }) => id),
    ["item"],
  );
  assert.deepEqual(
    stored.sdcpn.places.map(({ id }) => id),
    ["store"],
  );
  assert.equal(stored.sdcpn.places[0]?.differentialEquationId, "decay");
  assert.deepEqual(
    stored.sdcpn.differentialEquations.map(({ id, code }) => ({ id, code })),
    [{ id: "decay", code: repairedCode }],
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(blocked, []);
  process.stdout.write(
    `CANONICAL_COMPILER_FEEDBACK_PASS ${JSON.stringify({
      mode: first.initialData.mode,
      dirty: String(dirty.output).includes("definitelyNotDefined"),
      clean: true,
      saved: stored.sdcpn.differentialEquations[0]?.code === repairedCode,
    })}\n`,
  );
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
