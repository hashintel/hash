import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type StreamChunk = Record<string, unknown> & { readonly type: string };

const normalizedChunk = (chunk: StreamChunk, messageId: string): StreamChunk => {
  const normalized = { ...chunk };
  if (normalized.messageId === messageId) normalized.messageId = '$message';
  if (typeof normalized.id === 'string')
    normalized.id = normalized.id.replace(messageId, '$message');
  return normalized;
};

const normalizedChunks = (chunks: readonly StreamChunk[], messageId: string): StreamChunk[] =>
  chunks.reduce<StreamChunk[]>((normalized, chunk) => {
    const current = normalizedChunk(chunk, messageId);
    const previous = normalized.at(-1);
    if (
      current.type.endsWith('-delta') &&
      previous?.type === current.type &&
      previous.id === current.id &&
      typeof previous.delta === 'string' &&
      typeof current.delta === 'string'
    ) {
      previous.delta += current.delta;
      return normalized;
    }
    normalized.push(current);
    return normalized;
  }, []);

test('the committed application route drives the actual elicitor for reasoning and text', async () => {
  const child = Bun.spawn({
    cmd: [
      Bun.which('node') ?? 'node',
      '--experimental-strip-types',
      join(import.meta.dir, 'petrinaut-chat.integration.ts'),
    ],
    cwd: join(import.meta.dir, '../../..'),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);

  expect(exitCode, stderr || stdout).toBe(0);
  const inspectionLines = stdout
    .split('\n')
    .filter((line) => line.startsWith('TRANSPORT_AISDK '))
    .map((line) => JSON.parse(line.slice('TRANSPORT_AISDK '.length)) as Record<string, unknown>);
  const resultLine = stdout.split('\n').find((line) => line.startsWith('PETRINAUT_CHAT_RESULT '));
  expect(resultLine, stdout).toBeDefined();
  const result = JSON.parse(resultLine!.slice('PETRINAUT_CHAT_RESULT '.length)) as {
    status: number;
    messageId: string;
    partIds: string[];
    reasoning: string;
    text: string;
    finish: unknown;
    chunks: StreamChunk[];
  };

  expect(result.status).toBe(200);
  expect(result.messageId.length).toBeGreaterThan(0);
  expect(result.partIds.every((partId) => partId.startsWith(`${result.messageId}:`))).toBe(true);
  expect(result.reasoning).toContain('establish the process outcome');
  expect(result.text).toContain('What outcome should this process reliably produce?');
  expect(result.finish).toEqual({ type: 'finish', finishReason: 'stop' });
  const golden = JSON.parse(
    readFileSync(
      join(
        import.meta.dir,
        '../../../test/fixtures/transport-aisdk/elicitor-initial.normalized.json',
      ),
      'utf8',
    ),
  ) as StreamChunk[];
  expect(normalizedChunks(result.chunks, result.messageId)).toEqual(golden);
  expect(inspectionLines[0]).toMatchObject({
    type: 'request-start',
    requestId: 'request-fe1436-application',
  });
  expect(inspectionLines.at(-1)).toMatchObject({
    type: 'request-finish',
    terminalState: 'completed',
  });
});
