/**
 * The architectural boundaries, as tests rather than as documentation.
 *
 * Spec §4 and §12.2 state the dependency direction as invariants; an invariant
 * nobody can run is a wish. These are the mechanical checks — they read the
 * real tree, so a package added later is governed without opting in.
 *
 * Two of them are load-bearing beyond tidiness, because the Flue build is
 * silent about the failure: a `'use agent'` directive that is not the file's
 * first statement builds green and simply never registers the agent.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
  AGENT_DIRECTIVE_STATEMENT,
  agentModules,
  allDependencies,
  CONTEXT_ROOT,
  importedPackages,
  MODEL_KEY_NAME,
  packageOf,
  pinnedIdentities,
  runtimeDependencies,
  sourceFiles,
  testFiles,
  workspacePackages,
  type WorkspacePackage,
} from "./workspace";

const PACKAGES = workspacePackages();

const CORE = "@hashintel/brunch-agent";
/** Any substrate package. The harness may never name one; a binding must. */
const SUBSTRATE_SCOPES = ["@flue/", "@earendil-works/"];

const isSubstrate = (name: string): boolean =>
  SUBSTRATE_SCOPES.some((scope) => name.startsWith(scope));
const byRole = (role: string): WorkspacePackage[] =>
  PACKAGES.filter((pkg) => pkg.dir.startsWith(`${role}-`));

test("every workspace package is one the spec topology names", () => {
  // Derived from the spec's own §12.2 topology block instead of a second
  // hand-written list here. The spec names *intended* structure — some
  // entries are not scaffolded yet — so the direction checked is disk ⊆
  // spec: a package the spec does not name is loud, while an
  // intended-but-unbuilt one is not a failure. (The old hardcoded equality
  // would have failed the next legitimate package instead of governing it.)
  const spec = readFileSync(
    join(CONTEXT_ROOT, "docs/specs/elicitation-kernel.md"),
    "utf8",
  );
  const topology = /### 12\.2[^\n]*\n[\s\S]*?```text\n([\s\S]*?)```/.exec(
    spec,
  )?.[1];
  expect(topology).toBeDefined();
  const named = new Set(
    [...topology!.matchAll(/^((?:packages|apps)\/[\w-]+)(?=\s|$)/gm)].map(
      (match) => match[1]!,
    ),
  );
  expect(named.size).toBeGreaterThan(0);
  for (const pkg of PACKAGES) {
    const standalonePath =
      pkg.kind === "app" ? "apps/dev" : `packages/${pkg.dir}`;
    expect({ pkg: pkg.relPath, inSpec: named.has(standalonePath) }).toEqual({
      pkg: pkg.relPath,
      inSpec: true,
    });
  }
});

test("every package is actually scanned", () => {
  // Without this, a package the file walker misses passes every file-level
  // invariant vacuously — the substrate-import ban, the plugin-resolves-core
  // rule, and the schema-library ban would all iterate an empty list and go
  // green. A silent exemption is worse than no check at all.
  for (const pkg of PACKAGES) {
    expect({ pkg: pkg.relPath, scanned: sourceFiles(pkg).length > 0 }).toEqual({
      pkg: pkg.relPath,
      scanned: true,
    });
  }
});

describe("role prefixes name what a package is architecturally (spec §12.2)", () => {
  test("every package under packages/ is core or carries a role prefix", () => {
    for (const pkg of PACKAGES.filter((p) => p.kind === "package")) {
      expect(pkg.dir).toMatch(
        /^(core|plugin-[a-z0-9-]+|binding-[a-z0-9-]+|transport-[a-z0-9-]+)$/,
      );
    }
  });

  test("no package uses an avoided role noun", () => {
    // The glossary's own noun is `binding`; `adapter-*` and `wrapper-*` are
    // avoided terms, and `elicit-*` names function rather than identity.
    for (const pkg of PACKAGES) {
      expect(pkg.dir).not.toMatch(/^(adapter|wrapper|elicit)-/);
    }
  });

  test("the manifest name matches the role-prefixed directory", () => {
    for (const pkg of PACKAGES) {
      const expectedName =
        pkg.kind === "app"
          ? "@apps/brunch-agent"
          : pkg.dir === "core"
            ? CORE
            : `@hashintel/brunch-agent-${pkg.dir}`;
      expect(pkg.name).toBe(expectedName);
    }
  });
});

