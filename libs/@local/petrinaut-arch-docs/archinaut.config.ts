/**
 * The Petrinaut instance of archinaut. Packages, rules and ignore patterns are
 * the ones `architecture.config.ts` already holds, so the two generators read
 * one list while they coexist.
 */

import { fileURLToPath } from "node:url";

import { defineConfig, resolveSourceUrlPrefix } from "@local/archinaut";

import { config } from "./architecture.config";

export default defineConfig({
  root: fileURLToPath(new URL("../../../", import.meta.url)),
  packages: config.packages,
  rules: config.rules,
  ignoredDirectories: config.ignoredDirectories,
  ignoredFilePattern: config.ignoredFilePattern,
  contentDirectory: "libs/@local/petrinaut-arch-docs/content",
  outputDirectory: "libs/@local/petrinaut-arch-docs/bundle",
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
    logo: "libs/@local/petrinaut-arch-docs/assets/petrinaut-helmet.png",
    favicon: "libs/@local/petrinaut-arch-docs/assets/favicon.ico",
  },
});
