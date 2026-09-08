import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { observe } from "@flue/runtime";
import { createFlueClient, FlueApiError } from "@flue/sdk";

import { projectFlueHistoryForSweep } from "@hashintel/brunch-agent-binding-flue";
import {
  clientToolHistoryFrom,
  snapshotToUiMessages,
} from "@hashintel/brunch-agent-transport-aisdk";
import { BRUNCH_QUESTION_TOOL_NAME } from "@hashintel/brunch-agent/question-marker";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../src/conversation/identity.ts";
import { installFauxProvider } from "../src/evaluations/install-faux-provider.ts";
import { loadBuiltBrunchApplication } from "../src/evaluations/runbook/load-built-application.ts";

import type { FauxResponseStep } from "@earendil-works/pi-ai";
import type { FlueObservation } from "@flue/runtime";
import type {
  AgentSendResult,
  DeliveredMessage,
  FlueConversationSnapshot,
} from "@flue/sdk";

// Test-authored records only. These are not revisions, browser transitions or Vestera testimony.
const directory = process.env.A4_OUTPUT_DIRECTORY;
assert(
  directory,
  "A4_OUTPUT_DIRECTORY must name this probe's own existing directory",
);
const phase = process.env.A4_PHASE ?? "create";
assert(phase === "create" || phase === "reopen");
const identity = {
  principalKey: `a4-principal-${basename(directory)}`,
  conversationId: `a4-history-${basename(directory)}`,
};
const instanceId = flueConversationIdFrom(identity);
const dbPath = join(directory, "conversation.db");
assert.equal(
  existsSync(dbPath),
  phase === "reopen",
  "Create requires a fresh store; reopen requires the retained store",
);
const modelId = "a4-faux-only";
const contextWindow = 16000;
const maxTokens = 1024;
const keepRecentTokens = 256;
const overflowProbe = process.env.A4_OVERFLOW_PROBE === "1";
const explicitOverflow = process.env.A4_OVERFLOW_ERROR === "1";
const cancelOverflow = process.env.A4_OVERFLOW_CANCEL === "1";
assert(!explicitOverflow || overflowProbe);
assert(!cancelOverflow || (overflowProbe && !explicitOverflow));
let compactionEntered = () => {};
const compactionStarted = new Promise<void>((resolve) => {
  compactionEntered = resolve;
});
let compactionAborted = false;
process.env.BRUNCH_CHAT_MODEL = modelId;
process.env.BRUNCH_DEV_DB_PATH = dbPath;
process.env.BRUNCH_TEST_KEEP_RECENT_TOKENS = String(keepRecentTokens);
process.env.NODE_ENV = "test";
process.env.OTEL_SDK_DISABLED = "true";
delete process.env.HASH_OTLP_ENDPOINT;
const nativeFetch = globalThis.fetch;
globalThis.fetch = () => {
  throw new Error("External fetch forbidden in the in-process A4 probe");
};

const save = async (name: string, value: unknown) =>
  writeFile(join(directory, name), `${JSON.stringify(value, null, 2)}\n`);
const completedText = "A4 filler acknowledged.";
type CompletionPin = {
  event: Extract<FlueObservation, { type: "turn" }>;
  records: Record<string, unknown>[];
  priorErrorRecords: Record<string, unknown>[];
  message: FlueConversationSnapshot["messages"][number];
};
let completionPin: CompletionPin | undefined =
  phase === "reopen"
    ? (JSON.parse(
        await readFile(join(directory, "completed-response.json"), "utf8"),
      ) as CompletionPin)
    : undefined;
