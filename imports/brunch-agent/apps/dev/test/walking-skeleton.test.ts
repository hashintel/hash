import { expect, test } from 'bun:test';
import { join } from 'node:path';

test('the dev app suspends for free-text replies without instruction wakes', async () => {
  // closes-gap: wake-wart-residue
  const child = Bun.spawn({
    cmd: [
      Bun.which('node') ?? 'node',
      '--experimental-strip-types',
      join(import.meta.dir, 'walking-skeleton.integration.ts'),
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
  const resultLine = stdout.split('\n').find((line) => line.startsWith('WALKING_SKELETON_RESULT '));
  expect(resultLine, stdout).toBeDefined();
  expect(JSON.parse(resultLine!.slice('WALKING_SKELETON_RESULT '.length))).toEqual({
    boundReplyReachedModel: true,
    durableOutput: true,
    markdownFloor: true,
    noInstructionWake: true,
    secondAskRejected: true,
  });
});
