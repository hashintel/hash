import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

/** Write one line of output for a person to read. */
export const print = (text: string) => process.stdout.write(`${text}\n`);

/** One line the driver parses; everything else a server prints is shown as is. */
export const report = (event: string, data: unknown) =>
  process.stdout.write(`@@${JSON.stringify({ event, data })}\n`);

/** Poll `check` every 10 ms for up to 5 s. */
export const until = async (
  check: () => Promise<boolean>,
  triesLeft = 500,
): Promise<void> => {
  if (await check()) return;
  if (triesLeft === 0) throw new Error("Timed out waiting for the condition.");
  await new Promise((resolve) => setTimeout(resolve, 10));
  return until(check, triesLeft - 1);
};

export type Reports = Record<string, Record<string, unknown>>;

/**
 * Run `script` as one server process with `args`, echo its output, and
 * collect its reports; `killOn` SIGKILLs it at that report.
 */
export const runServer = (
  script: string,
  label: string,
  args: string[],
  killOn?: string,
) =>
  new Promise<{ reports: Reports; signal: NodeJS.Signals | null }>(
    (resolve, reject) => {
      const child = spawn(
        process.execPath,
        [...process.execArgv, script, ...args],
        {
          stdio: ["ignore", "pipe", "inherit"],
        },
      );
      const reports: Reports = {};
      createInterface({ input: child.stdout }).on("line", (line) => {
        if (!line.startsWith("@@")) {
          print(`  [${label}] ${line}`);
          return;
        }
        const { event, data } = JSON.parse(line.slice(2)) as {
          event: string;
          data: Record<string, unknown>;
        };
        reports[event] = data;
        print(`  [${label}] reported ${event}`);
        if (event === killOn) {
          print(`  [${label}] SIGKILL pid ${child.pid}`);
          child.kill("SIGKILL");
        }
      });
      child.on("error", reject);
      child.on("exit", (code, signal) => {
        if (signal === null && code !== 0)
          reject(new Error(`${label} exited with ${code}`));
        else resolve({ reports, signal });
      });
    },
  );