describe("dependency direction (spec §4, §12.2)", () => {
  test("the harness imports no substrate", () => {
    const core = PACKAGES.find((pkg) => pkg.name === CORE);
    expect(core).toBeDefined();
    expect(allDependencies(core!).filter(isSubstrate)).toEqual([]);
    for (const file of sourceFiles(core!)) {
      const substrateImports = importedPackages(file).filter((s) =>
        isSubstrate(packageOf(s)),
      );
      expect({ file: file.relPath, substrateImports }).toEqual({
        file: file.relPath,
        substrateImports: [],
      });
    }
  });

  test("the harness depends on no binding and no plugin", () => {
    const core = PACKAGES.find((pkg) => pkg.name === CORE)!;
    for (const dependency of runtimeDependencies(core)) {
      expect(dependency).not.toMatch(
        /^@hashintel\/brunch-agent-(binding|plugin)-/u,
      );
    }
  });

  test("plugins resolve core only — never the binding, never Flue", () => {
    const plugins = byRole("plugin");
    expect(plugins.length).toBeGreaterThan(0);
    for (const plugin of plugins) {
      const workspaceDeps = runtimeDependencies(plugin).filter((dependency) =>
        dependency.startsWith("@hashintel/brunch-agent"),
      );
      expect(workspaceDeps).toEqual([CORE]);
      expect(allDependencies(plugin).filter(isSubstrate)).toEqual([]);

      for (const file of sourceFiles(plugin)) {
        for (const specifier of importedPackages(file)) {
          const pkg = packageOf(specifier);
          expect(isSubstrate(pkg)).toBe(false);
          expect(pkg.startsWith("@hashintel/brunch-agent") ? pkg : CORE).toBe(
            CORE,
          );
          expect(specifier).not.toBe(`${CORE}/storage`);
          expect(specifier).not.toBe(`${CORE}/prompts`);
        }
      }
    }
  });

  test("a binding imports both", () => {
    const bindings = byRole("binding");
    expect(bindings.length).toBeGreaterThan(0);
    for (const binding of bindings) {
      const deps = runtimeDependencies(binding);
      expect(deps).toContain(CORE);
      expect(deps.some(isSubstrate)).toBe(true);
    }
  });

  test("bindings depend on no plugin — the harness discovers plugins, not the substrate", () => {
    for (const binding of byRole("binding")) {
      for (const dependency of runtimeDependencies(binding)) {
        expect(dependency).not.toMatch(/^@hashintel\/brunch-agent-plugin-/u);
      }
    }
  });

  test("repertoire defaults are guarded core prompt data (ADR-0008)", () => {
    expect(PACKAGES.map((pkg) => pkg.dir)).not.toContain("repertoire");

    const promptImporters = PACKAGES.flatMap((pkg) =>
      sourceFiles(pkg)
        .filter((file) => importedPackages(file).includes(`${CORE}/prompts`))
        .map((file) => ({ pkg: pkg.dir, file: file.relPath })),
    );
    expect(promptImporters.length).toBeGreaterThan(0);
    for (const importer of promptImporters) {
      expect(importer.pkg).toMatch(/^binding-/u);
    }

    // Plugin-only CI lints the plugin and does not run this suite. The
    // oxlint path ban is the gate that fires then; this assertion keeps
    // that gate from disappearing while the suite still runs.
    for (const plugin of byRole("plugin")) {
      expect(
        readFileSync(join(plugin.path, ".oxlintrc.json"), "utf8"),
      ).toContain(`"name": "${CORE}/prompts"`);
    }
  });

  test("transports consume their wire encoder only — never core, a binding, or Flue", () => {
    const transports = byRole("transport");
    expect(transports.length).toBeGreaterThan(0);
    for (const transport of transports) {
      expect(runtimeDependencies(transport).sort()).toEqual(
        ["ai", "valibot"].sort(),
      );
      for (const file of sourceFiles(transport).filter((file) =>
        file.path.startsWith(join(transport.path, "src")),
      )) {
        for (const specifier of importedPackages(file)) {
          if (specifier.startsWith("node:")) continue;
          expect(["ai", "valibot"]).toContain(packageOf(specifier));
        }
      }
    }
  });
});

