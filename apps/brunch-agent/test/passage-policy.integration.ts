/** TEST-only unpaid passage-edit matrix over the built ownership-guarded ChatAgent.
 * No browser, history import, private locator computation or production semantics changes.
 */
/* eslint-disable no-await-in-loop -- Each case owns a sequential synthetic response queue and revision chain. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { gzipSync } from "node:zlib";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  type Context,
  type FauxResponseStep,
} from "@earendil-works/pi-ai";
import { createFlueClient } from "@flue/sdk";
import * as v from "valibot";

import { validatedFixtureMutationMode } from "@hashintel/brunch-agent-plugin-sdcpn/flue";
import { workpieceReadOutputSchema } from "@hashintel/brunch-agent/flue";
import {
  preparedWorkpieceAuthorship,
  preparedWorkpieceSignalTag,
  preparedWorkpieceSignalType,
} from "@hashintel/brunch-agent/workpiece";

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

import type {
  WorkpieceEvidenceRelation,
  WorkpieceRevision,
} from "@hashintel/brunch-agent/workpiece";

type ReadOutput = v.InferOutput<typeof workpieceReadOutputSchema>;
/** Every read here supplies locateTexts, so the lookup branch is always present. */
type ReadResult = Omit<ReadOutput, "locatorLookup"> & {
  locatorLookup: Extract<
    NonNullable<ReadOutput["locatorLookup"]>,
    { sha256: string }
  >;
};
const outputDirectory = resolve(process.env.PASSAGE_POLICY_OUTPUT ?? "");
assert(
  process.env.PASSAGE_POLICY_OUTPUT,
  "Explicit fresh output directory required",
);
mkdirSync(outputDirectory, { recursive: false });
process.env.NODE_ENV = "test";
process.env.OTEL_SDK_DISABLED = "true";
process.env.HASH_OTLP_ENDPOINT = "";
process.env.BRUNCH_CHAT_MODEL = "claude-sonnet-4-6";
process.env.BRUNCH_DEV_DB_PATH = join(outputDirectory, "conversation.db");
const nativeFetch = globalThis.fetch;
globalThis.fetch = () => {
  throw new Error("No network fetch or provider fallback permitted");
};
const captures: NativeRequestCapture[] = [];
const contexts: Context[] = [];
const faux = fauxProvider({
  provider: "anthropic",
  models: [{ id: "claude-sonnet-4-6", reasoning: true }],
});
installFauxProvider(nativeSchemaProvider(faux.provider, captures, contexts));
let application = await loadBuiltBrunchApplication();
const sha256 = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");
const quote = "Reserve one crew.";
const narrow = "one crew";
const tail = "Timing remains unknown.";
const base = `# TEST account\n😀 ${quote}\n\n${tail}`;
const sourceText = `TEST scripted user source: ${quote} ${tail}`;
const call = (name: string, args: Record<string, unknown>, id: string) =>
  fauxAssistantMessage([fauxToolCall(name, args, { id })], {
    stopReason: "toolUse",
  });
const done = () =>
  fauxAssistantMessage(
    "TEST structured result checked; no semantic/utility acceptance.",
  );
