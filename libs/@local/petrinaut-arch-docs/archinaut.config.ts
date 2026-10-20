/**
 * The Petrinaut instance of archinaut: which packages participate, what to
 * skip, the layer-crossing rules, the tag vocabulary, the external parties,
 * and where content and output live. The layer taxonomy itself lives in the
 * packages, as README frontmatter and `@layerRoot` annotations.
 */

import { fileURLToPath } from "node:url";

import { defineConfig, resolveSourceUrlPrefix } from "@local/archinaut";

export default defineConfig({
  root: fileURLToPath(new URL("../../../", import.meta.url)),
  packages: [
    {
      name: "@hashintel/petrinaut-core",
      path: "libs/@hashintel/petrinaut-core",
      description:
        "Headless SDCPN engine: document model, HIR compiler, simulation runtimes, LSP, and an in-browser optimization runtime (Optuna under Pyodide in a worker). No React, no DOM.",
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
      name: "petrinaut-optimizer-core",
      path: "libs/@local/petrinaut-optimizer-core/python",
      description:
        "Optuna study construction, suggestion and ask/tell loop for the in-browser optimizer, loaded into Pyodide by the browser worker. Pure Python; its tests run under CPython.",
      language: "python",
    },
    {
      name: "@apps/petrinaut-website",
      path: "apps/petrinaut-website",
      description:
        "Demo site and embed host: TanStack Router routes, published example models, and server functions for oEmbed discovery.",
      language: "typescript",
      // The whole app, not just `src`: the Vercel functions in `api/` are part
      // of the architecture, and they deploy separately from the SPA. The
      // `scripts` directory and root `*.config.ts` files are excluded by the
      // shared ignore rules, so this buys `api/` without the build tooling.
      sourceDirectory: ".",
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
      from: "react.experiments",
      to: "react.optimizations",
      reason:
        "the experiments backend evaluates trials through the channel and never learns who asked",
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
    // Build and codegen tooling, which a package scanned with
    // `sourceDirectory: "."` would otherwise pull into its root layer.
    "scripts",
  ],

  /**
   * Tests, stories, fixtures and ambient declarations are excluded: they
   * describe the architecture's *use*, not its shape, and including them
   * inflates every layer's file count with fixtures.
   */
  ignoredFilePattern:
    /(?:\.(?:test|spec|stories)\.[cm]?[jt]sx?$|\.fixtures\.[cm]?[jt]sx?$|\.d\.ts$|\.config\.[cm]?[jt]s$|\/CHANGELOG\.md$|\/LICENSE[^/]*\.md$)/u,

  /**
   * The bundle is the product; the Starlight site in `apps/petrinaut-docs` and
   * hash.dev are both just consumers of it. It therefore lives with the
   * generator that owns its schema, not inside either renderer.
   */
  contentDirectory: "libs/@local/petrinaut-arch-docs/content",
  outputDirectory: "libs/@local/petrinaut-arch-docs/bundle",
  cacheDirectory: "node_modules/.cache/archinaut",
  sourceUrlPrefix: resolveSourceUrlPrefix(process.env),
  site: {
    title: "Docs",
    description:
      "How the Petrinaut packages fit together — generated from annotations in the source.",
    url: "https://docs.petrinaut.org",
    logo: "libs/@local/petrinaut-arch-docs/assets/petrinaut-helmet.png",
    favicon: "libs/@local/petrinaut-arch-docs/assets/favicon.ico",
  },
});
