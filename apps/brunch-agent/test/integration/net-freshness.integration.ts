/** Built ChatAgent, faux provider, no browser: the current-net freshness marker on user turns. */
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
  type Context,
} from "@earendil-works/pi-ai";
import { createFlueClient } from "@flue/sdk";

import { batchedConstructionMode } from "@hashintel/brunch-agent-plugin-sdcpn/flue";
import {
  clientToolResultSignal,
  snapshotToUiMessages,
} from "@hashintel/brunch-agent-transport-aisdk";
import { getLatestNetDefinitionToolName } from "@hashintel/petrinaut-core/ai";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../../src/conversation/identity.ts";
import { NET_STALE_SIGNAL } from "../../src/conversation/net-freshness.ts";
import { installFauxProvider } from "../../src/evaluations/install-faux-provider.ts";
import { createHeadlessPetrinautClient } from "../../src/evaluations/runbook/headless-petrinaut-client.ts";
import { loadBuiltBrunchApplication } from "../../src/evaluations/runbook/load-built-application.ts";

const directory = mkdtempSync(join(tmpdir(), "net-freshness-"));
process.env.NODE_ENV = "test";
process.env.HASH_OTLP_ENDPOINT = "";
process.env.OTEL_SDK_DISABLED = "true";
process.env.BRUNCH_CHAT_MODEL = "claude-sonnet-4-6";
process.env.BRUNCH_DEV_DB_PATH = join(directory, "conversation.db");
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
  principalKey: "TEST-net-freshness",
  conversationId: `net-freshness-${crypto.randomUUID()}`,
};
const binding = {
  conversationId: identity.conversationId,
  documentId: "net-freshness-document",
  incarnationId: crypto.randomUUID(),
};
const client = createFlueClient({
  url: `http://brunch.local/agents/chat/${flueConversationIdFrom(identity)}`,
  headers: agentOwnershipHeaders(identity),
  fetch: async (input, init) =>
    application.fetch(
      input instanceof Request ? input : new Request(input, init),
    ),
});

/** The model-facing context of each turn, captured as the faux provider sees it. */
const contexts: string[] = [];
const capturing =
  (message: ReturnType<typeof fauxAssistantMessage>) => (context: Context) => {
    contexts.push(JSON.stringify(context));
    return message;
  };
const staleMarkersIn = (text: string): number =>
  text.split(`<${NET_STALE_SIGNAL}`).length - 1;

const host = createHeadlessPetrinautClient("Freshness net");
try {
  // Turn 1: the conversation has never read the net.
  faux.setResponses([
    capturing(
      fauxAssistantMessage(
        [fauxToolCall(getLatestNetDefinitionToolName, {}, { id: "read-1" })],
        { stopReason: "toolUse" },
      ),
    ),
  ]);
  await client.wait(
    await client.send({
      initialData: {
        mode: batchedConstructionMode,
        construction: { binding },
      },
      message: { kind: "user", body: "Explain this model." },
    }),
  );
  const afterFirstTurn = await client.history();
  const firstStaleIndex = afterFirstTurn.messages.findIndex(
    (message) => message.signal?.tagName === NET_STALE_SIGNAL,
  );
  const firstAssistantIndex = afterFirstTurn.messages.findIndex(
    (message) => message.role === "assistant",
  );
  assert.notEqual(firstStaleIndex, -1, "turn 1 records the stale marker");
  assert(
    firstStaleIndex < firstAssistantIndex,
    "the marker is recorded before the model's first assistant message",
  );
  const firstMarker = afterFirstTurn.messages[firstStaleIndex]!;
  assert.equal(firstMarker.signal?.attributes?.kind, "never-read");
  assert.equal(contexts.length, 1);
  assert.equal(
    staleMarkersIn(contexts[0]!),
    1,
    "the model read exactly one marker on its first turn",
  );

  // The browser answers the read with its verified observation sidecar.
  const read = await host.execute({
    toolName: getLatestNetDefinitionToolName,
    toolCallId: "read-1",
    input: {},
  });
  const definition = host.definition();
  const observed = {
    definition,
    sha256: createHash("sha256")
      .update(JSON.stringify(definition))
      .digest("hex"),
  };
  faux.setResponses([
    capturing(fauxAssistantMessage([fauxText("GROUNDED_FROM_READ")])),
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
  assert.equal(
    staleMarkersIn(contexts[1]!),
    1,
    "the continuation adds no marker",
  );

  // Turn 2: the last verified read is the latest recorded net.
  faux.setResponses([
    capturing(fauxAssistantMessage([fauxText("ANSWERED_FROM_CURRENT_READ")])),
  ]);
  await client.wait(
    await client.send({
      message: { kind: "user", body: "And what does the first place hold?" },
    }),
  );
  const afterSecondTurn = await client.history();
  assert.equal(
    afterSecondTurn.messages.filter(
      (message) => message.signal?.tagName === NET_STALE_SIGNAL,
    ).length,
    1,
    "a current read adds no second marker",
  );
  assert.equal(staleMarkersIn(contexts[2]!), 1);
  assert.equal(
    afterSecondTurn.messages.filter(
      (message) => message.role === "user" && message.purpose === "user",
    ).length,
    2,
    "each user turn is recorded once",
  );
  const projected = snapshotToUiMessages(afterSecondTurn, {
    clientToolNames: new Set([getLatestNetDefinitionToolName]),
  });
  assert(
    !JSON.stringify(projected).includes(NET_STALE_SIGNAL),
    "the marker never reaches the UI projection",
  );
  assert.equal(
    projected.filter((message) => message.role === "user").length,
    2,
  );
  process.stdout.write(`NET_FRESHNESS_PASS ${directory}\n`);
} finally {
  host.dispose();
  await application.stop();
}
