/** Unpaid mounted-route evidence controls; scripted sources are TEST authorship, not expert testimony. */
/* eslint-disable no-await-in-loop -- Each synthetic response queue is consumed by one sequential submission. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

import { INTEGRATED_BRUNCH_MODE } from "@hashintel/brunch-agent-plugin-sdcpn/flue";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../src/conversation/identity.ts";
import { installFauxProvider } from "../src/evaluations/install-faux-provider.ts";
import { loadBuiltBrunchApplication } from "./load-built-application.ts";
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
let initialized = false;
const speak = (body: string) => {
  const first = !initialized;
  initialized = true;
  return client
    .send({
      ...(first
        ? {
            initialData: {
              mode: INTEGRATED_BRUNCH_MODE,
              construction: { binding },
            },
          }
        : {}),
      message: { kind: "user", body },
    })
    .then((receipt) => client.wait(receipt));
};
const call = (name: string, args: Record<string, unknown>, id: string) =>
  fauxAssistantMessage([fauxToolCall(name, args, { id })], {
    stopReason: "toolUse",
  });
const projectedTrueUserMessageId = (context: Context): string => {
  const marker = context.messages
    .flatMap((message) =>
      message.role === "user" && typeof message.content !== "string"
        ? message.content
        : [],
    )
    .findLast(
      (part) => part.type === "text" && /^\[message [^\]]+\]$/u.test(part.text),
    );
  assert(marker?.type === "text");
  const id = /^\[message ([^\]]+)\]$/u.exec(marker.text)?.at(1);
  assert(id, "The current true-user message must expose its id to the model.");
  return id;
};
const markdown = "# TEST account\nReserve one crew.\n\nTiming remains unknown.";
const correctedPassage = "The reserve lasts two hours.";
const correctedMarkdown = `${markdown}\n\n${correctedPassage}`;
let locator = { start: -1, end: -1 };
let sourceId = "";
const expectedEvidence = () => [
  { locator, messageIds: [sourceId], kind: "elicited" },
  { locator, messageIds: [], kind: "formalism-constraint" },
];
const observations: unknown[] = [];
try {
  faux.setResponses([
    (context) => {
      sourceId = projectedTrueUserMessageId(context);
      return call(
        "mutate_workpiece",
        {
          markdown,
          baseRevisionId: null,
          evidence: [
            {
              text: "Reserve one crew.",
              messageIds: [sourceId],
              kind: "elicited",
            },
            {
              text: "Reserve one crew.",
              messageIds: [],
              kind: "formalism-constraint",
            },
          ],
        },
        "evidence-revision",
      );
    },
    (context) => {
      const settled = toolResult(context, "mutate_workpiece");
      const evidence = settled.evidence as {
        locator: { start: number; end: number };
        messageIds: string[];
        kind: string;
      }[];
      assert.equal(settled.revisionId, "evidence-revision");
      assert.equal(settled.markdown, undefined);
      locator = evidence[0]?.locator ?? locator;
      assert.deepEqual(evidence, expectedEvidence());
      assert.deepEqual(locator, {
        start: markdown.indexOf("Reserve"),
        end: markdown.indexOf("\n\n"),
      });
      return call(
        "read_workpiece",
        { includeContent: false, locateTexts: ["Reserve one crew."] },
        "read-settled",
      );
    },
    (context) => {
      const result = toolResult(context, "read_workpiece");
      assert.equal(result.currentWorkpiece, null);
      assert.deepEqual(result.currentWorkpiecePointer, {
        revisionId: "evidence-revision",
        sha256: createHash("sha256").update(markdown).digest("hex"),
        ordinal: 1,
      });
      assert.deepEqual(result.sources, []);
      assert.deepEqual(
        (result.locatorLookup as { queries: unknown[] }).queries,
        [
          {
            text: "Reserve one crew.",
            occurrences: [locator],
            matchedCount: 1,
            omittedCount: 0,
          },
        ],
      );
      const settledLookup = result.locatorLookup as {
        subject: { kind: string; revisionId: string };
        sha256: string;
      };
      assert.equal(settledLookup.subject.kind, "current-revision");
      assert.equal(settledLookup.subject.revisionId, "evidence-revision");
      assert.equal(
        settledLookup.sha256,
        (result.currentWorkpiecePointer as { sha256: string }).sha256,
      );
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
    1,
    "The positive model-facing assertions must actually complete.",
  );
  const newTestimony =
    "TEST correction: the reserve lasts two hours, not one hour.";
  let correctionSourceId = "";
  faux.setResponses([
    (context) => {
      correctionSourceId = projectedTrueUserMessageId(context);
      return call(
        "read_workpiece",
        { includeContent: false, sourceIds: [correctionSourceId] },
        "check-correction-source",
      );
    },
    (context) => {
      const result = toolResult(context, "read_workpiece");
      assert.equal(result.currentWorkpiece, null);
      assert.deepEqual(result.currentWorkpiecePointer, {
        revisionId: "evidence-revision",
        sha256: createHash("sha256").update(markdown).digest("hex"),
        ordinal: 1,
      });
      assert.deepEqual(result.sources, [
        {
          id: correctionSourceId,
          role: "user",
          purpose: "user",
          text: newTestimony,
          textTruncated: false,
          untrusted: true,
        },
      ]);
      assert.equal(result.locatorLookup, undefined);
      observations.push({ correctionSource: result });
      return call(
        "mutate_workpiece",
        {
          markdown: correctedMarkdown,
          baseRevisionId: "evidence-revision",
          evidence: [
            {
              text: correctedPassage,
              messageIds: [correctionSourceId],
              kind: "elicited",
            },
          ],
        },
        "corrected-revision",
      );
    },
    (context) => {
      const result = toolResult(context, "mutate_workpiece");
      const evidence = result.evidence as {
        locator: { start: number; end: number };
        messageIds: string[];
        kind: string;
      }[];
      assert.equal(result.revisionId, "corrected-revision");
      assert.deepEqual(evidence, [
        {
          locator: {
            start: correctedMarkdown.indexOf(correctedPassage),
            end: correctedMarkdown.length,
          },
          messageIds: [correctionSourceId],
          kind: "elicited",
        },
        ...expectedEvidence(),
      ]);
      observations.push({ correctedSettlement: result });
      return fauxAssistantMessage([
        fauxText("TEST correction checked and settled."),
      ]);
    },
  ]);
  await speak(newTestimony);
  const history = await client.history();
  const initialSource = history.messages.find(
    (message) =>
      message.role === "user" &&
      message.purpose === "user" &&
      message.parts.some(
        (part) =>
          part.type === "text" &&
          part.text === "TEST scripted user control: Reserve one crew.",
      ),
  );
  assert(initialSource);
  assert.equal(sourceId, initialSource.id);
  const focusedSource = history.messages.find(
    (message) =>
      message.role === "user" &&
      message.purpose === "user" &&
      message.parts.some(
        (part) => part.type === "text" && part.text === newTestimony,
      ),
  );
  assert(focusedSource);
  assert.equal(correctionSourceId, focusedSource.id);
  const expectedCorrectedEvidence = () => [
    {
      locator: {
        start: correctedMarkdown.indexOf(correctedPassage),
        end: correctedMarkdown.length,
      },
      messageIds: [correctionSourceId],
      kind: "elicited",
    },
    ...expectedEvidence(),
  ];
  const assistantId = history.messages.find(
    (message) => message.role === "assistant",
  )?.id;
  assert(assistantId);
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
    call("read_workpiece", {}, "other-empty-read"),
    (context) => {
      assert.equal(
        toolResult(context, "read_workpiece").currentWorkpiece,
        null,
      );
      assert(!JSON.stringify(context).includes("markdownReference"));
      // Same revision ID/hash as the first conversation deliberately stresses scope.
      return call(
        "mutate_workpiece",
        { markdown, baseRevisionId: null },
        "evidence-revision",
      );
    },
    (context) => {
      const settled = toolResult(context, "mutate_workpiece");
      assert.equal(settled.markdown, undefined);
      assert.equal(
        (settled.markdownReference as { revisionId: string }).revisionId,
        "evidence-revision",
      );
      return call("read_workpiece", {}, "other-current-read");
    },
    (context) => {
      const settled = toolResult(context, "mutate_workpiece");
      const current = toolResult(context, "read_workpiece")
        .currentWorkpiece as {
        markdownReference: { retainedEntryId: string };
      };
      assert.equal(
        current.markdownReference.retainedEntryId,
        (settled.markdownReference as { retainedEntryId: string })
          .retainedEntryId,
      );
      return fauxAssistantMessage([
        fauxText("Other conversation TEST control."),
      ]);
    },
  ]);
  await otherClient.wait(
    await otherClient.send({
      initialData: {
        mode: INTEGRATED_BRUNCH_MODE,
        construction: {
          binding: {
            ...binding,
            conversationId: otherIdentity.conversationId,
          },
        },
      },
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
    [
      "assistant",
      [
        {
          text: "Reserve one crew.",
          messageIds: [assistantId],
          kind: "elicited",
        },
      ],
    ],
    [
      "other-principal-conversation",
      [
        {
          text: "Reserve one crew.",
          messageIds: [otherId],
          kind: "elicited",
        },
      ],
    ],
    [
      "unknown",
      [
        {
          text: "Reserve one crew.",
          messageIds: ["unknown"],
          kind: "elicited",
        },
      ],
    ],
    [
      "absent-text",
      [
        {
          text: "This text is absent.",
          messageIds: [sourceId],
          kind: "elicited",
        },
      ],
    ],
  ] as const) {
    faux.setResponses([
      call(
        "mutate_workpiece",
        {
          markdown: correctedMarkdown,
          baseRevisionId: "corrected-revision",
          evidence,
        },
        `refused-${label}`,
      ),
      call("read_workpiece", {}, `state-after-${label}`),
      (context) => {
        const result = toolResult(context, "read_workpiece");
        assert.equal(
          (result.currentWorkpiece as { revisionId: string }).revisionId,
          "corrected-revision",
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
    assert.equal(rejected?.state, "output-available");
    assert.deepEqual(
      {
        disposition: (rejected.output as { disposition?: unknown }).disposition,
        applied: (rejected.output as { applied?: unknown }).applied,
        correctable: (rejected.output as { correctable?: unknown }).correctable,
        code: (rejected.output as { code?: unknown }).code,
      },
      {
        disposition: "refused",
        applied: false,
        correctable: true,
        code: "evidence-invalid",
      },
    );
    assert.match(
      (rejected.output as { message: string }).message,
      /authorized true-user|must occur exactly once|Nothing was written/u,
    );
  }
  faux.setResponses([
    call(
      "mutate_workpiece",
      {
        markdown: `${correctedMarkdown}\nUnrelated context.`,
        baseRevisionId: "corrected-revision",
      },
      "carried-revision",
    ),
    call("read_workpiece", {}, "read-carried"),
    (context) => {
      const result = toolResult(context, "read_workpiece");
      assert.deepEqual(
        (result.currentWorkpiece as { evidence: unknown }).evidence,
        expectedCorrectedEvidence(),
      );
      observations.push({ carried: result.currentWorkpiece });
      return fauxAssistantMessage([
        fauxText("TEST unchanged relation retained without new support."),
      ]);
    },
  ]);
  await speak("TEST append unrelated context without inventing evidence.");
  const settledLedger = `${correctedMarkdown}\nUnrelated context.`;
  faux.setResponses([
    call(
      "mutate_workpiece",
      {
        markdown: "# TEST account\nReserve one crew.",
        baseRevisionId: "carried-revision",
      },
      "refused-shrink",
    ),
    call("read_workpiece", {}, "state-after-shrink"),
    (context) => {
      const result = toolResult(context, "read_workpiece");
      const current = result.currentWorkpiece as {
        revisionId: string;
        sha256: string;
        ordinal: number;
        evidence: unknown;
      };
      assert.equal(current.revisionId, "carried-revision");
      assert.equal(
        current.sha256,
        createHash("sha256").update(settledLedger).digest("hex"),
      );
      assert.equal(current.ordinal, 3);
      assert.deepEqual(current.evidence, expectedCorrectedEvidence());
      observations.push({ shrinkDidNotDisplaceSettledLedger: current });
      return fauxAssistantMessage([
        fauxText("TEST refused shrink left the settled Ledger authoritative."),
      ]);
    },
  ]);
  await speak(
    "TEST attempt to shrink the settled Ledger without a retraction.",
  );
  const refusedShrink = (await tools()).find(
    (tool) => tool.toolCallId === "refused-shrink",
  );
  assert.equal(refusedShrink?.state, "output-available");
  assert.equal(
    (refusedShrink.output as { disposition?: unknown }).disposition,
    "refused",
  );
  assert.equal((refusedShrink.output as { applied?: unknown }).applied, false);
  assert.equal(
    (refusedShrink.output as { code?: unknown }).code,
    "silent-shrink",
  );
  assert.match(
    (refusedShrink.output as { message: string }).message,
    /removes more than 25%/u,
  );
  assert.match(
    (refusedShrink.output as { message: string }).message,
    /Nothing was written/u,
  );
  const stateAfterShrink = (await tools()).find(
    (tool) => tool.toolCallId === "state-after-shrink",
  );
  assert.equal(stateAfterShrink?.state, "output-available");
  assert.equal(
    (
      stateAfterShrink.output as {
        currentWorkpiece: { revisionId: string; markdown: string };
      }
    ).currentWorkpiece.markdown,
    settledLedger,
  );
  faux.setResponses([
    call(
      "mutate_workpiece",
      { markdown: " \n\t", baseRevisionId: "carried-revision" },
      "thrown-empty-markdown",
    ),
    call("read_workpiece", {}, "state-after-thrown"),
    (context) => {
      const result = toolResult(context, "read_workpiece");
      assert.equal(
        (result.currentWorkpiece as { revisionId: string }).revisionId,
        "carried-revision",
      );
      observations.push({
        thrownDidNotDisplaceSettledLedger: result.currentWorkpiece,
      });
      return fauxAssistantMessage([
        fauxText(
          "TEST thrown input error left the settled Ledger authoritative.",
        ),
      ]);
    },
  ]);
  await speak("TEST throw on empty Markdown rather than returning a refusal.");
  const thrownEmpty = (await tools()).find(
    (tool) => tool.toolCallId === "thrown-empty-markdown",
  );
  assert.equal(thrownEmpty?.state, "output-error");
  assert.match(thrownEmpty.errorText, /must not be empty/u);
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
        expectedCorrectedEvidence(),
      );
      assert.equal((result.currentWorkpiece as { ordinal: number }).ordinal, 3);
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
    {
      markdown: settledLedger,
      baseRevisionId: "corrected-revision",
    },
    "Raw input must retain omitted evidence, not reconstructed declarations.",
  );
  assert.deepEqual(
    (carriedCall.output as { evidence: unknown }).evidence,
    expectedCorrectedEvidence(),
  );
  assert.equal(
    observations.length,
    11,
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
