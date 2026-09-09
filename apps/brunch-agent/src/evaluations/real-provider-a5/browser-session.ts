import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Pure filesystem/process identity helpers. The unguarded orchestrator must never
// import Playwright, provider resolution, application code or networking here.
export const repositoryRoot = fileURLToPath(
  new URL("../../../../../", import.meta.url),
);
export const browserTopology = "sibling-playwright-v1";
export const dryRunId = "TEST-a5-driver";
export const browserLeaseMs = 12 * 60_000;
export const chromeExecutable =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const loopbackProfile = resolve(
  repositoryRoot,
  "libs/@hashintel/brunch-agent/evaluations/protocols/network-guard/loopback-only.sb",
);
export const browserLibraryRoots = [
  "node_modules/playwright-core",
  "node_modules/playwright",
  "node_modules/@playwright/test",
];
export const digest = (bytes: string | Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const files = (path: string): string[] =>
  lstatSync(path).isDirectory()
    ? readdirSync(path)
        .sort()
        .flatMap((name) => files(join(path, name)))
    : [path];
export const browserIdentity = () => ({
  topology: browserTopology,
  playwrightVersion: (
    JSON.parse(
      readFileSync(
        resolve(repositoryRoot, "node_modules/playwright-core/package.json"),
        "utf8",
      ),
    ) as { version: string }
  ).version,
  librarySha256: digest(
    JSON.stringify(
      browserLibraryRoots
        .flatMap((root) => files(resolve(repositoryRoot, root)))
        .map((path) => [path, digest(readFileSync(path))]),
    ),
  ),
  profileSha256: digest(readFileSync(loopbackProfile)),
  nodeSha256: digest(readFileSync(process.execPath)),
  chromeSha256: digest(readFileSync(chromeExecutable)),
  ownerSha256: digest(
    readFileSync(new URL("./browser-owner.ts", import.meta.url)),
  ),
  launcherSha256: digest(readFileSync(new URL("./launch.ts", import.meta.url))),
  sessionSha256: digest(
    readFileSync(new URL("./browser-session.ts", import.meta.url)),
  ),
});
export type BrowserSession = {
  runId: string;
  executionId: string;
  launcherPid: number;
  directory: string;
  createdAt: number;
  expiresAt: number;
  identity: ReturnType<typeof browserIdentity>;
};
export type BrowserReadiness = BrowserSession & {
  ownerPid: number;
  chromePid: number;
  profilePath: string;
  endpoint: string;
};
export type BrowserBinding = {
  session: BrowserSession;
  ownerPid: number;
  chromePid: number;
  readinessSha256: string;
};
export const privateJson = (path: string, value: unknown) =>
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
const assertPrivate = (path: string, directory = false) => {
  const stat = lstatSync(path);
  assert(
    directory ? stat.isDirectory() : stat.isFile(),
    "Private session path must not be a link",
  );
  assert.equal(stat.uid, process.getuid?.());
  // eslint-disable-next-line no-bitwise -- POSIX permission bits, not Boolean logic.
  assert.equal(stat.mode & 0o777, directory ? 0o700 : 0o600);
  assert.equal(
    realpathSync(path),
    path,
    "Canonical private session path required",
  );
};
export const readPrivateJson = (path: string): unknown => {
  assertPrivate(path);
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
};
export const validateSession = (value: unknown): BrowserSession => {
  assert(value && typeof value === "object");
  const session = value as BrowserSession;
  assert(
    typeof session.runId === "string" &&
      /^[a-zA-Z0-9_-]{1,100}$/u.test(session.runId),
  );
  assert(
    typeof session.executionId === "string" &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(
        session.executionId,
      ),
  );
  assert(Number.isSafeInteger(session.launcherPid) && session.launcherPid > 1);
  assert(typeof session.directory === "string");
  assertPrivate(session.directory, true);
  assert(
    Number.isSafeInteger(session.createdAt) &&
      Number.isSafeInteger(session.expiresAt),
  );
  assert(
    session.createdAt <= Date.now() && session.expiresAt > Date.now(),
    "Stale browser session",
  );
  assert(
    session.expiresAt > session.createdAt &&
      session.expiresAt - session.createdAt <= browserLeaseMs,
  );
  assert.deepEqual(
    session.identity,
    browserIdentity(),
    "Browser library/profile/owner identity changed",
  );
  return session;
};
export const createBrowserSession = (
  runId: string,
  executionId: string = randomUUID(),
): BrowserSession => {
  const directory = realpathSync(
    mkdtempSync(join(tmpdir(), "brunch-a5-browser-")),
  );
  mkdirSync(join(directory, "home"), { mode: 0o700 });
  mkdirSync(join(directory, "tmp"), { mode: 0o700 });
  const createdAt = Date.now();
  const session = {
    runId,
    executionId,
    launcherPid: process.pid,
    directory,
    createdAt,
    expiresAt: createdAt + browserLeaseMs,
    identity: browserIdentity(),
  };
  validateSession(session);
  privateJson(join(directory, "session.json"), session);
  return session;
};
export const assertPid = (pid: number) => {
  assert(
    Number.isSafeInteger(pid) && pid > 1,
    "Invalid browser process identity",
  );
  process.kill(pid, 0);
};
export const readBrowserReadiness = (
  binding: BrowserBinding,
): BrowserReadiness => {
  const session = validateSession(binding.session);
  const path = join(session.directory, "ready.json");
  const readiness = readPrivateJson(path) as BrowserReadiness;
  assert.equal(
    digest(readFileSync(path)),
    binding.readinessSha256,
    "Readiness changed after owner binding",
  );
  for (const key of [
    "runId",
    "executionId",
    "launcherPid",
    "directory",
    "createdAt",
    "expiresAt",
    "identity",
  ] as const)
    assert.deepEqual(readiness[key], session[key], "Foreign browser readiness");
  assert.equal(readiness.ownerPid, binding.ownerPid);
  assert.equal(readiness.chromePid, binding.chromePid);
  assert.notEqual(readiness.ownerPid, readiness.chromePid);
  assertPid(readiness.ownerPid);
  assertPid(readiness.chromePid);
  assert(
    typeof readiness.profilePath === "string" &&
      readiness.profilePath.startsWith(
        `${session.directory}/tmp/playwright_chromiumdev_profile-`,
      ),
  );
  assert(lstatSync(readiness.profilePath).isDirectory());
  assert.equal(realpathSync(readiness.profilePath), readiness.profilePath);
  assert(typeof readiness.endpoint === "string");
  const endpoint = new URL(readiness.endpoint);
  assert.equal(endpoint.protocol, "ws:");
  assert.equal(endpoint.hostname, "127.0.0.1");
  assert(Number(endpoint.port) > 0 && Number(endpoint.port) <= 65535);
  assert(
    /^[/][a-f0-9]{32}$/u.test(endpoint.pathname),
    "Require the library's random endpoint path",
  );
  assert(
    !endpoint.username &&
      !endpoint.password &&
      !endpoint.search &&
      !endpoint.hash,
  );
  assert.equal(endpoint.href, readiness.endpoint);
  return readiness;
};
export const claimBrowser = (
  path: string,
  runId: string,
  executionId: string,
) => {
  const binding = readPrivateJson(path) as BrowserBinding;
  const session = validateSession(binding.session);
  assert.equal(path, join(session.directory, "binding.json"));
  assert.equal(session.runId, runId, "Foreign browser run");
  assert.equal(session.executionId, executionId, "Foreign browser execution");
  const readiness = readBrowserReadiness(binding);
  privateJson(join(session.directory, "controller-claim.json"), {
    executionId: session.executionId,
    controllerPid: process.pid,
  });
  return readiness;
};
