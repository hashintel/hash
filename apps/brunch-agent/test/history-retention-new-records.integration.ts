/** Reopen ONLY the disposable store freshly produced by mutation-records.integration.ts.
 * Saved history is an equality oracle, never input/import authority. Synthetic-model records, not testimony.
 */
/* eslint-disable no-await-in-loop -- The original store has exactly one sequential owner and folding is observed between turns. */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import { observe } from "@flue/runtime";
import { createFlueClient, FlueApiError } from "@flue/sdk";

import { CONSTRUCTION_CONTEXT_SIGNAL_TYPE } from "@hashintel/brunch-agent-plugin-sdcpn/flue";
import {
  clientToolHistoryFrom,
  snapshotToUiMessages,
} from "@hashintel/brunch-agent-transport-aisdk";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../src/conversation/identity.ts";
import { installFauxProvider } from "../src/evaluations/install-faux-provider.ts";
import { loadBuiltBrunchApplication } from "../src/evaluations/runbook/load-built-application.ts";

import type { Context } from "@earendil-works/pi-ai";
import type { FlueObservation } from "@flue/runtime";
import type { FlueConversationSnapshot } from "@flue/sdk";

const directory = process.env.A4_OUTPUT_DIRECTORY;
assert(directory, "Name the freshly produced browser witness directory");
const phase = process.env.A4_PHASE ?? "fold";
assert(phase === "fold" || phase === "reopen");
const save = (name: string, value: unknown) =>
  writeFile(
    join(directory, `retention-${name}.json`),
    `${JSON.stringify(value, null, 2)}\n`,
  );
const load = async (name: string): Promise<unknown> =>
  JSON.parse(await readFile(join(directory, name), "utf8")) as unknown;
assert(
  !existsSync(join(directory, `retention-${phase}-result.json`)),
  "Never overwrite a completed observation",
);
assert(
  existsSync(join(directory, "conversation.db")),
  "Never create a substitute store",
);
const storage = (await load("initial-storage.json")) as Record<string, string>;
const principalEntry = Object.entries(storage).find(([key]) =>
  key.includes("principal"),
);
assert(principalEntry);
const principalKey = principalEntry[1].startsWith('"')
  ? (JSON.parse(principalEntry[1]) as string)
  : principalEntry[1];
const preparation = (await load("preparation-request.json")) as {
  initialData: { browser: { binding: { conversationId: string } } };
};
const identity = {
  principalKey,
  conversationId: preparation.initialData.browser.binding.conversationId,
};
const instanceId = flueConversationIdFrom(identity);
process.env.NODE_ENV = "test";
process.env.OTEL_SDK_DISABLED = "true";
delete process.env.HASH_OTLP_ENDPOINT;
process.env.BRUNCH_CHAT_MODEL = "claude-sonnet-4-6";
process.env.BRUNCH_DEV_DB_PATH = join(directory, "conversation.db");
process.env.BRUNCH_TEST_KEEP_RECENT_TOKENS = "256";
const nativeFetch = globalThis.fetch;
globalThis.fetch = () => {
  throw new Error(
    "External fetch forbidden in the in-process retained-store probe",
  );
};
const events: FlueObservation[] = [];
let purpose = "agent";
const unsubscribe = observe((event) => {
  if (event.type === "turn_request") purpose = event.purpose;
  if (
    ["turn_request", "turn", "compaction_start", "compaction", "log"].includes(
      event.type,
    )
  )
    events.push(event);
});
const contexts: { purpose: string; context: Context }[] = [];
const faux = fauxProvider({
  provider: "anthropic",
  models: [{ id: "claude-sonnet-4-6", contextWindow: 64000, maxTokens: 16000 }],
});
installFauxProvider(faux.provider);
faux.setResponses(
  Array.from({ length: 30 }, () => (context: Context) => {
    contexts.push({
      purpose,
      context: JSON.parse(JSON.stringify(context)) as Context,
    });
    return fauxAssistantMessage(
      purpose.startsWith("compaction")
        ? "A4 new-record controlled summary. Earlier prepared synthetic activity occurred. Exact original messages, revision inputs and browser sidecars intentionally omitted."
        : "A4 retention acknowledgement only; no tools, mutation replay or why claim.",
    );
  }),
);
const application = await loadBuiltBrunchApplication();
const transport: typeof fetch = (input, init) =>
  Promise.resolve(
    application.fetch(
      input instanceof Request ? input : new Request(input, init),
    ),
  );