const modelOutput = (context: Context, id: string): ReadResult => {
  const result = context.messages.findLast(
    (message) => message.role === "toolResult" && message.toolCallId === id,
  );
  assert(
    result?.role === "toolResult" && !result.isError,
    `Actual successful model-facing response required: ${id}`,
  );
  // Core's read-tool output schema decides what a well-formed response is.
  const parsed = v.parse(
    workpieceReadOutputSchema,
    JSON.parse(
      result.content
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join(""),
    ),
  );
  const { locatorLookup } = parsed;
  assert(
    locatorLookup !== undefined && "sha256" in locatorLookup,
    `Locator lookup expected on ${id}`,
  );
  return { ...parsed, locatorLookup };
};
const checkLookup = (
  read: ReadResult,
  markdown: string,
  revisionId?: string,
) => {
  assert.equal(read.locatorLookup.sha256, sha256(markdown));
  assert.equal(read.locatorLookup.utf16Length, markdown.length);
  assert.deepEqual(
    read.locatorLookup.subject,
    revisionId === undefined
      ? { kind: "unsettled-candidate" }
      : { kind: "current-revision", revisionId },
  );
  for (const query of read.locatorLookup.queries) {
    assert.equal(
      query.matchedCount,
      query.occurrences.length + query.omittedCount,
    );
    for (const span of query.occurrences)
      assert.equal(markdown.slice(span.start, span.end), query.text);
  }
};
const spanFrom = (read: ReadResult, text: string, occurrence = 0) => {
  const query = read.locatorLookup.queries.find((entry) => entry.text === text);
  assert(query && query.omittedCount === 0);
  const span = query.occurrences[occurrence];
  assert(span, `Missing product locator: ${text}`);
  return span;
};
const rows: Record<string, unknown>[] = [];
const histories: unknown[] = [];
const counterexamples: unknown[] = [];
let serial = 0;
// The shared native helper intentionally supplies SDK responses, but a faux factory
// exception can become a normal native stop. Preserve errors outside that boundary.
const factoryFailures: unknown[] = [];
const setResponses = (steps: FauxResponseStep[]) =>
  faux.setResponses(
    steps.map((step) =>
      typeof step !== "function"
        ? step
        : async (...args) => {
            try {
              return await step(...args);
            } catch (error) {
              factoryFailures.push(error);
              throw error;
            }
          },
    ),
  );
