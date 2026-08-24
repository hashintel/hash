import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// One of the substrate integration entry points reviewed in
// test/boundaries.test.ts, which is where the permission lives — this comment
// does not grant it.
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  type Context,
} from "@earendil-works/pi-ai";
import { start } from "@flue/runtime/node";
import { createFlueClient } from "@flue/sdk";

import { toolName } from "@hashintel/brunch-agent";
import {
  createFlueHistoryReader,
  createLocalCaptureStore,
  type FlueHistoryReaderOptions,
} from "@hashintel/brunch-agent-binding-flue";

import {
  GHERKIN_MODEL_ID,
  GherkinElicitor,
} from "../src/agents/gherkin-elicitor.ts";
import app from "../src/app.ts";
import { GHERKIN_AGENT_ROUTE } from "../src/routes.ts";
import { targetDocumentPath } from "../src/target-document-path.ts";

import type { StatementNotedProposalInput } from "@hashintel/brunch-agent-plugin-gherkin";

const ask = toolName("ask");
const sweep = toolName("sweep");
const omittedQuote = "A shopper completes checkout.";
const newlyCapturedQuote = "Payment is authorized before fulfillment.";
const repairedQuote = "Refunds require approval.";
const missingQuote = "This quote is not in the conversation.";
const statementNoted = (quote: string): StatementNotedProposalInput => ({
  evidence: [{ excerpt: quote }],
  epistemicStatus: "explicit",
  confidence: "firm",
  content: {
    value: {
      type: "statement-noted",
      interior: { verbatim: quote },
    },
  },
});
const faux = fauxProvider({
  provider: "anthropic",
  models: [{ id: GHERKIN_MODEL_ID }],
});

