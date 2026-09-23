/** One bounded deep construction call through the built B-mode browser and server. */
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
  verifyDeepConstructionRecord,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import { BRUNCH_DEEP_CONSTRUCTION_MODE } from "@hashintel/brunch-agent-plugin-sdcpn/flue";
import { clientToolHistoryFrom } from "@hashintel/brunch-agent-transport-aisdk";
import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../src/conversation/identity.ts";
import { deriveNetLedger } from "../src/conversation/net-ledger.ts";
import { retainedSettledRevision } from "../src/conversation/workpiece.ts";
import { installFauxProvider } from "../src/evaluations/install-faux-provider.ts";
import { loadBuiltBrunchApplication } from "../src/evaluations/runbook/load-built-application.ts";
import { openBrowserFixture } from "./browser-fixture.ts";
import {
  nativeSchemaProvider,
  type NativeRequestCapture,
} from "./native-schema-provider.ts";

const output = mkdtempSync(join(tmpdir(), "deep-construction-browser-"));
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
const captures: NativeRequestCapture[] = [];
installFauxProvider(nativeSchemaProvider(faux.provider, captures, []));
const app = await loadBuiltBrunchApplication();
let fixture: Awaited<ReturnType<typeof openBrowserFixture>> | undefined;
const excerpt = "Represent waiting work with a Queue place.";
const markdown = `# Queue model\n\n${excerpt}`;
const modelInput = {
  operations: [
    {
      operationId: "queue-step",
      toolName: "addPlace",
      input: {
        id: "queue",
        name: "Queue",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 0,
        y: 0,
        targetSubnetId: null,
      },
      intendedEffect: "Represent waiting work.",
      intendedTarget: "Queue",
      expectedImpact: ["place:queue"],
      evidence: {
        excerpts: [excerpt],
        rationale: "The Ledger names this waiting place.",
      },
    },
  ],
};
const tool = (name: string, args: Record<string, unknown>, id: string) =>
  fauxAssistantMessage([fauxToolCall(name, args, { id })], {
    stopReason: "toolUse",
  });