const session = (label: string) => {
  const identity = {
    principalKey: "TEST-passage-owner",
    conversationId: `TEST-${label}-${crypto.randomUUID()}`,
  };
  const url = `http://passage.in-process/agents/chat/${flueConversationIdFrom(identity)}`;
  const client = createFlueClient({
    url,
    headers: agentOwnershipHeaders(identity),
    fetch: async (input, init) =>
      application.fetch(
        input instanceof Request ? input : new Request(input, init),
      ),
  });
  let initialized = false;
  const send = async (body: string) => {
    const receipt = await client.send({
      ...(!initialized
        ? {
            initialData: {
              mode: validatedFixtureMutationMode,
              browser: {
                binding: {
                  conversationId: identity.conversationId,
                  documentId: "TEST-passage-document",
                  incarnationId: identity.conversationId,
                },
                requestedBaseHash: "a".repeat(64),
              },
            },
          }
        : {}),
      message: { kind: "user", body },
    });
    initialized = true;
    await client.read(receipt, { signal: AbortSignal.timeout(30000) });
    assert.equal(
      factoryFailures.length,
      0,
      `Synthetic response assertion failed: ${factoryFailures.map(String).join("; ")}`,
    );
  };
  const part = async (id: string) => {
    const matches = (await client.history()).messages
      .flatMap((message) => message.parts)
      .filter(
        (entry) => entry.type === "dynamic-tool" && entry.toolCallId === id,
      );
    assert.equal(matches.length, 1);
    const found = matches[0];
    assert(found?.type === "dynamic-tool");
    return found;
  };
  return { identity, url, client, send, part };
};
type Session = ReturnType<typeof session>;
const seed = async (current: Session, markdown = base) => {
  const prefix = `seed-${++serial}`;
  let candidate: ReadResult | undefined;
  let settled: ReadResult | undefined;
  let relations: WorkpieceEvidenceRelation[] = [];
  let sourceId = "";
  setResponses([
    call(
      "brunch_workpiece",
      { markdown, locateTexts: [quote, narrow, tail, markdown] },
      `${prefix}-candidate`,
    ),
    (context) => {
      candidate = modelOutput(context, `${prefix}-candidate`);
      assert.equal(candidate.currentWorkpiece, null);
      checkLookup(candidate, markdown);
      const source = candidate.sources.find(
        (entry) => entry.text === sourceText,
      );
      assert(source);
      sourceId = source.id;
      relations = [
        {
          locator: spanFrom(candidate, quote),
          messageIds: [sourceId],
          kind: "elicited",
        },
        {
          locator: spanFrom(candidate, quote),
          messageIds: [],
          kind: "formalism-constraint",
        },
        {
          locator: spanFrom(candidate, narrow),
          messageIds: [],
          kind: "inference",
        },
        { locator: spanFrom(candidate, tail), messageIds: [], kind: "default" },
      ];
      return call(
        "update_workpiece",
        { markdown, evidence: relations },
        `${prefix}-revision`,
      );
    },
    call(
      "brunch_workpiece",
      { locateTexts: [quote, narrow, tail, markdown] },
      `${prefix}-read`,
    ),
    (context) => {
      settled = modelOutput(context, `${prefix}-read`);
      checkLookup(settled, markdown, `${prefix}-revision`);
      assert.deepEqual(settled.currentWorkpiece?.evidence, relations);
      assert.equal(settled.currentWorkpiece.ordinal, 1);
      return done();
    },
  ]);
  await current.send(sourceText);
  assert(
    candidate && settled?.currentWorkpiece && sourceId,
    "Seed factories must complete, not just settle an errored response",
  );
  rows.push({ label: prefix, identity: current.identity, candidate, settled });
  const defaultRelation = relations[3];
  assert(defaultRelation);
  return {
    relations,
    defaultRelation,
    sourceId,
    revision: settled.currentWorkpiece,
    candidate,
  };
};
const edit = async (
  current: Session,
  label: string,
  previous: WorkpieceRevision,
  markdown: string,
  expected: WorkpieceEvidenceRelation[] | undefined,
  declaration?: (candidate: ReadResult) => WorkpieceEvidenceRelation[],
  queries = [quote, narrow, tail, markdown],
) => {
  const prefix = `${label}-${++serial}`;
  let candidate: ReadResult | undefined;
  let actual: ReadResult | undefined;
  let evidence: WorkpieceEvidenceRelation[] | undefined;
  setResponses([
    call(
      "brunch_workpiece",
      { markdown, locateTexts: queries },
      `${prefix}-candidate`,
    ),
    (context) => {
      candidate = modelOutput(context, `${prefix}-candidate`);
      checkLookup(candidate, markdown);
      assert.deepEqual(
        candidate.currentWorkpiece,
        previous,
        "Candidate lookup cannot replace the single current authority",
      );
      evidence = declaration?.(candidate);
      return call(
        "update_workpiece",
        { markdown, ...(evidence === undefined ? {} : { evidence }) },
        `${prefix}-revision`,
      );
    },
    call("brunch_workpiece", { locateTexts: queries }, `${prefix}-read`),
    (context) => {
      actual = modelOutput(context, `${prefix}-read`);
      checkLookup(actual, markdown, `${prefix}-revision`);
      assert.equal(actual.currentWorkpiece?.markdown, markdown);
      assert.equal(actual.currentWorkpiece.sha256, sha256(markdown));
      assert.equal(actual.currentWorkpiece.ordinal, previous.ordinal + 1);
      assert.deepEqual(
        actual.currentWorkpiece.evidence,
        declaration ? evidence : expected,
      );
      assert.equal(
        actual.currentWorkpiece.evidenceValidated,
        (declaration ? evidence : expected) === undefined ? undefined : true,
      );
      return done();
    },
  ]);
  await current.send(
    `TEST synthetic edit: ${label}. No new operational testimony.`,
  );
  assert(
    candidate && actual?.currentWorkpiece,
    `All ${label} model-facing assertions must complete`,
  );
  const tool = await current.part(`${prefix}-revision`);
  assert.equal(tool.state, "output-available");
  assert.deepEqual(
    tool.input,
    { markdown, ...(evidence === undefined ? {} : { evidence }) },
    "Carry cannot rewrite raw input into a declaration",
  );
  rows.push({
    label,
    identity: current.identity,
    previous,
    candidate,
    actual,
    revisionTool: tool,
    explicitNewDeclaration: declaration !== undefined,
  });
  return actual.currentWorkpiece;
};
try {
  const automatic = [
    ["unchanged-append", `${base}\nUnrelated TEST context.`, [0, 1, 2, 3]],
    ["rename-same-width", base.replace("account", "renamed"), [0, 1, 2, 3]],
    ["rename-offset-change", base.replace("account", "longer heading"), []],
    ["move", `TEST preface\n${base}`, []],
    ["paraphrase", base.replace(quote, "Hold a single crew."), []],
    [
      "ambiguous-paraphrase",
      base.replace(quote, "Hold a single crew. Allocate one team."),
      [],
    ],
    ["split", base.replace(quote, "Reserve.\nOne crew."), []],
    [
      "merge-reworded",
      base.replace(
        `${quote}\n\n${tail}`,
        "Reserve a crew while timing stays unknown.",
      ),
      [],
    ],
    [
      "merge-separator-only",
      base.replace(`${quote}\n\n${tail}`, `${quote}  ${tail}`),
      [0, 1, 2, 3],
    ],
    ["deletion", "# TEST deletion\nNo governing passage remains.", []],
    ["duplicate-wording", `${base}\n${quote}`, [3]],
    ["duplicate-quoted-wording", `${base}\n> ${quote}`, [3]],
    [
      "duplicate-headings-only",
      `${base}\n# TEST account\nOther TEST text.`,
      [0, 1, 2, 3],
    ],
  ] as const;
  for (const [label, markdown, retained] of automatic) {
    const current = session(label);
    const initial = await seed(current);
    const expected = retained.map((index) => {
      const relation = initial.relations[index];
      assert(relation);
      return relation;
    });
    const revision = await edit(
      current,
      label,
      initial.revision,
      markdown,
      expected.length ? expected : undefined,
    );
    if (label === "deletion") {
      const reintroduced = await edit(
        current,
        "reintroduction-no-declaration",
        revision,
        base,
        undefined,
      );
      await edit(
        current,
        "reintroduction-explicit-new-declaration",
        reintroduced,
        base,
        undefined,
        (candidate) => [
          {
            locator: spanFrom(candidate, quote),
            messageIds: [initial.sourceId],
            kind: "elicited",
          },
        ],
      );
    }
    histories.push(await current.client.history());
  }
  // Source duplicate -> current unique still cannot automatically select an old passage.
  const duplicated = session("duplicate-origin");
  const duplicateSeed = await seed(duplicated, `${base}\n${quote}`);
  await edit(
    duplicated,
    "duplicate-origin-to-unique",
    duplicateSeed.revision,
    base,
    [duplicateSeed.defaultRelation],
  );
  histories.push(await duplicated.client.history());

  // Explicit declarations are new revision-local relations, not predecessor/successor identities.
  for (const [label, markdown, texts] of [
    ["move-explicit", `TEST preface\n${base}`, [quote]],
    [
      "paraphrase-explicit",
      base.replace(quote, "Hold a single crew."),
      ["Hold a single crew."],
    ],
    [
      "split-explicit",
      base.replace(quote, "Reserve.\nOne crew."),
      ["Reserve.", "One crew."],
    ],
    [
      "merge-explicit",
      base.replace(
        `${quote}\n\n${tail}`,
        "Reserve a crew while timing stays unknown.",
      ),
      ["Reserve a crew while timing stays unknown."],
    ],
    ["duplicate-explicit-selection", `${base}\n${base}`, [quote]],
    [
      "overbroad-explicit",
      `${base}\nUnrelated TEST weather and staffing prose.`,
      ["BROAD"],
    ],
  ] as const) {
    const current = session(label);
    const initial = await seed(current);
    // For explicit-only comparisons choose a new declaration covering all old retained spans;
    // move/reworded edits retain none. Duplicate selection retains none through ambiguity.
    const revised = await edit(
      current,
      label,
      initial.revision,
      markdown,
      undefined,
      (candidate) => {
        if (label === "overbroad-explicit")
          return [
            {
              locator: spanFrom(candidate, markdown),
              messageIds: [initial.sourceId],
              kind: "elicited",
            },
          ];
        return texts.map((text) => ({
          locator: spanFrom(
            candidate,
            text,
            label === "duplicate-explicit-selection" ? 1 : 0,
          ),
          messageIds: [initial.sourceId],
          kind: "correction",
        }));
      },
      [...(label === "overbroad-explicit" ? [] : texts), markdown],
    );
    assert(revised.evidenceValidated);
    histories.push(await current.client.history());
  }

  const overlap = session("overlap-override");
  const overlapSeed = await seed(overlap);
  let explicit: WorkpieceEvidenceRelation | undefined;
  // Explicit overlap replaces all three old intersecting relations, preserving the disjoint default.
  const prefix = `override-${++serial}`;
  let overlapResult: ReadResult | undefined;
  setResponses([
    call("brunch_workpiece", { locateTexts: [narrow] }, `${prefix}-lookup`),
    (context) => {
      const read = modelOutput(context, `${prefix}-lookup`);
      checkLookup(read, base, overlapSeed.revision.revisionId);
      explicit = {
        locator: spanFrom(read, narrow),
        kind: "correction",
        messageIds: [overlapSeed.sourceId],
      };
      return call(
        "update_workpiece",
        { markdown: base, evidence: [explicit] },
        `${prefix}-revision`,
      );
    },
    call(
      "brunch_workpiece",
      { locateTexts: [quote, narrow] },
      `${prefix}-read`,
    ),
    (context) => {
      overlapResult = modelOutput(context, `${prefix}-read`);
      assert.deepEqual(overlapResult.currentWorkpiece?.evidence, [
        explicit,
        overlapSeed.relations[3],
      ]);
      return done();
    },
  ]);
  await overlap.send(
    "TEST explicit narrow correction overrides intersecting declarations, not unrelated standing.",
  );
  assert(explicit && overlapResult?.currentWorkpiece);
  rows.push({
    label: "explicit-overlap-override",
    previous: overlapSeed.revision,
    actual: overlapResult,
    explicit,
  });
  histories.push(await overlap.client.history());

  const negatives = session("negative-controls");
  const negativeSeed = await seed(negatives);
  const relation = negativeSeed.relations[0];
  assert(relation);
  setResponses([done()]);
  const preparedReceipt = await negatives.client.send({
    message: {
      kind: "signal",
      type: preparedWorkpieceSignalType,
      tagName: preparedWorkpieceSignalTag,
      attributes: { authorship: preparedWorkpieceAuthorship },
      body: "TEST prepared source, never operational user testimony.",
    },
  });
  await negatives.client.read(preparedReceipt, {
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(factoryFailures.length, 0);
  const history = await negatives.client.history();
  const preparedId = history.messages.find(
    (message) => message.signal?.tagName === preparedWorkpieceSignalTag,
  )?.id;
  assert(preparedId);
  const assistantId = history.messages.find(
    (message) => message.role === "assistant",
  )?.id;
  assert(assistantId);
  const foreign = session("foreign-source");
  const foreignSeed = await seed(foreign);
  for (const [label, evidence] of [
    ["assistant-source", [{ ...relation, messageIds: [assistantId] }]],
    ["prepared-signal-source", [{ ...relation, messageIds: [preparedId] }]],
    [
      "foreign-conversation-source",
      [{ ...relation, messageIds: [foreignSeed.sourceId] }],
    ],
    ["unknown-source", [{ ...relation, messageIds: ["TEST-unknown"] }]],
    ["empty-elicited-source", [{ ...relation, messageIds: [] }]],
    [
      "out-of-bounds-stale-span",
      [{ ...relation, locator: { start: 0, end: base.length + 1 } }],
    ],
  ] as const) {
    const id = `negative-${++serial}`;
    let read: ReadResult | undefined;
    setResponses([
      call("update_workpiece", { markdown: base, evidence }, id),
      call("brunch_workpiece", { locateTexts: [quote] }, `${id}-read`),
      (context) => {
        read = modelOutput(context, `${id}-read`);
        assert.deepEqual(read.currentWorkpiece, negativeSeed.revision);
        assert(
          !read.sources.some((source) =>
            [assistantId, preparedId, foreignSeed.sourceId].includes(source.id),
          ),
        );
        return done();
      },
    ]);
    await negatives.send(`TEST refusal control: ${label}`);
    assert(read);
    const rejected = await negatives.part(id);
    assert.equal(rejected.state, "output-error");
    rows.push({ label, rejected, actual: read });
  }
  // The read operation does not select arbitrary revisions or accept old lookup identities.
  setResponses([
    call(
      "brunch_workpiece",
      { revisionId: "TEST-wrong-revision", locateTexts: [quote] },
      "wrong-revision-read",
    ),
    done(),
  ]);
  await negatives.send(
    "TEST reject an invented revision selector instead of reading it as current.",
  );
  const wrongRevisionRead = await negatives.part("wrong-revision-read");
  assert.equal(wrongRevisionRead.state, "output-error");
  rows.push({ label: "wrong-revision-selector", rejected: wrongRevisionRead });
  const beforeCalls = faux.state.callCount;
  for (const identity of [
    { ...negatives.identity, principalKey: "TEST-foreign-principal" },
    { ...negatives.identity, conversationId: "TEST-wrong-conversation" },
  ]) {
    const response = await application.fetch(
      new Request(`${negatives.url}/history`, {
        headers: agentOwnershipHeaders(identity),
      }),
    );
    assert.equal(response.status, 403);
    rows.push({
      label: "ownership-refusal",
      identity,
      status: response.status,
      body: await response.text(),
    });
  }
  assert.equal(faux.state.callCount, beforeCalls);
  histories.push(
    await negatives.client.history(),
    await foreign.client.history(),
  );

  // Mechanically valid does NOT mean scoped to the candidate lookup or semantically relevant.
  // Use a real OLD product span on different current text, explicitly declared. This is a
  // counterexample to any claim that update_workpiece authenticates a locator's source hash.
  const scope = session("stale-explicit-control");
  const scopeSeed = await seed(scope);
  const staleRelation = scopeSeed.relations[0];
  assert(staleRelation);
  const different = base.replace(quote, "Discuss the rain.");
  assert.equal(different.length, base.length);
  await edit(
    scope,
    "stale-inbounds-explicit-is-not-continuity",
    scopeSeed.revision,
    different,
    undefined,
    () => [staleRelation, scopeSeed.defaultRelation],
  );
  counterexamples.push({
    claimRefuted:
      "A valid explicit in-bounds relation authenticates old lookup hash or relevance",
    oldRevision: scopeSeed.revision,
    currentMarkdown: different,
    wrongText: different.slice(
      staleRelation.locator.start,
      staleRelation.locator.end,
    ),
    expectedLimit:
      "No revision/hash field exists on evidence relations; explicit declarations are current-revision-local and relevance is unassessed.",
  });
  histories.push(await scope.client.history());

  // Reopen original storage, with no new declarations or saved-history injection.
  await application.stop();
  application = await loadBuiltBrunchApplication();
  let reopened: ReadResult | undefined;
  setResponses([
    call(
      "brunch_workpiece",
      { locateTexts: [quote] },
      "reopened-negative-current",
    ),
    (context) => {
      reopened = modelOutput(context, "reopened-negative-current");
      assert.deepEqual(reopened.currentWorkpiece, negativeSeed.revision);
      return done();
    },
  ]);
  await negatives.send(
    "TEST reopen authoritative current revision, not the last rejected candidate.",
  );
  assert(reopened);
  rows.push({ label: "reopened-current-after-refusals", actual: reopened });
  writeFileSync(
    join(outputDirectory, "result.json"),
    JSON.stringify(
      {
        outcome: "Partial",
        synthetic: true,
        paidCalls: 0,
        requests: captures.length,
        rows,
        counterexamples,
        limits:
          "Existing revision-local fallback; no passage identity/predecessor graph, introduced-by, automatic semantic relevance, genuine testimony, browser/why, compaction or owner utility verdict. Runtime reload is not an OS-process restart.",
      },
      null,
      2,
    ),
  );
  process.stdout.write(
    `PASSAGE_POLICY_MATRIX_PARTIAL rows=${rows.length} requests=${captures.length} paidCalls=0 output=${outputDirectory}\n`,
  );
} catch (error) {
  writeFileSync(
    join(outputDirectory, "failure.json"),
    JSON.stringify(
      {
        error: String(error),
        stack: error instanceof Error ? error.stack : undefined,
        rows,
        counterexamples,
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await application.stop();
  globalThis.fetch = nativeFetch;
  writeFileSync(
    join(outputDirectory, "native-contexts.json.gz"),
    gzipSync(JSON.stringify({ captures, contexts })),
  );
  writeFileSync(
    join(outputDirectory, "histories.json.gz"),
    gzipSync(JSON.stringify(histories)),
  );
}
