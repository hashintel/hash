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

const lintFiles = (
  files: Readonly<Record<string, string>>,
  rule: string,
): SpawnSyncReturns<string> => {
  const directory = mkdtempSync(path.join(tmpdir(), "hash-oxlint-config-"));
  try {
    for (const [filename, content] of Object.entries(files)) {
      const filenamePath = path.join(directory, filename);
      mkdirSync(path.dirname(filenamePath), { recursive: true });
      writeFileSync(filenamePath, content);
    }

    const result = spawnSync(
      process.execPath,
      [
        binary,
        "--disable-nested-config",
        "-c",
        "oxlint.config.mjs",
        "-A",
        "all",
        "-D",
        rule,
        "--format",
        "json",
        ".",
      ],
      { cwd: directory, encoding: "utf8", timeout },
    );
    if (result.error !== undefined) {
      throw result.error;
    }

    return result;
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
};

describe("config_inheritance", () => {
  test("environment_globals", () => {
    expect.hasAssertions();

    const result = lintFiles(
      {
        "oxlint.config.mjs": `import { defineConfig } from ${JSON.stringify(entry)};
export default defineConfig({
  runtime: "node",
  extends: [{ env: { browser: true }, globals: { SHARED: "readonly" } }],
  options: { typeAware: false },
});
`,
        "globals.js": "console.log(process.pid, window.location, SHARED);\n",
        "unknown.js": "UNDECLARED;\n",
      },
      "no-undef",
    );

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      diagnostics: [{ filename: "unknown.js", code: "eslint(no-undef)" }],
    });
  });

  test("ignore_patterns", () => {
    expect.hasAssertions();

    const result = lintFiles(
      {
        "oxlint.config.mjs": `import { defineConfig } from ${JSON.stringify(entry)};
export default defineConfig({
  runtime: "node",
  extends: [{ ignorePatterns: ["generated/**"] }],
  ignorePatterns: ["!generated/keep.js"],
  options: { typeAware: false },
});
`,
        "generated/ignored.js": "UNDEFINED_GENERATED;\n",
        "generated/keep.js": "UNDEFINED_REINCLUDED;\n",
      },
      "no-undef",
    );

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      diagnostics: [
        { filename: "generated/keep.js", code: "eslint(no-undef)" },
      ],
    });
  });
});

describe("vitest_profile", () => {
  test("type_tests_reject_runtime_expect", () => {
    expect.hasAssertions();

    const result = lintFiles(
      {
        "oxlint.config.mjs": `import { defineConfig } from ${JSON.stringify(entry)};
export default defineConfig({
  frameworks: ["vitest"],
  runtime: "node",
  options: { typeAware: false },
});
`,
        "src/runtime.test-d.ts":
          'import { expect } from "vitest";\n\nexpect(1).toBe(1);\n',
        "src/types.test-d.ts":
          'import { expectTypeOf } from "vitest";\n\nexpectTypeOf(1).toBeNumber();\n',
        "src/runtime.test.ts":
          'import { expect } from "vitest";\n\nexpect(1).toBe(1);\n',
      },
      "no-restricted-imports",
    );

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      diagnostics: [
        {
          filename: "src/runtime.test-d.ts",
          code: "eslint(no-restricted-imports)",
        },
      ],
    });
  });
});
