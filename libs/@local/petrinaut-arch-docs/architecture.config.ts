/**
 * What the architecture bundle covers, and what it forbids.
 *
 * This file holds only things that genuinely cannot be read from the code:
 * which packages participate, what to skip, and the layer-crossing rules. The
 * layer taxonomy itself deliberately lives *in* the packages, as README
 * frontmatter and `@layerRoot` annotations — that is the whole point of the
 * exercise. Resist the temptation to add a path→layer mapping here.
 */

import { resolveSourceUrlPrefix } from "./src/source-url";

import type { ArchitecturePackageInput } from "./src/model";

export interface LayerRule {
  /** Layer id or ancestor prefix the rule applies to. */
  from: string;
  /** Layer id or ancestor prefix that must not be reached. */
  to: string;
  reason: string;
}

export interface ArchitectureConfig {
  packages: ArchitecturePackageInput[];
  rules: LayerRule[];
  ignoredDirectories: string[];
  ignoredFilePattern: RegExp;
  /** Where the generated bundle is written, repo-relative. */
  outputDirectory: string;
  /** Where hand-written MDX is read from, repo-relative. */
  contentDirectory: string;
  /** Base URL for source links in generated pages, including the git ref. */
  sourceUrlPrefix: string;
}

export const config: ArchitectureConfig = {
  packages: [
    {
      name: "@hashintel/petrinaut-core",
      path: "libs/@hashintel/petrinaut-core",
      description:
        "Headless SDCPN engine: document model, HIR compiler, simulation runtimes, LSP. No React, no DOM.",
      language: "typescript",
    },
    {
      name: "@hashintel/petrinaut",
      path: "libs/@hashintel/petrinaut",
      description:
        "React editor built on the headless core: providers, canvas, panels, Monaco integration.",
      language: "typescript",
    },
    {
      name: "@hashintel/petrinaut-cli",
      path: "libs/@hashintel/petrinaut-cli",
      description:
        "JSON-lines CLI serving one compiled model per process: run requests and optimization studies over stdio or a Unix socket. No HTTP, no React.",
      language: "typescript",
    },
    {
      name: "@local/petrinaut-python",
      path: "libs/@local/petrinaut-python",
      description:
        "Python bindings for the CLI's JSON-lines protocol: sessions, run requests, optimization studies. POSIX-only; pydantic validates protocol responses.",
      language: "python",
    },
    {
      name: "@apps/petrinaut-opt",
      path: "apps/petrinaut-opt",
      description:
        "Python optimizer service: detached Optuna studies over the CLI, replayable SSE event streams, admission control.",
      language: "python",
    },
  ],

  /**
   * Each rule is a claim the drift check enforces against the real import
   * graph, so adding one here without fixing the code fails CI. A rule matches
   * an edge when the edge's endpoints are the named layer or a descendant of it.
   */
  rules: [
    {
      from: "core",
      to: "react",
      reason:
        "the headless core is published without React and must stay usable from Node and workers",
    },
    {
      from: "core",
      to: "ui",
      reason: "the headless core must not reach into editor components",
    },
    {
      from: "core",
      to: "petrinaut",
      reason:
        "the core is the lower package of the pair and cannot depend on its consumer",
    },
    {
      from: "react",
      to: "ui",
      reason:
        "state providers must not depend on the components that render them, so the React layer stays testable without mounting the editor",
    },
    {
      from: "ui.worksheet",
      to: "ui.adhoc-form",
      reason:
        "the worksheet keyboard flow is generic: it must never know the form state it navigates",
    },
    {
      from: "core",
      to: "cli",
      reason:
        "the engine must not depend on its packaging: the CLI is one consumer of the core, never the reverse",
    },
  ],

  ignoredDirectories: [
    "node_modules",
    "dist",
    "__fixtures__",
    "__snapshots__",
    "docs",
    "__pycache__",
    ".venv",
  ],

  /**
   * Tests, stories and ambient declarations are excluded: they describe the
   * architecture's *use*, not its shape, and including them inflates every
   * layer's file count with fixtures.
   */
  ignoredFilePattern:
    /(?:\.(?:test|spec|stories)\.[cm]?[jt]sx?$|\.d\.ts$|\/CHANGELOG\.md$|\/LICENSE[^/]*\.md$)/u,

  /**
   * The bundle is the product; the Starlight site in `apps/petrinaut-docs` and
   * hash.dev are both just consumers of it. It therefore lives with the
   * generator that owns its schema, not inside either renderer.
   */
  outputDirectory: "libs/@local/petrinaut-arch-docs/bundle",
  contentDirectory: "libs/@local/petrinaut-arch-docs/content",
  /**
   * Resolved from the build environment rather than pinned to `main`, so a
   * preview deployment links to the commit it was built from. See
   * `src/source-url.ts` for the variables and their precedence.
   */
  sourceUrlPrefix: resolveSourceUrlPrefix(process.env),
};
