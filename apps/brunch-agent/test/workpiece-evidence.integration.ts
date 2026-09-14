/** Unpaid mounted-route evidence controls; scripted sources are TEST authorship, not expert testimony. */
/* eslint-disable no-await-in-loop -- Each synthetic response queue is consumed by one sequential submission. */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  fauxProvider,
  fauxAssistantMessage,
  fauxText,
  fauxToolCall,
  type Context,
} from "@earendil-works/pi-ai";
import { createFlueClient } from "@flue/sdk";

import { validatedFixtureMutationMode } from "@hashintel/brunch-agent-plugin-sdcpn/flue";
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

const outputDirectory = mkdtempSync(join(tmpdir(), "m7-a5-evidence-"));
process.env.NODE_ENV = "test";
process.env.BRUNCH_CHAT_MODEL = "claude-sonnet-4-6";
process.env.BRUNCH_DEV_DB_PATH = join(outputDirectory, "conversation.db");
process.env.HASH_OTLP_ENDPOINT = "";
const contexts: Context[] = [];
const captures: NativeRequestCapture[] = [];
const faux = fauxProvider({
  provider: "anthropic",
  models: [{ id: "claude-sonnet-4-6", reasoning: true }],
});
installFauxProvider(nativeSchemaProvider(faux.provider, captures, contexts));
let application = await loadBuiltBrunchApplication();
const identity = {
  principalKey: "TEST-a5-owner",
  conversationId: `TEST-a5-${crypto.randomUUID()}`,
};
const binding = {
  conversationId: identity.conversationId,
  documentId: "TEST-document",
  incarnationId: "TEST-incarnation",
};
const url = `http://brunch.local/agents/chat/${flueConversationIdFrom(identity)}`;
const client = createFlueClient({
  url,
  headers: agentOwnershipHeaders(identity),
  fetch: async (input, init) =>
    application.fetch(
      input instanceof Request ? input : new Request(input, init),
    ),
});
const tools = async () =>
  (await client.history()).messages.flatMap((message) =>
    message.parts.flatMap((part) =>
      part.type === "dynamic-tool" ? [part] : [],
    ),
  );
const toolResult = (
  context: Context,
  name: string,
): Record<string, unknown> => {
  const result = context.messages.findLast(
    (message) => message.role === "toolResult" && message.toolName === name,
  );
  assert(result?.role === "toolResult");
  return JSON.parse(
    result.content
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join(""),
  ) as Record<string, unknown>;
};
const speak = (body: string) =>
  client
    .send({ message: { kind: "user", body } })
    .then((receipt) => client.wait(receipt));
const call = (name: string, args: Record<string, unknown>, id: string) =>
  fauxAssistantMessage([fauxToolCall(name, args, { id })], {
    stopReason: "toolUse",
  });
