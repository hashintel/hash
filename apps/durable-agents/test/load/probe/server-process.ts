/**
 * A load-probe server process as the driver sees it: started with this
 * process's runtime (`tsx`), its `listening` report awaited, every `stats`
 * report folded into the latest totals and the request waits so far, and
 * its exit. Lines that are not reports are echoed with its label.
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

import { print } from "../../browser-call/proof/server-process";

import type { ServerStats } from "./server";

type Exit = { readonly code: number | null; readonly signal: string | null };

type Listening = {
  readonly port: number;
  readonly pid: number;
  readonly rssBytes: number;
};

export const spawnLoadServer = (
  script: string,
  label: string,
  args: readonly string[],
) => {
  const child = spawn(
    process.execPath,
    [...process.execArgv, script, ...args],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let latest: ServerStats | undefined;
  const requestWaitsMs: number[] = [];
  let stoppedRssBytes: number | undefined;
  let exit: Exit | undefined;
  const output: string[] = [];

  const exited = new Promise<Exit>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      exit = { code, signal };
      resolve(exit);
    });
  });
  let resolveListening: (listening: Listening) => void = () => {};
  const listening = new Promise<Listening>((resolve, reject) => {
    resolveListening = resolve;
    void exited.then((end) =>
      reject(
        new Error(
          `${label} exited (${end.signal ?? end.code}) before listening.`,
        ),
      ),
    );
  });
  // A rejection nobody awaits yet must not end the driver.
  listening.catch(() => {});

  const echo = (line: string) => {
    output.push(line);
    print(`  [${label}] ${line}`);
  };
  createInterface({ input: child.stderr }).on("line", echo);
  createInterface({ input: child.stdout }).on("line", (line) => {
    if (!line.startsWith("@@")) {
      echo(line);
      return;
    }
    const { event, data } = JSON.parse(line.slice(2)) as {
      event: string;
      data: unknown;
    };
    if (event === "listening") resolveListening(data as Listening);
    else if (event === "stats") {
      latest = data as ServerStats;
      requestWaitsMs.push(...latest.newRequestWaitsMs);
    } else if (event === "stopped")
      stoppedRssBytes = (data as { rssBytes: number }).rssBytes;
  });

  return {
    label,
    listening,
    exited,
    /** Send `signal` if it still runs. */
    kill: (signal: NodeJS.Signals) => {
      if (exit === undefined) child.kill(signal);
    },
    isRunning: () => exit === undefined,
    stats: () => latest,
    requestWaitsMs: () => requestWaitsMs,
    stoppedRssBytes: () => stoppedRssBytes,
    /** Lines it printed that were not reports: errors, mostly. */
    output: () => output,
  };
};

export type LoadServer = ReturnType<typeof spawnLoadServer>;