let replyContext: Context | undefined;
faux.setResponses([
  fauxAssistantMessage(
    [
      fauxToolCall(ask, {
        question: "What outcome should the scenario describe?",
      }),
    ],
    { stopReason: "toolUse" },
  ),
  (context) => {
    replyContext = context;
    return fauxAssistantMessage(
      [fauxToolCall(ask, { question: "Who initiates that outcome?" })],
      {
        stopReason: "toolUse",
      },
    );
  },
  fauxAssistantMessage(
    [
      fauxToolCall(ask, { question: "What happens first?" }),
      fauxToolCall(ask, { question: "What happens second?" }),
    ],
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage("Waiting for the accepted question to be answered."),
  fauxAssistantMessage("That closes the payment topic."),
  fauxAssistantMessage([fauxToolCall(sweep, {})], { stopReason: "toolUse" }),
  fauxAssistantMessage(
    [
      fauxToolCall("finish", {
        proposals: [statementNoted(newlyCapturedQuote)],
      }),
    ],
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage([fauxToolCall(sweep, {})], { stopReason: "toolUse" }),
  fauxAssistantMessage(
    [
      fauxToolCall("finish", {
        proposals: [
          statementNoted(newlyCapturedQuote),
          statementNoted(omittedQuote),
        ],
      }),
    ],
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage("The settled statements are captured."),
  fauxAssistantMessage("That closes the refund topic."),
  fauxAssistantMessage([fauxToolCall(sweep, {})], { stopReason: "toolUse" }),
  fauxAssistantMessage(
    [fauxToolCall("finish", { proposals: [statementNoted(missingQuote)] })],
    {
      stopReason: "toolUse",
    },
  ),
  fauxAssistantMessage("The refused sweep needs repair."),
  fauxAssistantMessage("I am stopping on the repair continuation."),
  fauxAssistantMessage([fauxToolCall(sweep, {})], { stopReason: "toolUse" }),
  fauxAssistantMessage(
    [
      fauxToolCall("finish", {
        proposals: [
          statementNoted(newlyCapturedQuote),
          statementNoted(omittedQuote),
          statementNoted(repairedQuote),
        ],
      }),
    ],
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage("The repaired sweep is captured."),
]);

const flue = await start({
  agents: [GherkinElicitor],
  providers: [faux.provider],
});
const targetDirectory = await mkdtemp(
  join(tmpdir(), "brunch-walking-skeleton-"),
);

try {
  process.env.BRUNCH_DEV_TARGET_DOCUMENT_DIR = targetDirectory;
  const fetchApp: FlueHistoryReaderOptions["transport"] = (input, init) =>
    Promise.resolve(
      app.fetch(input instanceof Request ? input : new Request(input, init)),
    );
  const conversationId = `walking-skeleton-${crypto.randomUUID()}`;
  const targetDocumentId = "walking-skeleton-test";
  const captureStore = createLocalCaptureStore(
    targetDocumentPath(targetDocumentId),
  );
  const historyReader = createFlueHistoryReader({
    resolveConversationUrl: (sessionId) =>
      `http://brunch.test/agents/${GHERKIN_AGENT_ROUTE}/${sessionId}`,
    transport: fetchApp,
    archive: captureStore,
  });
  const client = createFlueClient({
    url: `http://brunch.test/agents/${GHERKIN_AGENT_ROUTE}/${conversationId}`,
    fetch: fetchApp,
  });

  const kickoff = await client.send({
    message: { kind: "user", body: "Begin the interview." },
    initialData: { targetDocumentId },
  });
  await client.wait(kickoff);

  const firstHistory = await historyReader.read(conversationId);
  const previousArchive = await captureStore.readArchivedEntries({
    sessionId: conversationId,
    entryStart: 1,
    entryEnd: firstHistory.messages.length,
  });
  const quoteAbsentFromPreviousArchive =
    !JSON.stringify(previousArchive).includes(newlyCapturedQuote);
  const firstParts = firstHistory.messages.flatMap((message) => message.parts);
  const firstAsk = firstParts.find(
    (part) =>
      part.type === "dynamic-tool" &&
      part.toolName === ask &&
      part.state === "output-available",
  );
  const firstAskOutput =
    firstAsk?.type === "dynamic-tool" && firstAsk.state === "output-available"
      ? firstAsk.output
      : undefined;

  const answer = await client.send({
    message: { kind: "user", body: omittedQuote },
  });
  await client.wait(answer);

  const secondAnswer = await client.send({
    message: { kind: "user", body: "The shopper initiates it." },
  });
  await client.wait(secondAnswer);

  const thirdAnswer = await client.send({
    message: { kind: "user", body: newlyCapturedQuote },
  });
  await client.wait(thirdAnswer);

  const fourthAnswer = await client.send({
    message: { kind: "user", body: repairedQuote },
  });
  await client.wait(fourthAnswer);

  const history = await historyReader.peek(conversationId);
  const repeatedAskAssistant = [...history.messages]
    .reverse()
    .find(
      (message) =>
        message.role === "assistant" &&
        message.parts.filter(
          (part) => part.type === "dynamic-tool" && part.toolName === ask,
        ).length >= 2,
    );
  const finalAskParts =
    repeatedAskAssistant?.parts.filter(
      (part) => part.type === "dynamic-tool" && part.toolName === ask,
    ) ?? [];
  const captured = await captureStore.read();
  let archivePointerResolved = false;
  let affordanceReplyClassified = false;
  const capture = captured.captures.find(
    (candidate) =>
      "evidence" in candidate &&
      candidate.evidence.some(
        (evidence) => evidence.excerpt === newlyCapturedQuote,
      ),
  );
  if (capture && "evidence" in capture) {
    affordanceReplyClassified =
      capture.evidence[0]?.source === "user-affordance-payload";
    const [archived] = await captureStore.readArchivedEntries(
      capture.evidence[0]!.pointer,
    );
    archivePointerResolved =
      archived?.versions.at(-1)?.text === newlyCapturedQuote;
  }
  const settlementChecks = history.messages.filter(
    (message) => message.signal?.tagName === "settlement-check",
  );
  const repairSignals = history.messages.filter(
    (message) => message.signal?.tagName === "sweep-repair",
  );
  const sweepOutputs = history.messages
    .flatMap((message) => message.parts)
    .flatMap((part) =>
      part.type === "dynamic-tool" &&
      part.toolName === sweep &&
      part.state === "output-available" &&
      typeof part.output === "object" &&
      part.output !== null
        ? [part.output]
        : [],
    );
  const appliedSweepOutputs = sweepOutputs.filter(
    (output): output is Record<string, unknown> =>
      "status" in output && output.status === "applied",
  );
  const replayOutput = appliedSweepOutputs[1];
  const capturesStayAtVerbatimFloor = captured.captures.every((candidate) => {
    if (!("evidence" in candidate) || !("value" in candidate.content))
      return false;
    const serializedValue = JSON.stringify(candidate.content.value);
    return candidate.evidence.some(
      (evidence) =>
        serializedValue ===
        JSON.stringify({
          type: "statement-noted",
          interior: { verbatim: evidence.excerpt },
        }),
    );
  });
  const serializedReplyContext =
    replyContext === undefined ? undefined : JSON.stringify(replyContext);

  process.stdout.write(
    `WALKING_SKELETON_RESULT ${JSON.stringify({
      affordanceReplyClassified,
      archivePointerResolved,
      captureStoredThroughSweep: captured.captures.length === 3,
      capturesStayAtVerbatimFloor,
      boundReplyReachedModel:
        serializedReplyContext?.includes("A shopper completes checkout.") ===
          true && serializedReplyContext.includes("affordance-reply-bound"),
      durableOutput:
        JSON.stringify(firstAskOutput).includes(
          "What outcome should the scenario describe?",
        ) && JSON.stringify(firstAskOutput).includes('"form":"free-text"'),
      markdownFloor: firstParts.some(
        (part) =>
          part.type === "data-affordance" &&
          JSON.stringify(part.data).includes(
            "What outcome should the scenario describe?",
          ),
      ),
      noInstructionWake: !JSON.stringify(history.messages)
        .toLowerCase()
        .includes("instructions updated"),
      pendingAskSuppressedSettlement: !firstHistory.messages.some(
        (message) => message.signal?.tagName === "settlement-check",
      ),
      quoteAbsentFromPreviousArchive,
      refusalStopReopenedRange:
        sweepOutputs.some(
          (output) => "status" in output && output.status === "refused",
        ) &&
        repairSignals.length === 1 &&
        settlementChecks.length === 3,
      replayRepairedOmission:
        replayOutput !== undefined &&
        Array.isArray(replayOutput.appliedCaptureIds) &&
        replayOutput.appliedCaptureIds.length === 1 &&
        Array.isArray(replayOutput.skippedDedupKeys) &&
        replayOutput.skippedDedupKeys.length === 1,
      secondAskRejected:
        finalAskParts.filter(
          (part) =>
            part.type === "dynamic-tool" && part.state === "output-available",
        ).length === 1 &&
        finalAskParts.filter(
          (part) =>
            part.type === "dynamic-tool" && part.state === "output-error",
        ).length === 1,
      settlementNudgedAtEachFrontier: settlementChecks.length >= 2,
      unaccountedAskAdvisory: appliedSweepOutputs.some((output) =>
        JSON.stringify(output.advisories).includes("unaccounted-ask"),
      ),
    })}\n`,
  );
} finally {
  delete process.env.BRUNCH_DEV_TARGET_DOCUMENT_DIR;
  await flue.stop();
  await rm(targetDirectory, { recursive: true });
}
