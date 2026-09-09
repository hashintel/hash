/* eslint-disable no-await-in-loop -- Serial owned Chrome fault controls, with separate TEST rescue. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import {
  createBrowserSession,
  loopbackProfile,
  privateJson,
  repositoryRoot,
  type BrowserReadiness,
} from "../src/evaluations/real-provider-a5/browser-session.ts";

// Only process/filesystem orchestration runs here. All SDK/browser/socket work
// runs in explicitly guarded children. No driver, app, provider or ledger needed.
const [output] = process.argv.slice(2);
assert(output && resolve(output) === output && !existsSync(output));
mkdirSync(output, { mode: 0o700 });
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    assert.equal((error as NodeJS.ErrnoException).code, "ESRCH");
    return false;
  }
};
const outcomes: unknown[] = [];
for (const control of [
  "close-rejection",
  "close-timeout",
  "kill-rejection",
  "kill-timeout",
] as const) {
  const directory = join(output, control);
  mkdirSync(directory, { mode: 0o700 });
  const session = createBrowserSession(`TEST-${control}`);
  privateJson(join(session.directory, "TEST-shutdown-fault.json"), { control });
  const env = {
    PATH: "/usr/bin:/bin",
    HOME: join(session.directory, "home"),
    TMPDIR: join(session.directory, "tmp"),
  };
  const stdout = openSync(join(directory, "owner.stdout"), "wx", 0o600);
  const stderr = openSync(join(directory, "owner.stderr"), "wx", 0o600);
  const child = spawn(
    "/usr/bin/sandbox-exec",
    [
      "-f",
      loopbackProfile,
      process.execPath,
      "--experimental-strip-types",
      "--import",
      resolve(
        repositoryRoot,
        "apps/brunch-agent/test/real-provider-a5-shutdown-hook.ts",
      ),
      resolve(
        repositoryRoot,
        "apps/brunch-agent/src/evaluations/real-provider-a5/browser-owner.ts",
      ),
      join(session.directory, "session.json"),
    ],
    { cwd: repositoryRoot, env, stdio: ["ignore", stdout, stderr] },
  );
  closeSync(stdout);
  closeSync(stderr);
  let exit: { code: number | null; signal: NodeJS.Signals | null } | undefined;
  const exited = new Promise<void>((done, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      exit = { code, signal };
      done();
    });
  });
  type Cleanup = {
    gracefulClose: { status: string; error?: { message: string } };
    killFallback: { status: string; error?: { message: string } };
    cleanupComplete: boolean;
    chromeGone: boolean;
    profileRemoved: boolean;
    readinessRemoved: boolean;
    endpointClosed: string;
  };
  let readiness: BrowserReadiness | undefined;
  let observation:
    | {
        control: string;
        sessionDirectory: string;
        ownerPid: number;
        chromePid: number;
        closeCalled: boolean;
        killCalled: boolean;
        killDelayMs?: number;
        ownerAlive: boolean;
        chromeAlive: boolean;
        profileExists: boolean;
        readyExists: boolean;
        productionExit: typeof exit;
        endpointBeforeRescue: string;
        cleanup?: Cleanup;
        ownerFailure?: unknown;
      }
    | undefined;
  const endpointAudit = async (name: string) => {
    assert(readiness);
    const auditOut = openSync(join(directory, `${name}.json`), "wx", 0o600);
    const auditError = openSync(join(directory, `${name}.stderr`), "wx", 0o600);
    const audit = spawn(
      "/usr/bin/sandbox-exec",
      [
        "-f",
        loopbackProfile,
        process.execPath,
        "--input-type=module",
        "-e",
        `import net from 'node:net';const code=await new Promise(resolve=>{const socket=net.connect({host:'127.0.0.1',port:Number(process.argv[1])});socket.once('error',error=>resolve(error.code));socket.once('connect',()=>{socket.destroy();resolve('connected')});socket.setTimeout(1000,()=>{socket.destroy();resolve('timeout')})});console.log(JSON.stringify({code}));`,
        new URL(readiness.endpoint).port,
      ],
      { env, stdio: ["ignore", auditOut, auditError] },
    );
    closeSync(auditOut);
    closeSync(auditError);
    const code = await new Promise<number | null>((done, reject) => {
      audit.once("error", reject);
      audit.once("exit", done);
    });
    assert.equal(code, 0);
    return (
      JSON.parse(readFileSync(join(directory, `${name}.json`), "utf8")) as {
        code: string;
      }
    ).code;
  };
  try {
    const deadline = Date.now() + 15_000;
    const readyPath = join(session.directory, "ready.json");
    while (!existsSync(readyPath)) {
      assert(!exit && Date.now() < deadline, "Owner did not become ready");
      await delay(50);
    }
    readiness = JSON.parse(readFileSync(readyPath, "utf8")) as BrowserReadiness;
    assert(child.pid);
    privateJson(join(directory, "identity.json"), {
      session,
      ownerPid: child.pid,
      chromePid: readiness.chromePid,
      profilePath: readiness.profilePath,
    });
    writeFileSync(join(session.directory, "stop"), "TEST stop\n", {
      mode: 0o600,
    });
    // Beyond either five-second public-method deadline plus local audit time.
    await delay(7_500);
    const cleanupPath = join(session.directory, "cleanup.json");
    const failurePath = join(session.directory, "owner-failure.json");
    const callTime = (name: string): number | undefined => {
      const path = join(session.directory, `TEST-${name}-called.json`);
      return existsSync(path)
        ? (JSON.parse(readFileSync(path, "utf8")) as { atMs: number }).atMs
        : undefined;
    };
    const closeTime = callTime("close");
    const killTime = callTime("kill");
    observation = {
      control,
      sessionDirectory: session.directory,
      ownerPid: child.pid,
      chromePid: readiness.chromePid,
      closeCalled: existsSync(
        join(session.directory, "TEST-close-called.json"),
      ),
      killCalled: existsSync(join(session.directory, "TEST-kill-called.json")),
      killDelayMs:
        closeTime !== undefined && killTime !== undefined
          ? killTime - closeTime
          : undefined,
      ownerAlive: alive(child.pid),
      chromeAlive: alive(readiness.chromePid),
      profileExists: existsSync(readiness.profilePath),
      readyExists: existsSync(readyPath),
      productionExit: exit,
      endpointBeforeRescue: await endpointAudit("endpoint-before-rescue"),
      cleanup: existsSync(cleanupPath)
        ? (JSON.parse(readFileSync(cleanupPath, "utf8")) as Cleanup)
        : undefined,
      ownerFailure: existsSync(failurePath)
        ? (JSON.parse(readFileSync(failurePath, "utf8")) as unknown)
        : undefined,
    };
    privateJson(join(directory, "production-observation.json"), observation);
  } finally {
    // Save the failed production state first. This rescue must never count as a
    // successful production kill, cleanup outcome or original process exit.
    const rescueUsed = !exit;
    if (rescueUsed) child.kill("SIGUSR2");
    const cleaned = await Promise.race([
      exited.then(() => true),
      delay(10_000, undefined, { ref: false }).then(() => false),
    ]);
    assert(cleaned && readiness && child.pid, "TEST rescue failed");
    assert(!alive(child.pid) && !alive(readiness.chromePid));
    assert(!existsSync(readiness.profilePath));
    assert.equal(await endpointAudit("endpoint-after-rescue"), "ECONNREFUSED");
    privateJson(join(directory, "test-cleanup.json"), {
      rescueUsed,
      exitAfterTestCleanup: exit,
      ownerGone: true,
      chromeGone: true,
      profileRemoved: true,
      endpointClosed: "ECONNREFUSED",
    });
  }
  assert(observation.closeCalled, "Public close was not exercised");
  assert(
    observation.killCalled,
    "Production must invoke public kill after close rejection or timeout",
  );
  assert(observation.cleanup, "Production must report even failed cleanup");
  assert(
    typeof observation.killDelayMs === "number" &&
      observation.killDelayMs >= 0 &&
      observation.killDelayMs <= 6_500,
    "Public kill must run within the five-second close deadline plus scheduling margin",
  );
  if (control === "close-timeout") assert(observation.killDelayMs >= 4_900);
  assert.equal(
    observation.cleanup.gracefulClose.status,
    control === "close-timeout" ? "timeout" : "rejected",
  );
  if (control !== "close-timeout")
    assert.equal(
      observation.cleanup.gracefulClose.error?.message,
      "TEST injected public close rejection",
    );
  if (control === "close-rejection" || control === "close-timeout") {
    assert.equal(observation.cleanup.killFallback.status, "complete");
    assert(
      observation.cleanup.cleanupComplete &&
        observation.cleanup.chromeGone &&
        observation.cleanup.profileRemoved &&
        observation.cleanup.readinessRemoved,
    );
    assert(
      !observation.ownerAlive &&
        !observation.chromeAlive &&
        !observation.profileExists &&
        !observation.readyExists,
    );
    assert.equal(observation.endpointBeforeRescue, "ECONNREFUSED");
    assert.equal(observation.productionExit?.code, 0);
    assert.equal(
      (
        JSON.parse(
          readFileSync(join(directory, "test-cleanup.json"), "utf8"),
        ) as { rescueUsed: boolean }
      ).rescueUsed,
      false,
    );
  } else {
    assert.equal(
      observation.cleanup.killFallback.status,
      control === "kill-rejection" ? "rejected" : "timeout",
    );
    if (control === "kill-rejection")
      assert.equal(
        observation.cleanup.killFallback.error?.message,
        "TEST injected public kill rejection",
      );
    assert.equal(observation.cleanup.cleanupComplete, false);
    assert(
      observation.ownerFailure,
      "Failed kill/cleanup must report non-success",
    );
    assert(
      observation.ownerAlive &&
        observation.chromeAlive &&
        observation.profileExists,
    );
    assert.equal(observation.endpointBeforeRescue, "connected");
    assert.equal(observation.productionExit, undefined);
  }
  outcomes.push(observation);
}
privateJson(join(output, "result.json"), {
  passed: true,
  controls: outcomes,
  providerInvocations: 0,
});
process.stdout.write(
  `Four actual public shutdown fault controls passed: ${output}\n`,
);
