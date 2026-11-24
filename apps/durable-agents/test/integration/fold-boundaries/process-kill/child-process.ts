/**
 * Spawn `child.ts` under Node with `tsx`'s loader, await its `parked` report,
 * and SIGKILL it. Its other output is kept for the failure message.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

import type { KillPoint, Parked, StorageSpec } from "./scenario";

const here = dirname(fileURLToPath(import.meta.url));
const childScript = join(here, "child.ts");
/** The app's directory, from which `--import tsx` resolves. */
const appDirectory = join(here, "../../../..");

export const runChildToKillPoint = async (
  point: KillPoint,
  spec: StorageSpec,
): Promise<{ parked: Parked; signal: string | null }> => {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", childScript, point, JSON.stringify(spec)],
    { cwd: appDirectory, stdio: ["ignore", "pipe", "pipe"] },
  );
  const output: string[] = [];
  const exited = new Promise<string | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (_code, signal) => resolve(signal));
  });
  createInterface({ input: child.stderr }).on("line", (line) =>
    output.push(line),
  );
  const parked = new Promise<Parked>((resolve, reject) => {
    createInterface({ input: child.stdout }).on("line", (line) => {
      if (!line.startsWith("@@")) {
        output.push(line);
        return;
      }
      const { event, data } = JSON.parse(line.slice(2)) as {
        event: string;
        data: Parked;
      };
      if (event === "parked") resolve(data);
    });
    void exited.then((signal) =>
      reject(
        new Error(
          `The child exited (${signal ?? "no signal"}) before parking:\n${output.join("\n")}`,
        ),
      ),
    );
  });
  try {
    const report = await parked;
    child.kill("SIGKILL");
    return { parked: report, signal: await exited };
  } finally {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
  }
};
