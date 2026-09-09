import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
  claimBrowser,
  createBrowserSession,
  digest,
  privateJson,
  readBrowserReadiness,
  repositoryRoot,
  type BrowserBinding,
  type BrowserReadiness,
} from "../src/evaluations/real-provider-a5/browser-session.ts";

// Filesystem-only TEST identities. No browser, provider, credentials or socket.
const fixture = () => {
  const session = createBrowserSession("TEST-browser-binding");
  const profilePath = join(
    session.directory,
    "tmp/playwright_chromiumdev_profile-TEST",
  );
  mkdirSync(profilePath, { mode: 0o700 });
  const readiness: BrowserReadiness = {
    ...session,
    ownerPid: process.ppid,
    chromePid: process.pid,
    profilePath,
    endpoint: `ws://127.0.0.1:12345/${randomUUID().replaceAll("-", "")}`,
  };
  const readyPath = join(session.directory, "ready.json");
  privateJson(readyPath, readiness);
  const binding: BrowserBinding = {
    session,
    ownerPid: readiness.ownerPid,
    chromePid: readiness.chromePid,
    readinessSha256: digest(readFileSync(readyPath)),
  };
  const path = join(session.directory, "binding.json");
  const seal = () => {
    writeFileSync(readyPath, JSON.stringify(readiness));
    binding.readinessSha256 = digest(readFileSync(readyPath));
    writeFileSync(path, JSON.stringify(binding), { mode: 0o600 });
  };
  seal();
  return { session, readiness, binding, path, readyPath, seal };
};

describe("private one-execution sibling browser binding", () => {
  test("old real activation refuses in the launcher before creating a browser or opening its paid profile", () => {
    const input = fixture();
    const activation = join(input.session.directory, "old-activation.json");
    const output = join(input.session.directory, "not-started");
    privateJson(activation, { runId: "TEST-old", singleWriter: true });
    const result = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        join(
          repositoryRoot,
          "apps/brunch-agent/src/evaluations/real-provider-a5/launch.ts",
        ),
        "real",
        output,
        activation,
      ],
      { cwd: repositoryRoot, encoding: "utf8", timeout: 5_000 },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("A5 sibling run stopped");
    expect(existsSync(output)).toBe(false);
  });
  test("claims the expected run/execution once without leaking its endpoint into the claim", () => {
    const input = fixture();
    expect(
      claimBrowser(input.path, input.session.runId, input.session.executionId),
    ).toEqual(input.readiness);
    const claim = readFileSync(
      join(input.session.directory, "controller-claim.json"),
      "utf8",
    );
    expect(claim).not.toContain(input.readiness.endpoint);
    expect(() =>
      claimBrowser(input.path, input.session.runId, input.session.executionId),
    ).toThrow(/EEXIST/);
  });
  test.each([
    "run",
    "execution",
    "owner",
    "chrome",
    "directory",
    "expired",
    "library",
    "profile",
    "changed-bytes",
  ])("rejects %s identity before connection", (control) => {
    const input = fixture();
    let runId = input.session.runId;
    let executionId = input.session.executionId;
    if (control === "run") runId = "OTHER";
    if (control === "execution") executionId = randomUUID();
    if (control === "owner") input.readiness.ownerPid++;
    if (control === "chrome") input.readiness.chromePid++;
    if (control === "directory") input.readiness.directory += "-foreign";
    if (control === "expired") input.session.expiresAt = Date.now() - 1;
    if (control === "library")
      input.session.identity.librarySha256 = "different";
    if (control === "profile")
      input.session.identity.profileSha256 = "different";
    input.seal();
    if (control === "changed-bytes")
      writeFileSync(
        input.readyPath,
        `${readFileSync(input.readyPath, "utf8")} `,
      );
    expect(() => claimBrowser(input.path, runId, executionId)).toThrow(Error);
  });
  test.each([
    "ws://localhost:12345/0123456789abcdef0123456789abcdef",
    "ws://192.0.2.1:12345/0123456789abcdef0123456789abcdef",
    "wss://127.0.0.1:12345/0123456789abcdef0123456789abcdef",
    "ws://127.0.0.1:12345/fixed",
    "ws://127.0.0.1:12345/0123456789abcdef0123456789abcdef?forward=1",
    "ws://127.0.0.1:12345/0123456789abcdef0123456789abcdef#fragment",
    "ws://user:password@127.0.0.1:12345/0123456789abcdef0123456789abcdef",
    "not-an-endpoint",
  ])("refuses malformed/nonlocal endpoint %s", (endpoint) => {
    const input = fixture();
    input.readiness.endpoint = endpoint;
    input.seal();
    expect(() => readBrowserReadiness(input.binding)).toThrow(Error);
  });
  test("refuses a dead owner even with unchanged private readiness", () => {
    const input = fixture();
    input.binding.ownerPid = 2_147_483_647;
    input.readiness.ownerPid = 2_147_483_647;
    input.seal();
    expect(() => readBrowserReadiness(input.binding)).toThrow(/ESRCH/);
  });
  test("refuses a public readiness file or symlink", () => {
    const input = fixture();
    chmodSync(input.readyPath, 0o644);
    expect(() => readBrowserReadiness(input.binding)).toThrow(Error);
    unlinkSync(input.readyPath);
    symlinkSync(input.path, input.readyPath);
    expect(() => readBrowserReadiness(input.binding)).toThrow(
      /must not be a link/,
    );
  });
  test("refuses an externally located browser profile", () => {
    const input = fixture();
    input.readiness.profilePath = input.session.directory;
    input.seal();
    expect(() => readBrowserReadiness(input.binding)).toThrow(Error);
  });
});
