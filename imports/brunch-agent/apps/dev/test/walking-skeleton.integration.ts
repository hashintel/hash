// hermetic-substrate-test: faux-provider
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  type Context,
} from '@earendil-works/pi-ai';
import { toolName } from '@brunch/core';
import { createFlueClient } from '@flue/sdk';
import { start } from '@flue/runtime/node';
import app from '../src/app.ts';
import { GherkinElicitor } from '../src/agents/gherkin-elicitor.ts';
import { GHERKIN_AGENT_ROUTE } from '../src/routes.ts';

const ask = toolName('ask');
const faux = fauxProvider({
  provider: 'anthropic',
  models: [{ id: 'claude-haiku-4-5' }],
});

let replyContext: Context | undefined;
faux.setResponses([
  fauxAssistantMessage(
    [fauxToolCall(ask, { question: 'What outcome should the scenario describe?' })],
    { stopReason: 'toolUse' },
  ),
  (context) => {
    replyContext = context;
    return fauxAssistantMessage([fauxToolCall(ask, { question: 'Who initiates that outcome?' })], {
      stopReason: 'toolUse',
    });
  },
  fauxAssistantMessage(
    [
      fauxToolCall(ask, { question: 'What happens first?' }),
      fauxToolCall(ask, { question: 'What happens second?' }),
    ],
    { stopReason: 'toolUse' },
  ),
  fauxAssistantMessage('Waiting for the accepted question to be answered.'),
]);

const flue = await start({
  agents: [GherkinElicitor],
  providers: [faux.provider],
});

try {
  const fetchApp = ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(
      app.fetch(input instanceof Request ? input : new Request(input, init)),
    )) as typeof fetch;
  const conversationId = `walking-skeleton-${crypto.randomUUID()}`;
  const client = createFlueClient({
    url: `http://brunch.test/agents/${GHERKIN_AGENT_ROUTE}/${conversationId}`,
    fetch: fetchApp,
  });

  const kickoff = await client.send({
    message: { kind: 'user', body: 'Begin the interview.' },
    initialData: { targetDocumentId: 'walking-skeleton-test' },
  });
  await client.wait(kickoff);

  const firstHistory = await client.history();
  const firstParts = firstHistory.messages.flatMap((message) => message.parts);
  const firstAsk = firstParts.find(
    (part) =>
      part.type === 'dynamic-tool' && part.toolName === ask && part.state === 'output-available',
  );
  const firstAskOutput =
    firstAsk?.type === 'dynamic-tool' && firstAsk.state === 'output-available'
      ? firstAsk.output
      : undefined;

  const answer = await client.send({
    message: { kind: 'user', body: 'A shopper completes checkout.' },
  });
  await client.wait(answer);

  const secondAnswer = await client.send({
    message: { kind: 'user', body: 'The shopper initiates it.' },
  });
  await client.wait(secondAnswer);

  const history = await client.history();
  const finalAssistant = [...history.messages]
    .reverse()
    .find((message) => message.role === 'assistant');
  const finalAskParts =
    finalAssistant?.parts.filter((part) => part.type === 'dynamic-tool' && part.toolName === ask) ??
    [];

  console.log(
    `WALKING_SKELETON_RESULT ${JSON.stringify({
      boundReplyReachedModel:
        JSON.stringify(replyContext).includes('A shopper completes checkout.') &&
        JSON.stringify(replyContext).includes('affordance-reply-bound'),
      durableOutput:
        JSON.stringify(firstAskOutput).includes('What outcome should the scenario describe?') &&
        JSON.stringify(firstAskOutput).includes('"form":"free-text"'),
      markdownFloor: firstParts.some(
        (part) =>
          part.type === 'data-affordance' &&
          JSON.stringify(part.data).includes('What outcome should the scenario describe?'),
      ),
      noInstructionWake: !JSON.stringify(history.messages)
        .toLowerCase()
        .includes('instructions updated'),
      secondAskRejected:
        finalAskParts.filter(
          (part) => part.type === 'dynamic-tool' && part.state === 'output-available',
        ).length === 1 &&
        finalAskParts.filter(
          (part) => part.type === 'dynamic-tool' && part.state === 'output-error',
        ).length === 1,
    })}`,
  );
} finally {
  await flue.stop();
}
