/* eslint-disable no-await-in-loop -- One bounded evaluation and its two owned sibling processes. */
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import {
  browserTopology,
  createBrowserSession,
  digest,
  dryRunId,
  loopbackProfile,
  privateJson,
  readBrowserReadiness,
  readPrivateJson,
  repositoryRoot,
  type BrowserBinding,
  type BrowserReadiness,
} from "./browser-session.ts";

// Ordinary orchestration only: no socket, Playwright, provider or application
// imports. Each child gets its own OS root, never a nested paid -> loopback root.
const run = async () => {
  const [mode, output, activationPath] = process.argv.slice(2);
  assert(
    mode === "dry" || mode === "real",
    "Explicit dry or parent-activated real mode required",
  );
  assert(
    output && resolve(output) === output && !existsSync(output),
    "Fresh absolute output required",
  );
  let runId = dryRunId;
  let executionId: string | undefined;
  if (mode === "real") {
    assert(activationPath && resolve(activationPath) === activationPath);
    const activation = JSON.parse(readFileSync(activationPath, "utf8")) as {
      runId: string;
      executionId: string;
      browserTopology: string;
    };
    assert.equal(
      activation.browserTopology,
      browserTopology,
      "Old activation cannot launch",
    );
    assert(typeof activation.executionId === "string");
    runId = activation.runId;
    executionId = activation.executionId;
  }
  const session = createBrowserSession(runId, executionId);
  const ownerEnvironment = {
    PATH: "/usr/bin:/bin",
    HOME: join(session.directory, "home"),
    TMPDIR: join(session.directory, "tmp"),
  };
  type Exit = { code: number | null; signal: NodeJS.Signals | null };
  const start = (
    name: string,
    profile: string,
    file: string,
    args: string[],
    env: NodeJS.ProcessEnv,
  ) => {
    const stdout = openSync(
      join(session.directory, `${name}.stdout`),
      "wx",
      0o600,
    );
    const stderr = openSync(
      join(session.directory, `${name}.stderr`),
      "wx",
      0o600,
    );
    const child = spawn(
      "/usr/bin/sandbox-exec",
      [
        "-f",
        profile,
        process.execPath,
        "--experimental-strip-types",
        file,
        ...args,
      ],
      {
        cwd: repositoryRoot,
        env,
        stdio: ["ignore", stdout, stderr],
      },
    );
    closeSync(stdout);
    closeSync(stderr);
    let result: Exit | undefined;
    const exited = new Promise<Exit>((done) => {
      child.once("error", () => {
        result = { code: 1, signal: null };
        done(result);
      });
      child.once("exit", (code, signal) => {
        result = { code, signal };
        done(result);
      });
    });
    return { child, exited, result: () => result };
  };
  const owner = start(
    "owner",
    loopbackProfile,
    resolve(
      repositoryRoot,
      "apps/brunch-agent/src/evaluations/real-provider-a5/browser-owner.ts",
    ),
    [join(session.directory, "session.json")],
    ownerEnvironment,
  );
  let driver: ReturnType<typeof start> | undefined;
  let readiness: BrowserReadiness | undefined;
  const state = { interrupted: false };
  let failure: unknown;
  const stop = () =>
    writeFileSync(join(session.directory, "stop"), "stop\n", { mode: 0o600 });
  const interrupt = () => {
    state.interrupted = true;
    driver?.child.kill("SIGTERM");
    stop();
  };
  process.once("SIGTERM", interrupt);
  process.once("SIGINT", interrupt);
  process.once("SIGHUP", interrupt);
  const deadline = setTimeout(interrupt, session.expiresAt - Date.now());
  const bindingPath = join(session.directory, "binding.json");
  try {
    const readyPath = join(session.directory, "ready.json");
    const startupDeadline = Date.now() + 35_000;
    while (!existsSync(readyPath)) {
      assert(
        !state.interrupted && !owner.result() && Date.now() < startupDeadline,
        "Browser owner did not become ready",
      );
      await delay(50);
    }
    const raw = readPrivateJson(readyPath) as BrowserReadiness;
    assert(owner.child.pid);
    const binding: BrowserBinding = {
      session,
      ownerPid: owner.child.pid,
      chromePid: raw.chromePid,
      readinessSha256: digest(readFileSync(readyPath)),
    };
    readiness = readBrowserReadiness(binding);
    privateJson(bindingPath, binding);
    assert(!state.interrupted);
    driver = start(
      "driver",
      mode === "dry"
        ? loopbackProfile
        : resolve(
            repositoryRoot,
            "apps/brunch-agent/src/evaluations/real-provider-a5/paid-provider.sb",
          ),
      resolve(
        repositoryRoot,
        "apps/brunch-agent/src/evaluations/real-provider-a5.ts",
      ),
      [mode, output, activationPath ?? "-", bindingPath, session.executionId],
      process.env,
    );
    const result = await Promise.race([
      driver.exited,
      owner.exited.then(() => undefined),
    ]);
    assert(
      result?.code === 0 && !state.interrupted,
      "Driver failed or browser owner exited early",
    );
  } catch (error) {
    failure = error;
  } finally {
    clearTimeout(deadline);
    stop();
    if (driver && !driver.result()) {
      driver.child.kill("SIGTERM");
      if (
        !(await Promise.race([
          driver.exited.then(() => true),
          delay(5_000, undefined, { ref: false }).then(() => false),
        ]))
      ) {
        // Only our known controller PID; Chrome is closed by BrowserServer.
        driver.child.kill("SIGKILL");
        await driver.exited;
      }
    }
    let ownerExited = await Promise.race([
      owner.exited.then(() => true),
      delay(10_000, undefined, { ref: false }).then(() => false),
    ]);
    if (!ownerExited) {
      owner.child.kill("SIGTERM");
      ownerExited = await Promise.race([
        owner.exited.then(() => true),
        delay(7_000, undefined, { ref: false }).then(() => false),
      ]);
    }
    if (existsSync(bindingPath)) unlinkSync(bindingPath);
    if (!existsSync(output)) mkdirSync(output, { mode: 0o700 });
    if (failure)
      privateJson(join(output, "browser-orchestration-failure.json"), {
        name: failure instanceof Error ? failure.name : "unknown",
        message:
          failure instanceof Error ? failure.message : "Orchestration failed",
        stack: failure instanceof Error ? failure.stack : undefined,
      });
    for (const name of [
      "owner.stdout",
      "owner.stderr",
      "driver.stdout",
      "driver.stderr",
      "owner-failure.json",
    ])
      if (existsSync(join(session.directory, name)))
        copyFileSync(
          join(session.directory, name),
          join(output, `browser-${name}`),
        );
    const cleanupPath = join(session.directory, "cleanup.json");
    const cleanup = existsSync(cleanupPath)
      ? (readPrivateJson(cleanupPath) as {
          chromeGone: boolean;
          profileRemoved: boolean;
          endpointClosed: string;
          readinessRemoved: boolean;
        })
      : undefined;
    const gone = (child: ChildProcess | undefined) => {
      if (!child?.pid) return true;
      try {
        process.kill(child.pid, 0);
        return false;
      } catch (error) {
        return (error as NodeJS.ErrnoException).code === "ESRCH";
      }
    };
    const ownerGone = gone(owner.child);
    const driverGone = gone(driver?.child);
    privateJson(join(output, "browser-lifecycle.json"), {
      topology: browserTopology,
      session,
      ownerPid: owner.child.pid,
      driverPid: driver?.child.pid,
      chromePid: readiness?.chromePid,
      ownerExit: owner.result(),
      driverExit: driver?.result(),
      interrupted: state.interrupted,
      failed: !!failure,
      ownerGone,
      driverGone,
      cleanup,
      bindingRemoved: !existsSync(bindingPath),
    });
    assert(
      ownerExited &&
        ownerGone &&
        driverGone &&
        owner.result()?.code === 0 &&
        cleanup?.chromeGone &&
        cleanup.profileRemoved &&
        cleanup.readinessRemoved &&
        cleanup.endpointClosed === "ECONNREFUSED",
      "Browser cleanup incomplete; retain private state and stop",
    );
  }
  if (failure) throw failure;
  process.stdout.write(`A5 ${mode} sibling run complete: ${output}\n`);
};
await run().catch(() => {
  process.stderr.write(
    "A5 sibling run stopped; inspect private output/lifecycle evidence. No automatic retry.\n",
  );
  process.exitCode = 1;
});
