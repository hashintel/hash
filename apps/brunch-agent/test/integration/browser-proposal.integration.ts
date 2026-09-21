/** Built-mount proof: a multi-call browser proposal continues once after one correlated result signal. */
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

import { CANONICAL_PETRINAUT_TOOLS_MODE } from "@hashintel/brunch-agent-plugin-sdcpn";

import { CLIENT_TOOL_RESULT_SIGNAL } from "../../src/conversation/client-tools.ts";
import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../../src/conversation/identity.ts";
import { installFauxProvider } from "../../src/evaluations/install-faux-provider.ts";
import { createHeadlessPetrinautClient } from "../../src/evaluations/runbook/headless-petrinaut-client.ts";
import { loadBuiltBrunchApplication } from "../../src/evaluations/runbook/load-built-application.ts";

const directory = mkdtempSync(join(tmpdir(), "multi-browser-proposal-"));
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
const clientFor = (name: string) => {
  const identity = {
    principalKey: "TEST-browser-proposal",
    conversationId: `${name}-${crypto.randomUUID()}`,
  };
  return {
    client: createFlueClient({
      url: `http://brunch.local/agents/chat/${flueConversationIdFrom(identity)}`,
      headers: agentOwnershipHeaders(identity),
      fetch: async (input, init) =>
        application.fetch(
          input instanceof Request ? input : new Request(input, init),
        ),
    }),
    identity,
  };
};
const observations: unknown[] = [];
try {
  const { client, identity } = clientFor("multi-browser");
  const toolCallIds = ["first-read", "second-read"] as const;
  faux.setResponses([
    fauxAssistantMessage(
      toolCallIds.map((id) =>
        fauxToolCall("getLatestNetDefinition", {}, { id }),
      ),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage([fauxText("BOTH_CORRELATED_RESULTS_RECEIVED")]),
  ]);
  const start = faux.state.callCount;
  await client.wait(
    await client.send({
      initialData: {
        mode: CANONICAL_PETRINAUT_TOOLS_MODE,
        construction: {
          binding: {
            conversationId: identity.conversationId,
            documentId: "multi-browser-document",
            incarnationId: "multi-browser-incarnation",
          },
        },
      },
      message: {
        kind: "user",
        body: "TEST two browser reads, then one signal carrying both correlated results.",
      },
    }),
  );

  assert.equal(faux.state.callCount - start, 1);
  const pendingHistory = await client.history();
  const pending = pendingHistory.messages
    .flatMap((message) => message.parts)
    .filter(
      (part) =>
        part.type === "dynamic-tool" &&
        toolCallIds.includes(part.toolCallId as (typeof toolCallIds)[number]),
    );
  assert.equal(pending.length, 2);
  for (const part of pending) {
    assert(part.type === "dynamic-tool");
    assert.deepEqual(part.output, { awaiting: "client" });
  }
  assert(
    !JSON.stringify(pendingHistory).includes(
      "BOTH_CORRELATED_RESULTS_RECEIVED",
    ),
  );

  const host = createHeadlessPetrinautClient("multi-browser-control");
  try {
    const results = await Promise.all(
      toolCallIds.map((toolCallId) =>
        host.execute({
          toolName: "getLatestNetDefinition",
          toolCallId,
          input: {},
        }),
      ),
    );
    await client.wait(
      await client.send({
        message: {
          kind: "signal",
          type: CLIENT_TOOL_RESULT_SIGNAL,
          tagName: CLIENT_TOOL_RESULT_SIGNAL,
          body: JSON.stringify(results),
        },
      }),
    );
    assert.equal(faux.state.callCount - start, 2);
    const continuedHistory = await client.history();
    assert(
      JSON.stringify(continuedHistory).includes(
        "BOTH_CORRELATED_RESULTS_RECEIVED",
      ),
    );
    assert.equal(
      continuedHistory.messages.filter(
        (message) => message.signal?.tagName === CLIENT_TOOL_RESULT_SIGNAL,
      ).length,
      1,
    );
    observations.push({
      pendingToolCallIds: pending.map((part) =>
        part.type === "dynamic-tool" ? part.toolCallId : undefined,
      ),
      resultToolCallIds: results.map((result) => result.toolCallId),
      providerCalls: faux.state.callCount - start,
      clientResultSignals: 1,
    });
  } finally {
    host.dispose();
  }
  writeFileSync(
    join(directory, "observations.json"),
    JSON.stringify(observations, null, 2),
  );
  process.stdout.write(`MULTI_BROWSER_PROPOSAL_PASS ${directory}\n`);
} finally {
  await application.stop();
}
