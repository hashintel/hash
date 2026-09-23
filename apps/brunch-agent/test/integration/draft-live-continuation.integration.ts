/** Built Flue/ChatAgent -> canonical read dispatch -> in-flight server draft -> browser continuation. No paid provider. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { createFlueClient } from "@flue/sdk";

import { INTEGRATED_BRUNCH_MODE } from "@hashintel/brunch-agent-plugin-sdcpn/flue";
import { clientToolResultSignal } from "@hashintel/brunch-agent-transport-aisdk";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../../src/conversation/identity.ts";
import { installFauxProvider } from "../../src/evaluations/install-faux-provider.ts";
import { createHeadlessPetrinautClient } from "../../src/evaluations/runbook/headless-petrinaut-client.ts";
import { loadBuiltBrunchApplication } from "../../src/evaluations/runbook/load-built-application.ts";

const directory = mkdtempSync(join(tmpdir(), "brunch-draft-live-"));
process.env.NODE_ENV = "test";
process.env.BRUNCH_CHAT_MODEL = "claude-sonnet-4-6";
process.env.BRUNCH_DEV_DB_PATH = join(directory, "conversation.db");
process.env.OTEL_SDK_DISABLED = "true";
globalThis.fetch = () => {
  throw new Error("External fetch forbidden");
};
const faux = fauxProvider({
  provider: "anthropic",
  models: [{ id: "claude-sonnet-4-6" }],
});
installFauxProvider(faux.provider);
const application = await loadBuiltBrunchApplication();
const identity = {
  principalKey: "draft-live-test",
  conversationId: `draft-live-${crypto.randomUUID()}`,
};
const binding = {
  conversationId: identity.conversationId,
  documentId: "document",
  incarnationId: "incarnation",
};
const client = createFlueClient({
  url: `http://brunch.local/agents/chat/${flueConversationIdFrom(identity)}`,
  headers: agentOwnershipHeaders(identity),
  fetch: async (input, init) =>
    application.fetch(
      input instanceof Request ? input : new Request(input, init),
    ),
});
const host = createHeadlessPetrinautClient("Queue");
const semanticDraft = {
  experiment: {
    name: "Queue baseline",
    scenarioId: "baseline",
    scenarioParameterValues: {},
    runCount: 10,
    seed: 42,
    dt: 0.1,
    maxTime: 10,
    metricIds: ["throughput"],
    execution: { mode: "simulate" },
  },
  declarations: [
    {
      subject: "result",
      statement: "A simulated baseline is not a guarantee.",
    },
  ],
  unsupported: [],
};
try {
  faux.setResponses([
    fauxAssistantMessage(
      [
        fauxToolCall(
          "mutate_workpiece",
          {
            markdown:
              "Decision: test throughput under baseline conditions over a ten-unit horizon.",
            baseRevisionId: null,
          },
          { id: "settlement-1" },
        ),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      [fauxToolCall("getLatestNetDefinition", {}, { id: "read-1" })],
      { stopReason: "toolUse" },
    ),
  ]);
  await client.wait(
    await client.send({
      initialData: { mode: INTEGRATED_BRUNCH_MODE, construction: { binding } },
      message: {
        kind: "user",
        body: "Record this decision and read the model.",
      },
    }),
  );
  const read = await host.execute({
    toolName: "getLatestNetDefinition",
    toolCallId: "read-1",
    input: {},
  });
  const definition = host.definition();
  const observed = {
    definition,
    sha256: createHash("sha256")
      .update(JSON.stringify(definition))
      .digest("hex"),
    revisionId: host.revisionId(),
  };
  faux.setResponses([
    fauxAssistantMessage(
      [
        fauxToolCall("draft_petrinaut_experiment", semanticDraft, {
          id: "draft-1",
        }),
      ],
      { stopReason: "toolUse" },
    ),
  ]);
  await client.wait(
    await client.send({
      message: clientToolResultSignal([
        {
          ...read,
          metadata: {
            observation: { toolCallId: "read-1", binding, observed },
          },
        },
      ]),
    }),
  );
  const history = await client.history();
  const call = history.messages
    .flatMap((message) => message.parts)
    .find(
      (part) => part.type === "dynamic-tool" && part.toolCallId === "draft-1",
    );
  assert(
    call?.type === "dynamic-tool",
    "the in-flight draft call must be recorded",
  );
  assert.equal(call.state, "output-available", JSON.stringify(call));
  assert.deepEqual(call.output, { awaiting: "client" });
  faux.setResponses([
    fauxAssistantMessage([fauxText("Draft prepared, not run.")]),
  ]);
  await client.wait(
    await client.send({
      message: clientToolResultSignal([
        {
          toolCallId: "draft-1",
          toolName: "draft_petrinaut_experiment",
          output: {
            status: "invalid",
            summary: "The saved scenario is not present in this test net.",
            diagnostics: ["Missing saved scenario"],
          },
        },
      ]),
    }),
  );
  assert(
    JSON.stringify(await client.history()).includes("Draft prepared, not run."),
  );
  process.stdout.write(`DRAFT_LIVE_CONTINUATION_PASS ${directory}\n`);
} finally {
  host.dispose();
  await application.stop();
}
