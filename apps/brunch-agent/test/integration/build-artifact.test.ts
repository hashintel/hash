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

import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import { brunchHeaders } from "@hashintel/brunch-agent";

import { loadBuiltBrunchApplication } from "../load-built-application";

const DEV_APP = fileURLToPath(new URL("../..", import.meta.url)).replace(
  /[/\\]$/u,
  "",
);
const DIST = join(DEV_APP, "dist");
const CLIENT = join(DIST, "client");
const allowedCorsOrigin = "https://demo.petrinaut.org";
const previousAllowedCorsOrigins = process.env.BRUNCH_CORS_ALLOWED_ORIGINS;

/** Everything the server build emitted, concatenated. */
let bundle = "";

/** The test process's environment without any Brunch configuration. */
const unconfiguredEnvironment = () =>
  Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith("BRUNCH_")),
  );

const unusedPort = async () => {
  const probe = createServer().listen(0, "127.0.0.1");
  await once(probe, "listening");
  const address = probe.address();
  probe.close();
  if (address === null || typeof address === "string")
    throw new Error("The port probe has no TCP address.");
  return address.port;
};

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
    expect(bound.has("brunch-chat-agent")).toBe(true);
  });

  test("starts as a server and reports liveness on /health", async () => {
    const port = await unusedPort();
    const server = spawn(process.execPath, [join(DIST, "server.mjs")], {
      env: {
        ...unconfiguredEnvironment(),
        BRUNCH_DEV_DB_PATH: join(
          mkdtempSync(join(tmpdir(), "brunch-server-")),
          "conversation.db",
        ),
        NODE_ENV: "test",
        OTEL_SDK_DISABLED: "true",
        PORT: String(port),
      },
      stdio: "ignore",
    });
    try {
      const response = await vi.waitFor(
        () => fetch(`http://localhost:${port}/health`),
        { timeout: 30_000, interval: 250 },
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ status: "pass" });
    } finally {
      server.kill();
    }
  });

  test("refuses to start in production without Postgres settings", async () => {
    // Without db.ts reaching the bundle, conversations are process-memory and a
    // restart loses them — a difference invisible until something restarts.
    const refusal = await promisify(execFile)(
      process.execPath,
      [join(DIST, "server.mjs")],
      {
        env: {
          ...unconfiguredEnvironment(),
          // Production telemetry is required before the database is opened.
          HASH_OTLP_ENDPOINT: "http://127.0.0.1:9",
          NODE_ENV: "production",
          PORT: "0",
        },
        timeout: 30_000,
      },
    ).then(
      () => {
        throw new Error("The production server exited cleanly.");
      },
      (error: unknown) => error,
    );
    expect(refusal).toHaveProperty(
      "stderr",
      expect.stringContaining("BRUNCH_POSTGRES_AUTH_MODE"),
    );
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
              "Access-Control-Request-Headers": [
                "content-type",
                brunchHeaders.principal,
                brunchHeaders.conversation,
              ].join(","),
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

  test("packages each mounted skill directory natively through Flue", () => {
    expect(bundle).toContain("createSkillReference(");
    expect(bundle).toMatch(/"id": "skill:elicitation:[0-9a-f]+"/u);
    expect(bundle).toMatch(/"id": "skill:sdcpn-modelling:[0-9a-f]+"/u);
    for (const resource of [
      "references/checks.md",
      "references/experiment-configuration.md",
      "references/pn-construction.md",
      "references/profile.md",
      "templates/workpiece.md",
    ])
      expect(bundle).toContain(`"${resource}"`);
  });

  test("carries no model key", () => {
    const modelKey = new RegExp(
      `(?:${"ANTHROPIC"}|${"OPENAI"})_${"API"}_${"KEY"}\\s*[:=]\\s*['"][^'"]+['"]`,
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
