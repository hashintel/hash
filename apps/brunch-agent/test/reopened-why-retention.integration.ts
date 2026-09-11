/** Opt-in A5 proof: create actual browser records, then fold/reopen the SAME store in separate Node processes.
 * Spawned by `test/integration/reopened-why-retention.test.ts` (`yarn test:reopened-why-retention`).
 * Run each phase serially. Saved observations are equality oracles/identity pointers only, never imported into state.
 */
/* eslint-disable no-await-in-loop -- One original store, one owner, one synthetic response queue. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import { observe } from "@flue/runtime";
import { createFlueClient, FlueApiError } from "@flue/sdk";

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
import {
  nativeSchemaProvider,
  type NativeRequestCapture,
} from "./native-schema-provider.ts";
import {
  retentionCall,
  retentionQuery,
  retentionQuote,
  retentionSource,
  seedRetentionBrowser,
} from "./reopened-why-retention-browser.ts";

import type { RootArcExplanation } from "../src/conversation/why.ts";
import type { Context, FauxResponseStep } from "@earendil-works/pi-ai";
import type { FlueObservation } from "@flue/runtime";
import type { FlueConversationSnapshot } from "@flue/sdk";
import type { WorkpieceRevision } from "@hashintel/brunch-agent/workpiece";

const directory = process.env.A5_RETENTION_OUTPUT;
assert(
  directory,
  "A5_RETENTION_OUTPUT must name this run's original directory",
);
const phase = process.env.A5_RETENTION_PHASE ?? "create";
assert(phase === "create" || phase === "fold" || phase === "reopen");
if (phase === "create") {
  assert(
    !existsSync(directory),
    "Never overwrite an original store or evidence packet",
  );
  mkdirSync(directory, { recursive: true });
}
assert(existsSync(directory));
const dbPath = resolve(directory, "conversation.db");
assert.equal(existsSync(dbPath), phase !== "create");
assert(!existsSync(join(directory, `${phase}-result.json`)));
const save = (name: string, value: unknown) =>
  writeFileSync(
    join(directory, `${name}.json`),
    `${JSON.stringify(value, null, 2)}\n`,
  );
const load = <T>(name: string): T =>
  JSON.parse(readFileSync(join(directory, `${name}.json`), "utf8")) as T;
process.env.NODE_ENV = "test";
process.env.OTEL_SDK_DISABLED = "true";
process.env.HASH_OTLP_ENDPOINT = "";
process.env.BRUNCH_CHAT_MODEL = "claude-sonnet-4-6";
process.env.BRUNCH_DEV_DB_PATH = dbPath;
process.env.BRUNCH_TEST_KEEP_RECENT_TOKENS = "256";
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input.toString());
  assert(
    phase === "create" && url.hostname === "127.0.0.1",
    "No external fetch or paid fallback",
  );
  return nativeFetch(input, init);
};
const events: FlueObservation[] = [];
let purpose = "agent";
const contexts: { purpose: string; context: Context }[] = [];
const nativeContexts: Context[] = [];
const captures: NativeRequestCapture[] = [];
const responses: FauxResponseStep[] = [];
const summary =
  "A5 controlled lossy summary: prior TEST activity occurred. Original testimony, source IDs, workpiece passages, evidence relations and browser effects intentionally omitted. This summary is not evidence authority.";
type CompletionPin = {
  event: FlueObservation;
  records: Record<string, unknown>[];
  message: FlueConversationSnapshot["messages"][number];
};
const completionPins: CompletionPin[] = [];
// Read-only independent completion boundary, as in the strengthened A4 oracle. No writes/imports.
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
const unsubscribe = observe((event) => {
  if (event.type === "turn_request") purpose = event.purpose;
  if (
    ["turn_request", "turn", "compaction_start", "compaction", "log"].includes(
      event.type,
    )
  )
    events.push(event);
  if (
    phase === "create" ||
    event.type !== "turn" ||
    event.purpose !== "agent" ||
    event.response.finishReason !== "stop"
  )
    return;
  const content = event.response.output?.content;
  const text = content
    ?.flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("");
  // Only simple no-tool filler responses have one public step, pinned BEFORE compaction.
  if (!text?.startsWith("A5 retention filler completed ")) return;
  const records = canonicalRecords().filter(
    (record) => record.turnId === event.turnId,
  );
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
      typeof start.submissionId === "string" &&
      typeof start.turnId === "string",
  );
  assert.equal(end.messageId, start.messageId);
  assert.equal(end.stopReason, "stop");
  assert.equal(start.submissionId, event.submissionId);
  assert.equal(
    records
      .filter((record) => record.type === "assistant_text_delta")
      .map((record) => record.delta)
      .join(""),
    text,
  );
  assert(!completionPins.some((pin) => pin.message.id === start.messageId));
  completionPins.push({
    event,
    records,
    message: {
      id: start.messageId,
      role: "assistant",
      purpose: "assistant",
      display: "visible",
      submissionId: start.submissionId,
      turnId: start.turnId,
      parts: [{ type: "text", text, state: "done" }],
    },
  });
  save(`${phase}-completion-pins`, completionPins);
});
const faux = fauxProvider({
  provider: "anthropic",
  models: [
    {
      id: "claude-sonnet-4-6",
      reasoning: true,
      contextWindow: 64000,
      maxTokens: 16000,
    },
  ],
});
if (phase === "create")
  installFauxProvider(
    nativeSchemaProvider(faux.provider, captures, nativeContexts),
  );
else {
  installFauxProvider(faux.provider);
  faux.setResponses(
    Array.from({ length: 120 }, () => (context: Context) => {
      contexts.push({
        purpose,
        context: JSON.parse(JSON.stringify(context)) as Context,
      });
      if (purpose.startsWith("compaction"))
        return fauxAssistantMessage(summary);
      const response = responses.shift();
      assert(response, "Unexpected model call; never retry completed tools");
      assert(typeof response !== "function");
      return response;
    }),
  );
}
save(`${phase}-process`, {
  pid: process.pid,
  ppid: process.ppid,
  execPath: process.execPath,
  nodeVersion: process.version,
  cwd: process.cwd(),
  argv: process.argv,
  startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
  dbPath,
});
const application = await loadBuiltBrunchApplication();
const tools = (snapshot: FlueConversationSnapshot) =>
  snapshot.messages
    .flatMap((message) => message.parts)
    .filter((part) => part.type === "dynamic-tool");
const output = (snapshot: FlueConversationSnapshot, id: string) => {
  const found = tools(snapshot).filter((part) => part.toolCallId === id);
  assert.equal(found.length, 1, `Exactly one ${id} result`);
  const part = found[0];
  assert(
    part?.state === "output-available",
    `Successful actual tool result required for ${id}`,
  );
  return part.output;
};
type Seed = {
  pid: number;
  identity: { principalKey: string; conversationId: string };
  sourceId: string;
  locator: { start: number; end: number };
  governing: WorkpieceRevision;
  binding: RootArcExplanation["binding"];
  dbPath: string;
};
const assertWhy = (
  answer: RootArcExplanation,
  seed: Seed,
  expectedCurrent: WorkpieceRevision,
) => {
  assert.equal(answer.disposition, "partially-supported", answer.reason);
  assert.equal(answer.untrusted, true);
  assert.deepEqual(answer.binding, seed.binding);
  assert.deepEqual(answer.currentWorkpiece, expectedCurrent);
  assert.equal(answer.governing?.revisionId, seed.governing.revisionId);
  assert.equal(answer.governing.sha256, seed.governing.sha256);
  assert.equal(
    seed.governing.sha256,
    createHash("sha256").update(seed.governing.markdown).digest("hex"),
  );
  assert.equal(
    expectedCurrent.sha256,
    createHash("sha256").update(expectedCurrent.markdown).digest("hex"),
  );
  assert.equal(answer.governing.status, "superseded");
  assert.deepEqual(answer.governing.passages, [
    {
      locator: seed.locator,
      text: retentionQuote,
      standing: "declared-relations",
      relations: [
        {
          kind: "elicited",
          messageIds: [seed.sourceId],
          sources: [
            {
              id: seed.sourceId,
              role: "user",
              purpose: "user",
              text: retentionSource,
            },
          ],
        },
        { kind: "formalism-constraint", messageIds: [], sources: [] },
      ],
    },
  ]);
  assert.equal(answer.recordedChange?.toolCallId, "retention-arc");
  assert.equal(answer.quality.sourceRelevance, "unassessed");
};
try {
  if (phase === "create") {
    await seedRetentionBrowser({ application, faux, directory });
    const seed = load<Seed>("seed");
    const history = load<FlueConversationSnapshot>("create-history");
    const answer = output(history, "retention-live-why") as RootArcExplanation;
    assert(answer.currentWorkpiece);
    assertWhy(answer, seed, answer.currentWorkpiece);
    assert.equal(answer.reconciliation.status, "live-observed");
    assert.equal(answer.reconciliation.observationScope, "live-observed");
    assert.equal(
      answer.reconciliation.observationToolCallId,
      "retention-live-read",
    );
    assert.equal(answer.currentWorkpiece.revisionId, "retention-revision-3");
    assert.equal(answer.currentWorkpiece.evidenceValidated, true);
    assert.deepEqual(answer.currentWorkpiece.evidence, seed.governing.evidence);
    const second = tools(history).find(
      (part) => part.toolCallId === "retention-revision-2",
    );
    assert(second);
    assert(
      !("evidence" in (second.input as object)),
      "Raw carried input must not be rewritten",
    );
    assert.deepEqual(
      (second.output as WorkpieceRevision).evidence,
      seed.governing.evidence,
    );
    assert.equal(captures.length, nativeContexts.length);
    assert(!events.some((event) => event.type === "compaction_start"));
    save("create-result", {
      outcome: "pass",
      pid: process.pid,
      dbPath,
      requests: captures.length,
      actualBrowser: true,
      why: answer,
    });
  } else {
    const seed = load<Seed>("seed");
    assert.equal(seed.dbPath, dbPath);
    assert.notEqual(
      seed.pid,
      process.pid,
      "A genuinely new OS process must own the same store",
    );
    if (phase === "reopen")
      assert.notEqual(load<{ pid: number }>("fold-result").pid, process.pid);
    const transport: typeof fetch = async (input, init) =>
      application.fetch(
        input instanceof Request ? input : new Request(input, init),
      );
    const url = `http://a5.in-process/agents/chat/${flueConversationIdFrom(seed.identity)}`;
    const client = createFlueClient({
      url,
      fetch: transport,
      headers: agentOwnershipHeaders(seed.identity),
    });
    const initial = await client.history();
    assert.deepEqual(
      initial,
      load(phase === "fold" ? "create-history" : "fold-history"),
      "Reopen exact original store, not a saved-history substitute",
    );
    assert.equal(faux.state.callCount, 0);
    const baseline = load<FlueConversationSnapshot>("create-history");
    const originalAnswer = output(
      baseline,
      "retention-live-why",
    ) as RootArcExplanation;
    assert(originalAnswer.currentWorkpiece);
    const expectedCurrent = originalAnswer.currentWorkpiece;
    const status = async (operation: () => Promise<unknown>) => {
      try {
        await operation();
        return 200;
      } catch (error) {
        if (error instanceof FlueApiError) return error.status;
        throw error;
      }
    };
    const authorization: Record<string, number> = {};
    for (const [label, identity] of [
      [
        "foreignPrincipal",
        { ...seed.identity, principalKey: "TEST-other-principal" },
      ],
      [
        "foreignConversation",
        { ...seed.identity, conversationId: "TEST-other-conversation" },
      ],
    ] as const) {
      const foreign = createFlueClient({
        url,
        fetch: transport,
        headers: agentOwnershipHeaders(identity),
      });
      authorization[`${label}History`] = await status(() => foreign.history());
      authorization[`${label}ToolRequest`] = await status(() =>
        foreign.send({
          message: {
            kind: "user",
            body: "TEST forbidden request for read_workpiece and query_workpiece",
          },
        }),
      );
    }
    assert.deepEqual(authorization, {
      foreignPrincipalHistory: 403,
      foreignPrincipalToolRequest: 403,
      foreignConversationHistory: 403,
      foreignConversationToolRequest: 403,
    });
    assert.deepEqual(await client.history(), initial);
    assert.equal(faux.state.callCount, 0);
    save(`${phase}-before`, initial);
    const submittedBodies: string[] = [];
    const send = async (body: string) => {
      submittedBodies.push(body);
      const receipt = await client.send({ message: { kind: "user", body } });
      await client.read(receipt, { signal: AbortSignal.timeout(30000) });
      assert.equal(
        responses.length,
        0,
        "Every planned response consumed; no hidden failed factory",
      );
      return receipt;
    };
    const query = async (label: string, folded: boolean) => {
      const priorQueryIds = tools(await client.history())
        .filter(
          (part) =>
            part.toolName === "read_workpiece" ||
            part.toolName === "query_workpiece",
        )
        .map((part) => part.toolCallId);
      const beforeContext = contexts.length;
      const readId = `${label}-workpiece`;
      const whyId = `${label}-why`;
      const oldId = `${label}-old-observation-why`;
      const refusedId = `${label}-unknown-observation-why`;
      responses.push(
        retentionCall(
          "read_workpiece",
          { locateTexts: [retentionQuote] },
          readId,
        ),
        retentionCall("query_workpiece", retentionQuery, whyId),
        retentionCall(
          "query_workpiece",
          { ...retentionQuery, observationToolCallId: "retention-live-read" },
          oldId,
        ),
        retentionCall(
          "query_workpiece",
          {
            ...retentionQuery,
            observationToolCallId: "TEST-not-an-observed-read",
          },
          refusedId,
        ),
        fauxAssistantMessage(
          `TEST ${label}: structured as-of answers obtained; no fresh browser connected.`,
        ),
      );
      await send(
        `TEST ${label}: query the current workpiece and why from authorized original history, not a summary.`,
      );
      const history = await client.history();
      const read = output(history, readId) as {
        currentWorkpiece: WorkpieceRevision;
        sources: { id: string }[];
        locatorLookup: {
          subject: { revisionId: string };
          sha256: string;
          queries: { occurrences: unknown[] }[];
        };
      };
      assert.deepEqual(read.currentWorkpiece, expectedCurrent);
      assert.equal(
        read.locatorLookup.subject.revisionId,
        expectedCurrent.revisionId,
      );
      assert.equal(read.locatorLookup.sha256, expectedCurrent.sha256);
      assert.deepEqual(read.locatorLookup.queries[0]?.occurrences, [
        seed.locator,
      ]);
      const why = output(history, whyId) as RootArcExplanation;
      assertWhy(why, seed, expectedCurrent);
      assert.equal(why.reconciliation.status, "as-of");
      assert.equal(why.reconciliation.observationToolCallId, undefined);
      assert.deepEqual(why.recordedChange, originalAnswer.recordedChange);
      const old = output(history, oldId) as RootArcExplanation;
      assertWhy(old, seed, expectedCurrent);
      assert.equal(old.reconciliation.status, "as-of");
      assert.equal(
        old.reconciliation.observationScope,
        "as-of",
        "An old observation ID is never a fresh browser read",
      );
      assert.equal(
        old.reconciliation.observationToolCallId,
        "retention-live-read",
      );
      const refused = output(history, refusedId) as RootArcExplanation;
      assert.equal(refused.disposition, "refused");
      assert.equal(
        refused.reason,
        "Unknown admitted browser observation call.",
      );
      assert.equal(refused.governing, undefined);
      // Assert that the actual model saw the structured output, not just public presence.
      const actual = contexts
        .slice(beforeContext)
        .filter((entry) => entry.purpose === "agent");
      for (const [name, id, expected] of [
        ["read_workpiece", readId, read],
        ["query_workpiece", whyId, why],
        ["query_workpiece", oldId, old],
        ["query_workpiece", refusedId, refused],
      ] as const) {
        assert(
          actual.some((entry) =>
            entry.context.messages.some(
              (message) =>
                message.role === "toolResult" &&
                message.toolName === name &&
                message.toolCallId === id &&
                JSON.stringify(
                  JSON.parse(
                    message.content
                      .flatMap((part) =>
                        part.type === "text" ? [part.text] : [],
                      )
                      .join(""),
                  ),
                ) === JSON.stringify(expected),
            ),
          ),
          `Actual model result required: ${id}`,
        );
      }
      if (folded) {
        assert(
          read.sources.some((source) => source.id === seed.sourceId),
          "Authorized history still discovers the original source ID after fold",
        );
        const request = actual[0];
        assert(request);
        const serialized = JSON.stringify(request.context.messages);
        assert(serialized.includes(summary));
        assert(
          !serialized.includes(retentionSource),
          "Original true-user entry must leave model context before the history-backed query",
        );
        assert(
          !priorQueryIds.some((id) => serialized.includes(id)),
          "Prior workpiece/why query IDs must leave model context, even if their source text was redacted",
        );
        assert(
          !request.context.messages.some(
            (message) =>
              message.role === "toolResult" &&
              (message.toolName === "read_workpiece" ||
                message.toolName === "query_workpiece"),
          ),
          "No prior workpiece/why tool result may substitute for authorized history",
        );
        // The product intentionally still injects its ONE authoritative current revision,
        // including passage/evidence pointers. That state is not a retained source entry
        // or a cached governing explanation; do not filter it to manufacture emptiness.
        assert(
          !request.context.messages.some(
            (message) =>
              message.role === "assistant" &&
              message.content.some(
                (part) =>
                  part.type === "toolCall" &&
                  [
                    "retention-revision-1",
                    "retention-revision-2",
                    "retention-arc",
                  ].includes(part.id),
              ),
          ),
          "Original revision/mutation calls must be folded, not replayed in context",
        );
      }
      save(label, {
        read,
        why,
        oldObservationWhy: old,
        refusedObservationWhy: refused,
        beforeRequestContextIndex: beforeContext,
        priorQueryIds,
        currentRevisionRemainsInContext: true,
      });
      return history;
    };
    if (phase === "fold") {
      await query("process-restarted-before-fold", false);
      for (let index = 0; index < 22; index++) {
        responses.push(
          fauxAssistantMessage(
            `A5 retention filler completed window-${index}.`,
          ),
        );
        await send(`TEST non-evidence source-window filler ${index}.`);
      }
      for (
        let index = 0;
        index < 9 &&
        !events.some((event) => event.type === "compaction" && !event.isError);
        index++
      ) {
        responses.push(
          fauxAssistantMessage(
            `A5 retention filler completed threshold-${index}.`,
          ),
        );
        await send(
          `TEST non-evidence threshold filler ${index}. ${"synthetic-padding ".repeat(index === 0 ? 2000 : 1000)}`,
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
      assert(completionPins.length >= 22);
      save("fold-immediate-history", await client.history());
    }
    let after = await query(`${phase}-after-compaction`, true);
    const immediatePins = [...completionPins];
    if (phase === "fold") {
      // The successful why just reintroduced source text as a tool result. Fold that result too,
      // so the next OS process cannot answer from either the original source or a saved answer.
      const previousCompactions = events.filter(
        (event) => event.type === "compaction" && !event.isError,
      ).length;
      for (
        let index = 0;
        index < 9 &&
        events.filter((event) => event.type === "compaction" && !event.isError)
          .length === previousCompactions;
        index++
      ) {
        responses.push(
          fauxAssistantMessage(
            `A5 retention filler completed refold-${index}.`,
          ),
        );
        await send(
          `TEST fold retrieved answers too ${index}. ${"synthetic-padding ".repeat(index === 0 ? 2000 : 1000)}`,
        );
      }
      assert(
        events.filter((event) => event.type === "compaction" && !event.isError)
          .length > previousCompactions,
      );
      assert(
        !events.some(
          (event) =>
            event.type === "compaction_start" && event.reason === "overflow",
        ),
      );
      after = await client.history();
    }
    const pins =
      phase === "fold"
        ? completionPins
        : load<CompletionPin[]>("fold-completion-pins");
    for (const [snapshot, expectedPins] of [
      [after, pins],
      ...(phase === "fold"
        ? [
            [
              load<FlueConversationSnapshot>("fold-immediate-history"),
              immediatePins,
            ] as const,
          ]
        : [[initial, pins] as const]),
    ] as const) {
      for (const pin of expectedPins) {
        assert.deepEqual(
          snapshot.messages.filter((message) => message.id === pin.message.id),
          [pin.message],
          "Independently pinned completed response must survive exactly once",
        );
        assert.deepEqual(
          snapshot.settlements.filter(
            (entry) => entry.submissionId === pin.message.submissionId,
          ),
          [
            {
              submissionId: pin.message.submissionId,
              outcome: "completed",
              answeredBySubmissionId: pin.message.submissionId,
            },
          ],
          "Exact completed settlement retained",
        );
      }
    }
    // Pin canonical completed settlement too, independently of the public snapshot.
    const canonicalSettlements = canonicalRecords().filter(
      (record) =>
        record.type === "submission_settled" &&
        pins.some((pin) => pin.message.submissionId === record.submissionId),
    );
    for (const pin of pins) {
      const settlements = canonicalSettlements.filter(
        (record) => record.submissionId === pin.message.submissionId,
      );
      assert.equal(settlements.length, 1);
      assert.equal(settlements[0]?.outcome, "completed");
    }
    save(`${phase}-canonical-settlements`, canonicalSettlements);
    const userBodies = (snapshot: FlueConversationSnapshot) =>
      snapshot.messages
        .filter(
          (message) => message.role === "user" && message.purpose === "user",
        )
        .map((message) =>
          message.parts
            .flatMap((part) => (part.type === "text" ? [part.text] : []))
            .join(""),
        );
    assert.deepEqual(
      userBodies(after),
      [...userBodies(initial), ...submittedBodies],
      "Only actual submitted user inputs; no recovery-invented message",
    );
    save(`${phase}-submitted-bodies`, submittedBodies);
    for (const message of initial.messages)
      assert.deepEqual(
        after.messages.filter((entry) => entry.id === message.id),
        [message],
        "No canonical source identity/content change or duplicate",
      );
    for (const settlement of initial.settlements)
      assert.deepEqual(
        after.settlements.filter(
          (entry) => entry.submissionId === settlement.submissionId,
        ),
        [settlement],
      );
    const completedNames = new Set([
      "mutate_workpiece",
      "addArc",
      "getLatestNetDefinition",
    ]);
    assert.deepEqual(
      tools(after).filter((part) => completedNames.has(part.toolName)),
      tools(baseline).filter((part) => completedNames.has(part.toolName)),
      "No completed mutation/revision/browser tool reissue",
    );
    assert.deepEqual(
      clientToolHistoryFrom(after.messages).results,
      clientToolHistoryFrom(baseline.messages).results,
    );
    assert(
      !snapshotToUiMessages(after, {
        clientToolNames: new Set(["addArc", "getLatestNetDefinition"]),
        validatedClientToolNames: new Set(["addArc"]),
      }).some((message) =>
        message.parts.some(
          (part) =>
            part.type === "tool-addArc" && part.state === "input-available",
        ),
      ),
      "Hydration cannot offer completed mutation again",
    );
    save(`${phase}-history`, after);
    save(`${phase}-result`, {
      outcome: "pass",
      pid: process.pid,
      previousPid:
        phase === "fold" ? seed.pid : load<{ pid: number }>("fold-result").pid,
      dbPath,
      identity: seed.identity,
      authorization,
      requests: faux.state.callCount,
      contextWindow: 64000,
      maxTokens: 16000,
      keepRecentTokens: 256,
      publicLostIds: [],
      publicChangedRecords: [],
      reissuedCompletedTools: 0,
      pinnedCompletedResponses: pins.length,
      limits:
        "Synthetic controls; actual browser seed only. Restarted tools use original store and as-of records, never fresh live browser observations. No import, relocation, power-loss, provider-fidelity, relevance, utility, genuine testimony or Step A/B acceptance.",
    });
  }
  process.stdout.write(
    `A5_RETENTION_${phase.toUpperCase()}_PASS pid=${process.pid}\n`,
  );
} catch (error) {
  save(`${phase}-failure`, {
    pid: process.pid,
    error: String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  throw error;
} finally {
  await application.stop();
  unsubscribe();
  globalThis.fetch = nativeFetch;
  save(`${phase}-events`, events);
  save(`${phase}-contexts`, phase === "create" ? nativeContexts : contexts);
  if (phase === "create") save("create-native-requests", captures);
}
