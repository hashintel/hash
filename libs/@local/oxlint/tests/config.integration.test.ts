import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import type { SpawnSyncReturns } from "node:child_process";

const binary = fileURLToPath(
  new URL("../bin/oxlint", import.meta.resolve("oxlint")),
);
const entry = new URL("../dist/index.js", import.meta.url).href;
const timeout = 10_000;

const runOxlint = (
  directory: string,
  arguments_: readonly string[],
): SpawnSyncReturns<string> => {
  const result = spawnSync(
    process.execPath,
    [
      binary,
      "--disable-nested-config",
      "-c",
      "oxlint.config.mjs",
      ...arguments_,
    ],
    { cwd: directory, encoding: "utf8", timeout },
  );
  if (result.error !== undefined) {
    throw result.error;
  }

  return result;
};

const prepareFiles = (directory: string): void => {
  writeFileSync(
    path.join(directory, "oxlint.config.mjs"),
    `import { defineConfig } from ${JSON.stringify(entry)};
export default defineConfig({
  runtime: "node",
  frameworks: ["next"],
  extends: [{
    extends: [{
      env: { browser: true },
      globals: { SHARED: "readonly" },
      settings: { react: { version: "18.2.0" } },
      ignorePatterns: ["generated/**"],
      rules: { "no-console": "deny" },
    }],
    ignorePatterns: ["middle/**"],
    overrides: [{ files: ["*.js"], rules: { "no-debugger": "warn" } }],
  }],
  ignorePatterns: ["local/**", "!generated/keep.js"],
  options: { typeAware: false },
  overrides: [{ files: ["*.js"], rules: { "no-debugger": "allow" } }],
  rules: { "eslint/no-console": "allow" },
});
`,
  );
  const files = {
    "globals.js": "console.log(process.pid, window.location, SHARED);\n",
    "unknown.js": "console.log(UNDECLARED);\n",
    "overrides.js": "debugger;\nexport const marker = true;\n",
    ".next/ignored.js": "UNDEFINED_BUILD;\n",
    "generated/ignored.js": "UNDEFINED_GENERATED;\n",
    "middle/ignored.js": "UNDEFINED_MIDDLE;\n",
    "local/ignored.js": "UNDEFINED_LOCAL;\n",
    "generated/keep.js": "UNDEFINED_REINCLUDED;\n",
  };
  for (const [filename, content] of Object.entries(files)) {
    const filenamePath = path.join(directory, filename);
    mkdirSync(path.dirname(filenamePath), { recursive: true });
    writeFileSync(filenamePath, content);
  }
};

const withFixture = (check: (directory: string) => void): void => {
  const directory = mkdtempSync(path.join(tmpdir(), "hash-oxlint-config-"));
  try {
    prepareFiles(directory);
    check(directory);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
};

describe("resolved_config", () => {
  test("inherited_fields", () => {
    expect.hasAssertions();

    withFixture((directory) => {
      const result = runOxlint(directory, ["--print-config"]);

      expect(result).toMatchObject({ status: 0 });
      expect(JSON.parse(result.stdout)).toMatchObject({
        env: { builtin: true, es2026: true, node: true, browser: true },
        globals: { SHARED: "readonly" },
        settings: { react: { version: "18.2.0" } },
        options: { typeAware: false, reportUnusedDisableDirectives: "deny" },
        ignorePatterns: [
          ".next/**",
          "next-env.d.ts",
          "generated/**",
          "middle/**",
          "local/**",
          "!generated/keep.js",
        ],
      });
    });
  });

  test("environment_globals", () => {
    expect.hasAssertions();

    withFixture((directory) => {
      const valid = runOxlint(directory, [
        "-A",
        "all",
        "-D",
        "no-undef",
        "globals.js",
      ]);
      const invalid = runOxlint(directory, [
        "-A",
        "all",
        "-D",
        "no-undef",
        "unknown.js",
      ]);

      expect(valid).toMatchObject({ status: 0 });
      expect(invalid.status).toBe(1);
      expect(invalid.stdout).toContain("UNDECLARED");
    });
  });

  test("ignore_patterns", () => {
    expect.hasAssertions();

    withFixture((directory) => {
      const ignored = runOxlint(directory, [
        "-A",
        "all",
        "-D",
        "no-undef",
        "globals.js",
        ".next/ignored.js",
        "generated/ignored.js",
        "middle/ignored.js",
        "local/ignored.js",
      ]);
      const included = runOxlint(directory, [
        "-A",
        "all",
        "-D",
        "no-undef",
        "generated/keep.js",
      ]);

      expect(ignored).toMatchObject({ status: 0 });
      expect(included.status).toBe(1);
      expect(included.stdout).toContain("UNDEFINED_REINCLUDED");
    });
  });

  test("native_precedence", () => {
    expect.hasAssertions();

    withFixture((directory) => {
      const result = runOxlint(directory, ["--deny-warnings", "overrides.js"]);
      const printed = runOxlint(directory, ["--print-config"]);

      expect(result).toMatchObject({ status: 0 });
      expect(printed.status).toBe(0);
      expect(JSON.parse(printed.stdout)).toMatchObject({
        rules: { "no-console": "allow" },
      });
    });
  });
});