const markdown = "# TEST account\nReserve one crew.\n\nTiming remains unknown.";
let locator = { start: -1, end: -1 };
let sourceId = "";
const expectedEvidence = () => [
  { locator, messageIds: [sourceId], kind: "elicited" },
  { locator, messageIds: [], kind: "formalism-constraint" },
];
const observations: unknown[] = [];
try {
  faux.setResponses([
    call(
      "read_workpiece",
      { locateTexts: ["missing current"] },
      "unavailable-locators",
    ),
    (context) => {
      const result = toolResult(context, "read_workpiece");
      assert.equal(result.currentWorkpiece, null);
      const lookup = result.locatorLookup as {
        subject: { kind: string };
        sha256?: string;
      };
      assert.equal(lookup.subject.kind, "unavailable");
      assert.equal(lookup.sha256, undefined);
      observations.push({ noCurrentLookup: result });
      return fauxAssistantMessage([
        fauxText("TEST prepared source acknowledged; not user evidence."),
      ]);
    },
  ]);
  await client.wait(
    await client.send({
      initialData: {
        mode: validatedFixtureMutationMode,
        browser: { binding, requestedBaseHash: "a".repeat(64) },
      },
      message: {
        kind: "signal",
        type: preparedWorkpieceSignalType,
        tagName: preparedWorkpieceSignalTag,
        attributes: { authorship: preparedWorkpieceAuthorship },
        body: "Prepared hypothesis, not elicited support.",
      },
    }),
  );
  assert.equal(
    observations.length,
    1,
    "Unavailable-current lookup must complete without inventing a document.",
  );
  faux.setResponses([
    call(
      "read_workpiece",
      { markdown, locateTexts: ["Reserve one crew."] },
      "discover-sources",
    ),
    (context) => {
      const result = toolResult(context, "read_workpiece");
      const lookup = result.locatorLookup as {
        subject: { kind: string; revisionId?: string };
        queries: {
          occurrences: { start: number; end: number }[];
          omittedCount: number;
        }[];
      };
      assert.equal(lookup.subject.kind, "unsettled-candidate");
      assert.equal(lookup.subject.revisionId, undefined);
      assert.equal(
        result.currentWorkpiece,
        null,
        "Candidate lookup cannot settle state.",
      );
      assert.equal(lookup.queries[0]?.omittedCount, 0);
      assert.equal(lookup.queries[0].occurrences.length, 1);
      const found = lookup.queries[0].occurrences[0];
      assert(found);
      locator = found;
      assert.deepEqual(
        locator,
        { start: markdown.indexOf("Reserve"), end: markdown.indexOf("\n\n") },
        "Independent oracle only; the successful input uses the product-returned span.",
      );
      assert(Array.isArray(result.sources));
      const source = result.sources.find(
        (entry: unknown) =>
          typeof entry === "object" &&
          entry !== null &&
          "text" in entry &&
          entry.text === "TEST scripted user control: Reserve one crew.",
      ) as { id: string } | undefined;
      assert(
        source,
        "Positive source must be discoverable in actual model-facing output, not test history.",
      );
      sourceId = source.id;
      return call(
        "mutate_workpiece",
        {
          markdown,
          evidence: expectedEvidence(),
        },
        "evidence-revision",
      );
    },
    call(
      "read_workpiece",
      { locateTexts: ["Reserve one crew."] },
      "read-settled",
    ),
    (context) => {
      const result = toolResult(context, "read_workpiece");
      assert.deepEqual(
        (result.currentWorkpiece as { evidence: unknown }).evidence,
        expectedEvidence(),
      );
      const settledLookup = result.locatorLookup as {
        subject: { kind: string; revisionId: string };
        queries: { occurrences: unknown }[];
        sha256: string;
      };
      assert.equal(settledLookup.subject.kind, "current-revision");
      assert.equal(settledLookup.subject.revisionId, "evidence-revision");
      assert.equal(
        settledLookup.sha256,
        (result.currentWorkpiece as { sha256: string }).sha256,
      );
      assert.deepEqual(settledLookup.queries[0]?.occurrences, [locator]);
      observations.push({ positiveModelFacingResult: result });
      return fauxAssistantMessage([
        fauxText(
          "TEST interpretation: the declared user-source relation is authorized, not adjudicated for relevance or utility.",
        ),
      ]);
    },
  ]);
  await speak("TEST scripted user control: Reserve one crew.");
  assert(
    sourceId.length > 0,
    "The product must expose a source and locator; a failed scripted response is not a pass.",
  );
  assert.equal(
    observations.length,
    2,
    "The positive model-facing assertions must actually complete.",
  );
  faux.setResponses([
    call(
      "read_workpiece",
      {
        markdown: "# A different unsettled candidate",
        locateTexts: ["candidate"],
      },
      "candidate-not-authority",
    ),
    (context) => {
      const result = toolResult(context, "read_workpiece");
      const lookup = result.locatorLookup as {
        subject: { kind: string; revisionId?: string; ordinal?: number };
        sha256: string;
      };
      const current = result.currentWorkpiece as {
        revisionId: string;
        markdown: string;
        sha256: string;
      };
      assert.equal(current.revisionId, "evidence-revision");
      assert.equal(current.markdown, markdown);
      assert.equal(lookup.subject.kind, "unsettled-candidate");
      assert.equal(lookup.subject.revisionId, undefined);
      assert.equal(lookup.subject.ordinal, undefined);
      assert.notEqual(lookup.sha256, current.sha256);
      observations.push({ candidateDoesNotReplaceCurrent: result });
      return fauxAssistantMessage([
        fauxText("TEST candidate locators are not a revision or state write."),
      ]);
    },
  ]);
  await speak(
    "TEST locate a different candidate without replacing the current workpiece.",
  );
  assert.equal(observations.length, 3);
  const history = await client.history();
  const preparedId = history.messages.find(
    (message) => message.signal?.tagName === preparedWorkpieceSignalTag,
  )?.id;
  const assistantId = history.messages.find(
    (message) => message.role === "assistant",
  )?.id;
  assert(preparedId && assistantId);
  // A second principal's actual source exists, but is outside this bound history.
  const otherIdentity = {
    principalKey: "TEST-other-owner",
    conversationId: "TEST-other-conversation",
  };
  const otherClient = createFlueClient({
    url: `http://brunch.local/agents/chat/${flueConversationIdFrom(otherIdentity)}`,
    headers: agentOwnershipHeaders(otherIdentity),
    fetch: async (input, init) =>
      application.fetch(
        input instanceof Request ? input : new Request(input, init),
      ),
  });
  faux.setResponses([
    fauxAssistantMessage([fauxText("Other conversation TEST control.")]),
  ]);
  await otherClient.wait(
    await otherClient.send({
      message: {
        kind: "user",
        body: "Not evidence for the bound conversation.",
      },
    }),
  );
  const otherId = (await otherClient.history()).messages.find(
    (message) => message.role === "user" && message.purpose === "user",
  )?.id;
  assert(otherId);
  for (const [label, evidence] of [
    ["assistant", [{ locator, messageIds: [assistantId], kind: "elicited" }]],
    [
      "prepared-signal",
      [{ locator, messageIds: [preparedId], kind: "elicited" }],
    ],
    [
      "other-principal-conversation",
      [{ locator, messageIds: [otherId], kind: "elicited" }],
    ],
    ["unknown", [{ locator, messageIds: ["unknown"], kind: "elicited" }]],
    [
      "invalid-span",
      [
        {
          locator: { start: 0, end: markdown.length + 1 },
          messageIds: [sourceId],
          kind: "elicited",
        },
      ],
    ],
  ] as const) {
    faux.setResponses([
      call("mutate_workpiece", { markdown, evidence }, `refused-${label}`),
      call("read_workpiece", {}, `state-after-${label}`),
      (context) => {
        const result = toolResult(context, "read_workpiece");
        assert.equal(
          (result.currentWorkpiece as { revisionId: string }).revisionId,
          "evidence-revision",
        );
        observations.push({ refusal: label, state: result.currentWorkpiece });
        return fauxAssistantMessage([
          fauxText(`TEST ${label} relation refused without changing state.`),
        ]);
      },
    ]);
    await speak(`TEST negative ${label} source control.`);
    const rejected = (await tools()).find(
      (tool) => tool.toolCallId === `refused-${label}`,
    );
    assert.equal(rejected?.state, "output-error");
  }
  faux.setResponses([
    call(
      "mutate_workpiece",
      { markdown: `${markdown}\nUnrelated context.` },
      "carried-revision",
    ),
    call("read_workpiece", {}, "read-carried"),
    (context) => {
      const result = toolResult(context, "read_workpiece");
      assert.deepEqual(
        (result.currentWorkpiece as { evidence: unknown }).evidence,
        expectedEvidence(),
      );
      observations.push({ carried: result.currentWorkpiece });
      return fauxAssistantMessage([
        fauxText("TEST unchanged relation retained without new support."),
      ]);
    },
  ]);
  await speak("TEST append unrelated context without inventing evidence.");
  const wrongOwner = await application.fetch(
    new Request(`${url}/history`, {
      headers: agentOwnershipHeaders({
        ...identity,
        principalKey: "wrong-owner",
      }),
    }),
  );
  assert.equal(wrongOwner.status, 403);
  await application.stop();
  application = await loadBuiltBrunchApplication();
  faux.setResponses([
    call("read_workpiece", {}, "reopened-current"),
    (context) => {
      const result = toolResult(context, "read_workpiece");
      assert.equal(
        (result.currentWorkpiece as { revisionId: string }).revisionId,
        "carried-revision",
      );
      assert.deepEqual(
        (result.currentWorkpiece as { evidence: unknown }).evidence,
        expectedEvidence(),
      );
      assert.equal((result.currentWorkpiece as { ordinal: number }).ordinal, 2);
      observations.push({ reopenedModelFacingResult: result });
      return fauxAssistantMessage([
        fauxText(
          "TEST reopened authoritative state queried through the same production operation.",
        ),
      ]);
    },
  ]);
  await speak("TEST reopen and query the current workpiece.");
  const carriedCall = (await tools()).find(
    (entry) => entry.toolCallId === "carried-revision",
  );
  assert(carriedCall?.state === "output-available");
  assert.deepEqual(
    carriedCall.input,
    { markdown: `${markdown}\nUnrelated context.` },
    "Raw input must retain omitted evidence, not reconstructed declarations.",
  );
  assert.deepEqual(
    (carriedCall.output as { evidence: unknown }).evidence,
    expectedEvidence(),
  );
  assert.equal(
    observations.length,
    10,
    "Every model-facing positive, refusal, carry and reopen assertion must complete.",
  );
  writeFileSync(
    join(outputDirectory, "evidence-relations.json"),
    JSON.stringify(
      {
        identity,
        binding,
        sourceId,
        observations,
        captures,
        contexts,
        history: await client.history(),
      },
      null,
      2,
    ),
  );
  process.stdout.write(
    JSON.stringify({
      outputDirectory,
      observations: observations.length,
      syntheticRequests: captures.length,
      paidCalls: 0,
    }),
  );
} catch (error) {
  writeFileSync(
    join(outputDirectory, "failure.json"),
    JSON.stringify(
      {
        error: String(error),
        observations,
        contexts,
        captures,
        history: await client.history(),
      },
      null,
      2,
    ),
  );
  process.stderr.write(
    `Retained failed source/locator probe: ${outputDirectory}\n`,
  );
  throw error;
} finally {
  await application.stop();
}
