/** Unpaid native addType/headless regression; original A1 evidence remains pinned at its commit. */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { createFlueClient } from "@flue/sdk";

import { VALIDATED_CONSTRUCTION_MODE } from "@hashintel/brunch-agent-plugin-sdcpn/flue";
import {
  petrinautAiTools,
  type PetrinautAiToolInput,
} from "@hashintel/petrinaut-core/ai";

import { STEP_A_MODEL_ID } from "../../chat-model.ts";
import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../../conversation/identity.ts";
import { CHAT_AGENT_ROUTE } from "../../http/routes.ts";
import { installFauxProvider } from "../install-faux-provider.ts";
import { createBrunchTurnTool } from "../persona/brunch-turn.ts";
import { createHeadlessPetrinautClient } from "./headless-petrinaut-client.ts";
import { loadBuiltBrunchApplication } from "./load-built-application.ts";

import type { Context, Provider } from "@earendil-works/pi-ai";

assert(
  !process.argv.includes("--paid"),
  "The one-use paid A1 instrument is retired. Its source, evidence and batching-limit caveat are retained in the A1 carrier-result.md packet. A new paid instrument needs a new reservation and an enforced batched-attempt ceiling.",
);
const modelId = STEP_A_MODEL_ID;
const runId = `a1-faux-${crypto.randomUUID()}`;
const outputDirectory = mkdtempSync(join(tmpdir(), "a1-faux-"));
process.env.BRUNCH_CHAT_MODEL = modelId;
process.env.BRUNCH_DEV_DB_PATH = join(outputDirectory, "conversation.db");
const save = (name: string, value: unknown) =>
  writeFileSync(
    join(outputDirectory, name),
    `${JSON.stringify(value, null, 2)}\n`,
  );

const nestedType = {
  id: "production_eligibility",
  name: "ProductionEligibility",
  iconSlug: "circle",
  displayColor: "#808080",
  elements: [
    { elementId: "product_family", name: "product_family", type: "string" },
    { elementId: "line_qualified", name: "line_qualified", type: "boolean" },
  ],
} satisfies PetrinautAiToolInput<"addType">;
const faux = fauxProvider({
  provider: "anthropic",
  models: [{ id: modelId, reasoning: true }],
});
faux.setResponses([
  fauxAssistantMessage(
    [fauxToolCall("getLatestNetDefinition", {}, { id: "read-before" })],
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage(
    [fauxToolCall("addType", nestedType, { id: "nested-type" })],
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage([
    fauxText(
      "The synthetic nested type was added. This is carrier evidence only, not an operational model or provenance proof.",
    ),
  ]),
]);
const contexts: Context[] = [];
const provider: Provider = {
  ...faux.provider,
  stream() {
    throw new Error("A1 expects the production streamSimple boundary");
  },
  streamSimple(model, context, options) {
    contexts.push(context);
    return faux.provider.streamSimple(model, context, options);
  },
};
installFauxProvider(provider);

const identity = {
  principalKey: "principal-mission-7-a1",
  conversationId: runId,
};
const headless = createHeadlessPetrinautClient(
  "Isolated A1 synthetic carrier check",
);
const application = await loadBuiltBrunchApplication();
const observations: unknown[] = [];
let failure: string | undefined;
try {
  const client = createFlueClient({
    url: `http://brunch.local/agents/${CHAT_AGENT_ROUTE}/${flueConversationIdFrom(identity)}`,
    fetch: async (input, init) =>
      application.fetch(
        input instanceof Request ? input : new Request(input, init),
      ),
    headers: agentOwnershipHeaders(identity),
  });
  let firstSend = true;
  const turn = createBrunchTurnTool({
    conversationId: runId,
    client: {
      history: (...args) => client.history(...args),
      read: (...args) => client.read(...args),
      send: (input) => {
        const initialData = firstSend
          ? { mode: VALIDATED_CONSTRUCTION_MODE }
          : undefined;
        firstSend = false;
        return client.send({ ...input, initialData });
      },
    },
    retainSnapshot: (snapshot) => save("history.json", snapshot),
    resolveClientToolHost: () => ({
      kind: "real-headless",
      async execute(call) {
        assert(
          ["getLatestNetDefinition", "addType"].includes(call.toolName),
          `Probe does not authorize executing ${call.toolName}`,
        );
        const before = structuredClone(headless.definition());
        const result = await headless.execute(call);
        observations.push({
          call,
          before,
          result,
          after: structuredClone(headless.definition()),
        });
        return result.output;
      },
    }),
  });
  const result = await turn.execute(
    "a1-probe",
    {
      message:
        "This is an isolated test-authored carrier replay, not an operational interview. Read the empty document, then create only a ProductionEligibility type with product_family (string) and line_qualified (boolean) attributes, stable IDs and ordinary display settings. No real plant facts or process structure are represented.",
    },
    AbortSignal.timeout(30_000),
  );
  save("turn-result.json", result);
  const generatedTools = contexts.flatMap((context) => context.tools ?? []);
  const generatedAddType = generatedTools.find(
    (tool) => tool.name === "addType",
  );
  assert(generatedAddType, "addType not mounted at provider boundary");
  const canonicalSchema = petrinautAiTools.addType.inputSchema.toJSONSchema({
    io: "input",
  });
  assert.deepEqual(generatedAddType.parameters, canonicalSchema);
  assert(
    generatedTools.some((tool) => tool.name === "brunch_mark_question"),
    "Question marker missing",
  );
  assert.deepEqual(headless.definition().types, [
    petrinautAiTools.addType.inputSchema.parse(nestedType),
  ]);
  assert(headless.parse().ok, "Canonical document parse failed");
  assert(
    result.details.toolActivity.some(
      (activity) =>
        activity.toolCallId === "nested-type" &&
        activity.executor === "real-headless",
    ),
    "Result was not correlated to the provider call",
  );
} catch (error) {
  failure =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.exitCode = 1;
} finally {
  save("canonical-observations.json", observations);
  save("contexts.json", contexts);
  save("result.json", {
    runId,
    paid: false,
    passed: failure === undefined,
    failure,
    definition: headless.definition(),
    scope:
      "Unpaid nested carrier/headless regression, not read-before-mutation settlement proof",
  });
  headless.dispose();
  await application.stop();
  process.stdout.write(
    `SCHEMA_CARRIER_PROBE ${JSON.stringify({ passed: failure === undefined, paid: false, outputDirectory, failure })}\n`,
  );
}