describe("the direction is enforced under HASH's linker", () => {
  // HASH may hoist dependencies, so physical resolution is not an authority:
  // an undeclared package can be resolvable by accident. Runtime manifests and
  // authored imports are the stable boundary surfaces.
  test("every imported Brunch workspace is a declared runtime dependency", () => {
    for (const pkg of PACKAGES) {
      const declared = runtimeDependencies(pkg);
      for (const file of sourceFiles(pkg)) {
        const importedWorkspaces = importedPackages(file)
          .map(packageOf)
          .filter(
            (imported) =>
              imported === CORE ||
              imported.startsWith("@hashintel/brunch-agent-"),
          );
        for (const imported of importedWorkspaces) {
          expect({
            file: file.relPath,
            imported,
            declared: declared.includes(imported),
          }).toEqual({
            file: file.relPath,
            imported,
            declared: true,
          });
        }
      }
    }
  });
});

describe("Valibot is the schema library at every boundary (spec §12.4)", () => {
  // Flue locks Valibot at every boundary. A Standard-Schema waist would buy
  // comfort at the cost of a conversion seam that can silently drop
  // constraints — the silent-coercion smell.
  const OTHER_SCHEMA_LIBRARIES = [
    "zod",
    "yup",
    "joi",
    "ajv",
    "superstruct",
    "arktype",
    "io-ts",
    "runtypes",
    "@sinclair/typebox",
    "@standard-schema/spec",
    "@standard-schema/utils",
  ];

  test("no package declares another schema library", () => {
    for (const pkg of PACKAGES) {
      for (const forbidden of OTHER_SCHEMA_LIBRARIES) {
        expect(allDependencies(pkg)).not.toContain(forbidden);
      }
    }
  });

  test("no source file imports another schema library", () => {
    for (const pkg of PACKAGES) {
      for (const file of sourceFiles(pkg)) {
        for (const specifier of importedPackages(file)) {
          expect(OTHER_SCHEMA_LIBRARIES).not.toContain(packageOf(specifier));
        }
      }
    }
  });

  test("a package declares valibot exactly when its source imports it", () => {
    for (const pkg of PACKAGES) {
      const importsValibot = sourceFiles(pkg).some((file) =>
        importedPackages(file).some(
          (specifier) => packageOf(specifier) === "valibot",
        ),
      );
      const declaresValibot = allDependencies(pkg).includes("valibot");
      expect({ pkg: pkg.relPath, declaresValibot }).toEqual({
        pkg: pkg.relPath,
        declaresValibot: importsValibot,
      });
    }
  });
});

