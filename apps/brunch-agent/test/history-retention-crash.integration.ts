/** Revision recovery safety through the built mount and original local store. Fault injection is process-local only. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { createFlueClient } from "@flue/sdk";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../src/conversation/identity.ts";
import { installFauxProvider } from "../src/evaluations/install-faux-provider.ts";
import { loadBuiltBrunchApplication } from "../src/evaluations/runbook/load-built-application.ts";

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
process.env.BRUNCH_CHAT_MODEL = "a4-crash-faux";
process.env.BRUNCH_DEV_DB_PATH = dbPath;
const nativeFetch = globalThis.fetch;
globalThis.fetch = () => {
  throw new Error("Network disabled in crash diagnostic");
};
const faux = fauxProvider({
  provider: "anthropic",
  models: [{ id: "a4-crash-faux" }],
});
const contexts: unknown[] = [];
installFauxProvider({
  ...faux.provider,
  streamSimple(model, context, options) {
    contexts.push(JSON.parse(JSON.stringify(context)) as unknown);
    save("contexts", contexts);
    return faux.provider.streamSimple(model, context, options);
  },
});
const markdown =
  "# A4 synthetic revision\n\nCrash-boundary diagnostic, not elicited testimony. Preserve exact source.\n";
const response = (id: string, content: string) =>
  fauxAssistantMessage(
    fauxToolCall("update_workpiece", { markdown: content }, { id }),
    { stopReason: "toolUse" },
  );
faux.setResponses(
  phase === "create"
    ? [
        response("a4-crash-revision", markdown),
        fauxAssistantMessage("Synthetic revision acknowledged."),
      ]
    : Array.from({ length: 6 }, () =>
        fauxAssistantMessage("Recovered diagnostic continuation only."),
      ),
);
const application = await loadBuiltBrunchApplication();
const client = createFlueClient({
  url: `http://a4.in-process/agents/chat/${flueConversationIdFrom(identity)}`,
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
const assertRevision = (
  snapshot: FlueConversationSnapshot,
  revisionId: string,
  content: string,
  ordinal: number,
) => {
  const pointer = {
    revisionId,
    sha256: createHash("sha256").update(content).digest("hex"),
    ordinal,
  };
  const tool = tools(snapshot).find((part) => part.toolCallId === revisionId);
  assert(tool?.state === "output-available");
  assert.deepEqual(
    tool.input,
    { markdown: content },
    "Raw call input survives",
  );
  assert.deepEqual(
    tool.output,
    pointer,
    "Stable call/result identity and ordinal",
  );
  const signal = snapshot.messages.findLast(
    (message) => message.signal?.tagName === "brunch.construction-context",
  );
  assert(signal);
  const context = JSON.parse(
    signal.parts
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join(""),
  ) as { currentWorkpiece: unknown };
  assert.deepEqual(
    context.currentWorkpiece,
    { ...pointer, markdown: content },
    "A successful result must retain its exact current state, not only historical JSON",
  );
};
try {
  if (phase === "create") {
    const receipt = await client.send({
      uid: null,
      initialData: {
        mode: "validated-fixture-mutation",
        browser: {
          binding: {
            conversationId: identity.conversationId,
            documentId: "a4-no-browser-crash-diagnostic",
            incarnationId: basename(directory),
          },
          requestedBaseHash: "a".repeat(64),
        },
      },
      message: {
        kind: "user",
        body: "Record the explicitly synthetic crash diagnostic revision.",
      },
    });
    writeFileSync(
      join(directory, "receipt.json"),
      `${JSON.stringify({ receipt, pid: process.pid, identity, markdown }, null, 2)}\n`,
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
    save("history-before-state-render", await client.history());
    save("store-after-recovery", inspect());
    // Construction context is render-captured at submission entry, not a live state getter.
    // A new real, prose-only submission observes the current state without writing it.
    const renderCurrentState = async () => {
      faux.setResponses([
        fauxAssistantMessage("Read-only state observation acknowledged."),
      ]);
      await client.read(
        await client.send({
          uid: original.receipt.uid,
          message: {
            kind: "user",
            body: "Observe the current synthetic revision without changing it or calling tools.",
          },
        }),
        { signal: AbortSignal.timeout(30000) },
      );
      return client.history();
    };
    const recovered = await renderCurrentState();
    save("history", recovered);
    faux.setResponses([
      response("a4-next-revision", "# Next synthetic diagnostic revision"),
      fauxAssistantMessage("Next revision acknowledged."),
    ]);
    await client.read(
      await client.send({
        uid: original.receipt.uid,
        message: {
          kind: "user",
          body: "Record the next synthetic revision to expose the recovered ordinal.",
        },
      }),
      { signal: AbortSignal.timeout(30000) },
    );
    save("next-history-before-state-render", await client.history());
    const next = await renderCurrentState();
    save("next-history", next);
    save("result", {
      outcome: "observations-before-safety-assertions",
      pid: process.pid,
      originalPid: original.pid,
      recoveredTools: tools(recovered),
      nextTools: tools(next),
      providerCalls: faux.state.callCount,
    });
    // Persist both observations before asserting, so failures retain the next ordinal too.
    assertRevision(recovered, "a4-crash-revision", markdown, 1);
    assertRevision(
      next,
      "a4-next-revision",
      "# Next synthetic diagnostic revision",
      2,
    );
    assert.deepEqual(
      tools(next).map((part) => part.toolCallId),
      ["a4-crash-revision", "a4-next-revision"],
      "Recovery must not reissue the completed call or reuse a revision ID",
    );
    save("safety", { verdict: "Pass", exactState: true, nextOrdinal: 2 });
  }
} finally {
  await application.stop();
  save("store-after-stop", inspect());
  globalThis.fetch = nativeFetch;
}
