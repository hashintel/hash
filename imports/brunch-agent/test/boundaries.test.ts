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

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AGENT_DIRECTIVE_STATEMENT,
  agentModules,
  allDependencies,
  filesIn,
  importedPackages,
  MODEL_KEY_NAME,
  packageOf,
  pinnedIdentities,
  REPO_ROOT,
  sourceFiles,
  testFiles,
  workspacePackages,
  type WorkspacePackage,
} from './workspace.ts';

const PACKAGES = workspacePackages();

const CORE = '@brunch/core';
/** Any substrate package. The harness may never name one; a binding must. */
const SUBSTRATE_SCOPES = ['@flue/', '@earendil-works/'];

const isSubstrate = (name: string): boolean =>
  SUBSTRATE_SCOPES.some((scope) => name.startsWith(scope));
const byRole = (role: string): WorkspacePackage[] =>
  PACKAGES.filter((pkg) => pkg.dir.startsWith(`${role}-`));

test('every workspace package is one the spec topology names', () => {
  // Derived from the spec's own §12.2 topology block instead of a second
  // hand-written list here. The spec names *intended* structure — some
  // entries are not scaffolded yet — so the direction checked is disk ⊆
  // spec: a package the spec does not name is loud, while an
  // intended-but-unbuilt one is not a failure. (The old hardcoded equality
  // would have failed the next legitimate package instead of governing it.)
  const spec = readFileSync(join(REPO_ROOT, 'docs/planning/elicitation-kernel/spec.md'), 'utf8');
  const topology = /### 12\.2[^\n]*\n[\s\S]*?```\n([\s\S]*?)```/.exec(spec)?.[1];
  expect(topology).toBeDefined();
  const named = new Set(
    [...topology!.matchAll(/^((?:packages|apps)\/[\w-]+)(?=\s|$)/gm)].map((match) => match[1]!),
  );
  expect(named.size).toBeGreaterThan(0);
  for (const pkg of PACKAGES) {
    expect({ pkg: pkg.relPath, inSpec: named.has(pkg.relPath) }).toEqual({
      pkg: pkg.relPath,
      inSpec: true,
    });
  }
});

