import assert from "node:assert/strict";
import { existsSync, renameSync, unlinkSync } from "node:fs";
import { connect } from "node:net";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import {
  chromeExecutable,
  privateJson,
  readPrivateJson,
  validateSession,
} from "./browser-session.ts";
import { assertExternalDenied } from "./network-guard.ts";

const run = async () => {
  await assertExternalDenied();
  // macOS adds this non-credential runtime variable even to env -i children.
  // Drop it without reading its value; reject any other unexpected inheritance.
  delete process.env.__CF_USER_TEXT_ENCODING;
  assert(
    Object.keys(process.env).every((name) =>
      ["PATH", "HOME", "TMPDIR"].includes(name),
    ),
    "Browser owner requires a minimal environment",
  );
  const [path] = process.argv.slice(2);
  assert(path);
  const session = validateSession(readPrivateJson(path));
  assert.equal(path, join(session.directory, "session.json"));
  assert.equal(process.env.HOME, join(session.directory, "home"));
  assert.equal(process.env.TMPDIR, join(session.directory, "tmp"));
  const parentPid = process.ppid;
  assert.equal(
    parentPid,
    session.launcherPid,
    "Owner must be the named launcher's child",
  );
  let stopReason = "";
  let wake: () => void = () => {};
  const stopped = new Promise<void>((resolve) => {
    wake = resolve;
  });
  const stop = (reason: string) => {
    if (!stopReason) {
      stopReason = reason;
      wake();
    }
  };
  const interrupt = () => stop("interrupt");
  process.once("SIGTERM", interrupt);
  process.once("SIGINT", interrupt);
  process.once("SIGHUP", interrupt);
  const deadline = setTimeout(
    () => stop("lease-expired"),
    Math.max(0, session.expiresAt - Date.now()),
  );
  const poll = setInterval(() => {
    if (existsSync(join(session.directory, "stop"))) stop("orchestrator-stop");
    if (process.ppid !== parentPid) stop("orchestrator-exited");
  }, 100);
  // Check inherited environment before the library initializes its own local flags.
  const { chromium } = await import("@playwright/test");
  const server = await chromium
    .launchServer({
      host: "127.0.0.1",
      port: 0,
      executablePath: chromeExecutable,
      headless: true,
      timeout: Math.min(30_000, session.expiresAt - Date.now()),
      // The owner handles its signals and bounded close/kill, not a second handler.
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
      env: {
        PATH: "/usr/bin:/bin",
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
      },
    })
    .catch((error: unknown) => {
      clearTimeout(deadline);
      clearInterval(poll);
      throw error;
    });
  const child = server.process();
  assert(child.pid);
  const chromePid = child.pid;
  const profilePath = child.spawnargs
    .find((arg) => arg.startsWith("--user-data-dir="))
    ?.slice("--user-data-dir=".length);
  assert(profilePath);
  const endpoint = server.wsEndpoint();
  const readyPath = join(session.directory, "ready.json");
  server.once("close", () => stop("browser-exited"));
  let failure: unknown;
  let closeMethod = "close";
  try {
    const publishingPath = join(session.directory, "ready-publishing.json");
    privateJson(publishingPath, {
      ...session,
      ownerPid: process.pid,
      chromePid,
      profilePath,
      endpoint,
    });
    assert(!existsSync(readyPath));
    renameSync(publishingPath, readyPath);
    await stopped;
  } catch (error) {
    failure = error;
    stop("owner-failed");
  } finally {
    clearTimeout(deadline);
    clearInterval(poll);
    if (existsSync(readyPath)) unlinkSync(readyPath);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        server.close(),
        new Promise<void>((resolve, reject) => {
          timer = setTimeout(() => {
            closeMethod = "kill";
            void server.kill().then(resolve, reject);
          }, 5_000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    let chromeGone = false;
    try {
      process.kill(chromePid, 0);
    } catch (error) {
      chromeGone = (error as NodeJS.ErrnoException).code === "ESRCH";
    }
    const url = new URL(endpoint);
    const refusal = () =>
      new Promise<string>((resolve) => {
        const socket = connect({ host: "127.0.0.1", port: Number(url.port) });
        socket.once("connect", () => {
          socket.destroy();
          resolve("connected");
        });
        socket.once("error", (error: NodeJS.ErrnoException) =>
          resolve(error.code ?? "unknown"),
        );
        socket.setTimeout(500, () => {
          socket.destroy();
          resolve("timeout");
        });
      });
    let endpointClosed = await refusal();
    for (
      let attempt = 0;
      attempt < 10 && endpointClosed !== "ECONNREFUSED";
      attempt++
    ) {
      // Library server shutdown follows Chrome shutdown asynchronously.
      // eslint-disable-next-line no-await-in-loop
      await delay(100);
      // eslint-disable-next-line no-await-in-loop
      endpointClosed = await refusal();
    }
    const profileRemoved = !existsSync(profilePath);
    privateJson(join(session.directory, "cleanup.json"), {
      runId: session.runId,
      executionId: session.executionId,
      ownerPid: process.pid,
      chromePid,
      profilePath,
      stopReason,
      closeMethod,
      chromeGone,
      profileRemoved,
      endpointClosed,
      readinessRemoved: !existsSync(readyPath),
    });
    assert(
      chromeGone && profileRemoved && endpointClosed === "ECONNREFUSED",
      "Browser cleanup failed",
    );
  }
  if (failure) throw failure;
};
// Never publish capability-bearing library diagnostics to a live console.
await run().catch((error: unknown) => {
  const path = process.argv[2];
  if (path)
    privateJson(join(dirname(path), "owner-failure.json"), {
      name: error instanceof Error ? error.name : "unknown",
      message: error instanceof Error ? error.message : "Owner failed",
      stack: error instanceof Error ? error.stack : undefined,
    });
  process.stderr.write(
    "A5 browser owner failed; inspect private lifecycle evidence.\n",
  );
  process.exitCode = 1;
});
