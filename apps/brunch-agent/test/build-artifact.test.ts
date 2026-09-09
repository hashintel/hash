/**
 * What the build actually emitted — checked against the artifact, not the source.
 *
 * The failure mode here is silent — `@flue/vite` drops a module that stops
 * looking like an agent module and the build stays green, so "it compiled"
 * says nothing about whether the app has its agent in the bundle.
 *
 * Any future change that quietly stops the agent, its route, or the conversation
 * store from reaching the bundle fails here, whatever the cause: a directive
 * moved or a config path changed.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { ChatAgent } from "../src/agents/chat-agent/agent";
import { loadBuiltBrunchApplication } from "../src/evaluations/runbook/load-built-application";

const DEV_APP = fileURLToPath(new URL("..", import.meta.url)).replace(
  /[/\\]$/u,
  "",
);
const DIST = join(DEV_APP, "dist");
const CLIENT = join(DIST, "client");
const allowedCorsOrigin = "https://demo.petrinaut.org";
const previousAllowedCorsOrigins = process.env.BRUNCH_CORS_ALLOWED_ORIGINS;

/** Everything the server build emitted, concatenated. */
let bundle = "";

beforeAll(() => {
  process.env.BRUNCH_CORS_ALLOWED_ORIGINS = allowedCorsOrigin;
  // `test:unit` depends on the app's build in `turbo.json`; the test inspects
  // that graph-owned artifact rather than hiding a nested build invocation.
  bundle = readdirSync(DIST)
    .filter((entry) => entry.endsWith(".mjs"))
    .map((entry) => readFileSync(join(DIST, entry), "utf8"))
    .join("\n");
});

afterAll(() => {
  if (previousAllowedCorsOrigins === undefined) {
    delete process.env.BRUNCH_CORS_ALLOWED_ORIGINS;
  } else {
    process.env.BRUNCH_CORS_ALLOWED_ORIGINS = previousAllowedCorsOrigins;
  }
});

describe("the emitted server bundle", () => {
  test("exists", () => {
    expect(existsSync(DIST)).toBe(true);
    expect(bundle.length).toBeGreaterThan(0);
  });

  test("registers the chat agent under its pinned identity", () => {
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
    expect(bound.has(ChatAgent.agentName)).toBe(true);
  });

  test("includes the fail-closed production store", () => {
    // Without db.ts reaching the bundle, conversations are process-memory and a
    // restart loses them — a difference invisible until something restarts.
    expect(bundle).toContain("BRUNCH_POSTGRES_AUTH_MODE");
    expect(bundle).toContain(`config.kind === "postgres"`);
    expect(bundle).toContain(
      `postgres(createPostgresRunner(config, shutdownBrunchTelemetry))`,
    );
    expect(bundle).toContain("Production database configuration requires");
    // SQLite remains available to local/test execution only.
    expect(bundle).toContain("BRUNCH_DEV_DB_PATH");
    expect(bundle).toContain(".data-wipe-me");
  });

  test("serves only the guarded Flue conversation door", async () => {
    const application = await loadBuiltBrunchApplication();
    const [legacyResponse, flueResponse] = await Promise.all([
      application.fetch(new Request("http://brunch.test/api/chat")),
      application.fetch(
        new Request("http://brunch.test/agents/chat/missing-identity"),
      ),
    ]);

    expect(legacyResponse.status).toBe(404);
    expect(flueResponse.status).toBe(401);
  });

  test("applies route-scoped CORS before ownership", async () => {
    const application = await loadBuiltBrunchApplication();
    const [preflight, guardedResponse, bareOptions, healthResponse] =
      await Promise.all([
        application.fetch(
          new Request("http://brunch.test/agents/chat/conversation", {
            method: "OPTIONS",
            headers: {
              Origin: allowedCorsOrigin,
              "Access-Control-Request-Method": "POST",
              "Access-Control-Request-Headers":
                "content-type,x-brunch-principal,x-brunch-conversation",
            },
          }),
        ),
        application.fetch(
          new Request("http://brunch.test/agents/chat/conversation", {
            headers: { Origin: allowedCorsOrigin },
          }),
        ),
        application.fetch(
          new Request("http://brunch.test/agents/chat/conversation", {
            method: "OPTIONS",
          }),
        ),
        application.fetch(
          new Request("http://brunch.test/health", {
            headers: { Origin: allowedCorsOrigin },
          }),
        ),
      ]);

    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe(
      allowedCorsOrigin,
    );
    expect(preflight.headers.get("access-control-allow-methods")).toBe(
      "GET,POST,OPTIONS",
    );
    expect(preflight.headers.get("access-control-allow-headers")).toBe(
      "Content-Type,x-brunch-principal,x-brunch-conversation",
    );
    expect(
      preflight.headers.get("access-control-allow-credentials"),
    ).toBeNull();

    expect(guardedResponse.status).toBe(401);
    expect(guardedResponse.headers.get("access-control-allow-origin")).toBe(
      allowedCorsOrigin,
    );
    expect(bareOptions.status).toBe(401);
    expect(bareOptions.headers.get("access-control-allow-origin")).toBeNull();
    expect(healthResponse.status).toBe(200);
    expect(healthResponse.headers.get("content-type")).toContain(
      "application/health+json",
    );
    expect(
      healthResponse.headers.get("access-control-allow-origin"),
    ).toBeNull();
  });

  test("packages the authored skill without the retired filesystem loader", () => {
    expect(bundle).toContain("defineSkill");
    expect(bundle).toContain("sdcpn-modelling");
    expect(bundle).toContain("The registers are addresses, not a procedure");
    expect(bundle).toContain("Operational-Process and SDCPN Elicitation");
    expect(bundle).toContain(
      "Every operational claim has one authoritative home",
    );
    expect(bundle).toContain("Capability-aware lifecycle");
    expect(bundle).toContain("Activate the `elicitation` skill");
    expect(bundle).not.toContain("## The role (core)");
    expect(bundle).not.toContain("Completion is computed by the harness");
    expect(bundle).not.toContain("splitSkillMarkdown");
    expect(bundle).not.toContain("skillFileUrl");
    expect(bundle).not.toContain("./sdcpn-modelling/SKILL.md");
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
