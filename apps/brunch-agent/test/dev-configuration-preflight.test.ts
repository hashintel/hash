import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { selectChatModel } from "../src/chat-model.ts";
import { checkDevConfiguration } from "../src/dev-configuration-preflight.ts";

const syntheticKey = "synthetic-config-fixture-not-a-real-credential";
let root: string;
let app: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "brunch-config-preflight-"));
  app = join(root, "apps/brunch-agent");
  mkdirSync(app, { recursive: true });
  for (const variable of [
    "DEBUG",
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_OAUTH_TOKEN",
    "BRUNCH_CHAT_MODEL",
  ]) {
    vi.stubEnv(variable, undefined);
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

const localConfig = () =>
  writeFileSync(
    join(app, ".env.local"),
    `ANTHROPIC_API_KEY=${syntheticKey}\nBRUNCH_CHAT_MODEL=claude-sonnet-4-6\n`,
  );

const check = async () => {
  const report = await checkDevConfiguration(root);
  expect(JSON.stringify(report)).not.toContain(syntheticKey);
  return report;
};

describe("development configuration preflight (synthetic only)", () => {
  it("rejects a tracked application dummy", async () => {
    writeFileSync(
      join(app, ".env"),
      "ANTHROPIC_API_KEY=dummy\nBRUNCH_CHAT_MODEL=claude-sonnet-4-6\n",
    );
    const report = await check();
    expect(report.status).toBe("FAIL");
    expect(report.apiKey).toEqual({
      source: "apps/brunch-agent/.env",
      status: "placeholder rejected",
    });
  });

  it("does not load root configuration when application local configuration is missing", async () => {
    writeFileSync(join(root, ".env"), "ANTHROPIC_API_KEY=dummy\n");
    writeFileSync(
      join(root, ".env.local"),
      `ANTHROPIC_API_KEY=${syntheticKey}\n`,
    );
    const report = await check();
    expect(report.status).toBe("FAIL");
    expect(report.localOverride).toBe("absent");
    expect(report.apiKey).toEqual({
      source: "absent",
      status: "missing/empty",
    });
    expect(report.rootFiles).toContainEqual({
      path: ".env.local",
      present: true,
      selection: "not loaded by dev server",
    });
    expect(report.model.actual).toBe("anthropic/claude-haiku-4-5");
  });

  it("rejects a process dummy overriding valid local configuration", async () => {
    localConfig();
    vi.stubEnv("ANTHROPIC_API_KEY", "dummy");
    const report = await check();
    expect(report.status).toBe("FAIL");
    expect(report.apiKey).toEqual({
      source: "process environment",
      status: "placeholder rejected",
    });
    expect(process.env.ANTHROPIC_API_KEY).toBe("dummy");
  });

  it("verifies valid local selection through Vite and public provider resolution without authenticating", async () => {
    writeFileSync(join(app, ".env"), "ANTHROPIC_API_KEY=dummy\n");
    localConfig();
    const report = await check();
    expect(report.status).toBe("PASS");
    expect(report.localOverride).toBe("present");
    expect(report.apiKey.source).toBe("apps/brunch-agent/.env.local");
    expect(report.providerSelection).toBe(
      "verified: ANTHROPIC_API_KEY matches Vite selection",
    );
    expect(report.result).toBe(
      "configuration verified; credential validity untested",
    );
    expect(report.persona).toContain("UNVERIFIED");
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("honors Vite mode-local precedence and interpolation", async () => {
    localConfig();
    writeFileSync(
      join(app, ".env.development.local"),
      `CONFIG_FIXTURE=dummy\nANTHROPIC_API_KEY=\${CONFIG_FIXTURE}\n`,
    );
    const report = await check();
    expect(report.status).toBe("FAIL");
    expect(report.apiKey).toEqual({
      source: "apps/brunch-agent/.env.development.local",
      status: "placeholder rejected",
    });
  });

  it.each(["ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_OAUTH_TOKEN"])(
    "fails safely instead of resolving higher-priority %s",
    async (variable) => {
      localConfig();
      vi.stubEnv(variable, syntheticKey);
      const report = await check();
      expect(report.status).toBe("FAIL");
      expect(report.higherPrioritySources).toEqual([
        { variable, source: "process environment" },
      ]);
      expect(report.providerSelection).toContain(
        "alternate credential not resolved",
      );
    },
  );

  it("rejects empty process overrides and hides unknown model values", async () => {
    localConfig();
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("BRUNCH_CHAT_MODEL", syntheticKey);
    const report = await check();
    expect(report.status).toBe("FAIL");
    expect(report.apiKey.status).toBe("missing/empty");
    expect(report.model.actual).toBe("unrecognized model; value withheld");
  });

  it("refuses DEBUG before Vite can expose configuration", async () => {
    vi.stubEnv("DEBUG", "vite:env");
    await expect(checkDevConfiguration(root)).rejects.toThrow(
      "DEBUG unset or empty",
    );
  });
});

it("preserves canonical ChatAgent default semantics", () => {
  expect(selectChatModel({})).toBe("claude-haiku-4-5");
  expect(selectChatModel({ BRUNCH_CHAT_MODEL: "" })).toBe("claude-haiku-4-5");
  expect(selectChatModel({ BRUNCH_CHAT_MODEL: " " })).toBe(" ");
  expect(selectChatModel({ BRUNCH_CHAT_MODEL: "claude-sonnet-4-6" })).toBe(
    "claude-sonnet-4-6",
  );
});
