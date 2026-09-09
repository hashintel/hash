/* eslint-disable no-await-in-loop -- Serial, private, unpaid browser lifecycle controls. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import {
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
} from "../src/evaluations/real-provider-a5/browser-session.ts";

// This entrypoint only orchestrates processes/files, never sockets or SDK work.
// Run from an ordinary shell: the actual owner/controller/audit are separate
// guarded siblings. Do not nest this orchestration beneath deny-only policy.
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
const launch = (
  name: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  directory: string,
) => {
  const stdout = openSync(join(directory, `${name}.stdout`), "wx", 0o600);
  const stderr = openSync(join(directory, `${name}.stderr`), "wx", 0o600);
  const child = spawn(
    "/usr/bin/sandbox-exec",
    ["-f", loopbackProfile, process.execPath, ...args],
    { cwd: repositoryRoot, env, stdio: ["ignore", stdout, stderr] },
  );
  closeSync(stdout);
  closeSync(stderr);
  const exited = new Promise<number | null>((done, reject) => {
    child.once("error", reject);
    child.once("exit", done);
  });
  return { child, exited };
};
const outcomes: unknown[] = [];
for (const control of [
  "foreign-execution",
  "attach-failure",
  "lease-expired",
  "interrupt",
] as const) {
  const directory = join(output, control);
  mkdirSync(directory, { mode: 0o700 });
  const session = createBrowserSession(dryRunId);
  if (control === "lease-expired") {
    session.expiresAt = session.createdAt + 4_000;
    writeFileSync(
      join(session.directory, "session.json"),
      JSON.stringify(session),
    );
  }
  const env = {
    PATH: "/usr/bin:/bin",
    HOME: join(session.directory, "home"),
    TMPDIR: join(session.directory, "tmp"),
  };
  const owner = launch(
    "owner",
    [
      "--experimental-strip-types",
      resolve(
        repositoryRoot,
        "apps/brunch-agent/src/evaluations/real-provider-a5/browser-owner.ts",
      ),
      join(session.directory, "session.json"),
    ],
    env,
    directory,
  );
  let readiness: BrowserReadiness | undefined;
  let driverPid: number | undefined;
  let driverExit: number | null | undefined;
  const readyPath = join(session.directory, "ready.json");
  try {
    const deadline = Date.now() + 15_000;
    while (!existsSync(readyPath)) {
      assert(
        owner.child.exitCode === null && Date.now() < deadline,
        "Owner readiness missing",
      );
      await delay(50);
    }
    readiness = readPrivateJson(readyPath) as BrowserReadiness;
    assert(owner.child.pid);
    const binding: BrowserBinding = {
      session,
      ownerPid: owner.child.pid,
      chromePid: readiness.chromePid,
      readinessSha256: digest(readFileSync(readyPath)),
    };
    readBrowserReadiness(binding);
    // Only this TEST fixture reseals a syntactically valid but unserved path to
    // reach actual Playwright attachment failure. Production never reseals it.
    if (control === "attach-failure") {
      const endpoint = new URL(readiness.endpoint);
      endpoint.pathname = `/${randomUUID().replaceAll("-", "")}`;
      writeFileSync(
        readyPath,
        JSON.stringify({ ...readiness, endpoint: endpoint.href }),
      );
      binding.readinessSha256 = digest(readFileSync(readyPath));
    }
    const bindingPath = join(session.directory, "binding.json");
    privateJson(bindingPath, binding);
    if (control === "foreign-execution" || control === "attach-failure") {
      const driverOutput = join(directory, "driver-output");
      const driver = launch(
        "driver",
        [
          "--experimental-strip-types",
          resolve(
            repositoryRoot,
            "apps/brunch-agent/src/evaluations/real-provider-a5.ts",
          ),
          "dry",
          driverOutput,
          "-",
          bindingPath,
          control === "foreign-execution" ? randomUUID() : session.executionId,
        ],
        process.env,
        directory,
      );
      driverPid = driver.child.pid;
      driverExit = await driver.exited;
      assert.equal(driverExit, 1);
      const ledger = JSON.parse(
        readFileSync(join(driverOutput, "TEST-usage-ledger.json"), "utf8"),
      ) as { calls: unknown[] };
      assert.equal(ledger.calls.length, 0);
      assert(
        !readdirSync(driverOutput).some((name) => name.startsWith("native-")),
      );
      assert(driverPid && !alive(driverPid));
    } else if (control === "interrupt") owner.child.kill("SIGTERM");
    if (control === "lease-expired") await owner.exited;
  } finally {
    writeFileSync(join(session.directory, "stop"), "TEST stop\n", {
      mode: 0o600,
    });
    const ownerExit = await owner.exited;
    assert.equal(ownerExit, 0);
    assert(readiness && owner.child.pid);
    const cleanup = readPrivateJson(
      join(session.directory, "cleanup.json"),
    ) as {
      stopReason: string;
      chromeGone: boolean;
      profileRemoved: boolean;
      endpointClosed: string;
      readinessRemoved: boolean;
    };
    assert(
      cleanup.chromeGone && cleanup.profileRemoved && cleanup.readinessRemoved,
    );
    assert.equal(cleanup.endpointClosed, "ECONNREFUSED");
    assert(!alive(owner.child.pid) && !alive(readiness.chromePid));
    assert(!existsSync(readiness.profilePath) && !existsSync(readyPath));
    if (control === "lease-expired" || control === "interrupt")
      assert.equal(cleanup.stopReason, control);
    // Independent socket-close check executes only inside its own loopback root.
    const audit = launch(
      "audit",
      [
        "--input-type=module",
        "-e",
        `import assert from 'node:assert/strict'; import net from 'node:net'; const code=await new Promise(resolve=>{const socket=net.connect({host:'127.0.0.1',port:Number(process.argv[1])});socket.once('error',error=>resolve(error.code));socket.once('connect',()=>{socket.destroy();resolve('connected')});socket.setTimeout(1000,()=>{socket.destroy();resolve('timeout')})});assert.equal(code,'ECONNREFUSED');console.log(JSON.stringify({endpointClosed:code}));`,
        new URL(readiness.endpoint).port,
      ],
      env,
      directory,
    );
    assert.equal(await audit.exited, 0);
    const observation = {
      control,
      runId: session.runId,
      executionId: session.executionId,
      orchestratorPid: process.pid,
      ownerPid: owner.child.pid,
      chromePid: readiness.chromePid,
      driverPid,
      driverExit,
      ownerExit,
      nativeDispatches: 0,
      cleanup,
      sessionDirectory: session.directory,
    };
    privateJson(join(directory, "result.json"), observation);
    outcomes.push(observation);
  }
}
// Exercise the real orchestration entrypoint's early interrupt, not just the
// test's direct owner/controller fixtures. Observe only this case's private tmp.
{
  const directory = join(output, "launcher-interrupt");
  const temporary = join(directory, "tmp");
  const driverOutput = join(directory, "driver-output");
  mkdirSync(directory, { mode: 0o700 });
  mkdirSync(temporary, { mode: 0o700 });
  const stdout = openSync(join(directory, "launcher.stdout"), "wx", 0o600);
  const stderr = openSync(join(directory, "launcher.stderr"), "wx", 0o600);
  const launcher = spawn(
    process.execPath,
    [
      "--experimental-strip-types",
      resolve(
        repositoryRoot,
        "apps/brunch-agent/src/evaluations/real-provider-a5/launch.ts",
      ),
      "dry",
      driverOutput,
    ],
    {
      cwd: repositoryRoot,
      env: { ...process.env, TMPDIR: temporary },
      stdio: ["ignore", stdout, stderr],
    },
  );
  closeSync(stdout);
  closeSync(stderr);
  const exited = new Promise<number | null>((done, reject) => {
    launcher.once("error", reject);
    launcher.once("exit", done);
  });
  try {
    const deadline = Date.now() + 15_000;
    while (
      !readdirSync(temporary).some(
        (name) =>
          name.startsWith("brunch-a5-browser-") &&
          existsSync(join(temporary, name, "ready.json")),
      )
    ) {
      assert(
        launcher.exitCode === null && Date.now() < deadline,
        "Launcher owner did not become ready",
      );
      await delay(5);
    }
  } finally {
    launcher.kill("SIGTERM");
    assert.equal(await exited, 1);
  }
  const result = readPrivateJson(
    realpathSync(join(driverOutput, "browser-lifecycle.json")),
  ) as {
    interrupted: boolean;
    ownerGone: boolean;
    driverGone: boolean;
    cleanup: {
      chromeGone: boolean;
      profileRemoved: boolean;
      endpointClosed: string;
      readinessRemoved: boolean;
    };
    session: { executionId: string };
  };
  assert(result.interrupted && result.ownerGone && result.driverGone);
  assert(
    result.cleanup.chromeGone &&
      result.cleanup.profileRemoved &&
      result.cleanup.readinessRemoved,
  );
  assert.equal(result.cleanup.endpointClosed, "ECONNREFUSED");
  assert(!readdirSync(driverOutput).some((name) => name.startsWith("native-")));
  if (existsSync(join(driverOutput, "TEST-usage-ledger.json"))) {
    const ledger = JSON.parse(
      readFileSync(join(driverOutput, "TEST-usage-ledger.json"), "utf8"),
    ) as { calls: unknown[] };
    assert.equal(ledger.calls.length, 0);
  }
  outcomes.push({
    control: "launcher-interrupt",
    ...result,
    nativeDispatches: 0,
  });
}
privateJson(join(output, "result.json"), { passed: true, controls: outcomes });
process.stdout.write(
  `Five sibling-browser failure/lifetime controls passed: ${output}\n`,
);
