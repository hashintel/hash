/** Ledger commit recovery safety through the built mount and original local store.
 * Spawned by `test/integration/history-retention-crash.test.ts`. Fault injection is process-local only.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  type JsonValue,
} from "@earendil-works/pi-ai";
import { createFlueClient } from "@flue/sdk";

import { agentOwnershipHeaders } from "@hashintel/brunch-agent";
import { installFauxProvider } from "@local/pi-faux-providers/install-faux-provider";

import { flueConversationId } from "../../src/shared/conversation/identity.ts";
import { loadBuiltBrunchApplication } from "../load-built-application.ts";

import type { AgentSendResult, FlueConversationSnapshot } from "@flue/sdk";

const directory = process.env.A4_DIAGNOSTIC_DIRECTORY;
assert(directory);
const phase = process.env.A4_PHASE ?? "create";
assert(phase === "create" || phase === "recover");
const label = `${phase}-${process.env.A4_FAULT ?? "plain"}`;
const save = (name: string, value: unknown) =>
  writeFileSync(
    join(directory, `${label}-${name}.json`),
    `${JSON.stringify(value, null, 2)}\n`,
  );
assert(
  !existsSync(join(directory, `${label}-result.json`)),
  "Fresh observation required",
);
const dbPath = join(directory, "conversation.db");
assert.equal(existsSync(dbPath), phase === "recover");
const identity = {
  principalKey: `a4-crash-${basename(directory)}`,
  conversationId: `a4-crash-${basename(directory)}`,
};
const inspect = () => {
  const database = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return {
      batches: database
        .prepare(
          "SELECT seq, data FROM flue_conversation_stream_batches ORDER BY seq",
        )
        .all()
        .map((row) => ({
          seq: row.seq,
          data: JSON.parse(String(row.data)) as unknown,
        })),
      submissions: database
        .prepare(
          "SELECT submission_id, status, attempt_count, error, settlement_record FROM flue_agent_submissions ORDER BY sequence",
        )
        .all(),
    };
  } finally {
    database.close();
  }
};
if (phase === "recover") save("store-before-boot", inspect());
process.env.NODE_ENV = "test";
process.env.OTEL_SDK_DISABLED = "true";
delete process.env.HASH_OTLP_ENDPOINT;
process.env.BRUNCH_DEV_DB_PATH = dbPath;
const nativeFetch = globalThis.fetch;
globalThis.fetch = () => {
  throw new Error("Network disabled in crash diagnostic");
};
const faux = fauxProvider({ provider: "openai" });
const contexts: unknown[] = [];
installFauxProvider({
  ...faux.provider,
  streamSimple(model, context, options) {
    contexts.push(JSON.parse(JSON.stringify(context)) as unknown);
    save("contexts", contexts);
    return faux.provider.streamSimple(model, context, options);
  },
});
const entries = [
  [
    "entity/create",
    {
      name: "Crash boundary",
      kind: "thing",
      origin: "inferred",
      status: "confirmed",
    },
  ],
  [
    "claim/create",
    {
      text: "Crash-boundary diagnostic, not elicited testimony. Preserve exact source.",
      entities: ["$0"],
      origin: "inferred",
      status: "confirmed",
    },
  ],
];
const nextEntries = [
  [
    "claim/create",
    {
      text: "Next synthetic diagnostic commit after recovery.",
      entities: ["e1"],
      origin: "inferred",
      status: "confirmed",
      supersedes: ["c1"],
    },
  ],
];
const response = (id: string, commitEntries: readonly JsonValue[]) =>
  fauxAssistantMessage(
    fauxToolCall("ledger_commit", { entries: commitEntries }, { id }),
    { stopReason: "toolUse" },
  );
faux.setResponses(
  phase === "create"
    ? [
        response("a4-crash-revision", entries),
        fauxAssistantMessage("Synthetic commit acknowledged."),
      ]
    : Array.from({ length: 6 }, () =>
        fauxAssistantMessage("Recovered diagnostic continuation only."),
      ),
);
const application = await loadBuiltBrunchApplication();
const client = createFlueClient({
  url: `http://a4.in-process/agents/petrinaut/${flueConversationId(identity)}`,
  headers: agentOwnershipHeaders(identity),
  fetch: async (input, init) =>
    application.fetch(
      input instanceof Request ? input : new Request(input, init),
    ),
});
const tools = (snapshot: FlueConversationSnapshot) =>
  snapshot.messages
    .flatMap((message) => message.parts)
    .filter((part) => part.type === "dynamic-tool");
const assertCommit = (
  snapshot: FlueConversationSnapshot,
  commitId: string,
  commitEntries: readonly unknown[],
  output: Record<string, unknown>,
) => {
  const tool = tools(snapshot).find((part) => part.toolCallId === commitId);
  assert(tool?.state === "output-available");
  assert.deepEqual(
    tool.input,
    { entries: commitEntries },
    "Raw call input survives",
  );
  assert.partialDeepStrictEqual(
    tool.output,
    { status: "recorded", commitId, ...output },
    "Stable call identity and host-assigned record IDs",
  );
};
try {
  if (phase === "create") {
    const receipt = await client.send({
      uid: null,
      initialData: {
        binding: {
          conversationId: identity.conversationId,
          documentId: "a4-no-browser-crash-diagnostic",
        },
      },
      message: {
        kind: "user",
        body: "Record the explicitly synthetic crash diagnostic commit.",
      },
    });
    writeFileSync(
      join(directory, "receipt.json"),
      `${JSON.stringify(
        { receipt, pid: process.pid, identity, entries },
        null,
        2,
      )}\n`,
    );
    await client.read(receipt, { signal: AbortSignal.timeout(60000) });
    const history = await client.history();
    save("history", history);
    save("result", {
      outcome: "normal-control",
      pid: process.pid,
      providerCalls: faux.state.callCount,
    });
  } else {
    const original = JSON.parse(
      readFileSync(join(directory, "receipt.json"), "utf8"),
    ) as { receipt: AgentSendResult; pid: number };
    assert.notEqual(process.pid, original.pid);
    await client.read(original.receipt, { signal: AbortSignal.timeout(60000) });
    save("store-after-recovery", inspect());
    // The recovered Ledger is observed at the product boundary: the next
    // commit must supersede the recovered Note under the next address.
    const recovered = await client.history();
    save("history", recovered);
    faux.setResponses([
      response("a4-next-revision", nextEntries),
      fauxAssistantMessage("Next commit acknowledged."),
    ]);
    await client.read(
      await client.send({
        uid: original.receipt.uid,
        message: {
          kind: "user",
          body: "Record the next synthetic commit to expose the recovered Ledger.",
        },
      }),
      { signal: AbortSignal.timeout(30000) },
    );
    const next = await client.history();
    save("next-history", next);
    save("result", {
      outcome: "observations-before-safety-assertions",
      pid: process.pid,
      originalPid: original.pid,
      recoveredTools: tools(recovered),
      nextTools: tools(next),
      providerCalls: faux.state.callCount,
    });
    // Persist both observations before asserting, so failures retain the next commit too.
    assertCommit(recovered, "a4-crash-revision", entries, {
      revision: 1,
      ids: ["e1", "c1"],
    });
    assertCommit(next, "a4-next-revision", nextEntries, {
      revision: 2,
      ids: ["c2"],
    });
    assert.deepEqual(
      tools(next).map((part) => part.toolCallId),
      ["a4-crash-revision", "a4-next-revision"],
      "Recovery must not reissue the completed call or reuse a commit ID",
    );
    save("safety", { verdict: "Pass", exactLedger: true, nextRevision: 2 });
  }
} finally {
  await application.stop();
  save("store-after-stop", inspect());
  globalThis.fetch = nativeFetch;
}