const url = `http://a4.in-process/agents/chat/${instanceId}`;
const client = createFlueClient({
  url,
  fetch: transport,
  headers: agentOwnershipHeaders(identity),
});
const status = async (operation: () => Promise<unknown>) => {
  try {
    await operation();
    return 200;
  } catch (error) {
    if (error instanceof FlueApiError) return error.status;
    throw error;
  }
};
const tools = (snapshot: FlueConversationSnapshot) =>
  snapshot.messages
    .flatMap((message) => message.parts)
    .filter((part) => part.type === "dynamic-tool");
const projection = (snapshot: FlueConversationSnapshot) =>
  snapshotToUiMessages(snapshot, {
    clientToolNames: new Set(["addArc", "getLatestNetDefinition"]),
    validatedClientToolNames: new Set(["addArc"]),
  });
const currentRevision = (snapshot: FlueConversationSnapshot) => {
  const signal = snapshot.messages.findLast(
    (message) => message.signal?.tagName === CONSTRUCTION_CONTEXT_SIGNAL_TYPE,
  );
  assert(signal, "The real plugin must expose its current core revision");
  return (
    JSON.parse(
      signal.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join(""),
    ) as { currentWorkpiece: unknown }
  ).currentWorkpiece;
};
try {
  const before = await client.history();
  const expected = await load(
    phase === "fold" ? "conflicting-history.json" : "retention-after.json",
  );
  assert.deepEqual(
    before,
    expected,
    "Exact canonical public history must reopen from the original store",
  );
  assert.equal(faux.state.callCount, 0);
  const authorization = {
    missing: await status(() =>
      createFlueClient({ url, fetch: transport }).history(),
    ),
    foreignPrincipal: await status(() =>
      createFlueClient({
        url,
        fetch: transport,
        headers: agentOwnershipHeaders({
          ...identity,
          principalKey: "a4-other-principal",
        }),
      }).history(),
    ),
    foreignConversation: await status(() =>
      createFlueClient({
        url,
        fetch: transport,
        headers: agentOwnershipHeaders({
          ...identity,
          conversationId: "a4-other-conversation",
        }),
      }).history(),
    ),
    wrongUid: await status(() =>
      client.send({
        uid: "a4-wrong-incarnation",
        message: { kind: "user", body: "Must not enter history" },
      }),
    ),
  };
  assert.deepEqual(authorization, {
    missing: 401,
    foreignPrincipal: 403,
    foreignConversation: 403,
    wrongUid: 404,
  });
  assert.deepEqual(await client.history(), before);
  const revisionTool = tools(before).find(
    (part) => part.toolCallId === "m7-browser-revision",
  );
  assert(revisionTool?.state === "output-available");
  const revision = currentRevision(before);
  assert.deepEqual(revision, {
    ...(revisionTool.input as object),
    ...(revisionTool.output as object),
  });
  const arc = tools(before).find(
    (part) => part.toolCallId === "m7-browser-arc",
  );
  assert(arc?.state === "output-available");
  const original = arc.input as { weight: string; brunch: unknown };
  assert.equal(original.weight, "1");
  const results = clientToolHistoryFrom(before.messages).results;
  const arcResults = results.filter(
    (result) => result.toolCallId === "m7-browser-arc",
  );
  assert(arcResults.length >= 1);
  const record = (await load("mutation-records.json")) as {
    attempts: { request: { input: { weight: number }; envelope: unknown } }[];
  };
  assert.equal(record.attempts[0]?.request.input.weight, 1);
  const send = async (body: string) => {
    const receipt = await client.send({ message: { kind: "user", body } });
    await client.read(receipt, { signal: AbortSignal.timeout(30000) });
    return receipt;
  };
  await save(`${phase}-before`, before);
  if (phase === "fold") {
    // A generous reserve separates the threshold band from silent overflow. Faux usage triggers the real runtime; no private compaction call.
    for (
      let index = 0;
      index < 9 &&
      !events.some((event) => event.type === "compaction" && !event.isError);
      index++
    ) {
      await send(
        `A4 explicit non-evidence threshold filler ${index}. ${"synthetic-padding ".repeat(index === 0 ? 2000 : 1000)}`,
      );
    }
    assert(
      events.some(
        (event) =>
          event.type === "compaction_start" && event.reason === "threshold",
      ),
    );
    assert(
      !events.some(
        (event) =>
          event.type === "compaction_start" && event.reason === "overflow",
      ),
    );
    assert(
      events.some(
        (event) =>
          event.type === "compaction" &&
          !event.isError &&
          event.messagesAfter < event.messagesBefore,
      ),
    );
  } else {
    const previous = (await load("retention-fold-result.json")) as {
      pid: number;
    };
    assert.notEqual(process.pid, previous.pid);
  }
  const receipt = await send(
    "A4 retained-store follow-up only. No tool execution and no product why operation.",
  );
  const after = await client.history();
  const byId = new Map(after.messages.map((message) => [message.id, message]));
  const lost = before.messages.filter((message) => !byId.has(message.id));
  const changed = before.messages.filter(
    (message) =>
      byId.has(message.id) &&
      JSON.stringify(byId.get(message.id)) !== JSON.stringify(message),
  );
  await save(`${phase}-comparison`, {
    beforeIds: before.messages.map((message) => message.id),
    afterIds: after.messages.map((message) => message.id),
    lost,
    changed,
    revisionBefore: revision,
    revisionAfter: currentRevision(after),
    originalInput: arc.input,
    browserRecord: record,
    clientResultsBefore: results,
    clientResultsAfter: clientToolHistoryFrom(after.messages).results,
  });
  assert.deepEqual(lost, []);
  assert.deepEqual(changed, []);
  assert.deepEqual(currentRevision(after), revision);
  assert.deepEqual(
    tools(after),
    tools(before),
    "Retention must not reissue or execute any mutation/revision tool",
  );
  assert.deepEqual(clientToolHistoryFrom(after.messages).results, results);
  assert(
    !projection(after).some((message) =>
      message.parts.some(
        (part) =>
          part.type === "tool-addArc" && part.state === "input-available",
      ),
    ),
  );
  const latestContext = contexts.findLast((entry) => entry.purpose === "agent");
  assert(latestContext);
  const serialized = JSON.stringify(latestContext.context);
  assert(serialized.includes("A4 new-record controlled summary"));
  assert(
    !serialized.includes('"id":"m7-browser-revision"'),
    "Original assistant call must have folded away",
  );
  assert(
    !serialized.includes(
      "Settle the labelled prepared workpiece for this unpaid mechanical tracer",
    ),
    "Original synthetic user wording must leave model context",
  );
  await save(phase === "fold" ? "after" : "reopened-after", after);
  await save(`${phase}-ui`, projection(after));
  await save(`${phase}-result`, {
    outcome: "pass",
    pid: process.pid,
    identity,
    instanceId,
    dbPath: process.env.BRUNCH_DEV_DB_PATH,
    conversationId: after.conversationId,
    incarnation: after.incarnation,
    receipt,
    authorization,
    historyProviderCalls: 0,
    providerCalls: faux.state.callCount,
    contextWindow: 64000,
    maxTokens: 16000,
    keepRecentTokens: 256,
    reissuedTools: 0,
    publicLostIds: [],
    publicChangedRecords: [],
    currentRevision: revision,
    limits:
      "Prepared synthetic-model records; public hydration/no executor reapplication, not a second live browser or crash proof; no A5 why",
  });
  process.stdout.write(`A4_NEW_RECORDS_${phase.toUpperCase()}_PASS\n`);
} finally {
  await save(`${phase}-final-history`, await client.history());
  await application.stop();
  unsubscribe();
  globalThis.fetch = nativeFetch;
  await save(`${phase}-events`, events);
  await save(`${phase}-contexts`, contexts);
}
