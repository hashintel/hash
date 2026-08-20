// One of the substrate integration entry points reviewed in
// test/boundaries.test.ts, which is where the permission lives — this comment
// does not grant it.
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  type Context,
} from '@earendil-works/pi-ai';
import { createFlueHistoryReader, createLocalCaptureStore } from '@brunch/binding-flue';
import { toolName } from '@brunch/core';
import { createFlueClient } from '@flue/sdk';
import { start } from '@flue/runtime/node';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import app from '../src/app.ts';
import { GHERKIN_MODEL_ID, GherkinElicitor } from '../src/agents/gherkin-elicitor.ts';
import { GHERKIN_AGENT_ROUTE } from '../src/routes.ts';

const ask = toolName('ask');
const faux = fauxProvider({
  provider: 'anthropic',
  models: [{ id: GHERKIN_MODEL_ID }],
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
const targetDirectory = await mkdtemp(join(tmpdir(), 'brunch-walking-skeleton-'));

try {
  const fetchApp = ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(
      app.fetch(input instanceof Request ? input : new Request(input, init)),
    )) as typeof fetch;
  const conversationId = `walking-skeleton-${crypto.randomUUID()}`;
  const captureStore = createLocalCaptureStore(join(targetDirectory, 'target-document.json'));
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
    message: { kind: 'user', body: 'Begin the interview.' },
    initialData: { targetDocumentId: 'walking-skeleton-test' },
  });
  await client.wait(kickoff);

  const firstHistory = await historyReader.read(conversationId);
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

  const history = await historyReader.read(conversationId);
  const finalAssistant = [...history.messages]
    .reverse()
    .find((message) => message.role === 'assistant');
  const finalAskParts =
    finalAssistant?.parts.filter((part) => part.type === 'dynamic-tool' && part.toolName === ask) ??
    [];
  const captured = await captureStore.execute(
    {
      type: 'apply-sweep',
      proposals: [
        {
          evidence: [{ excerpt: 'A shopper completes checkout.' }],
          epistemicStatus: 'explicit',
          confidence: 'high',
          content: { value: 'checkout completes' },
        },
      ],
    },
    { sessionId: conversationId },
  );
  let archivePointerResolved = false;
  let affordanceReplyClassified = false;
  if (captured.ok) {
    const capture = captured.snapshot.captures[0];
    if (capture && 'evidence' in capture) {
      affordanceReplyClassified = capture.evidence[0]?.source === 'user-affordance-payload';
      const [archived] = await captureStore.readArchivedEntries(capture.evidence[0]!.pointer);
      archivePointerResolved = archived?.versions.at(-1)?.text === 'A shopper completes checkout.';
    }
  }

  console.log(
    `WALKING_SKELETON_RESULT ${JSON.stringify({
      affordanceReplyClassified,
      archivePointerResolved,
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
  await rm(targetDirectory, { recursive: true });
}
