import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { petrinautPanelEnv } from "../../petrinaut-local.vite.config.ts";
import { brunchEnv } from "../../src/env.ts";

const repoRoot = fileURLToPath(new URL("../../../..", import.meta.url));
const appRoot = "apps/brunch-agent";
const registryPath = `${appRoot}/src/env.ts`;
const thisPath = `${appRoot}/test/architecture/environment-names.test.ts`;

/** Variables only tests read; each test names its variable literally. */
const testOnlyNames = new Set([
  "BRUNCH_LIVE_MODEL_TESTS",
  "BRUNCH_RETAIN_CRASH_ARTIFACTS",
]);

const mentionPattern = /(?<![A-Za-z0-9_])(?:VITE_)?BRUNCH_[A-Z0-9_]*/g;
const declarationPattern = /"((?:VITE_)?BRUNCH_[A-Z0-9_]+)"/g;
const namePattern = /^(?:VITE_)?BRUNCH_[A-Z0-9_]+$/;

const isTestPath = (path: string): boolean =>
  path.startsWith(`${appRoot}/test/`) ||
  path.startsWith("tests/") ||
  /\.(?:test|integration)\.tsx?$/.test(path);

const isAppSourcePath = (path: string): boolean =>
  path.startsWith(`${appRoot}/`) && /\.tsx?$/.test(path) && !isTestPath(path);

const readRepoFile = (path: string): string =>
  readFileSync(join(repoRoot, path), "utf8");

/** Repository files, tracked or not yet staged, that contain `text`. */
const pathsContaining = (text: string): string[] =>
  execFileSync(
    "git",
    ["grep", "--untracked", "--files-with-matches", "-z", "-I", "-F", text],
    { cwd: repoRoot, encoding: "utf8" },
  )
    .split("\0")
    .filter((path) => path.length > 0);

const mentioningPaths = pathsContaining("BRUNCH_").filter(
  (path) => path !== thisPath,
);

const declarations = new Map<string, string[]>();
for (const path of mentioningPaths.filter(isAppSourcePath)) {
  for (const [, name] of readRepoFile(path).matchAll(declarationPattern)) {
    if (name === undefined) continue;
    const paths = declarations.get(name) ?? [];
    if (!paths.includes(path)) paths.push(path);
    declarations.set(name, paths);
  }
}

type NameTree = { readonly [key: string]: string | NameTree };

const leaves = (tree: NameTree, prefix = ""): [string, string][] =>
  Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string"
      ? [[`${prefix}${key}`, value] satisfies [string, string]]
      : leaves(value, `${prefix}${key}.`),
  );

interface TurboConfig {
  readonly tasks: Readonly<
    Record<string, { readonly passThroughEnv?: readonly string[] }>
  >;
}

const forwardedBrunchNames = (task: string): string[] => {
  const turboConfig = JSON.parse(
    readRepoFile(`${appRoot}/turbo.json`),
  ) as TurboConfig;
  return (turboConfig.tasks[task]?.passThroughEnv ?? [])
    .filter((name) => namePattern.test(name))
    .toSorted();
};

describe("Brunch environment variable names", () => {
  test("each name is declared by exactly one module", () => {
    const duplicated = [...declarations].filter(
      ([, paths]) => paths.length > 1,
    );

    expect(duplicated).toEqual([]);
  });

  test("every mention in the repository names a declared variable", () => {
    const undeclared = mentioningPaths.flatMap((path) =>
      [...readRepoFile(path).matchAll(mentionPattern)]
        .map(([mention]) => mention)
        .filter((mention) =>
          mention.endsWith("_")
            ? ![...declarations.keys()].some((name) => name.startsWith(mention))
            : !declarations.has(mention) && !testOnlyNames.has(mention),
        )
        .map((mention) => `${path}: ${mention}`),
    );

    expect(undeclared).toEqual([]);
  });

  test("test-only names stay undeclared and are still read by a test", () => {
    const testText = mentioningPaths
      .filter(isTestPath)
      .map(readRepoFile)
      .join("\n");

    for (const name of testOnlyNames) {
      expect(declarations.has(name), name).toBe(false);
      expect(testText, name).toContain(name);
    }
  });

  test("every registered server variable is read outside the registry", () => {
    const sourceText = pathsContaining("brunchEnv.")
      .filter((path) => isAppSourcePath(path) && path !== registryPath)
      .map(readRepoFile)
      .join("\n");

    const unread = leaves(brunchEnv)
      .map(([path]) => path)
      .filter(
        (path) =>
          !new RegExp(`brunchEnv\\.${path.replaceAll(".", "\\.")}\\b`).test(
            sourceText,
          ),
      );

    expect(unread).toEqual([]);
  });

  test("Turbo forwards exactly the server's variables to `dev`", () => {
    expect(forwardedBrunchNames("dev")).toEqual(
      leaves(brunchEnv)
        .map(([, name]) => name)
        .toSorted(),
    );
  });

  test("Turbo forwards exactly the panel's variables to `petrinaut:dev`", () => {
    expect(forwardedBrunchNames("petrinaut:dev")).toEqual(
      Object.values(petrinautPanelEnv).toSorted(),
    );
  });
});
