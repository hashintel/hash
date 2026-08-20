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
  agentModules,
  allDependencies,
  filesIn,
  importedPackages,
  packageOf,
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

test('the workspace has the packages the spec topology names', () => {
  const dirs = PACKAGES.map((pkg) => pkg.relPath).sort();
  expect(dirs).toEqual([
    'apps/dev',
    'packages/binding-flue',
    'packages/core',
    'packages/plugin-gherkin',
  ]);
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
  const resolvesFrom = (pkg: WorkspacePackage, specifier: string): boolean => {
    try {
      Bun.resolveSync(specifier, pkg.path);
      return true;
    } catch {
      return false;
    }
  };

  test('a plugin cannot resolve the substrate or the binding', () => {
    for (const plugin of byRole('plugin')) {
      expect(resolvesFrom(plugin, '@flue/runtime')).toBe(false);
      expect(resolvesFrom(plugin, '@brunch/binding-flue')).toBe(false);
      expect(resolvesFrom(plugin, CORE)).toBe(true);
    }
  });

  test('core cannot resolve the substrate', () => {
    const core = PACKAGES.find((pkg) => pkg.name === CORE)!;
    expect(resolvesFrom(core, '@flue/runtime')).toBe(false);
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
      const firstStatement = withoutLeadingComments.split('\n')[0]?.trim();
      expect(`${file.relPath}: ${firstStatement}`).toBe(`${file.relPath}: 'use agent';`);
    }
  });

  test('agentName is a pinned string literal', () => {
    // Conversation storage keys on it, so a computed value is unsupportable
    // and a changed value orphans every existing conversation.
    for (const file of devAgentModules) {
      expect(file.text).toMatch(/^\s*\w+\.agentName\s*=\s*'[a-z][a-z0-9-]*';\s*$/m);
    }
  });

  test('a pinned identity appears only in its own agent module', () => {
    // The mount path (and anything else naming the agent) must derive from
    // `agentName`, not copy it: a duplicated literal is the seam the FE-1361
    // review verified — a copy-pasted second agent shadows the mount while
    // every test stays green, because nothing ties the copies together.
    const identities = devAgentModules.flatMap((file) =>
      [...file.text.matchAll(/\w+\.agentName\s*=\s*'([^']+)'/g)].map((match) => ({
        identity: match[1]!,
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

describe('the testing subpath stays off production paths (spec §12.2)', () => {
  test('core exposes testing as a subpath export', () => {
    const core = PACKAGES.find((pkg) => pkg.name === CORE)!;
    expect(Object.keys(core.manifest.exports ?? {})).toEqual(['.', './testing']);
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
});

describe('the CI smoke is runnable without a model key or a network (spec §12.5)', () => {
  const workflow = readFileSync(join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8');

  test('CI runs every gate', () => {
    // Asserted against the workflow rather than against a convenience script,
    // because the workflow is what actually gates a merge.
    for (const gate of ['lint:check', 'fmt:check', 'typecheck', 'bun test', 'bun run build']) {
      expect({ gate, inWorkflow: workflow.includes(gate) }).toEqual({ gate, inWorkflow: true });
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

  test('no test names a model key or reaches for the substrate', () => {
    // Keeps the suite hermetic by construction. The spec names an optional
    // secret-gated real-model `flue run` smoke; it is deliberately not part of
    // this run, and this check is what stops it drifting in unnoticed.
    const suite = [
      ...PACKAGES.flatMap((pkg) => testFiles(pkg)),
      ...filesIn(join(REPO_ROOT, 'test')),
    ];
    expect(suite.length).toBeGreaterThan(0);
    // Composed rather than written literally, so this check does not flag its
    // own source.
    const modelKey = new RegExp(`[A-Z_]*${'API'}_${'KEY'}`, 'g');
    for (const file of suite) {
      expect({
        file: file.relPath,
        keys: file.text.match(modelKey) ?? [],
      }).toEqual({
        file: file.relPath,
        keys: [],
      });
      const substrateImports = importedPackages(file).filter((s) => isSubstrate(packageOf(s)));
      expect({ file: file.relPath, substrateImports }).toEqual({
        file: file.relPath,
        substrateImports: [],
      });
    }
  });
});
