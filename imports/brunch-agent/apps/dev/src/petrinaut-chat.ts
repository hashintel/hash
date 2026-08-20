/** Application composition for Petrinaut's stock AI SDK chat transport. */

import { createFlueReplyProjector } from '@brunch/binding-flue';
import { createAiSdkChatHandler, type TransportInspectionEvent } from '@brunch/transport-aisdk';
import { init } from '@flue/runtime';
import { GherkinElicitor } from './agents/gherkin-elicitor.ts';

const inspect =
  process.env.BRUNCH_TRANSPORT_AISDK_INSPECT === '1'
    ? (event: TransportInspectionEvent): void => {
        // This is an opt-in shell diagnostic stream. It is never dispatched
        // into Flue and therefore cannot become elicitation evidence.
        console.log(`TRANSPORT_AISDK ${JSON.stringify(event)}`);
      }
    : undefined;

export const petrinautChatHandler = createAiSdkChatHandler({
  allowedOrigins: (
    process.env.BRUNCH_PETRINAUT_ORIGINS ?? 'http://127.0.0.1:4915,http://localhost:4915'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0),
  inspect,
  async runTurn(input, emit) {
    const agent = init(GherkinElicitor, { id: input.conversationId });
    const receipt = await agent.dispatch({
      message: input.userMessage.text,
      idempotencyKey: input.idempotencyKey,
      initialData: {
        // FE-1439 replaces this local one-conversation/one-document identity
        // with principal-owned private session lookup. Keep it opaque here.
        targetDocumentId: `petrinaut-local:${input.conversationId}`,
      },
    });
    const projector = createFlueReplyProjector({
      submissionId: receipt.submissionId,
      emit,
    });
    await agent.read(receipt, { onEvent: (chunk) => projector.accept(chunk) });
  },
});
