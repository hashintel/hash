/** Application composition for Petrinaut's stock AI SDK chat transport. */

import { init } from "@flue/runtime";

import {
  decideAskReplyAdmission,
  pendingAskAffordanceId,
} from "@hashintel/brunch-agent";
import {
  createFlueReplyProjector,
  projectFlueHistoryForSweep,
} from "@hashintel/brunch-agent-binding-flue";
import {
  createAiSdkChatHandler,
  type HarnessReplyEvent,
  type TransportInspectionEvent,
} from "@hashintel/brunch-agent-transport-aisdk";

import { GherkinElicitor } from "./agents/gherkin-elicitor.ts";
import { createGherkinElicitationSession } from "./elicitation-session.ts";
import { defaultPanelOrigins } from "./local-dev-origins.ts";
import { voiceExperimentDiagnostics } from "./voice-experiment-diagnostics.ts";

const inspect =
  process.env.BRUNCH_TRANSPORT_AISDK_INSPECT === "1"
    ? (event: TransportInspectionEvent): void => {
        // This is an opt-in shell diagnostic stream. It is never dispatched
        // into Flue and therefore cannot become elicitation evidence.
        console.log(`TRANSPORT_AISDK ${JSON.stringify(event)}`);
      }
    : undefined;

// FE-1439 replaces this local one-conversation/one-document identity
// with principal-owned private session lookup. Keep it opaque here.
const targetDocumentIdFor = (conversationId: string): string =>
  `petrinaut-local:${conversationId}`;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;

const streamElicitorTurn = async (
  conversationId: string,
  dispatch: { readonly message: string; readonly idempotencyKey: string },
  emit: (event: HarnessReplyEvent) => void,
): Promise<void> => {
  const voiceTurnId = voiceExperimentDiagnostics.beginTurn(conversationId);
  if (voiceTurnId) {
    voiceExperimentDiagnostics.recordTranscript(conversationId, {
      isPartial: false,
      speaker: "expert",
      transcript: dispatch.message,
      turnId: voiceTurnId,
    });
  }
  let assistantText = "";
  const agent = init(GherkinElicitor, { id: conversationId });
  const receipt = await agent.dispatch({
    ...dispatch,
    initialData: { targetDocumentId: targetDocumentIdFor(conversationId) },
  });
  const projector = createFlueReplyProjector({
    submissionId: receipt.submissionId,
    emit: (event) => {
      if (voiceTurnId && event.type === "part-delta" && event.kind === "text") {
        assistantText += event.delta;
        voiceExperimentDiagnostics.recordTranscript(conversationId, {
          isPartial: true,
          speaker: "assistant",
          transcript: assistantText,
          turnId: voiceTurnId,
        });
      }
      if (
        voiceTurnId &&
        event.type === "part-end" &&
        event.kind === "text" &&
        assistantText
      ) {
        voiceExperimentDiagnostics.recordTranscript(conversationId, {
          isPartial: false,
          speaker: "assistant",
          transcript: assistantText,
          turnId: voiceTurnId,
        });
      }
      if (event.type === "tool-input") {
        voiceExperimentDiagnostics.recordToolCall(
          conversationId,
          voiceTurnId,
          event,
        );
        const question = asRecord(event.input)?.question;
        if (
          voiceTurnId &&
          event.toolName === "brunch_ask" &&
          typeof question === "string"
        ) {
          voiceExperimentDiagnostics.recordTranscript(conversationId, {
            isPartial: false,
            speaker: "assistant",
            transcript: question,
            turnId: voiceTurnId,
          });
        }
      }
      if (event.type === "tool-output") {
        voiceExperimentDiagnostics.recordToolOutput(conversationId, event);
      }
      emit(event);
    },
  });
  await agent.read(receipt, { onEvent: (chunk) => projector.accept(chunk) });
};

export const petrinautChatHandler = createAiSdkChatHandler({
  allowedOrigins: (
    process.env.BRUNCH_PETRINAUT_ORIGINS ?? defaultPanelOrigins.join(",")
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0),
  inspect,
  runTurn: (input, emit) =>
    streamElicitorTurn(
      input.conversationId,
      { message: input.userMessage.text, idempotencyKey: input.idempotencyKey },
      emit,
    ),
  askReply: {
    // Admission consults durable Flue history, not request-shaped claims: the
    // submission resumes the conversation only when its tool-call id
    // correlates with the one ask still awaiting a reply.
    async admit(input) {
      const session = createGherkinElicitationSession(
        input.conversationId,
        targetDocumentIdFor(input.conversationId),
      );
      const entries = projectFlueHistoryForSweep(
        await session.historyReader.peek(input.conversationId),
      );
      return decideAskReplyAdmission(
        pendingAskAffordanceId(entries),
        input.ask.toolCallId,
      );
    },
    // The admitted answer is a fresh user dispatch (spec §7.4); the binding
    // binds it to the pending affordance, making it the user-affordance reply.
    run: (input, emit) =>
      streamElicitorTurn(
        input.conversationId,
        { message: input.ask.answer, idempotencyKey: input.idempotencyKey },
        emit,
      ),
  },
});
