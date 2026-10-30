/**
 * The Petrinaut instance of archinaut: which packages participate, what to
 * skip, the layer-crossing rules, the tag vocabulary, the external parties,
 * and where content and output live. The layer taxonomy itself lives in the
 * packages, as README frontmatter and `@layerRoot` annotations.
 */

import { fileURLToPath } from "node:url";

import { defineConfig, resolveSourceUrlPrefix } from "@local/archinaut";

export default defineConfig({
  root: fileURLToPath(new URL("../../", import.meta.url)),
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
      name: "@hashintel/petrinaut-cli",
      path: "libs/@hashintel/petrinaut-cli",
      description:
        "JSON-lines CLI serving one compiled model per process: run requests and optimization studies over stdio or a Unix socket. No HTTP, no React.",
      language: "typescript",
    },
    {
      name: "petrinaut-python",
      path: "libs/@local/petrinaut-python",
      description:
        "Python bindings for the CLI's JSON-lines protocol: sessions, run requests, optimization studies. POSIX-only; pydantic validates protocol responses.",
      language: "python",
    },
    {
      name: "petrinaut-optimizer-core",
      path: "libs/@local/petrinaut-optimizer-core/python",
      description:
        "Optuna study construction, suggestion and ask/tell loop shared by the optimizer service and the browser worker. Pure Python; runs under CPython and Pyodide.",
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
    {
      name: "petrinaut-optimization",
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
    {
      from: "react.experiments",
      to: "react.optimizations",
      reason:
        "the experiments backend evaluates trials through the channel and never learns who asked",
    },
    {
      from: "cli",
      to: "core.optimization.browser",
      reason:
        "the CLI is driven by the service across the subprocess boundary, never by Pyodide",
    },
    {
      from: "optimizer-core",
      to: "optimizer",
      reason: "the study library runs under Pyodide and cannot see the service",
    },
    {
      from: "optimizer-core",
      to: "python-bindings",
      reason:
        "the core runs under Pyodide, where the bindings' subprocesses do not exist",
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
  contentDirectory: "apps/petrinaut-docs/content",
  outputDirectory: "apps/petrinaut-docs/bundle",
  cacheDirectory: "node_modules/.cache/archinaut",
  sourceUrlPrefix: resolveSourceUrlPrefix(process.env),
  tags: [
    {
      id: "simulation",
      description: "Stepping a net: engine, frames, runtimes.",
    },
    {
      id: "experiments",
      description:
        "Many runs with bounded memory: Monte Carlo, sweeps, backends.",
    },
    {
      id: "workers",
      description:
        "Code that runs in a Web Worker, and the factories that spawn it.",
    },
    {
      id: "protocols",
      description: "Every interface two parties speak across a boundary.",
    },
    {
      id: "embedding",
      description:
        "Putting the editor inside a host: the handle, routes, oEmbed.",
    },
    {
      id: "plugins",
      description: "Contributions into the editor chrome, and who makes them.",
    },
    {
      id: "optimization",
      description: "Optuna studies in the browser, the service, and the CLI.",
    },
    {
      id: "gpu",
      description: "The WebGPU experiment backend and its shader generation.",
    },
    {
      id: "language-server",
      description: "Diagnostics and completions for user code.",
    },
    {
      id: "commands",
      description: "Named commands and the palette that runs them.",
    },
    { id: "ai", description: "Assistant-driven flows." },
  ],
  externals: [
    {
      id: "external:host-apps",
      name: "Host applications",
      summary:
        "Applications that embed the editor over their own document store: the HASH frontend, TOPOS in CatCollab.",
      tags: ["embedding"],
      audience: ["integrator"],
      participates: [
        { interface: "iface:doc-handle", role: "implements" },
        { interface: "iface:command-registry", role: "consumes" },
      ],
    },
    {
      id: "external:automation-scripts",
      name: "Scripts and services",
      summary: "Anything that spawns the CLI and speaks JSON lines to it.",
      tags: ["protocols"],
      audience: ["integrator"],
      participates: [{ interface: "iface:cli-json-lines", role: "consumes" }],
    },
  ],
  site: {
    title: "Docs",
    description:
      "How the Petrinaut packages fit together — generated from annotations in the source.",
    url: "https://docs.petrinaut.org",
    logo: "apps/petrinaut-docs/assets/petrinaut-helmet.png",
    favicon: "apps/petrinaut-docs/assets/favicon.ico",
  },
});