describe("recorded Flue constraints hold by construction (spec §10)", () => {
  const dev = PACKAGES.find((pkg) => pkg.relPath === "apps/brunch-agent")!;
  // Statement-anchored detection (see workspace.ts): a comment mentioning the
  // directive is not an agent module, but a *misplaced* directive still is —
  // so the first-statement test below sees it and goes red.
  const devAgentModules = agentModules(dev);

  test("the dev app has at least one agent module", () => {
    expect(devAgentModules.length).toBeGreaterThan(0);
  });

  test("'use agent' is the module's first statement", () => {
    // The build does NOT catch this: a misplaced directive builds green and
    // the module simply stops being an agent. Nothing else would notice until
    // a conversation failed to start.
    for (const file of devAgentModules) {
      // Comments are not statements, so a leading doc block is legal and must
      // not read as a violation.
      const withoutLeadingComments = file.text
        .replace(/^﻿/, "")
        .replace(/^(?:\s*(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/))*\s*/, "");
      // Judged by the same pattern that detects the directive at all
      // (workspace.ts), so every form the lexicon declares legal — either
      // quote style, optional semicolon, trailing comment — passes and only
      // placement can fail. The old literal comparison spuriously failed
      // forms this suite's own fixtures assert are legal.
      const firstStatement = withoutLeadingComments.split("\n")[0] ?? "";
      expect({
        file: file.relPath,
        firstStatementIsDirective:
          AGENT_DIRECTIVE_STATEMENT.test(firstStatement),
      }).toEqual({ file: file.relPath, firstStatementIsDirective: true });
    }
  });

  test("agentName is a pinned string literal", () => {
    // Conversation storage keys on it, so a computed value is unsupportable
    // and a changed value orphans every existing conversation. Extraction
    // goes through the shared pinnedIdentities pattern — a third hand-copied
    // regex here could silently disagree with the other suites on what
    // counts as an identity — and this test adds the shape constraint.
    for (const file of devAgentModules) {
      const identities = pinnedIdentities(file);
      expect({ file: file.relPath, pinned: identities.length > 0 }).toEqual({
        file: file.relPath,
        pinned: true,
      });
      for (const identity of identities) {
        expect(identity).toMatch(/^[a-z][a-z0-9-]*$/);
      }
    }
  });

  test("a pinned identity appears only in its own agent module", () => {
    // The mount path (and anything else naming the agent) must derive from
    // `agentName`, not copy it: a duplicated literal is the seam the FE-1361
    // review verified — a copy-pasted second agent shadows the mount while
    // every test stays green, because nothing ties the copies together.
    const identities = devAgentModules.flatMap((file) =>
      pinnedIdentities(file).map((identity) => ({
        identity,
        pinnedIn: file.relPath,
      })),
    );
    expect(identities.length).toBeGreaterThan(0);
    // Quoted occurrences only: prose in a comment may *name* the agent without
    // duplicating its identity into anything the runtime reads — flagging that
    // would be the cry-wolf failure this ticket removed from the directive
    // check. A string literal carrying the identity anywhere else is real
    // duplication, including inside a longer path like '/agents/…'.
    const STRING_LITERAL = /(['"`])(?:\\.|(?!\1)[^\\\n])*\1/g;
    for (const { identity, pinnedIn } of identities) {
      const duplicatedIn = sourceFiles(dev)
        .filter((file) => file.relPath !== pinnedIn)
        .filter((file) =>
          (file.text.match(STRING_LITERAL) ?? []).some((literal) =>
            literal.includes(identity),
          ),
        )
        .map((file) => file.relPath);
      expect({ identity, duplicatedIn }).toEqual({
        identity,
        duplicatedIn: [],
      });
    }
  });

  test("vite is pinned to 8, which @flue/vite requires", () => {
    const pinned = PACKAGES.flatMap((pkg) => {
      const range =
        pkg.manifest.devDependencies?.vite ?? pkg.manifest.dependencies?.vite;
      return range ? [range] : [];
    });
    expect(pinned.length).toBeGreaterThan(0);
    for (const range of pinned) expect(range).toMatch(/^\^?8(\.|$)/);
  });

  test("the dev app owns the agent module, the mount, and the conversation store", () => {
    // Every host authors its own thin `'use agent'` module, `app.ts` and
    // `db.ts` — Flue's build-time scan makes shipping a pre-registered agent
    // from a library structurally unavailable (spec §12.1).
    for (const file of ["src/app.ts", "src/db.ts"]) {
      expect(() => readFileSync(join(dev.path, file), "utf8")).not.toThrow();
    }
  });

  test("runtime entrypoints never select Flue's Bun adapter", () => {
    for (const pkg of PACKAGES) {
      for (const file of [...sourceFiles(pkg), ...testFiles(pkg)]) {
        expect(importedPackages(file)).not.toContain("@flue/runtime/bun");
      }
    }
  });
});

describe("core auxiliary subpaths stay in their assigned lanes (spec §12.2)", () => {
  test("core exposes browser contracts, prompts, storage support and testing as explicit subpaths", () => {
    const core = PACKAGES.find((pkg) => pkg.name === CORE)!;
    expect(Object.keys(core.manifest.exports ?? {})).toEqual([
      ".",
      "./client-tools",
      "./prompts",
      "./storage",
      "./testing",
    ]);
    expect(core.manifest.exports?.["./prompts"]).toEqual({
      types: "./src/prompts.ts",
      import: "./dist/prompts.js",
    });

    const rootEntry = readFileSync(join(core.path, "src/index.ts"), "utf8");
    expect(rootEntry).not.toMatch(/\bfrom\s+["']\.\/prompts["']/u);
  });

  test("no package source imports core/testing", () => {
    // Fixtures, arbitraries and the replay driver belong to tests; production
    // bundles stay clean.
    for (const pkg of PACKAGES) {
      for (const file of sourceFiles(pkg)) {
        expect(importedPackages(file)).not.toContain(`${CORE}/testing`);
      }
    }
  });

  test("only bindings import core/storage", () => {
    for (const pkg of PACKAGES.filter(
      (candidate) => !candidate.dir.startsWith("binding-"),
    )) {
      for (const file of sourceFiles(pkg)) {
        expect(importedPackages(file)).not.toContain(`${CORE}/storage`);
      }
    }
  });
});

describe("the HASH smoke is runnable without a model key or a network (spec §12.5)", () => {
  test("every Brunch workspace exposes HASH lint, typecheck, and unit-test tasks", () => {
    for (const pkg of PACKAGES) {
      expect(typeof pkg.manifest.scripts?.["lint:eslint"]).toBe("string");
      expect(typeof pkg.manifest.scripts?.["lint:tsc"]).toBe("string");
      expect(pkg.manifest.scripts?.["test:unit"]).toContain("vitest run");
    }
  });

  /** Every Brunch test file Turbo can reach through the workspace tasks. */
  const suite = PACKAGES.flatMap((pkg) => testFiles(pkg));

  /**
   * The test files permitted to import a substrate package, each reviewed once
   * and recorded here with what makes it hermetic.
   *
   * Declared data, not a claim a file makes about itself. The previous gate
   * admitted any `*.integration.ts` containing the string
   * `hermetic-substrate-test: faux-provider`, so any new file granted itself
   * substrate access by copying a comment — the FE-1389 deep read's finding. A
   * path enters here by review only.
   */
  const SUBSTRATE_INTEGRATION_ENTRY_POINTS: Readonly<Record<string, string>> = {
    "apps/brunch-agent/test/flue-transcript.test.ts":
      "Types Flue's public conversation snapshot so the transcript projector can be unit-tested; the import is type-only — no provider key, no socket, no model call, no runtime boot.",
    "apps/brunch-agent/test/flue-ui-stream.test.ts":
      "Types Flue conversation-stream chunks so the AI SDK projector can be unit-tested; the import is type-only — no provider key, no socket, no model call, no runtime boot.",
    "apps/brunch-agent/test/petrinaut-chat.integration.ts":
      "Boots the plain Flue chat agent on Flue's node runtime with pi-ai's faux provider, drives the committed /api/chat door over app.fetch, and proves streamed reasoning/text, one server tool, one stub skill activation, one read-only client-tool resume, GET history ownership, SQLite restart, and harness-side idempotent apply-sweep into a capture store keyed by Flue conversation identity — no provider key, no socket, no extraction model call. Run as a child process by petrinaut-chat.test.ts.",
    "apps/brunch-agent/test/turn-timing.test.ts":
      "Types recorded Flue observations and model requests so the condition-5 purpose splitter can be unit-tested; the import is type-only — no provider key, no socket, no model call, no runtime boot.",
  };

  test("no test file carries a live model credential", () => {
    // The spec names an optional secret-gated real-model `flue run` smoke; it
    // is deliberately not part of this run, and this is what stops it drifting
    // in unnoticed.
    expect(suite.length).toBeGreaterThan(0);
    // Composed in workspace.ts rather than written literally, so this check
    // does not flag its own source or the pattern's.
    const modelKey = new RegExp(MODEL_KEY_NAME, "g");
    for (const file of suite) {
      expect({
        file: file.relPath,
        keys: file.text.match(modelKey) ?? [],
      }).toEqual({
        file: file.relPath,
        keys: [],
      });
    }
  });

  test("the substrate is imported by exactly the reviewed entry points", () => {
    // Set equality in both directions. An unlisted importer is substrate
    // access nobody reviewed; a listed file that no longer imports the
    // substrate is a permission standing for nothing, which is how an
    // inventory stops describing the tree it governs.
    const importers = suite
      .filter((file) =>
        importedPackages(file).some((s) => isSubstrate(packageOf(s))),
      )
      .map((file) => file.relPath)
      .sort();
    expect(importers).toEqual(
      Object.keys(SUBSTRATE_INTEGRATION_ENTRY_POINTS).sort(),
    );
  });

  test("every reviewed entry point records what makes it hermetic", () => {
    for (const [path, review] of Object.entries(
      SUBSTRATE_INTEGRATION_ENTRY_POINTS,
    )) {
      expect({ path, reviewed: review.trim().length > 0 }).toEqual({
        path,
        reviewed: true,
      });
    }
  });
});
