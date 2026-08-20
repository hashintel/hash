import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createFlueHistoryReader } from '../src/history-reader.ts';
import { createLocalCaptureStore } from '../src/local-capture-store.ts';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

const storePath = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'brunch-history-'));
  directories.push(directory);
  return join(directory, 'target-document.json');
};

const snapshot = {
  v: 1 as const,
  conversationId: 'flue-conversation-internal',
  offset: '4',
  incarnation: 'incarnation-1',
  messages: [
    {
      id: 'kickoff',
      role: 'user' as const,
      purpose: 'user' as const,
      display: 'visible' as const,
      parts: [{ type: 'text' as const, text: 'Begin the interview.', state: 'done' as const }],
    },
    {
      id: 'ask',
      role: 'assistant' as const,
      purpose: 'assistant' as const,
      display: 'visible' as const,
      parts: [
        {
          type: 'dynamic-tool' as const,
          toolName: 'brunch_ask',
          toolCallId: 'tool-1',
          state: 'output-available' as const,
          input: { question: 'When?' },
          output: { id: 'affordance-1', form: 'free-text', markdown: 'When?' },
        },
      ],
    },
    {
      id: 'reply',
      role: 'user' as const,
      purpose: 'user' as const,
      display: 'visible' as const,
      parts: [{ type: 'text' as const, text: 'June works.', state: 'done' as const }],
    },
    {
      id: 'reply-binding',
      role: 'system' as const,
      purpose: 'dispatch' as const,
      display: 'hidden' as const,
      signal: {
        tagName: 'affordance-reply-bound',
        attributes: { affordanceId: 'affordance-1' },
      },
      parts: [{ type: 'text' as const, text: 'Reply binding.', state: 'done' as const }],
    },
  ],
  settlements: [{ submissionId: 'submission-1', outcome: 'completed' as const }],
};

describe('Flue materialized-history reader', () => {
  test('uses only the host-resolved URL and transport, then archives the public snapshot', async () => {
    const path = await storePath();
    const store = createLocalCaptureStore(path);
    const requested: string[] = [];
    const transport = (async (input: RequestInfo | URL) => {
      requested.push(input instanceof Request ? input.url : input.toString());
      return Response.json(snapshot);
    }) as typeof fetch;
    const reader = createFlueHistoryReader({
      resolveConversationUrl: (sessionId) => `http://host.test/custom-mount/${sessionId}`,
      transport,
      archive: store,
    });

    expect(await reader.read('session-1')).toEqual(snapshot);
    expect(requested).toEqual(['http://host.test/custom-mount/session-1?view=history']);

    const entries = await store.readArchivedEntries({
      sessionId: 'session-1',
      entryStart: 1,
      entryEnd: 4,
    });
    expect(entries.map((entry) => entry.versions.at(-1)!.kind)).toEqual([
      'user',
      'assistant',
      'user-affordance-payload',
      'non-user',
    ]);
    expect(entries[0]!.versions.at(-1)!.materialized).toEqual(
      JSON.parse(JSON.stringify(snapshot.messages[0]!)),
    );

    const captured = await store.execute(
      {
        type: 'apply-sweep',
        proposals: [
          {
            evidence: [{ excerpt: 'June works.' }],
            epistemicStatus: 'explicit',
            confidence: 'high',
            content: { value: 'June' },
          },
        ],
      },
      { sessionId: 'session-1' },
    );
    expect(captured.ok).toBe(true);
    if (!captured.ok) throw new Error(captured.refusal.message);
    const capture = captured.snapshot.captures[0]!;
    if (!('evidence' in capture)) throw new Error('capture did not retain evidence');
    const pointer = capture.evidence[0]!.pointer;
    expect((await store.readArchivedEntries(pointer))[0]!.substrateEntryId).toBe('reply');

    expect(
      await store.execute(
        {
          type: 'apply-sweep',
          proposals: [
            {
              evidence: [{ excerpt: 'Reply binding.' }],
              epistemicStatus: 'explicit',
              confidence: 'high',
              content: { value: 'injected' },
            },
          ],
        },
        { sessionId: 'session-1' },
      ),
    ).toMatchObject({ ok: false, refusal: { code: 'non-user-evidence' } });

    const persisted = JSON.parse(await readFile(path, 'utf8')) as {
      formatVersion: number;
      sessionLogArchive: {
        sessions: { reads: { substrateConversationId?: string }[] }[];
      };
    };
    expect(persisted.formatVersion).toBe(1);
    expect(persisted.sessionLogArchive.sessions).toHaveLength(1);
    expect(persisted.sessionLogArchive.sessions[0]!.reads[0]!.substrateConversationId).toBe(
      'flue-conversation-internal',
    );
  });

  test('versions an evolving public message instead of duplicating its archive ordinal', async () => {
    const path = await storePath();
    const store = createLocalCaptureStore(path);
    const snapshots = [
      {
        ...snapshot,
        offset: '1',
        messages: [
          {
            id: 'assistant',
            role: 'assistant' as const,
            purpose: 'assistant' as const,
            display: 'visible' as const,
            parts: [{ type: 'text' as const, text: 'Jun', state: 'streaming' as const }],
          },
        ],
      },
      {
        ...snapshot,
        offset: '2',
        messages: [
          {
            id: 'assistant',
            role: 'assistant' as const,
            purpose: 'assistant' as const,
            display: 'visible' as const,
            parts: [{ type: 'text' as const, text: 'June.', state: 'done' as const }],
          },
        ],
      },
    ];
    const transport = (async () => Response.json(snapshots.shift()!)) as unknown as typeof fetch;
    const reader = createFlueHistoryReader({
      resolveConversationUrl: () => 'http://host.test/agent/session-1',
      transport,
      archive: store,
    });

    await reader.read('session-1');
    await reader.read('session-1');
    const [entry] = await store.readArchivedEntries({
      sessionId: 'session-1',
      entryStart: 1,
      entryEnd: 1,
    });
    expect(entry!.versions.map((version) => version.text)).toEqual(['Jun', 'June.']);
  });
});
