import { expect, test } from "bun:test";
import { join } from "node:path";

test("the dev app suspends for free-text replies without instruction wakes", async () => {
  // Spec §7.4 and §14.5's wake-wart item: the one instruction-state write path
  // that exists must not re-trigger an advisory wake.
  const child = Bun.spawn({
    cmd: [
      Bun.which("node") ?? "node",
      "--experimental-strip-types",
      join(import.meta.dir, "walking-skeleton.integration.ts"),
    ],
    cwd: join(import.meta.dir, "../../.."),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);

  expect(exitCode, stderr || stdout).toBe(0);
  const resultLine = stdout
    .split("\n")
    .find((line) => line.startsWith("WALKING_SKELETON_RESULT "));
  expect(resultLine, stdout).toBeDefined();
  expect(
    JSON.parse(resultLine!.slice("WALKING_SKELETON_RESULT ".length)),
  ).toEqual({
    affordanceReplyClassified: true,
    archivePointerResolved: true,
    boundReplyReachedModel: true,
    captureStoredThroughSweep: true,
    capturesStayAtVerbatimFloor: true,
    durableOutput: true,
    markdownFloor: true,
    noInstructionWake: true,
    pendingAskSuppressedSettlement: true,
    quoteAbsentFromPreviousArchive: true,
    refusalStopReopenedRange: true,
    replayRepairedOmission: true,
    secondAskRejected: true,
    settlementNudgedAtEachFrontier: true,
    unaccountedAskAdvisory: true,
  });
});
