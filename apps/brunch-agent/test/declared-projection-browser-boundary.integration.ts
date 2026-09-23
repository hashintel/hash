/** One declared intention then a separate canonical mutation in the built A-mode browser. */
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
  verifyCanonicalMutationRecord,
  verifyDeclaredProjectionOutput,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import { BRUNCH_DECLARED_PROJECTION_MODE } from "@hashintel/brunch-agent-plugin-sdcpn/flue";
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

const output = mkdtempSync(join(tmpdir(), "declared-projection-browser-"));
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
const markdown = `# Queue intent\n\n${excerpt}`;
// Model-authored semantics and a literal passage only: the host resolves revision and offsets.
const declaration = {
  operations: [
    {
      operationId: "queue-intent",
      toolName: "addPlace",
      intendedEffect: "Represent waiting work.",
      intendedTarget: "Queue",
      expectedImpact: ["place:queue"],
      evidence: {
        excerpts: [excerpt],
        rationale: "The Ledger describes waiting work.",
      },
    },
  ],
};
const place = {
  id: "queue",
  name: "Queue",
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
  targetSubnetId: null,
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
    (context: Context) => {
      const settled = context.messages.findLast(
        (message) =>
          message.role === "toolResult" &&
          message.toolName === "mutate_workpiece",
      );
      assert(settled?.role === "toolResult" && !settled.isError);
      return tool("declare_petrinaut_projection", declaration, "declaration-1");
    },
    async (context: Context) => {
      const declared = context.messages.findLast(
        (message) =>
          message.role === "toolResult" &&
          message.toolName === "declare_petrinaut_projection",
      );
      assert(declared?.role === "toolResult" && !declared.isError);
      const firstRequest = JSON.parse(deliveries[0]?.body ?? "null") as {
        initialData?: { construction?: { binding?: { documentId: string } } };
      } | null;
      const documentId =
        firstRequest?.initialData?.construction?.binding?.documentId;
      assert(documentId, "Missing browser document binding at declaration");
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
      assert(beforePlace, "Missing browser document after declaration");
      assert.deepEqual(beforePlace.places, [], "Declaration changed the net");
      return tool("addPlace", place, "a-place-1");
    },
    (context: Context) => {
      const result = context.messages.findLast(
        (message) =>
          message.role === "toolResult" && message.toolName === "addPlace",
      );
      assert(result?.role === "toolResult" && !result.isError);
      return fauxAssistantMessage([
        fauxText("A declaration and canonical place completed."),
      ]);
    },
  ]);
  const composer = page.getByRole("textbox", {
    name: "Message AI assistant",
    exact: true,
  });
  await composer.fill(
    "Record the Queue intention, declare one projection grounded in that exact Ledger sentence, then add the Queue place separately.",
  );
  await composer.press("Enter");
  await page
    .getByText("A declaration and canonical place completed.", { exact: true })
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
  assert.equal(first.initialData?.mode, BRUNCH_DECLARED_PROJECTION_MODE);
  const binding = first.initialData.construction?.binding;
  assert(binding, "Missing actual A-mode browser binding");
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
    ["mutate_workpiece", "declare_petrinaut_projection", "addPlace"],
  );
  const declared = issued.find(
    ({ toolCallId }) => toolCallId === "declaration-1",
  );
  const canonical = issued.find(({ toolCallId }) => toolCallId === "a-place-1");
  assert(declared && canonical);
  assert.equal(declared.state, "output-available");
  assert.deepEqual(declared.input, declaration);
  const revision = retainedSettledRevision(history, "ledger-1");
  assert(revision, "The Ledger revision did not settle");
  const verifiedDeclaration = await verifyDeclaredProjectionOutput({
    issuedInput: declared.input,
    recordedOutput: declared.output,
    currentRevision: revision,
  });
  assert.equal(verifiedDeclaration.standing, "intent-only");
  assert.equal(verifiedDeclaration.revision.revisionId, revision.revisionId);
  const basis = verifiedDeclaration.operations.at(0)?.basis;
  assert(basis?.kind === "declared");
  assert.equal(basis.sha256, revision.sha256);
  assert.deepEqual(basis.locators, [
    {
      start: markdown.indexOf(excerpt),
      end: markdown.indexOf(excerpt) + excerpt.length,
    },
  ]);
  const results = clientToolHistoryFrom(history.messages).results;
  const mutation = results.find(({ toolCallId }) => toolCallId === "a-place-1");
  assert(mutation && canonical.state === "output-available");
  assert.deepEqual(mutation.output, {
    applied: true,
    title: "Added place Queue",
    target: { kind: "selection", item: { type: "place", id: "queue" } },
  });
  const record = parseClientToolResultMetadata(
    mutation.metadata,
  )?.canonicalMutationRecord;
  assert(record, "Canonical addPlace did not deliver a mutation record");
  const verifiedMutation = await verifyCanonicalMutationRecord({
    record,
    toolCallId: canonical.toolCallId,
    toolName: canonical.toolName,
    canonicalInput: canonical.input,
    canonicalOutput: mutation.output,
    binding,
  });
  assert.equal(verifiedMutation.outcome, "applied");
  assert.equal(verifiedMutation.settlement.status, "settled");
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

  const events = await deriveNetLedger(history, { binding });
  assert.equal(events.length, 1, "Declaration must not itself be a net change");
  const event = events.at(0);
  assert(event?.kind === "mutation");
  assert.equal(event.toolCallId, "a-place-1");
  assert.equal(event.outcome, "applied");
  assert.equal(event.provenance.standing, "declared-projection");
  assert.equal(event.provenance.operationId, "queue-intent");
  assert.equal(
    event.provenance.impactAssessment,
    "owner-adjudication-required",
  );
  assert.deepEqual(event.provenance.basis, basis);

  const canonicalNames = Object.keys(petrinautAiTools);
  assert(canonicalNames.includes("createExperiment"));
  const names = captures[0]?.serialized.tools.map(({ name }) => name);
  assert(names, "The native provider received no tool catalogue");
  assert.deepEqual(
    names.filter((name) => canonicalNames.includes(name)),
    canonicalNames,
  );
  assert.deepEqual(
    names.filter((name) => !canonicalNames.includes(name)).toSorted(),
    [
      "activate_skill",
      "declare_petrinaut_projection",
      "draft_petrinaut_experiment",
      "mutate_workpiece",
      "ping",
      "query_workpiece",
      "read_skill_resource",
      "read_workpiece",
      "task",
    ],
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(blocked, []);
  process.stdout.write("DECLARED_PROJECTION_BROWSER_BOUNDARY_PASS\n");
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