let beforePlace: { revisionId: string; places: string[] } | undefined;
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
    tool("mutate_workpiece", { markdown, baseRevisionId: null }, "ledger-1"),
    async (context: Context) => {
      const settled = context.messages.findLast(
        (message) =>
          message.role === "toolResult" &&
          message.toolName === "mutate_workpiece",
      );
      assert(settled?.role === "toolResult" && !settled.isError);
      const first = JSON.parse(deliveries[0]?.body ?? "null") as {
        initialData?: { construction?: { binding?: { documentId: string } } };
      } | null;
      const documentId = first?.initialData?.construction?.binding?.documentId;
      assert(documentId, "Missing browser document binding before B call");
      beforePlace = await page.evaluate((boundDocumentId) => {
        const documents = JSON.parse(
          localStorage.getItem("petrinaut-sdcpn") ?? "{}",
        ) as Record<
          string,
          { revisionId: string; sdcpn: { places: { id: string }[] } }
        >;
        const document = documents[boundDocumentId];
        return document === undefined
          ? undefined
          : {
              revisionId: document.revisionId,
              places: document.sdcpn.places.map(({ id }) => id),
            };
      }, documentId);
      assert(beforePlace, "Missing browser document before B call");
      assert.deepEqual(beforePlace.places, []);
      return tool("apply_petrinaut_construction", modelInput, "b-apply-1");
    },
    (context: Context) => {
      const applied = context.messages.findLast(
        (message) =>
          message.role === "toolResult" &&
          message.toolName === "apply_petrinaut_construction",
      );
      assert(applied?.role === "toolResult" && !applied.isError);
      return fauxAssistantMessage([fauxText("B deep construction finished.")]);
    },
  ]);
  const composer = page.getByRole("textbox", {
    name: "Message AI assistant",
    exact: true,
  });
  await composer.fill(
    "Record the Queue intention, then apply one bounded construction step for the Queue place with a literal Ledger passage.",
  );
  await composer.press("Enter");
  const continued = await page
    .getByText("B deep construction finished.", { exact: true })
    .waitFor({ timeout: 8_000 })
    .then(
      () => true,
      () => false,
    );

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
  assert.equal(first.initialData?.mode, BRUNCH_DEEP_CONSTRUCTION_MODE);
  const binding = first.initialData.construction?.binding;
  assert(binding, "Missing actual B-mode browser binding");
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
    ["mutate_workpiece", "apply_petrinaut_construction"],
  );
  const ledger = retainedSettledRevision(history, "ledger-1");
  assert(ledger, "The Ledger revision did not settle");
  const call = issued.find(({ toolCallId }) => toolCallId === "b-apply-1");
  assert(call && call.state === "output-available");
  assert.deepEqual(call.input, modelInput);
  const results = clientToolHistoryFrom(history.messages).results;
  const result = results.find(({ toolCallId }) => toolCallId === "b-apply-1");
  const hostAuthorityError =
    (await page
      .getByText("The deep construction call lacks host authority.", {
        exact: true,
      })
      .count()) > 0;
  assert(
    result,
    hostAuthorityError
      ? "B browser tool lacked host authority and delivered no client result"
      : "B browser tool delivered no client result",
  );
  assert.equal(result.toolName, "apply_petrinaut_construction");
  assert(!hostAuthorityError, "B browser tool reported missing host authority");
  const record = parseClientToolResultMetadata(
    result.metadata,
  )?.deepConstructionRecord;
  assert(record, "B browser result lacks a deep construction record");
  const verified = await verifyDeepConstructionRecord({
    record,
    toolCallId: call.toolCallId,
    canonicalInput: call.input,
    canonicalOutput: result.output,
    binding,
    ledgerRevision: ledger,
  });
  assert.equal(verified.authority.status, "verified");
  assert.equal(verified.output.disposition, "complete");
  assert.deepEqual(
    verified.output.outcomes.map(({ operationId, toolName, status }) => ({
      operationId,
      toolName,
      status,
    })),
    [{ operationId: "queue-step", toolName: "addPlace", status: "applied" }],
  );
  const attempt = verified.attempts.at(0);
  assert(attempt);
  assert.equal(attempt.record.outcome, "applied");
  assert.equal(attempt.record.settlement.status, "settled");
  assert(attempt.basis.kind === "declared");
  assert.deepEqual(attempt.basis.locators, [
    {
      start: markdown.indexOf(excerpt),
      end: markdown.indexOf(excerpt) + excerpt.length,
    },
  ]);
  const stored = await page.evaluate((documentId) => {
    const documents = JSON.parse(
      localStorage.getItem("petrinaut-sdcpn") ?? "{}",
    ) as Record<
      string,
      { revisionId: string; sdcpn: { places: { id: string }[] } }
    >;
    const document = documents[documentId];
    return document === undefined
      ? undefined
      : {
          revisionId: document.revisionId,
          places: document.sdcpn.places.map(({ id }) => id),
        };
  }, binding.documentId);
  assert(beforePlace && stored);
  assert.notEqual(stored.revisionId, beforePlace.revisionId);
  assert.deepEqual(stored.places, ["queue"]);
  assert(verified.output.finalObservation.disposition === "observed");
  assert.equal(
    verified.output.finalObservation.documentRevision,
    stored.revisionId,
  );

  const events = await deriveNetLedger(history, { binding });
  assert.equal(events.length, 1);
  const event = events.at(0);
  assert(event?.kind === "construction");
  assert.equal(event.disposition, "complete");
  assert.equal(event.authority.status, "verified");
  assert.equal(event.steps.length, 1);
  const step = event.steps.at(0);
  assert(step);
  assert.equal(step.operationId, "queue-step");
  assert.equal(step.toolName, "addPlace");
  assert.deepEqual(step.expectedImpact, ["place:queue"]);
  assert.equal(step.impactAssessment, "owner-adjudication-required");
  assert.equal(step.attempt.outcome, "applied");

  const canonicalNames = Object.keys(petrinautAiTools);
  assert(canonicalNames.includes("createExperiment"));
  const names = captures[0]?.serialized.tools.map(({ name }) => name);
  assert(names, "The native provider received no tool catalogue");
  assert.deepEqual(
    names.filter((name) => canonicalNames.includes(name)),
    canonicalNames,
  );
  assert(names.includes("draft_petrinaut_experiment"));
  assert(names.includes("apply_petrinaut_construction"));
  assert(!names.includes("declare_petrinaut_projection"));
  assert(continued, "B client result was not admitted for model continuation");
  assert.deepEqual(errors, []);
  assert.deepEqual(blocked, []);
  process.stdout.write("DEEP_CONSTRUCTION_BROWSER_BOUNDARY_PASS\n");
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