// Independent of client.history(): read the real committed source, never insert or import it.
const canonicalRecords = () => {
  const database = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return database
      .prepare("SELECT data FROM flue_conversation_stream_batches ORDER BY seq")
      .all()
      .flatMap(
        (row) => JSON.parse(String(row.data)) as Record<string, unknown>[],
      );
  } finally {
    database.close();
  }
};
const captureCompletion = (
  event: Extract<FlueObservation, { type: "turn" }>,
) => {
  assert.equal(
    completionPin,
    undefined,
    "The intended successful response must complete exactly once",
  );
  assert.equal(event.response.finishReason, "stop");
  assert.equal(event.isError, false);
  const source = canonicalRecords();
  const records = source.filter((record) => record.turnId === event.turnId);
  const starts = records.filter(
    (record) => record.type === "assistant_message_started",
  );
  const ends = records.filter(
    (record) => record.type === "assistant_message_completed",
  );
  assert.equal(starts.length, 1);
  assert.equal(ends.length, 1);
  const start = starts[0];
  const end = ends[0];
  assert(
    start &&
      end &&
      typeof start.messageId === "string" &&
      typeof start.submissionId === "string",
  );
  assert.equal(end.messageId, start.messageId);
  assert.equal(end.stopReason, "stop");
  assert.equal(start.submissionId, event.submissionId);
  assert.equal(start.conversationId, event.conversationId);
  const textStarts = records.filter(
    (record) => record.type === "assistant_text_started",
  );
  const textEnds = records.filter(
    (record) => record.type === "assistant_text_completed",
  );
  assert.equal(textStarts.length, 1);
  assert.equal(textEnds.length, 1);
  const textStart = textStarts[0];
  const textEnd = textEnds[0];
  assert(textStart && textEnd);
  const deltas = records.filter(
    (record) => record.type === "assistant_text_delta",
  );
  assert.equal(textEnd.deltaCount, deltas.length);
  for (const [index, delta] of deltas.entries()) {
    assert.equal(delta.sequence, index);
    assert.equal(delta.messageId, start.messageId);
    assert.equal(delta.blockId, textStart.blockId);
  }
  assert.equal(deltas.map((record) => record.delta).join(""), completedText);
  const priorErrorRecords = source.filter(
    (record) =>
      record.submissionId === event.submissionId &&
      record.turnId !== event.turnId &&
      String(record.type).startsWith("assistant_"),
  );
  let publicStart = start;
  if (explicitOverflow) {
    const errorStarts = priorErrorRecords.filter(
      (record) => record.type === "assistant_message_started",
    );
    const errorEnds = priorErrorRecords.filter(
      (record) => record.type === "assistant_message_completed",
    );
    assert.equal(errorStarts.length, 1);
    assert.equal(errorEnds.length, 1);
    const errorStart = errorStarts[0];
    const errorEnd = errorEnds[0];
    assert(errorStart && errorEnd);
    assert.equal(errorEnd.messageId, errorStart.messageId);
    assert.equal(errorEnd.stopReason, "error");
    assert.equal(
      errorEnd.error,
      "Synthetic explicit overflow (request_too_large)",
    );
    assert.equal(
      priorErrorRecords
        .filter((record) => record.type === "assistant_text_delta")
        .map((record) => record.delta)
        .join(""),
      "",
    );
    // Flue folds same-submission assistant steps into the FIRST step's public
    // id/turnId, appending parts. The failed first step is not a successful stop.
    publicStart = errorStart;
  } else assert.deepEqual(priorErrorRecords, []);
  assert(
    typeof publicStart.messageId === "string" &&
      typeof publicStart.turnId === "string",
  );
  completionPin = {
    event,
    records,
    priorErrorRecords,
    message: {
      id: publicStart.messageId,
      role: "assistant",
      purpose: "assistant",
      display: "visible",
      submissionId: start.submissionId,
      turnId: publicStart.turnId,
      parts: [
        ...(explicitOverflow
          ? [{ type: "text" as const, text: "", state: "done" as const }]
          : []),
        { type: "text", text: completedText, state: "done" },
      ],
    },
  };
  const path = join(directory, "completed-response.json");
  assert(!existsSync(path));
  // turn is emitted after the awaited assistant_message_completed append, before compaction.
  writeFileSync(path, `${JSON.stringify(completionPin, null, 2)}\n`);
};
const assertCompletedResponse = (snapshot: FlueConversationSnapshot) => {
  const pin = completionPin;
  assert(pin, "Independent canonical completion pin required");
  assert.equal(snapshot.conversationId, pin.event.conversationId);
  assert.deepEqual(
    snapshot.messages.filter((message) => message.id === pin.message.id),
    [pin.message],
    "The pinned completed response must survive exactly once, with exact identity/content",
  );
  assert.equal(
    snapshot.messages.filter((message) =>
      message.parts.some(
        (part) => part.type === "text" && part.text === completedText,
      ),
    ).length,
    1,
    "The successful response must not be replaced by another identity or duplicated",
  );
  const submissionId = pin.message.submissionId;
  assert.deepEqual(
    snapshot.settlements.filter((item) => item.submissionId === submissionId),
    [
      {
        submissionId,
        outcome: "completed",
        answeredBySubmissionId: submissionId,
      },
    ],
    "The response's own completed settlement must remain exact",
  );
};
const pinSettlement = async (receipt: AgentSendResult) => {
  assert(completionPin);
  assert.equal(receipt.submissionId, completionPin.message.submissionId);
  const records = canonicalRecords().filter(
    (record) =>
      record.type === "submission_settled" &&
      record.submissionId === receipt.submissionId,
  );
  assert.equal(records.length, 1);
  assert.equal(records[0]?.outcome, "completed");
  assert.equal(records[0].conversationId, completionPin.event.conversationId);
  await save("completed-response-settlement.json", { receipt, records });
};
const events: FlueObservation[] = [];
let purpose: Extract<FlueObservation, { type: "turn_request" }>["purpose"] =
  "agent";
