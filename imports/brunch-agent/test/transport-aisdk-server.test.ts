import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createFlueReplyProjector } from '../packages/binding-flue/src/index.ts';
import {
  createAiSdkChatHandler,
  type HarnessReplyEvent,
  type TransportInspectionEvent,
} from '../packages/transport-aisdk/src/index.ts';
import { REPO_ROOT } from './workspace.ts';

type GoldenChunk = Record<string, unknown> & { readonly type: string };

const FIXTURES = join(REPO_ROOT, 'test/fixtures/transport-aisdk');

const fixture = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');

const responseChunks = async (response: Response): Promise<readonly GoldenChunk[]> =>
  (await response.text())
    .trim()
    .split('\n\n')
    .slice(0, -1)
    .map((frame) => JSON.parse(frame.slice('data: '.length)) as GoldenChunk);

const panelInitialHarnessEvents: readonly HarnessReplyEvent[] = [
  { type: 'response-start', messageId: 'assistant-fe1435-1' },
  { type: 'turn-start', turnId: 'turn-fe1435-1' },
  { type: 'part-start', kind: 'reasoning', partId: 'reasoning-fe1435-1' },
  {
    type: 'part-delta',
    kind: 'reasoning',
    partId: 'reasoning-fe1435-1',
    delta: '**Checking the wire seam**\n\nThe harness stream is translating reasoning parts.',
  },
  {
    type: 'part-delta',
    kind: 'reasoning',
    partId: 'reasoning-fe1435-1',
    delta: ' It will now drive both server and browser tools.',
  },
  { type: 'part-end', kind: 'reasoning', partId: 'reasoning-fe1435-1' },
  { type: 'part-start', kind: 'text', partId: 'text-fe1435-1' },
  {
    type: 'part-delta',
    kind: 'text',
    partId: 'text-fe1435-1',
    delta: 'Harness-streamed text reached Petrinaut before tool execution.',
  },
  { type: 'part-end', kind: 'text', partId: 'text-fe1435-1' },
  {
    type: 'tool-input',
    toolCallId: 'tool-server-fe1435',
    toolName: 'serverProbe',
    input: { scope: 'real-panel' },
    execution: 'server',
  },
  {
    type: 'tool-output',
    toolCallId: 'tool-server-fe1435',
    output: { ok: true, source: 'fake-harness-loop' },
    execution: 'server',
  },
  {
    type: 'tool-input',
    toolCallId: 'tool-place-fe1435',
    toolName: 'addPlace',
    input: {
      id: 'place__fe1435_buffer',
      name: 'SpikeBuffer',
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      showAsInitialState: true,
      x: 180,
      y: 140,
    },
    execution: 'client',
  },
  {
    type: 'tool-input',
    toolCallId: 'tool-transition-fe1435',
    toolName: 'addTransition',
    input: {
      id: 'transition__fe1435_dispatch',
      name: 'Spike dispatch',
      inputArcs: [],
      outputArcs: [],
      lambdaType: 'predicate',
      lambdaCode: 'export const Lambda = () => true;',
      transitionKernelCode: 'export const TransitionKernel = () => ({});',
      x: 420,
      y: 140,
    },
    execution: 'client',
  },
  { type: 'turn-finish', turnId: 'turn-fe1435-1' },
  { type: 'response-finish', finishReason: 'tool-calls', terminalState: 'completed' },
];

