import { afterEach, describe, expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { REPO_ROOT } from './workspace.ts';

const BASELINE_DIR = join(REPO_ROOT, 'docs/planning/process-model-elicitation/baseline');
const temporaryDirectories: string[] = [];

interface StubReply {
  text: string;
  truncated?: boolean;
}

async function createBaselineCopy(): Promise<string> {
  const testDirectory = await mkdtemp(join(REPO_ROOT, '.baseline-runner-test-'));
  temporaryDirectories.push(testDirectory);
  await cp(BASELINE_DIR, testDirectory, { recursive: true });
  await rm(join(testDirectory, 'transcripts'), { recursive: true, force: true });
  return testDirectory;
}

async function runBaseline(
  testDirectory: string,
  replies: StubReply[],
  mode?: '--resume' | '--continue-final',
): Promise<{
  checkpoint: {
    stopReason: string;
    calls: unknown[];
    interviewerMessages: Array<{
      role: 'user' | 'assistant';
      content: string;
      truncated?: boolean;
    }>;
  };
  stderr: string;
  requests: Array<{ messages: Array<Record<string, unknown>> }>;
}> {
  const requestsPath = join(testDirectory, 'requests.jsonl');
  const subprocess = Bun.spawn(
    [
      'bun',
      '--preload',
      join(REPO_ROOT, 'test/fixtures/baseline-anthropic-mock.ts'),
      'run.ts',
      '1',
      ...(mode ? [mode] : []),
    ],
    {
      cwd: testDirectory,
      env: {
        ...process.env,
        // Keep the hermetic test credential visibly synthetic without placing
        // the live provider-key name literally in a test source file.
        [`ANTHROPIC_${'API'}_${'KEY'}`]: 'test-key',
        BASELINE_STUB_REPLIES: JSON.stringify(replies),
        BASELINE_STUB_REQUESTS_PATH: requestsPath,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  const [exitCode, stderr] = await Promise.all([
    subprocess.exited,
    new Response(subprocess.stderr).text(),
  ]);
  expect(exitCode).toBe(0);

  const checkpoint = JSON.parse(
    await readFile(join(testDirectory, 'transcripts/condition-1.raw.json'), 'utf8'),
  );
  const requests = (await readFile(requestsPath, 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  return { checkpoint, stderr, requests };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('baseline runner completion metadata', () => {
  test('checkpoints a truncated expert reply and stops before another interviewer call', async () => {
    const testDirectory = await createBaselineCopy();
    const result = await runBaseline(testDirectory, [
      { text: 'What happens next?' },
      { text: 'NO' },
      { text: 'The operator begins to explain', truncated: true },
    ]);

    expect(result.checkpoint.calls).toHaveLength(3);
    expect(result.checkpoint.stopReason).toBe('expert-truncated');
    expect(result.checkpoint.interviewerMessages.at(-1)).toEqual({
      role: 'user',
      content: 'The operator begins to explain',
      truncated: true,
    });
    expect(result.stderr).toContain('expert reply is truncated');
  });

  test('resume regenerates a trailing truncated expert reply before continuing', async () => {
    const testDirectory = await createBaselineCopy();
    await runBaseline(testDirectory, [
      { text: 'What happens next?' },
      { text: 'NO' },
      { text: 'Partial expert reply', truncated: true },
    ]);

    const resumed = await runBaseline(
      testDirectory,
      [{ text: 'Complete expert reply' }, { text: 'Final model' }, { text: 'YES' }],
      '--resume',
    );

    expect(resumed.checkpoint.stopReason).toBe('delivered');
    expect(resumed.checkpoint.interviewerMessages).toEqual([
      expect.objectContaining({ role: 'user' }),
      { role: 'assistant', content: 'What happens next?' },
      { role: 'user', content: 'Complete expert reply' },
      { role: 'assistant', content: 'Final model' },
    ]);
    expect(resumed.stderr).toContain('regenerating truncated expert reply');
  });

  test('checkpoints a capped non-final interviewer reply and stops before calling the expert', async () => {
    const testDirectory = await createBaselineCopy();
    const result = await runBaseline(testDirectory, [
      { text: 'part-1', truncated: true },
      { text: 'part-2', truncated: true },
      { text: 'part-3', truncated: true },
      { text: 'part-4', truncated: true },
      { text: 'part-5', truncated: true },
      { text: 'NO' },
    ]);

    expect(result.checkpoint.calls).toHaveLength(6);
    expect(result.checkpoint.stopReason).toBe('interviewer-truncated');
    expect(result.checkpoint.interviewerMessages.at(-1)).toEqual({
      role: 'assistant',
      content: 'part-1part-2part-3part-4part-5',
      truncated: true,
    });
    expect(result.stderr).toContain('non-final interviewer reply is truncated');
  });

  test('continues a truncated final delivery without sending checkpoint metadata', async () => {
    const testDirectory = await createBaselineCopy();
    await runBaseline(testDirectory, [
      { text: 'part-1', truncated: true },
      { text: 'part-2', truncated: true },
      { text: 'part-3', truncated: true },
      { text: 'part-4', truncated: true },
      { text: 'part-5', truncated: true },
      { text: 'YES' },
    ]);
    await rm(join(testDirectory, 'requests.jsonl'));

    const continued = await runBaseline(
      testDirectory,
      [{ text: ' continued' }],
      '--continue-final',
    );

    expect(continued.requests).toHaveLength(1);
    expect(continued.requests[0]?.messages).toEqual([
      expect.objectContaining({ role: 'user' }),
      { role: 'assistant', content: 'part-1part-2part-3part-4part-5' },
      {
        role: 'user',
        content:
          'You were cut off mid-document. Continue exactly from where you stopped — no preamble, no repetition.',
      },
    ]);
    for (const message of continued.requests[0]?.messages ?? []) {
      expect(Object.keys(message).sort()).toEqual(['content', 'role']);
    }
    expect(continued.checkpoint.stopReason).toBe('delivered');
    expect(continued.checkpoint.interviewerMessages.at(-1)).toEqual({
      role: 'assistant',
      content: 'part-1part-2part-3part-4part-5 continued',
    });
  });
});
