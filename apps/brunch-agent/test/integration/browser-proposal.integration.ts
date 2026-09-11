/** Scoped built-mount admission: mixed-validity browser calls cannot continue before client results. */
/* eslint-disable no-await-in-loop -- One synthetic queue; proposal/result order is the boundary under test. */
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

import { CLIENT_TOOL_RESULT_SIGNAL } from "../../src/conversation/client-tools.ts";
import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../../src/conversation/identity.ts";
import { installFauxProvider } from "../../src/evaluations/install-faux-provider.ts";
import { createHeadlessPetrinautClient } from "../../src/evaluations/runbook/headless-petrinaut-client.ts";
import { loadBuiltBrunchApplication } from "../../src/evaluations/runbook/load-built-application.ts";

const directory = mkdtempSync(join(tmpdir(), "single-browser-proposal-"));
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
  return createFlueClient({
    url: `http://brunch.local/agents/chat/${flueConversationIdFrom(identity)}`,
    headers: agentOwnershipHeaders(identity),
    fetch: async (input, init) =>
      application.fetch(
        input instanceof Request ? input : new Request(input, init),
      ),
  });
};
const observations: unknown[] = [];
try {
  for (const reverse of [false, true]) {
    const client = clientFor(`mixed-validity-${reverse}`);
    const calls = [
      fauxToolCall("getLatestNetDefinition", {}, { id: "pending-read" }),
      fauxToolCall(
        "addType",
        { id: "invalid-type" },
        { id: "invalid-mutation" },
      ),
    ];
    if (reverse) calls.reverse();
    faux.setResponses([
      fauxAssistantMessage(calls, { stopReason: "toolUse" }),
      fauxAssistantMessage([
        fauxText("MUST_NOT_CONTINUE_WITHOUT_CLIENT_RESULT"),
      ]),
    ]);
    const start = faux.state.callCount;
    let failure: unknown;
    try {
      await client.wait(
        await client.send({
          initialData: { mode: VALIDATED_CONSTRUCTION_MODE },
          message: {
            kind: "user",
            body: "TEST mixed-validity browser-only proposal; no client result will be sent.",
          },
        }),
      );
    } catch (error) {
      failure = error;
    }
    const history = await client.history();
    observations.push({
      reverse,
      failure: String(failure),
      providerCalls: faux.state.callCount - start,
      history,
    });
    writeFileSync(
      join(directory, "observations.json"),
      JSON.stringify(observations, null, 2),
    );
    assert.match(String(failure), /Multiple browser calls/);
    assert.equal(faux.state.callCount - start, 1);
    assert(
      !history.messages.some((message) =>
        message.parts.some((part) => part.type === "dynamic-tool"),
      ),
    );
    assert(
      !JSON.stringify(history).includes(
        "MUST_NOT_CONTINUE_WITHOUT_CLIENT_RESULT",
      ),
    );
    assert(
      !history.messages.some(
        (message) => message.signal?.tagName === CLIENT_TOOL_RESULT_SIGNAL,
      ),
    );
  }
  const client = clientFor("single-browser");
  const start = faux.state.callCount;
  faux.setResponses([
    fauxAssistantMessage(
      [fauxToolCall("getLatestNetDefinition", {}, { id: "single-read" })],
      { stopReason: "toolUse" },
    ),
  ]);
  await client.wait(
    await client.send({
      initialData: { mode: VALIDATED_CONSTRUCTION_MODE },
      message: {
        kind: "user",
        body: "TEST one browser read, then its correlated result.",
      },
    }),
  );
  assert.equal(faux.state.callCount - start, 1);
  const history = await client.history();
  const pending = history.messages
    .flatMap((message) => message.parts)
    .find(
      (part) =>
        part.type === "dynamic-tool" && part.toolCallId === "single-read",
    );
  assert(pending?.type === "dynamic-tool");
  assert.deepEqual(pending.output, { awaiting: "client" });
  const host = createHeadlessPetrinautClient("single-browser-control");
  try {
    const result = await host.execute({
      toolName: "getLatestNetDefinition",
      toolCallId: "single-read",
      input: {},
    });
    faux.setResponses([
      fauxAssistantMessage([fauxText("CORRELATED_RESULT_RECEIVED")]),
    ]);
    await client.wait(
      await client.send({
        message: {
          kind: "signal",
          type: CLIENT_TOOL_RESULT_SIGNAL,
          tagName: CLIENT_TOOL_RESULT_SIGNAL,
          body: JSON.stringify([result]),
        },
      }),
    );
    assert.equal(faux.state.callCount - start, 2);
    assert(
      JSON.stringify(await client.history()).includes(
        "CORRELATED_RESULT_RECEIVED",
      ),
    );
    observations.push({ singleBrowserContinuation: true });
  } finally {
    host.dispose();
  }
  writeFileSync(
    join(directory, "observations.json"),
    JSON.stringify(observations, null, 2),
  );
  process.stdout.write(`SINGLE_BROWSER_PROPOSAL_PASS ${directory}\n`);
} finally {
  await application.stop();
}