const unsubscribe = observe((event) => {
  if (event.type === "turn_request") purpose = event.purpose;
  if (
    event.type === "turn" &&
    event.purpose === "agent" &&
    event.response.output?.content.some(
      (part) => part.type === "text" && part.text === completedText,
    )
  ) {
    captureCompletion(event);
  }
  if (["compaction_start", "compaction", "turn", "log"].includes(event.type))
    events.push(event);
});
const faux = fauxProvider({
  provider: "anthropic",
  models: [{ id: modelId, contextWindow, maxTokens }],
});
installFauxProvider(faux.provider);
const contexts: {
  purpose: Extract<FlueObservation, { type: "turn_request" }>["purpose"];
  context: unknown;
}[] = [];
const responses: ReturnType<typeof fauxAssistantMessage>[] = [];
const nextResponse: FauxResponseStep = async (context, options) => {
  contexts.push({
    purpose,
    context: JSON.parse(JSON.stringify(context)) as unknown,
  });
  if (purpose === "compaction" || purpose === "compaction_prefix") {
    if (phase === "create" && cancelOverflow && !compactionAborted) {
      const signal = options?.signal;
      assert(signal, "The real summarizer must receive active cancellation");
      compactionEntered();
      await new Promise<void>((_resolve, reject) => {
        const abort = () => {
          compactionAborted = true;
          reject(new Error("Synthetic summary cancelled"));
        };
        if (signal.aborted) abort();
        else signal.addEventListener("abort", abort, { once: true });
      });
      assert.fail("Cancelled compaction must not publish a summary");
    }
    // The runtime requests, persists and applies this controlled provider summary.
    // Its deliberately lossy text is never substituted for historical source evidence.
    return fauxAssistantMessage(
      "A4 controlled summary: earlier synthetic test activity occurred; exact quotations and tool payloads are intentionally omitted.",
    );
  }
  const response = responses.shift();
  assert(response, "Unexpected agent-purpose call; no live-provider fallback");
  return response;
};
faux.setResponses(Array.from({ length: 40 }, () => nextResponse));
const application = await loadBuiltBrunchApplication();
const transport: typeof fetch = async (input, init) =>
  application.fetch(
    input instanceof Request ? input : new Request(input, init),
  );
