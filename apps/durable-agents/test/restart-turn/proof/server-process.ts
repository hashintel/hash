/**
 * One server process of the restart-turn proof, as the driver sees it: its
 * `@@` reports by event, awaited one at a time, and its exit.
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

import { print } from "../../browser-call/proof/server-process";

type Exit = { readonly code: number | null; readonly signal: string | null };

/** Run `script` with `args` under this process's runtime (`tsx`), echoing what it prints. */
export const spawnServer = (script: string, label: string, args: string[]) => {
  const child = spawn(
    process.execPath,
    [...process.execArgv, script, ...args],
    {
      stdio: ["ignore", "pipe", "inherit"],
    },
  );
  const reports = new Map<string, unknown>();
  const waiting = new Map<string, (data: unknown) => void>();
  let exit: Exit | undefined;
  const exited = new Promise<Exit>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      exit = { code, signal };
      resolve(exit);
    });
  });

  createInterface({ input: child.stdout }).on("line", (line) => {
    if (!line.startsWith("@@")) {
      print(`  [${label}] ${line}`);
      return;
    }
    const { event, data } = JSON.parse(line.slice(2)) as {
      event: string;
      data: unknown;
    };
    print(`  [${label}] reported ${event}`);
    reports.set(event, data);
    waiting.get(event)?.(data);
  });

  return {
    label,
    /** The data of report `event`, once the process reports it; rejects if it exits first. */
    next: <Data>(event: string) =>
      reports.has(event)
        ? Promise.resolve(reports.get(event) as Data)
        : Promise.race([
            new Promise<Data>((resolve) => {
              waiting.set(event, (data) => resolve(data as Data));
            }),
            exited.then((end) => {
              throw new Error(
                `${label} exited (${end.signal ?? end.code}) before reporting ${event}.`,
              );
            }),
          ]),
    kill: (signal: NodeJS.Signals) => {
      if (exit !== undefined) return;
      print(`  [${label}] ${signal} pid ${child.pid}`);
      child.kill(signal);
    },
    exited,
    isRunning: () => exit === undefined,
  };
};

export type ServerProcess = ReturnType<typeof spawnServer>;
