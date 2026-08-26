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

import { SdcpnElicitor } from "./agents/sdcpn-elicitor.ts";
import { createSdcpnElicitationSession } from "./elicitation-session.ts";
import { defaultPanelOrigins } from "./local-dev-origins.ts";

const inspect =
  process.env.BRUNCH_TRANSPORT_AISDK_INSPECT === "1"
    ? (event: TransportInspectionEvent): void => {
        // This is an opt-in shell diagnostic stream. It is never dispatched
        // into Flue and therefore cannot become elicitation evidence.
        process.stdout.write(`TRANSPORT_AISDK ${JSON.stringify(event)}\n`);
      }
    : undefined;

const targetDocumentIdFor = (principalKey: string): string =>
  `petrinaut-local:${principalKey}`;

const streamElicitorTurn = async (
  principalKey: string,
  conversationId: string,
  dispatch: { readonly message: string; readonly idempotencyKey: string },
  emit: (event: HarnessReplyEvent) => void,
): Promise<void> => {
  const agent = init(SdcpnElicitor, { id: conversationId });
  const receipt = await agent.dispatch({
    ...dispatch,
    initialData: {
      ownerKey: principalKey,
      targetDocumentId: targetDocumentIdFor(principalKey),
    },
  });
  const projector = createFlueReplyProjector({
    submissionId: receipt.submissionId,
    emit,
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
      input.principalKey,
      input.conversationId,
      { message: input.userMessage.text, idempotencyKey: input.idempotencyKey },
      emit,
    ),
  askReply: {
    // Admission consults durable Flue history, not request-shaped claims: the
    // submission resumes the conversation only when its tool-call id
    // correlates with the one ask still awaiting a reply.
    async admit(input) {
      const session = createSdcpnElicitationSession(
        input.conversationId,
        targetDocumentIdFor(input.principalKey),
        input.principalKey,
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
        input.principalKey,
        input.conversationId,
        { message: input.ask.answer, idempotencyKey: input.idempotencyKey },
        emit,
      ),
  },
});