const url = `http://a4.in-process/agents/chat/${instanceId}`;
const client = createFlueClient({
  url,
  fetch: transport,
  headers: agentOwnershipHeaders(identity),
});
const tools = (name: string, input: Record<string, unknown>, id: string) =>
  fauxAssistantMessage(fauxToolCall(name, input, { id }), {
    stopReason: "toolUse",
  });
const project = (snapshot: FlueConversationSnapshot) =>
  snapshotToUiMessages(snapshot, {
    clientToolNames: new Set(["readPetrinautDoc"]),
    hiddenToolNames: new Set([BRUNCH_QUESTION_TOOL_NAME]),
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
const authorization = async () => ({
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
  correctlyBoundMissingConversation: await status(() =>
    createFlueClient({
      url: `http://a4.in-process/agents/chat/${flueConversationIdFrom({ ...identity, conversationId: "a4-absent" })}`,
      fetch: transport,
      headers: agentOwnershipHeaders({
        ...identity,
        conversationId: "a4-absent",
      }),
    }).history(),
  ),
});
const send = async (message: DeliveredMessage, uid?: string | null) => {
  const admission = await client.send({
    message,
    ...(uid === undefined ? {} : { uid }),
  });
  await client.read(admission, { signal: AbortSignal.timeout(20000) });
  return admission;
};
const completeClientTool = async (toolCallId: string, output: string) =>
  send({
    kind: "signal",
    type: "client-tool-result",
    tagName: "client-tool-result",
    attributes: { toolCallIds: toolCallId },
    body: JSON.stringify([
      { toolCallId, toolName: "readPetrinautDoc", output },
    ]),
  });

try {
  const authorizationResult = await authorization();
  assert.deepEqual(authorizationResult, {
    missing: 401,
    foreignPrincipal: 403,
    foreignConversation: 403,
    correctlyBoundMissingConversation: 404,
  });
  if (phase === "create") {
    assert.equal(
      await status(() => client.history()),
      404,
      "Never write into an existing conversation",
    );
    responses.push(
      tools("ping", { note: "a4-early-ping" }, "a4-ping-early"),
      tools(
        BRUNCH_QUESTION_TOOL_NAME,
        { question: "Which synthetic record follows?" },
        "a4-question",
      ),
      tools("readPetrinautDoc", { doc: "ai-assistant" }, "a4-doc-early"),
      fauxAssistantMessage(
        "Which synthetic record follows? A4 first controlled continuation.",
      ),
    );
    const admission = await send(
      {
        kind: "user",
        body: "A4 test-authored early source: violet gear. Not operational testimony.",
      },
      null,
    );
    const pending = await client.history();
    assert(
      project(pending)
        .flatMap((message) => message.parts)
        .some(
          (part) =>
            "toolCallId" in part &&
            part.toolCallId === "a4-doc-early" &&
            part.state === "input-available",
        ),
    );
    await completeClientTool(
      "a4-doc-early",
      "A4 test executor's first synthetic documentation result.",
    );
    responses.push(
      tools("ping", { note: "a4-middle-ping" }, "a4-ping-middle"),
      fauxAssistantMessage("A4 middle acknowledged."),
    );
    await send(
      {
        kind: "user",
        body: "A4 unrelated middle source: silver latch. Not support for violet gear.",
      },
      admission.uid,
    );
    responses.push(
      tools("readPetrinautDoc", { doc: "ai-assistant" }, "a4-doc-late"),
      fauxAssistantMessage("A4 second controlled continuation."),
    );
    await send(
      {
        kind: "user",
        body: "A4 test-authored late source: amber wheel. Distinct from the early source.",
      },
      admission.uid,
    );
    await completeClientTool(
      "a4-doc-late",
      "A4 test executor's second synthetic documentation result.",
    );
    const before = await client.history();
    await save("before.json", before);
    assert.equal(
      events.filter((event) => event.type === "compaction").length,
      0,
      "Sources must be captured before folding",
    );
    assert.equal(
      before.messages.filter(
        (message) => message.role === "user" && message.purpose === "user",
      ).length,
      3,
    );
    const publicTools = before.messages
      .flatMap((message) => message.parts)
      .filter((part) => part.type === "dynamic-tool");
    assert.deepEqual(
      publicTools.map((part) => part.toolCallId),
      [
        "a4-ping-early",
        "a4-question",
        "a4-doc-early",
        "a4-ping-middle",
        "a4-doc-late",
      ],
    );
    for (const suffix of ["early", "middle"]) {
      const ping = publicTools.find(
        (part) => part.toolCallId === `a4-ping-${suffix}`,
      );
      assert(ping?.state === "output-available");
      assert.deepEqual(ping.input, { note: `a4-${suffix}-ping` });
      assert.deepEqual(ping.output, { ok: true, note: `a4-${suffix}-ping` });
    }
    const marker = publicTools.find(
      (part) => part.toolCallId === "a4-question",
    );
    assert(marker?.state === "output-available");
    assert.deepEqual(marker.output, { marked: true });
    assert(
      before.messages
        .flatMap((message) => message.parts)
        .some((part) => part.type === "data-brunch-question"),
    );
    const clientResults = clientToolHistoryFrom(before.messages).results;
    assert.deepEqual(
      clientResults.map((result) => result.toolCallId),
      ["a4-doc-early", "a4-doc-late"],
    );
    assert(
      before.messages
        .filter((message) => message.signal?.tagName === "client-tool-result")
        .every(
          (message) =>
            message.role === "system" && message.purpose === "dispatch",
        ),
    );
    await save("pending.json", pending);
    await save("before-ui.json", project(before));
    if (explicitOverflow)
      responses.push(
        fauxAssistantMessage("", {
          stopReason: "error",
          errorMessage: "Synthetic explicit overflow (request_too_large)",
        }),
      );
    responses.push(
      fauxAssistantMessage(completedText),
      fauxAssistantMessage(
        "A4 after-fold continuation; no historical quotation claim.",
      ),
    );
    const agentCallsBeforeFiller = contexts.filter(
      (entry) => entry.purpose === "agent",
    ).length;
    const filler: DeliveredMessage = {
      kind: "user",
      body: `A4 transparent threshold filler, not domain evidence. ${"synthetic-padding ".repeat(overflowProbe ? 4000 : 1350)}`,
    };
    if (cancelOverflow) {
      const receipt = await client.send({
        uid: admission.uid,
        message: filler,
      });
      const settlement = client
        .read(receipt, { signal: AbortSignal.timeout(20000) })
        .then(
          () => null,
          (error: unknown) =>
            error instanceof Error ? error.message : String(error),
        );
      await Promise.race([
        compactionStarted,
        settlement.then(() =>
          assert.fail("Submission settled before compaction was reached"),
        ),
      ]);
      await client.abort();
      const error = await settlement;
      await save("cancellation-observation.json", {
        receipt,
        readError: error,
        compactionAborted,
        history: await client.history(),
      });
      assert(compactionAborted);
      assert.equal(
        contexts.filter((entry) => entry.purpose === "agent").length,
        agentCallsBeforeFiller + 1,
      );
      await pinSettlement(receipt);
      const stopped = await client.history();
      assertCompletedResponse(stopped);
      // This Stop interrupts post-response compaction: the successful assistant
      // stop already exists. Preserve that completed settlement, not an invented
      // rollback; active unfinished-response cancellation has separate oracles.
      assert.equal(
        stopped.settlements.find(
          (item) => item.submissionId === receipt.submissionId,
        )?.outcome,
        "completed",
      );
      const byId = new Map(
        stopped.messages.map((message) => [message.id, message]),
      );
      assert(
        before.messages.every(
          (message) =>
            JSON.stringify(byId.get(message.id)) === JSON.stringify(message),
        ),
      );
      assert.deepEqual(
        clientToolHistoryFrom(stopped.messages).results,
        clientResults,
      );
      await save("cancellation.json", {
        verdict: "Pass",
        receipt,
        error,
        compactionAborted,
        retainedSuccessfulStop: true,
        completedToolReissues: 0,
        eventsAtStop: structuredClone(events),
      });
      await save("cancelled-history.json", stopped);
      // Consume the previously withheld response only for this next actual user input.
      await send(
        {
          kind: "user",
          body: "A4 final short turn: finish the retention probe without tools.",
        },
        admission.uid,
      );
      const after = await client.history();
      await save("after.json", after);
      assertCompletedResponse(after);
      assert.deepEqual(
        after.messages
          .flatMap((message) => message.parts)
          .filter((part) => part.type === "dynamic-tool"),
        publicTools,
      );
      assert.equal(
        after.messages.filter(
          (message) => message.role === "user" && message.purpose === "user",
        ).length,
        5,
      );
      await save("identity.json", {
        identity,
        instanceId,
        dbPath,
        pid: process.pid,
        admission,
        conversationId: after.conversationId,
        incarnation: after.incarnation,
      });
    } else {
      const fillerReceipt = await send(filler, admission.uid);
      await pinSettlement(fillerReceipt);
      const afterThreshold = await client.history();
      await save("after-threshold.json", afterThreshold);
      assertCompletedResponse(afterThreshold);
      assert.equal(
        contexts.filter((entry) => entry.purpose === "agent").length,
        agentCallsBeforeFiller + (explicitOverflow ? 2 : 1),
        "Only an explicit error retries; a retained successful stop must settle after folding",
      );
      await send(
        {
          kind: "user",
          body: "A4 final short turn: finish the retention probe without tools.",
        },
        admission.uid,
      );
      const after = await client.history();
      const compactions = events.filter((event) => event.type === "compaction");
      assert(
        compactions.some(
          (event) =>
            !event.isError && event.messagesAfter < event.messagesBefore,
        ),
        "Actual successful folding must reduce runtime context messages",
      );
      assert(
        events.some(
          (event) =>
            event.type === "compaction_start" &&
            event.reason === (overflowProbe ? "overflow" : "threshold"),
        ),
        "The selected threshold/overflow boundary must actually be reached",
      );
      assert(
        contexts.some((context) => context.purpose === "compaction"),
        "Runtime must invoke the summarizer",
      );
      const lastAgentContext = contexts.findLast(
        (context) => context.purpose === "agent",
      );
      assert(lastAgentContext);
      const lastContextJson = JSON.stringify(lastAgentContext.context);
      assert(
        lastContextJson.includes("A4 controlled summary:"),
        "A subsequent real agent turn must consume the folded context",
      );
      assert(
        !lastContextJson.includes("violet gear"),
        "Exact old source text must actually leave model context",
      );
      assert(
        !lastContextJson.includes("a4-ping-early"),
        "Old tool records must actually leave model context",
      );
      const afterById = new Map(
        after.messages.map((message) => [message.id, message]),
      );
      const lost = before.messages.filter(
        (message) => !afterById.has(message.id),
      );
      const changed = before.messages.filter(
        (message) =>
          afterById.has(message.id) &&
          JSON.stringify(afterById.get(message.id)) !== JSON.stringify(message),
      );
      await save("after.json", after);
      assertCompletedResponse(after);
      await save("after-ui.json", project(after));
      await save("comparison.json", {
        beforeIds: before.messages.map((message) => message.id),
        afterIds: after.messages.map((message) => message.id),
        lost,
        changed,
        beforeKinds: projectFlueHistoryForSweep(before),
        afterKinds: projectFlueHistoryForSweep(after),
        clientResultsBefore: clientResults,
        clientResultsAfter: clientToolHistoryFrom(after.messages).results,
      });
      await save("identity.json", {
        identity,
        instanceId,
        dbPath,
        pid: process.pid,
        admission,
        conversationId: after.conversationId,
        incarnation: after.incarnation,
        authorization: authorizationResult,
        modelId,
        contextWindow,
        maxTokens,
        keepRecentTokens,
        buildHashes: Object.fromEntries(
          await Promise.all(
            (await readdir(new URL("../dist/", import.meta.url)))
              .filter((name) => name.endsWith(".mjs"))
              .sort()
              .map(
                async (name) =>
                  [
                    name,
                    createHash("sha256")
                      .update(
                        await readFile(
                          new URL(`../dist/${name}`, import.meta.url),
                        ),
                      )
                      .digest("hex"),
                  ] as const,
              ),
          ),
        ),
      });
      // Survival is the prospective oracle, not a snapshot blessing. Persist failures first.
      assert.deepEqual(
        lost,
        [],
        "Public history lost pre-compaction source IDs",
      );
      assert.deepEqual(
        changed,
        [],
        "Public history changed pre-compaction source records",
      );
      assert.deepEqual(
        clientToolHistoryFrom(after.messages).results,
        clientResults,
      );
      assert.equal(
        after.messages.filter(
          (message) => message.role === "user" && message.purpose === "user",
        ).length,
        5,
        "Only the five actually submitted user messages may exist; recovery must not invent one",
      );
      assert.deepEqual(
        after.messages
          .flatMap((message) => message.parts)
          .filter((part) => part.type === "dynamic-tool"),
        publicTools,
        "Completed calls/results must remain unchanged without reissue",
      );
      assert.deepEqual(
        project(after).slice(0, project(before).length),
        project(before),
        "Reopened UI projection must retain completed causal tools and question data",
      );
    }
  } else {
    const original = JSON.parse(
      await readFile(join(directory, "identity.json"), "utf8"),
    ) as { admission: AgentSendResult; pid: number };
    const expected = JSON.parse(
      await readFile(join(directory, "after.json"), "utf8"),
    ) as FlueConversationSnapshot;
    const reopened = await client.history();
    assertCompletedResponse(reopened);
    assert.notEqual(
      process.pid,
      original.pid,
      "Reopen must use a fresh runtime process",
    );
    assert.deepEqual(
      reopened,
      expected,
      "Reopen must return the actual retained history, not just HTTP 200",
    );
    assert.equal(
      faux.state.callCount,
      0,
      "History retrieval must not generate a turn",
    );
    const wrongUidStatus = await status(() =>
      client.send({
        uid: "a4-wrong-incarnation",
        message: { kind: "user", body: "Must not be admitted" },
      }),
    );
    assert.equal(wrongUidStatus, 404);
    assert.deepEqual(
      await client.history(),
      reopened,
      "Rejected incarnation must leave history unchanged",
    );
    responses.push(
      fauxAssistantMessage(
        "A4 reopened continuation acknowledged; this is not a product why operation.",
      ),
    );
    const continuation = await send(
      { kind: "user", body: "A4 genuine retained-store follow-up, no tools." },
      original.admission.uid,
    );
    assert.equal(continuation.uid, original.admission.uid);
    const continued = await client.history();
    assertCompletedResponse(continued);
    assert.equal(continued.conversationId, reopened.conversationId);
    assert.equal(continued.incarnation, reopened.incarnation);
    await save("reopened.json", reopened);
    await save("reopened-ui.json", project(reopened));
    await save("continued.json", continued);
    await save("reopen-result.json", {
      identity,
      instanceId,
      dbPath,
      pid: process.pid,
      originalPid: original.pid,
      conversationId: reopened.conversationId,
      incarnation: reopened.incarnation,
      authorization: authorizationResult,
      wrongUidStatus,
      continuation,
      historyEqual: true,
      historyProviderCalls: 0,
    });
  }
  assert.equal(
    responses.length,
    0,
    "Every intended response must execute, including after the next actual input following Stop",
  );
  process.stdout.write(`A4_${phase.toUpperCase()}_PASS\n`);
} finally {
  try {
    await save(`${phase}-final-history.json`, await client.history());
  } finally {
    await application.stop();
    unsubscribe();
    globalThis.fetch = nativeFetch;
  }
  await save(`${phase}-events.json`, events);
  await save(`${phase}-contexts.json`, contexts);
  await save(`${phase}-shutdown.json`, {
    stopped: true,
    pid: process.pid,
    providerCalls: faux.state.callCount,
  });
}