describe('FE-1436 Petrinaut wire server', () => {
  test('refuses malformed JSON values at the transport boundary', async () => {
    let dispatched = false;
    const handler = createAiSdkChatHandler({
      async runTurn() {
        dispatched = true;
      },
    });

    for (const body of [null, [], 'not-an-object', 1436, { messages: [null] }]) {
      const response = await handler(
        new Request('http://brunch.test/api/petrinaut/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
      );

      expect({ body, status: response.status, refusal: await response.json() }).toEqual({
        body,
        status: 400,
        refusal: { error: 'invalid_chat_request' },
      });
    }
    expect(dispatched).toBe(false);
  });

  test('emits one truthful terminal sequence for failed and aborted settlements', async () => {
    for (const terminalState of ['failed', 'aborted'] as const) {
      const inspections: TransportInspectionEvent[] = [];
      const handler = createAiSdkChatHandler({
        inspect: (event) => inspections.push(event),
        async runTurn(_input, emit) {
          const submissionId = `submission-${terminalState}`;
          const projector = createFlueReplyProjector({ submissionId, emit });
          projector.accept({
            type: 'message-started',
            conversationId: `conversation-${terminalState}`,
            submissionId,
            messageId: `message-${terminalState}`,
            turnId: `turn-${terminalState}`,
            position: { batch: 1, index: 0 },
          });
          projector.accept({
            type: 'submission-settled',
            conversationId: `conversation-${terminalState}`,
            submissionId,
            outcome: terminalState,
            position: { batch: 1, index: 1 },
          });
          // Flue's read API rejects after delivering a failed/aborted settlement.
          throw new Error(`${terminalState} settlement`);
        },
      });

      const response = await handler(
        new Request('http://brunch.test/api/petrinaut/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            id: `conversation-${terminalState}`,
            trigger: 'submit-message',
            messages: [
              { id: `user-${terminalState}`, role: 'user', parts: [{ type: 'text', text: 'Go' }] },
            ],
          }),
        }),
      );
      const chunks = await responseChunks(response);
      const terminalChunkTypes = chunks
        .map((chunk) => chunk.type)
        .filter((type) => type === 'finish' || type === 'abort' || type === 'error');

      expect({ terminalState, terminalChunkTypes }).toEqual({
        terminalState,
        terminalChunkTypes: [terminalState === 'failed' ? 'error' : 'abort'],
      });
      expect(inspections.filter((event) => event.type === 'request-finish')).toEqual([
        {
          type: 'request-finish',
          requestId: expect.any(String),
          terminalState,
          finishReason: 'error',
        },
      ]);
      expect(inspections.find((event) => event.type === 'turn-finish')).toEqual({
        type: 'turn-finish',
        requestId: expect.any(String),
        turnId: `turn-${terminalState}`,
      });
    }
  });

  test('streams a failed server tool outcome before settling the failed turn', async () => {
    const handler = createAiSdkChatHandler({
      async runTurn(_input, emit) {
        emit({ type: 'response-start', messageId: 'message-tool-failed' });
        emit({ type: 'turn-start', turnId: 'turn-tool-failed' });
        emit({
          type: 'tool-input',
          toolCallId: 'tool-failed',
          toolName: 'bl_sweep',
          input: {},
          execution: 'server',
        });
        emit({
          type: 'tool-output-error',
          toolCallId: 'tool-failed',
          errorText: 'Sweep persistence failed.',
          execution: 'server',
        });
        emit({ type: 'turn-finish', turnId: 'turn-tool-failed' });
        emit({
          type: 'response-finish',
          terminalState: 'failed',
          finishReason: 'error',
        });
      },
    });

    const response = await handler(
      new Request('http://brunch.test/api/petrinaut/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 'conversation-tool-failed',
          trigger: 'submit-message',
          messages: [
            { id: 'user-tool-failed', role: 'user', parts: [{ type: 'text', text: 'Go' }] },
          ],
        }),
      }),
    );

    expect(await responseChunks(response)).toEqual([
      { type: 'start', messageId: 'message-tool-failed' },
      { type: 'start-step' },
      {
        type: 'tool-input-available',
        toolCallId: 'tool-failed',
        toolName: 'bl_sweep',
        input: {},
        providerExecuted: true,
      },
      {
        type: 'tool-output-error',
        toolCallId: 'tool-failed',
        errorText: 'Sweep persistence failed.',
        providerExecuted: true,
      },
      { type: 'finish-step' },
      { type: 'error', errorText: 'The elicitor turn failed.' },
    ]);
  });

  test('answers an allowlisted panel preflight without opening every origin', async () => {
    const handler = createAiSdkChatHandler({
      allowedOrigins: ['http://127.0.0.1:4915'],
      async runTurn() {},
    });

    const allowed = await handler(
      new Request('http://brunch.test/api/petrinaut/chat', {
        method: 'OPTIONS',
        headers: { origin: 'http://127.0.0.1:4915' },
      }),
    );
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:4915');
    expect(allowed.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS');

    const refused = await handler(
      new Request('http://brunch.test/api/petrinaut/chat', {
        method: 'OPTIONS',
        headers: { origin: 'https://untrusted.example' },
      }),
    );
    expect(refused.status).toBe(403);
    expect(refused.headers.get('access-control-allow-origin')).toBeNull();
  });

  test('encodes fixed harness events as the real-panel golden SSE', async () => {
    const inspections: TransportInspectionEvent[] = [];
    const handler = createAiSdkChatHandler({
      inspect: (event) => inspections.push(event),
      async runTurn(input, emit) {
        expect(input).toEqual({
          conversationId: 'm5z0GU9KJPzhOTlx',
          idempotencyKey: 'm5z0GU9KJPzhOTlx:6ddgGkjhSxGjOtiv',
          userMessage: {
            id: '6ddgGkjhSxGjOtiv',
            text: 'Run the FE-1435 transport probe.',
          },
        });
        for (const event of panelInitialHarnessEvents) emit(event);
      },
    });

    const response = await handler(
      new Request('http://brunch.test/api/petrinaut/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'request-fe1436-contract',
        },
        body: fixture('panel-initial.post.json'),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-vercel-ai-ui-message-stream')).toBe('v1');
    expect((await response.text()).trimEnd()).toBe(fixture('panel-initial.sse').trimEnd());
    expect(inspections[0]).toEqual({
      type: 'request-start',
      requestId: 'request-fe1436-contract',
      conversationId: 'm5z0GU9KJPzhOTlx',
      userMessageId: '6ddgGkjhSxGjOtiv',
    });
    expect(
      inspections
        .filter((event) => event.type === 'part-emitted')
        .map((event) => ({
          kind: event.kind,
          partId: event.partId,
          toolCallId: event.toolCallId,
        })),
    ).toEqual([
      { kind: 'reasoning', partId: 'reasoning-fe1435-1', toolCallId: undefined },
      { kind: 'text', partId: 'text-fe1435-1', toolCallId: undefined },
      { kind: 'tool-input', partId: undefined, toolCallId: 'tool-server-fe1435' },
      { kind: 'tool-output', partId: undefined, toolCallId: 'tool-server-fe1435' },
      { kind: 'tool-input', partId: undefined, toolCallId: 'tool-place-fe1435' },
      { kind: 'tool-input', partId: undefined, toolCallId: 'tool-transition-fe1435' },
    ]);
    expect(inspections.at(-1)).toEqual({
      type: 'request-finish',
      requestId: 'request-fe1436-contract',
      terminalState: 'completed',
      finishReason: 'tool-calls',
    });
  });

  test('refuses the frozen tool-result follow-up without dispatching diagnostics as user evidence', async () => {
    let dispatched = false;
    const handler = createAiSdkChatHandler({
      allowedOrigins: ['http://127.0.0.1:4915'],
      async runTurn() {
        dispatched = true;
      },
    });

    const response = await handler(
      new Request('http://brunch.test/api/petrinaut/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://127.0.0.1:4915',
        },
        body: fixture('panel-tool-results.post.json'),
      }),
    );

    expect(response.status).toBe(422);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:4915');
    expect(await response.json()).toEqual({
      error: 'tool_result_follow_up_not_supported',
    });
    expect(dispatched).toBe(false);
  });
});
