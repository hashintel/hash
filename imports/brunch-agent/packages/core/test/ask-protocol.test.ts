import { describe, expect, test } from 'bun:test';
import {
  ASK_TOOL_DESCRIPTION,
  askProtocolInstructionFragments,
  buildReplyBindingSignalPayload,
  decidePendingAffordance,
  mintAskAffordance,
} from '../src/ask-protocol.ts';

const firstAffordance = mintAskAffordance(
  'What outcome should the scenario describe?',
  'tool-call-1',
);

describe('ask protocol', () => {
  test('mints the free-text affordance from the question and call id', () => {
    expect(firstAffordance).toEqual({
      id: 'affordance_tool-call-1',
      form: 'free-text',
      markdown: 'What outcome should the scenario describe?',
      payload: { question: 'What outcome should the scenario describe?' },
    });
  });

  test('accepts the first live affordance', () => {
    const candidate = mintAskAffordance('Who initiates the outcome?', 'tool-call-2');

    expect(decidePendingAffordance(null, candidate)).toEqual({
      ok: true,
      pending: candidate,
    });
  });

  test('refuses a second live affordance with the existing diagnostic', () => {
    const candidate = mintAskAffordance('What happens next?', 'tool-call-2');

    expect(decidePendingAffordance(firstAffordance, candidate)).toEqual({
      ok: false,
      reason:
        'An interactive affordance is already pending (affordance_tool-call-1); wait for its reply before asking another question.',
    });
  });

  test('builds the mechanical reply-binding signal from the pending affordance', () => {
    expect(buildReplyBindingSignalPayload(firstAffordance)).toEqual({
      type: 'affordance-reply-bound',
      tagName: 'affordance-reply-bound',
      body: [
        'The immediately preceding user message is mechanically bound as the reply to this pending affordance:',
        'What outcome should the scenario describe?',
      ].join('\n\n'),
      attributes: { affordanceId: 'affordance_tool-call-1' },
    });
  });

  test('supplies render-invariant instruction fragments', () => {
    expect(ASK_TOOL_DESCRIPTION).toBe(
      'Ask one free-text question and suspend this turn for the person’s reply. A second ask in the same tool batch is rejected.',
    );
    expect(askProtocolInstructionFragments('gherkin')).toEqual([
      'You are interviewing someone to elicit gherkin.',
      'Ask one question at a time with brunch_ask.',
      'Continue the conversation after each reply, using the harness-provided reply binding as a mechanical fact.',
    ]);
  });
});
