import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { expect, test } from "vitest";

import {
  assertCrashRecovery,
  type CrashRecoveryKind,
} from "./history-retention-crash-audit";
import { runNodeScript } from "./run-node-script";

const repositoryRoot = join(import.meta.dirname, "../../../..");
const crashScript = join(
  import.meta.dirname,
  "../history-retention-crash.integration.ts",
);
const runtimeHook = pathToFileURL(
  join(import.meta.dirname, "../history-retention-runtime-hook.ts"),
).href;

const wasKilled = (result: {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
}) => result.signal === "SIGKILL" || result.exitCode === 137;

const runCrashPhase = async (
  directory: string,
  env: Readonly<Record<string, string>>,
) =>
  runNodeScript(crashScript, repositoryRoot, {
    A4_DIAGNOSTIC_DIRECTORY: directory,
    ...env,
  });

const instrumented = (
  directory: string,
  env: Readonly<Record<string, string>>,
) =>
  runCrashPhase(directory, {
    ...env,
    NODE_OPTIONS: `--import=${runtimeHook}`,
  });

const withRetainedFailureTraces = async (
  prefix: string,
  body: (directory: string) => Promise<void>,
) => {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  try {
    await body(directory);
  } catch (error) {
    process.stderr.write(`Preserved diagnostic directory ${directory}\n`);
    throw error;
  }
  await rm(directory, { recursive: true, force: true });
};

test.each([
  "plain",
  "observe",
  "after-outcome",
  "before-outcome",
  "direct-after-outcome",
] as const)(
  "crash recovery restores exact state after %s",
  async (kind) => {
    await withRetainedFailureTraces(
      `brunch-a4-crash-${kind}-`,
      async (directory) => {
        const create =
          kind === "plain"
            ? await runCrashPhase(directory, { A4_FAULT: kind })
            : await instrumented(directory, { A4_FAULT: kind });
        const createSurvived = kind === "plain" || kind === "observe";
        expect(
          createSurvived ? create.exitCode === 0 : wasKilled(create),
          create.stderr + create.stdout,
        ).toBe(true);
        const recover = await runCrashPhase(directory, { A4_PHASE: "recover" });
        expect(recover.exitCode, recover.stderr + recover.stdout).toBe(0);
        assertCrashRecovery(directory, kind);
      },
    );
  },
  120000,
);

test.each(["after-repair", "after-outcome"] as const)(
  "interrupted recovery still finishes after a %s kill",
  async (boundary) => {
    const kind: CrashRecoveryKind =
      boundary === "after-repair"
        ? "repair-after-repair"
        : "repair-after-outcome";
    await withRetainedFailureTraces(
      `brunch-a4-crash-repair-${boundary}-`,
      async (directory) => {
        const create = await instrumented(directory, {
          A4_FAULT: "before-outcome",
        });
        expect(wasKilled(create), create.stderr + create.stdout).toBe(true);
        const interrupted = await instrumented(directory, {
          A4_PHASE: "recover",
          A4_FAULT: boundary,
        });
        expect(
          wasKilled(interrupted),
          interrupted.stderr + interrupted.stdout,
        ).toBe(true);
        const recover = await runCrashPhase(directory, { A4_PHASE: "recover" });
        expect(recover.exitCode, recover.stderr + recover.stdout).toBe(0);
        assertCrashRecovery(directory, kind);
      },
    );
  },
  120000,
);
