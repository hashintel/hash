import { spawnSync } from "node:child_process";
import { chmod, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { cruise } from "dependency-cruiser";
import extractTSConfig from "dependency-cruiser/config-utl/extract-ts-config";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const outputDirectory = fileURLToPath(
  new URL("../docs/architecture/", import.meta.url),
);
const tsconfigPath = fileURLToPath(
  new URL("../dependency-cruiser.tsconfig.json", import.meta.url),
);

const corePrefix = "libs/@hashintel/petrinaut-core/src/";
const petrinautPrefix = "libs/@hashintel/petrinaut/src/";
const coreSource = join(repoRoot, corePrefix);

const coreAliases = [
  ["@hashintel/petrinaut-core/examples", "examples/index.ts"],
  ["@hashintel/petrinaut-core/hir-runtime", "hir-runtime.ts"],
  ["@hashintel/petrinaut-core/hir", "hir.ts"],
  ["@hashintel/petrinaut-core/workers/lsp", "workers/lsp.ts"],
  ["@hashintel/petrinaut-core/workers/monte-carlo", "workers/monte-carlo.ts"],
  ["@hashintel/petrinaut-core/workers/simulation", "workers/simulation.ts"],
  ["@hashintel/petrinaut-core", "index.ts"],
].map(([name, path]) => ({
  alias: join(coreSource, path),
  name,
  onlyModule: true,
}));

const cruiseResult = await cruise(
  ["libs/@hashintel/petrinaut-core/src", "libs/@hashintel/petrinaut/src"],
  {
    baseDir: repoRoot,
    exclude:
      "(?:[.](?:test|stories)[.][cm]?[jt]sx?$|/(?:__fixtures__|__snapshots__)/)",
    includeOnly: "^libs/@hashintel/petrinaut(?:-core)?/src/",
    moduleSystems: ["es6"],
    tsPreCompilationDeps: true,
  },
  {
    alias: coreAliases,
    conditionNames: ["types", "import", "default"],
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
  },
  { tsConfig: extractTSConfig(tsconfigPath) },
);

if (typeof cruiseResult.output === "string") {
  throw new TypeError("dependency-cruiser returned formatted output");
}

/** @type {import("dependency-cruiser").ICruiseResult["modules"]} */
const modules = cruiseResult.output.modules;

/**
 * @param {string} source
 * @returns {string | null}
 */
function broadModule(source) {
  if (source.startsWith(corePrefix)) {
    const path = source.slice(corePrefix.length);
    const [directory, child] = path.split("/");

    if (directory === "hir" || directory.startsWith("hir")) {
      return "core / HIR compiler & runtime";
    }
    if (directory === "lsp" || path === "workers/lsp.ts") {
      return "core / LSP";
    }
    if (directory === "simulation" || directory === "workers") {
      if (child === "monte-carlo" || path === "workers/monte-carlo.ts") {
        return "core / Monte Carlo runtime";
      }
      if (
        ["runtime", "worker"].includes(child) ||
        path === "workers/simulation.ts"
      ) {
        return "core / simulation runtime & workers";
      }
      return "core / simulation engine";
    }
    if (
      [
        "actions.ts",
        "clipboard",
        "commands.ts",
        "handle",
        "layout",
        "store",
      ].includes(directory)
    ) {
      return "core / editing & document state";
    }
    if (
      [
        "actual-mode",
        "file-format",
        "playback",
        "schemas",
        "validation",
      ].includes(directory)
    ) {
      return "core / model & persistence";
    }
    if (directory === "examples") {
      return "core / examples";
    }
    if (directory === "ai.ts") {
      return "core / AI tools";
    }
    return "core / shared model API";
  }

  if (source.startsWith(petrinautPrefix)) {
    const path = source.slice(petrinautPrefix.length);
    const [directory, child, grandchild] = path.split("/");

    if (!child) {
      return "Petrinaut / public API";
    }
    if (directory === "react") {
      if (child === "lsp") {
        return "React / LSP";
      }
      if (["experiments", "simulation"].includes(child)) {
        return "React / simulation & experiments";
      }
      if (
        ["actual-mode-context.ts", "execution-frame", "playback"].includes(
          child,
        )
      ) {
        return "React / playback & actual mode";
      }
      return "React / editor state";
    }
    if (directory === "ui" && child === "views") {
      if (grandchild === "Editor") {
        return "UI / editor";
      }
      if (grandchild === "SDCPN") {
        return "UI / canvas";
      }
      return "UI / shared views";
    }
    if (directory === "ui" && child === "dev") {
      return "UI / development tools";
    }
    return "UI / shared components & infrastructure";
  }

  return null;
}

/**
 * @param {string} source
 * @returns {string | null}
 */
function compilationModule(source) {
  if (source.startsWith(corePrefix)) {
    const path = source.slice(corePrefix.length);

    if (path.startsWith("lsp/worker/")) {
      return "core / LSP worker";
    }
    if (path.startsWith("lsp/lib/")) {
      return "core / LSP services";
    }
    if (path.startsWith("lsp/") || path === "workers/lsp.ts") {
      return "core / LSP client & transport";
    }
    if (path === "hir.ts") {
      return "core / HIR compiler API";
    }
    if (path === "hir-runtime.ts" || path === "hir/instantiate.ts") {
      return "core / HIR runtime API";
    }
    if (path.startsWith("hir/emit-")) {
      return "core / HIR emitters";
    }
    if (path === "hir/artifact-fingerprint.ts") {
      return "core / HIR artifacts";
    }
    if (path.startsWith("hir/")) {
      return "core / HIR compiler";
    }
    if (path === "simulation/engine/build-simulation.ts") {
      return "core / simulation assembly";
    }
    if (path.startsWith("simulation/frames/")) {
      return "core / simulation frames & metrics";
    }
    if (path.startsWith("simulation/runtime/")) {
      return "core / simulation controller";
    }
    if (
      path.startsWith("simulation/worker/") ||
      path === "workers/simulation.ts"
    ) {
      return "core / simulation worker";
    }
    if (
      path.startsWith("simulation/monte-carlo/") ||
      path === "workers/monte-carlo.ts"
    ) {
      return "core / Monte Carlo runtime";
    }
    return null;
  }

  if (!source.startsWith(petrinautPrefix)) {
    return null;
  }

  const path = source.slice(petrinautPrefix.length);
  if (path.startsWith("react/lsp/") || path === "react/hooks/use-lsp.ts") {
    return "React / LSP provider";
  }
  if (
    path.startsWith("react/simulation/") ||
    path === "react/hooks/use-simulation.ts"
  ) {
    return "React / simulation provider";
  }
  if (path.startsWith("react/experiments/")) {
    return "React / experiments provider";
  }
  if (path.includes("/SimulateView/metrics/")) {
    return "UI / metric authoring";
  }
  if (path.includes("/SimulateView/experiments/")) {
    return "UI / experiment authoring";
  }
  if (path.includes("/simulation-timeline/")) {
    return "UI / simulation timeline";
  }
  if (path.endsWith("/scenario-lsp.ts")) {
    return "UI / scenario authoring";
  }
  return null;
}

/** @param {string} name */
function moduleClass(name) {
  if (name.startsWith("core /")) {
    return "core";
  }
  if (name.startsWith("React /")) {
    return "react";
  }
  return "ui";
}

/** @param {(source: string) => string | null} classify */
function buildGraph(classify) {
  /** @type {Map<string, Set<string>>} */
  const nodes = new Map();
  /** @type {Map<string, number>} */
  const edges = new Map();

  for (const module of modules) {
    const from = classify(module.source);
    if (from) {
      const sources = nodes.get(from) ?? new Set();
      sources.add(module.source);
      nodes.set(from, sources);
    }

    for (const dependency of module.dependencies) {
      const to = classify(dependency.resolved);
      if (!from || !to || from === to) {
        continue;
      }

      const sources = nodes.get(to) ?? new Set();
      sources.add(dependency.resolved);
      nodes.set(to, sources);

      const edge = `${from}\u0000${to}`;
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
  }

  const nodeLines = [...nodes.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, sources]) => {
      const fileLabel = `${sources.size} source ${sources.size === 1 ? "file" : "files"}`;
      return `${JSON.stringify(name)}: {class: ${moduleClass(name)}; tooltip: ${JSON.stringify(fileLabel)}}`;
    });
  const edgeLines = [...edges.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([edge, count]) => {
      const [from, to] = edge.split("\u0000");
      return `${JSON.stringify(from)} -> ${JSON.stringify(to)}: {tooltip: ${JSON.stringify(`${count} file-level ${count === 1 ? "dependency" : "dependencies"}`)}}`;
    });

  return (
    `# Generated by scripts/generate-dependency-diagrams.mjs. Do not edit.\n\n` +
    `direction: right\n\n` +
    `# modules\n\n${nodeLines.join("\n")}\n\n` +
    `# dependencies\n\n${edgeLines.join("\n")}\n\n` +
    `# styling\n\nclasses: {\n` +
    `  core: {style.fill: "#dcecff"; style.stroke: "#3676b8"}\n` +
    `  react: {style.fill: "#e8e0ff"; style.stroke: "#7051b5"}\n` +
    `  ui: {style.fill: "#e2f4e8"; style.stroke: "#3d8055"}\n` +
    `}\n`
  );
}

/**
 * @param {string} sourcePath
 * @param {string} outputPath
 */
function renderD2(sourcePath, outputPath) {
  const result = spawnSync(
    "mise",
    [
      "exec",
      "--env",
      "dev",
      "--",
      "d2",
      "--layout",
      "elk",
      sourcePath,
      outputPath,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "D2 rendering failed");
  }
}

/** @type {Array<[string, (source: string) => string | null]>} */
const diagrams = [
  ["petrinaut-dependencies", broadModule],
  ["petrinaut-compilation-dependencies", compilationModule],
];

for (const [name, classify] of diagrams) {
  const sourcePath = `${outputDirectory}${name}.d2`;
  const outputPath = `${outputDirectory}${name}.svg`;
  await writeFile(sourcePath, buildGraph(classify));
  renderD2(sourcePath, outputPath);
  await chmod(outputPath, 0o644);
  process.stdout.write(
    `Generated ${sourcePath.slice(repoRoot.length)} and ${outputPath.slice(repoRoot.length)}\n`,
  );
}