test('every package is actually scanned', () => {
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

describe('role prefixes name what a package is architecturally (spec §12.2)', () => {
  test('every package under packages/ is core or carries a role prefix', () => {
    for (const pkg of PACKAGES.filter((p) => p.kind === 'package')) {
      expect(pkg.dir).toMatch(/^(core|plugin-[a-z0-9-]+|binding-[a-z0-9-]+)$/);
    }
  });

  test('no package uses an avoided role noun', () => {
    // The glossary's own noun is `binding`; `adapter-*` and `wrapper-*` are
    // avoided terms, and `elicit-*` names function rather than identity.
    for (const pkg of PACKAGES) {
      expect(pkg.dir).not.toMatch(/^(adapter|wrapper|elicit)-/);
    }
  });

  test('the manifest name matches the role-prefixed directory', () => {
    for (const pkg of PACKAGES) {
      expect(pkg.name).toBe(`@brunch/${pkg.dir}`);
    }
  });
});

describe('dependency direction (spec §4, §12.2)', () => {
  test('the harness imports no substrate', () => {
    const core = PACKAGES.find((pkg) => pkg.name === CORE);
    expect(core).toBeDefined();
    expect(allDependencies(core!).filter(isSubstrate)).toEqual([]);
    for (const file of sourceFiles(core!)) {
      const substrateImports = importedPackages(file).filter((s) => isSubstrate(packageOf(s)));
      expect({ file: file.relPath, substrateImports }).toEqual({
        file: file.relPath,
        substrateImports: [],
      });
    }
  });

  test('the harness depends on no binding and no plugin', () => {
    const core = PACKAGES.find((pkg) => pkg.name === CORE)!;
    for (const dependency of allDependencies(core)) {
      expect(dependency).not.toMatch(/^@brunch\/(binding|plugin)-/);
    }
  });

  test('plugins resolve core only — never the binding, never Flue', () => {
    const plugins = byRole('plugin');
    expect(plugins.length).toBeGreaterThan(0);
    for (const plugin of plugins) {
      const workspaceDeps = allDependencies(plugin).filter((d) => d.startsWith('@brunch/'));
      expect(workspaceDeps).toEqual([CORE]);
      expect(allDependencies(plugin).filter(isSubstrate)).toEqual([]);

      for (const file of sourceFiles(plugin)) {
        for (const specifier of importedPackages(file)) {
          const pkg = packageOf(specifier);
          expect(isSubstrate(pkg)).toBe(false);
          if (pkg.startsWith('@brunch/')) expect(pkg).toBe(CORE);
          expect(specifier).not.toBe(`${CORE}/storage`);
        }
      }
    }
  });

  test('a binding imports both', () => {
    const bindings = byRole('binding');
    expect(bindings.length).toBeGreaterThan(0);
    for (const binding of bindings) {
      const deps = allDependencies(binding);
      expect(deps).toContain(CORE);
      expect(deps.some(isSubstrate)).toBe(true);
    }
  });

  test('bindings depend on no plugin — the harness discovers plugins, not the substrate', () => {
    for (const binding of byRole('binding')) {
      for (const dependency of allDependencies(binding)) {
        expect(dependency).not.toMatch(/^@brunch\/plugin-/);
      }
    }
  });
});

describe('the direction is physical, not merely declared', () => {
  // Bun's isolated linker gives each package only what it declares, so a
  // forbidden import cannot even resolve. This asserts that property holds
  // rather than assuming it — a hoisted node_modules would quietly restore
  // every forbidden path.
  /**
   * Whether `specifier` resolves from `pkg`'s directory.
   *
   * Only a module-not-found result answers "no". Every other resolver failure
   * is rethrown, because `false` is the answer these tests assert: the broad
   * `catch` this replaces turned any error at all — including one raised
   * before the resolver reached the question — into a satisfied dependency ban.
   *
   * Bun raises `ResolveMessage`, which is not an `Error` subclass, so the
   * `instanceof Error` shape the capture store's ENOENT guard uses would
   * rethrow every failure here, not only the unexpected ones. And Bun reports
   * a corrupt manifest and an unexported subpath with the same code as a
   * missing package, so `false` means "the resolver cannot get there" rather
   * than "nothing is installed" — which is why each test below also probes a
   * specifier that must resolve.
   */
  const resolvesFrom = (pkg: WorkspacePackage, specifier: string): boolean => {
    try {
      Bun.resolveSync(specifier, pkg.path);
      return true;
    } catch (error) {
      if (error instanceof ResolveMessage && error.code === 'ERR_MODULE_NOT_FOUND') return false;
      throw error;
    }
  };

  // Probed with the substrate packages the bindings actually declare, and
  // with every binding by name — derived from the tree, so a new substrate
  // dependency or a second binding is probed without opting in.
  const substratePackages = [
    ...new Set(byRole('binding').flatMap((b) => allDependencies(b).filter(isSubstrate))),
  ];

  test('a plugin cannot resolve the substrate or a binding', () => {
    expect(substratePackages.length).toBeGreaterThan(0);
    for (const plugin of byRole('plugin')) {
      for (const specifier of substratePackages) {
        expect({
          plugin: plugin.dir,
          specifier,
          resolves: resolvesFrom(plugin, specifier),
        }).toEqual({ plugin: plugin.dir, specifier, resolves: false });
      }
      for (const binding of byRole('binding')) {
        expect(resolvesFrom(plugin, binding.name)).toBe(false);
      }
      expect(resolvesFrom(plugin, CORE)).toBe(true);
    }
  });

  test('core cannot resolve the substrate', () => {
    const core = PACKAGES.find((pkg) => pkg.name === CORE)!;
    for (const specifier of substratePackages) {
      expect({ specifier, resolves: resolvesFrom(core, specifier) }).toEqual({
        specifier,
        resolves: false,
      });
    }
    // Positive control, derived from core's own manifest: the linker must
    // supply everything core declares. Without it, a probe that resolves
    // nothing at all from this directory reads as a satisfied ban.
    const declared = allDependencies(core);
    expect(declared.length).toBeGreaterThan(0);
    for (const specifier of declared) {
      expect({ specifier, resolves: resolvesFrom(core, specifier) }).toEqual({
        specifier,
        resolves: true,
      });
    }
  });
});

describe('Valibot is the schema library at every boundary (spec §12.4)', () => {
  // Flue locks Valibot at every boundary. A Standard-Schema waist would buy
  // comfort at the cost of a conversion seam that can silently drop
  // constraints — the silent-coercion smell.
  const OTHER_SCHEMA_LIBRARIES = [
    'zod',
    'yup',
    'joi',
    'ajv',
    'superstruct',
    'arktype',
    'io-ts',
    'runtypes',
    '@sinclair/typebox',
    '@standard-schema/spec',
    '@standard-schema/utils',
  ];

  test('no package declares another schema library', () => {
    for (const pkg of PACKAGES) {
      for (const forbidden of OTHER_SCHEMA_LIBRARIES) {
        expect(allDependencies(pkg)).not.toContain(forbidden);
      }
    }
  });

  test('no source file imports another schema library', () => {
    for (const pkg of PACKAGES) {
      for (const file of sourceFiles(pkg)) {
        for (const specifier of importedPackages(file)) {
          expect(OTHER_SCHEMA_LIBRARIES).not.toContain(packageOf(specifier));
        }
      }
    }
  });

  test('every package that validates anything declares valibot', () => {
    for (const pkg of PACKAGES) {
      const usesValibot = sourceFiles(pkg).some((file) =>
        importedPackages(file).some((specifier) => packageOf(specifier) === 'valibot'),
      );
      if (usesValibot) expect(allDependencies(pkg)).toContain('valibot');
    }
  });
});

describe('recorded Flue constraints hold by construction (spec §10)', () => {
  const dev = PACKAGES.find((pkg) => pkg.relPath === 'apps/dev')!;
  // Statement-anchored detection (see workspace.ts): a comment mentioning the
  // directive is not an agent module, but a *misplaced* directive still is —
  // so the first-statement test below sees it and goes red.
  const devAgentModules = agentModules(dev);

  test('the dev app has at least one agent module', () => {
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
        .replace(/^﻿/, '')
        .replace(/^(?:\s*(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/))*\s*/, '');
      // Judged by the same pattern that detects the directive at all
      // (workspace.ts), so every form the lexicon declares legal — either
      // quote style, optional semicolon, trailing comment — passes and only
      // placement can fail. The old literal comparison spuriously failed
      // forms this suite's own fixtures assert are legal.
      const firstStatement = withoutLeadingComments.split('\n')[0] ?? '';
      expect({
        file: file.relPath,
        firstStatementIsDirective: AGENT_DIRECTIVE_STATEMENT.test(firstStatement),
      }).toEqual({ file: file.relPath, firstStatementIsDirective: true });
    }
  });

  test('agentName is a pinned string literal', () => {
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

  test('a pinned identity appears only in its own agent module', () => {
    // The mount path (and anything else naming the agent) must derive from
    // `agentName`, not copy it: a duplicated literal is the seam the FE-1361
    // review verified — a copy-pasted second agent shadows the mount while
    // every test stays green, because nothing ties the copies together.
    const identities = devAgentModules.flatMap((file) =>
      pinnedIdentities(file).map((identity) => ({ identity, pinnedIn: file.relPath })),
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
          (file.text.match(STRING_LITERAL) ?? []).some((literal) => literal.includes(identity)),
        )
        .map((file) => file.relPath);
      expect({ identity, duplicatedIn }).toEqual({ identity, duplicatedIn: [] });
    }
  });

  test('vite is pinned to ^8, which @flue/vite requires', () => {
    const pinned = PACKAGES.flatMap((pkg) => {
      const range = pkg.manifest.devDependencies?.vite ?? pkg.manifest.dependencies?.vite;
      return range ? [range] : [];
    });
    expect(pinned.length).toBeGreaterThan(0);
    for (const range of pinned) expect(range).toMatch(/^\^8(\.|$)/);
  });

  test('the dev app owns the agent module, the mount, and the conversation store', () => {
    // Every host authors its own thin `'use agent'` module, `app.ts` and
    // `db.ts` — Flue's build-time scan makes shipping a pre-registered agent
    // from a library structurally unavailable (spec §12.1).
    for (const file of ['src/app.ts', 'src/db.ts']) {
      expect(() => readFileSync(join(dev.path, file), 'utf8')).not.toThrow();
    }
  });
});

describe('core auxiliary subpaths stay in their assigned lanes (spec §12.2)', () => {
  test('core exposes binding storage support and testing as explicit subpaths', () => {
    const core = PACKAGES.find((pkg) => pkg.name === CORE)!;
    expect(Object.keys(core.manifest.exports ?? {})).toEqual(['.', './storage', './testing']);
  });

  test('no package source imports core/testing', () => {
    // Fixtures, arbitraries and the replay driver belong to tests; production
    // bundles stay clean.
    for (const pkg of PACKAGES) {
      for (const file of sourceFiles(pkg)) {
        expect(importedPackages(file)).not.toContain(`${CORE}/testing`);
      }
    }
  });

  test('only bindings import core/storage', () => {
    for (const pkg of PACKAGES.filter((candidate) => !candidate.dir.startsWith('binding-'))) {
      for (const file of sourceFiles(pkg)) {
        expect(importedPackages(file)).not.toContain(`${CORE}/storage`);
      }
    }
  });
});

describe('the CI smoke is runnable without a model key or a network (spec §12.5)', () => {
  // Parsed rather than substring-matched: a commented-out step vanishes at
  // parse time, and a step disabled with `if: false` is visibly not a gate.
  // Raw-text `includes()` was satisfied by both — a disabled gate read as
  // present, which is this suite's own silent-pass failure mode.
  const workflow = Bun.YAML.parse(
    readFileSync(join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8'),
  ) as { jobs?: Record<string, { steps?: Array<{ run?: string; if?: unknown }> }> };
  const disabled = new Set<unknown>([false, 'false', '${{ false }}']);
  // Split per line, because a multi-line `run:` block declares several
  // commands and only whole lines are commands.
  const activeRunCommands = Object.values(workflow.jobs ?? {})
    .flatMap((job) => job.steps ?? [])
    .filter((step) => !disabled.has(step.if))
    .flatMap((step) => (step.run ?? '').split('\n'))
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  test('CI runs every gate as its exact declared command', () => {
    // Asserted against the workflow rather than against a convenience script,
    // because the workflow is what actually gates a merge. The build gate is
    // deliberately absent from this list: `bun test` builds the app itself
    // (build-artifact's beforeAll), so a separate build step would run the
    // build twice per CI run for no additional coverage.
    //
    // Exact equality, not `includes`: a substring accepted commands that are
    // not the gate. `bun test test/boundaries.test.ts` contains `bun test`
    // while running one file, and `bun run typecheck:fast` contains
    // `typecheck` while checking whatever that script happens to check — both
    // would have read as a merge gate that no longer exists.
    for (const gate of [
      'bun run lint:check',
      'bun run fmt:check',
      'bun run typecheck',
      'bun test',
    ]) {
      expect({ gate, declaredInWorkflow: activeRunCommands.includes(gate) }).toEqual({
        gate,
        declaredInWorkflow: true,
      });
    }
  });

  test('the lint gate fails on warnings', () => {
    // oxlint reports its default rules at warning severity and exits 0 for
    // them, so a bare `oxlint .` is a step that cannot go red.
    const rootManifest = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    expect(rootManifest.scripts?.['lint:check']).toContain('--deny-warnings');
  });

  /** Every file the suite runs: package tests at any depth, plus the root ones. */
  const suite = [...PACKAGES.flatMap((pkg) => testFiles(pkg)), ...filesIn(join(REPO_ROOT, 'test'))];

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
    'apps/dev/test/walking-skeleton.integration.ts':
      "Boots the dev app on Flue's node runtime with pi-ai's faux provider and drives it over app.fetch — no provider key, no socket, no model call. Run as a child process by walking-skeleton.test.ts, which is what makes the node runtime drivable from this suite at all.",
  };

  test('no test file carries a live model credential', () => {
    // The spec names an optional secret-gated real-model `flue run` smoke; it
    // is deliberately not part of this run, and this is what stops it drifting
    // in unnoticed.
    expect(suite.length).toBeGreaterThan(0);
    // Composed in workspace.ts rather than written literally, so this check
    // does not flag its own source or the pattern's.
    const modelKey = new RegExp(MODEL_KEY_NAME, 'g');
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

  test('the substrate is imported by exactly the reviewed entry points', () => {
    // Set equality in both directions. An unlisted importer is substrate
    // access nobody reviewed; a listed file that no longer imports the
    // substrate is a permission standing for nothing, which is how an
    // inventory stops describing the tree it governs.
    const importers = suite
      .filter((file) => importedPackages(file).some((s) => isSubstrate(packageOf(s))))
      .map((file) => file.relPath)
      .sort();
    expect(importers).toEqual(Object.keys(SUBSTRATE_INTEGRATION_ENTRY_POINTS).sort());
  });

  test('every reviewed entry point records what makes it hermetic', () => {
    for (const [path, review] of Object.entries(SUBSTRATE_INTEGRATION_ENTRY_POINTS)) {
      expect({ path, reviewed: review.trim().length > 0 }).toEqual({ path, reviewed: true });
    }
  });
});
