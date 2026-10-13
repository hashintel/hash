import { join } from "node:path";

import { runNodeScript } from "./run-node-script.ts";

import type { AdmissionControlsResult } from "./admission-controls.integration.ts";

export type { AdmissionControlsResult };

const outputPrefix = "ADMISSION_CONTROLS ";

/** Runs the probe in its own process, since it installs module hooks before loading the build. */
export const runAdmissionControls = async (
  env: Readonly<Record<string, string>> = {},
): Promise<{
  readonly result: AdmissionControlsResult;
  readonly stderr: string;
  readonly stdout: string;
}> => {
  const { exitCode, stdout, stderr } = await runNodeScript(
    join(import.meta.dirname, "admission-controls.integration.ts"),
    join(import.meta.dirname, "../../../.."),
    env,
  );
  if (exitCode !== 0) throw new Error(stderr || stdout);
  const line = stdout
    .split("\n")
    .find((entry) => entry.startsWith(outputPrefix));
  if (line === undefined) throw new Error(stdout);
  return {
    result: JSON.parse(
      line.slice(outputPrefix.length),
    ) as AdmissionControlsResult,
    stderr,
    stdout,
  };
};
