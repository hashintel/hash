/**
 * What the build actually emitted — checked against the artifact, not the source.
 *
 * `test/boundaries.test.ts` catches a misplaced `'use agent'` directive by
 * reading the source. This checks the same property from the other end: that
 * the agent really is registered in the emitted bundle. The distinction earns
 * its keep because the failure mode here is silent — `@flue/vite` drops a
 * module that stops looking like an agent module and the build stays green, so
 * "it compiled" says nothing about whether the app has any agents in it.
 *
 * Any future change that quietly stops an agent, its route, or the conversation
 * store from reaching the bundle fails here, whatever the cause: a directive
 * moved, a config path changed, an entry dropped from the scan glob.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, test } from "vitest";

const DEV_APP = fileURLToPath(new URL("..", import.meta.url)).replace(
  /[/\\]$/u,
  "",
);
const HASH_ROOT = fileURLToPath(new URL("../../..", import.meta.url)).replace(
  /[/\\]$/u,
  "",
);
const DIST = join(DEV_APP, "dist");
const CLIENT = join(DIST, "client");

/** Everything the server build emitted, concatenated. */
let bundle = "";

beforeAll(() => {
  // Build through Turbo so dependency tasks and HASH's workspace graph are
  // exercised by the same command CI uses.
  const built = spawnSync(
    "turbo",
    ["run", "build", "--filter", "@apps/brunch-agent"],
    {
      cwd: HASH_ROOT,
      encoding: "utf8",
      env: { ...process.env, NODE_ENV: "production" },
    },
  );
  if (built.status !== 0) {
    throw new Error(
      `workspace build failed:\n${built.stdout}\n${built.stderr}`,
    );
  }
  bundle = readdirSync(DIST)
    .filter((entry) => entry.endsWith(".mjs"))
    .map((entry) => readFileSync(join(DIST, entry), "utf8"))
    .join("\n");
}, 120_000);

/** The pinned identity of every agent module in the app, read from source. */
function declaredAgentIdentities(): string[] {
  const agentSource = readFileSync(
    join(DEV_APP, "src/agents/gherkin-elicitor.ts"),
    "utf8",
  );
  return [
    ...agentSource.matchAll(/\w+\.agentName\s*=\s*(["'])([^"']+)\1/gu),
  ].map((match) => match[2]!);
}

describe("the emitted server bundle", () => {
  test("exists", () => {
    expect(existsSync(DIST)).toBe(true);
    expect(bundle.length).toBeGreaterThan(0);
  });

  test("registers every declared agent under its pinned identity", () => {
    // The check that matters. A `'use agent'` directive that is not the first
    // statement builds green and simply never registers — the app boots with no
    // agents and nothing says so until a conversation fails to start.
    //
    // Asserted against the emitted `__flueBindAgentModule(Fn, { identity })`
    // call rather than the bare string, because the string survives that
    // failure: the `agentName` assignment is still in the bundle as ordinary
    // dead code once the module stops being scanned as an agent.
    const bound = new Set(
      [
        ...bundle.matchAll(
          /__flueBindAgentModule\([^)]*identity:\s*["']([^"']+)["']/g,
        ),
      ].map((match) => match[1]!),
    );
    const identities = declaredAgentIdentities();
    expect(identities.length).toBeGreaterThan(0);
    for (const identity of identities) {
      expect({ identity, bound: bound.has(identity) }).toEqual({
        identity,
        bound: true,
      });
    }
  });

  test("mounts the agent router and wires the conversation store", () => {
    // Without db.ts reaching the bundle, conversations are process-memory and a
    // restart loses them — a difference invisible until something restarts.
    //
    // Witnessed by strings that exist only in the app's own modules. The
    // obvious witnesses are vacuous: `createAgentRouter` survives in a
    // bootstrap JSDoc comment and `sqlite` in the bootstrap's unconditional
    // default-adapter fallback, so both match even when the mount or db.ts
    // never reach the bundle. (Bare `/agents/` is no better — a bundler
    // region comment for `src/agents/` carries it.)
    expect(bundle).toContain("route(`/agents/"); // app.ts's mount call
    expect(bundle).toContain("BRUNCH_DEV_DB_PATH"); // db.ts's env override
    expect(bundle).toContain(".data-wipe-me"); // db.ts's default store path
  });

  test("carries no model key", () => {
    const modelKey = new RegExp(
      `${"ANTHROPIC"}_${"API"}_${"KEY"}\\s*[:=]\\s*['"][^'"]+['"]`,
      "u",
    );
    expect(bundle).not.toMatch(modelKey);
  });
});

describe("the emitted client bundle", () => {
  // `@flue/vite` emits the server environment only, so the ui tree is built by
  // a second plain vite config. Without these, a client-side break would be
  // invisible to CI — the Flue build would go green having never transformed a
  // line of it.
  test("emits html and a bundled entry", () => {
    expect(existsSync(join(CLIENT, "index.html"))).toBe(true);
    expect(existsSync(join(CLIENT, "assets/index.js"))).toBe(true);
  });

  test("the emitted html points at the built asset, not at source", () => {
    // The failure this catches: shipping the source index.html, whose script
    // tag names a .tsx module nothing serves in production.
    const html = readFileSync(join(CLIENT, "index.html"), "utf8");
    expect(html).toContain("/assets/index.js");
    expect(html).not.toContain(".tsx");
  });

  test("the entry really bundled its dependencies", () => {
    // A near-empty chunk would mean the entry resolved to nothing.
    const entry = readFileSync(join(CLIENT, "assets/index.js"), "utf8");
    expect(entry.length).toBeGreaterThan(10_000);
  });
});

// The production asset route is tested in `apps/brunch-agent/test/assets.test.ts`,
// against the handler module directly: the emitted server bundle targets
// Node (`node:sqlite`), so the handler test isolates the asset policy.
