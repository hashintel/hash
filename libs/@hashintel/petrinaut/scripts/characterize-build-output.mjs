#!/usr/bin/env node

/* eslint-disable no-console, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unnecessary-condition */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpus,
  freemem,
  platform,
  release,
  totalmem,
} from "node:os";
import {
  mkdir,
  readFile,
  readdir,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { performance } from "node:perf_hooks";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(SCRIPT_PATH);
const PACKAGE_ROOT = path.resolve(SCRIPT_DIR, "..");
const DIST_DIR = path.join(PACKAGE_ROOT, "dist");

const KNOWN_HEAVY_DEPENDENCIES = [
  "@babel/standalone",
  "elkjs",
  "monaco-editor",
  "@monaco-editor/react",
  "typescript",
  "uplot",
  "@xyflow/react",
];

const DEFAULT_WATCH_SAMPLES = [
  {
    label: "css entry",
    path: "src/index.css",
  },
  {
    label: "small component",
    path: "src/components/icon-button.tsx",
  },
  {
    label: "editor shell",
    path: "src/views/Editor/editor-view.tsx",
  },
  {
    label: "simulation worker",
    path: "src/simulation/worker/simulation.worker.ts",
  },
  {
    label: "compiler utility",
    path: "src/simulation/simulator/compile-user-code.ts",
  },
  {
    label: "panda shared config",
    path: "panda.config.shared.ts",
  },
];

const HEAVY_SOURCE_PATTERNS = [
  {
    key: "inlineWorkerImports",
    pattern: /\?worker&inline/g,
  },
  {
    key: "workerImports",
    pattern: /\?worker/g,
  },
  {
    key: "babelStandaloneImports",
    pattern: /from\s+["']@babel\/standalone["']|import\s+\*\s+as\s+\w+\s+from\s+["']@babel\/standalone["']/g,
  },
  {
    key: "elkImports",
    pattern: /from\s+["']elkjs["']/g,
  },
  {
    key: "uplotImports",
    pattern: /from\s+["']uplot["']|import\s+["']uplot\/dist\/uPlot\.min\.css["']/g,
  },
  {
    key: "fontsourceImports",
    pattern: /@fontsource-variable\//g,
  },
  {
    key: "dsHelpersCssImports",
    pattern: /@hashintel\/ds-helpers\/css/g,
  },
  {
    key: "reactIconsImports",
    pattern: /from\s+["']react-icons\//g,
  },
];

export function formatBytes(bytes) {
  if (bytes === 0) {
    return "0 B";
  }

  const units = ["B", "KiB", "MiB", "GiB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  const formatted =
    exponent === 0 ? String(value) : value.toFixed(value >= 10 ? 1 : 1);

  return `${formatted.replace(/\.0$/, "")} ${units[exponent]}`;
}

function gzipSize(buffer) {
  return gzipSync(buffer, { level: 9 }).byteLength;
}

function isBareSpecifier(specifier) {
  return !specifier.startsWith(".") && !specifier.startsWith("/");
}

export function parseBareImports(source) {
  const imports = new Set();
  const importFromPattern =
    /(?:^|[;\n])\s*import\s+(?:[^'"()]+?\s+from\s+)?["']([^"']+)["']/g;
  const exportFromPattern =
    /(?:^|[;\n])\s*export\s+(?:[^'"]+?\s+from\s+)["']([^"']+)["']/g;
  const sideEffectImportPattern =
    /(?:^|[;\n])\s*import\s*["']([^"']+)["']/g;

  for (const pattern of [
    importFromPattern,
    exportFromPattern,
    sideEffectImportPattern,
  ]) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier && isBareSpecifier(specifier)) {
        imports.add(specifier);
      }
    }
  }

  return [...imports].sort((left, right) => left.localeCompare(right));
}

async function listFiles(directory) {
  if (!(await pathExists(directory))) {
    return [];
  }

  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return listFiles(entryPath);
      }
      if (entry.isFile()) {
        return [entryPath];
      }
      return [];
    }),
  );

  return files.flat().sort();
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function createEmptyAssetGroup() {
  return {
    count: 0,
    bytes: 0,
    gzipBytes: 0,
  };
}

function assetGroupFor(relativePath) {
  if (relativePath.endsWith(".js")) {
    return "js";
  }
  if (relativePath.endsWith(".css")) {
    return "css";
  }
  if (relativePath.endsWith(".map")) {
    return "maps";
  }
  return "other";
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

export async function summarizeDistDirectory(distDir = DIST_DIR) {
  const files = await listFiles(distDir);
  const assetGroups = {
    js: createEmptyAssetGroup(),
    css: createEmptyAssetGroup(),
    maps: createEmptyAssetGroup(),
    other: createEmptyAssetGroup(),
  };
  const assets = [];

  for (const filePath of files) {
    const bytes = await readFile(filePath);
    const relativePath = path.relative(distDir, filePath);
    const gzipBytes = gzipSize(bytes);
    const group = assetGroupFor(relativePath);

    assetGroups[group].count += 1;
    assetGroups[group].bytes += bytes.byteLength;
    assetGroups[group].gzipBytes += gzipBytes;

    assets.push({
      path: relativePath,
      bytes: bytes.byteLength,
      gzipBytes,
      group,
    });
  }

  assets.sort((left, right) => right.bytes - left.bytes);

  const mainJsPath = path.join(distDir, "main.js");
  const mainCssPath = path.join(distDir, "main.css");
  const mainJs = await readFile(mainJsPath, "utf8").catch(() => "");
  const mainCss = await readFile(mainCssPath, "utf8").catch(() => "");
  const mainMap = await readJsonIfExists(path.join(distDir, "main.js.map"));

  const heavyDependencySignals = Object.fromEntries(
    KNOWN_HEAVY_DEPENDENCIES.map((dependency) => [
      dependency,
      mainJs.includes(`"${dependency}"`) ||
        mainJs.includes(`'${dependency}'`) ||
        mainJs.includes(`${dependency}/`),
    ]),
  );

  const sourceMapSources = Array.isArray(mainMap?.sources) ? mainMap.sources : [];

  return {
    assetGroups,
    exists: await pathExists(distDir),
    assets,
    largestAssets: assets.slice(0, 20),
    workerAssets: assets.filter((asset) =>
      /(?:^|[./-])worker(?:[.-]|$)/.test(asset.path),
    ),
    mainJs: {
      bytes: Buffer.byteLength(mainJs),
      gzipBytes: mainJs ? gzipSize(Buffer.from(mainJs)) : 0,
      bareImports: parseBareImports(mainJs),
      heavyDependencySignals,
    },
    css: {
      bytes: Buffer.byteLength(mainCss),
      gzipBytes: mainCss ? gzipSize(Buffer.from(mainCss)) : 0,
      fontFaceRules: (mainCss.match(/@font-face/g) ?? []).length,
    },
    sourceMapSignals: {
      sources: sourceMapSources.length,
      dsHelpersSources: sourceMapSources.filter((source) =>
        source.includes("ds-helpers"),
      ).length,
      babelStandaloneSources: sourceMapSources.filter((source) =>
        source.includes("@babel/standalone"),
      ).length,
      workerSources: sourceMapSources.filter((source) =>
        source.includes(".worker"),
      ).length,
    },
  };
}

async function summarizeSourceHotspots() {
  const sourceFiles = (
    await listFiles(path.join(PACKAGE_ROOT, "src"))
  ).filter((filePath) => /\.(?:css|ts|tsx)$/.test(filePath));
  const extraFiles = [
    path.join(PACKAGE_ROOT, "panda.config.ts"),
    path.join(PACKAGE_ROOT, "panda.config.shared.ts"),
    path.join(PACKAGE_ROOT, "vite.config.ts"),
  ];
  const files = [...sourceFiles, ...extraFiles];
  const totals = Object.fromEntries(
    HEAVY_SOURCE_PATTERNS.map(({ key }) => [key, 0]),
  );
  const samples = [];

  for (const filePath of files) {
    const source = await readFile(filePath, "utf8");
    const fileCounts = {};

    for (const { key, pattern } of HEAVY_SOURCE_PATTERNS) {
      const count = (source.match(pattern) ?? []).length;
      if (count > 0) {
        fileCounts[key] = count;
        totals[key] += count;
      }
    }

    if (Object.keys(fileCounts).length > 0) {
      samples.push({
        path: path.relative(PACKAGE_ROOT, filePath),
        counts: fileCounts,
      });
    }
  }

  return {
    totals,
    samples: samples.slice(0, 100),
  };
}

async function commandExists(command, args = ["--version"]) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: PACKAGE_ROOT,
      stdio: "ignore",
    });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
}

async function runTimedCommand(label, command, args) {
  const startedAt = performance.now();
  let stdout = "";
  let stderr = "";

  const child = spawn(command, args, {
    cwd: PACKAGE_ROOT,
    env: {
      ...process.env,
      CI: "1",
      FORCE_COLOR: process.env.FORCE_COLOR ?? "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    stdout += text;
    process.stdout.write(text);
  });

  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    stderr += text;
    process.stderr.write(text);
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });

  const durationMs = performance.now() - startedAt;
  const combinedOutput = `${stdout}\n${stderr}`;

  return {
    label,
    command: [command, ...args].join(" "),
    exitCode,
    durationMs,
    warnings: extractWarnings(combinedOutput),
    outputHash: createHash("sha256").update(combinedOutput).digest("hex"),
  };
}

function extractWarnings(output) {
  return output
    .split(/\r?\n/)
    .filter((line) =>
      /warning|deoptim|exceed|large|chunk|worker|error/i.test(line),
    )
    .slice(-80);
}

function parseArgs(argv) {
  const args = {
    build: true,
    watch: true,
    checks: false,
    outputDir: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--skip-build":
        args.build = false;
        break;
      case "--skip-watch":
        args.watch = false;
        break;
      case "--include-checks":
        args.checks = true;
        break;
      case "--output-dir":
        args.outputDir = argv[index + 1] ?? null;
        index += 1;
        break;
      case "--help":
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/characterize-build-output.mjs [options]

Options:
  --skip-build       Analyze the existing dist directory without running yarn build.
  --skip-watch       Skip Vite library watch rebuild profiling.
  --include-checks   Also time lint, typecheck, and unit tests.
  --output-dir DIR   Write markdown and JSON reports to DIR.
`);
}

async function findRepoRoot() {
  let current = PACKAGE_ROOT;
  while (current !== path.dirname(current)) {
    const packageJsonPath = path.join(current, "package.json");
    const packageJson = await readJsonIfExists(packageJsonPath);
    if (packageJson?.name === "hash") {
      return current;
    }
    current = path.dirname(current);
  }
  return PACKAGE_ROOT;
}

async function getCommandVersion(command, args = ["--version"]) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: PACKAGE_ROOT,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", () => resolve(null));
    child.on("exit", (code) => resolve(code === 0 ? output.trim() : null));
  });
}

async function getGitValue(args) {
  return new Promise((resolve) => {
    const child = spawn("git", args, {
      cwd: PACKAGE_ROOT,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", () => resolve(null));
    child.on("exit", (code) => resolve(code === 0 ? output.trim() : null));
  });
}

async function collectEnvironment() {
  const packageJson = await readJsonIfExists(path.join(PACKAGE_ROOT, "package.json"));

  return {
    timestamp: new Date().toISOString(),
    packageName: packageJson?.name ?? null,
    packageVersion: packageJson?.version ?? null,
    gitCommit: await getGitValue(["rev-parse", "HEAD"]),
    gitBranch: await getGitValue(["branch", "--show-current"]),
    node: process.version,
    yarn: await getCommandVersion("yarn"),
    platform: `${platform()} ${release()}`,
    cpuCount: cpus().length,
    cpuModel: cpus()[0]?.model ?? null,
    totalMemoryBytes: totalmem(),
    freeMemoryBytes: freemem(),
  };
}

async function touchFile(filePath) {
  const now = new Date();
  await utimes(filePath, now, now);
}

async function profileWatchRebuilds() {
  const vite = await import("vite");
  const builds = [];
  let activeBuild = null;
  let buildEndResolver = null;

  const waitForNextBuild = () =>
    new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timed out waiting for Vite watch rebuild"));
      }, 180_000);

      buildEndResolver = (build) => {
        clearTimeout(timeout);
        resolve(build);
      };
    });

  const timingPlugin = {
    name: "petrinaut-characterize-watch-timing",
    buildStart() {
      activeBuild = {
        startedAt: performance.now(),
      };
    },
    closeBundle() {
      if (!activeBuild) {
        return;
      }

      const build = {
        index: builds.length,
        durationMs: performance.now() - activeBuild.startedAt,
      };
      builds.push(build);
      activeBuild = null;
      buildEndResolver?.(build);
      buildEndResolver = null;
    },
  };

  const watcher = await vite.build({
    configFile: path.join(PACKAGE_ROOT, "vite.config.ts"),
    root: PACKAGE_ROOT,
    logLevel: "warn",
    plugins: [timingPlugin],
    build: {
      watch: {},
    },
  });

  try {
    const initialBuild = await waitForNextBuild();
    const rebuilds = [];

    for (const sample of DEFAULT_WATCH_SAMPLES) {
      const absolutePath = path.join(PACKAGE_ROOT, sample.path);
      const expectedBuildIndex = builds.length;
      const nextBuild = waitForNextBuild();
      await touchFile(absolutePath);
      const build = await nextBuild;

      rebuilds.push({
        ...sample,
        buildIndex: expectedBuildIndex,
        durationMs: build.durationMs,
      });
    }

    return {
      initialBuild,
      rebuilds,
    };
  } finally {
    await watcher.close();
  }
}

function formatMs(durationMs) {
  return `${(durationMs / 1_000).toFixed(2)}s`;
}

function markdownTable(headers, rows) {
  const escapeCell = (value) =>
    String(value ?? "")
      .replace(/\|/g, "\\|")
      .replace(/\n/g, "<br>");

  return [
    `| ${headers.map(escapeCell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`),
  ].join("\n");
}

function renderReportMarkdown(report) {
  const sections = [
    "# Petrinaut Build Characterization",
    "",
    `Generated: ${report.environment.timestamp}`,
    "",
    "## Environment",
    "",
    markdownTable(
      ["Metric", "Value"],
      [
        ["Package", report.environment.packageName],
        ["Git branch", report.environment.gitBranch],
        ["Git commit", report.environment.gitCommit],
        ["Node", report.environment.node],
        ["Yarn", report.environment.yarn],
        ["Platform", report.environment.platform],
        [
          "CPU",
          `${report.environment.cpuCount} x ${report.environment.cpuModel}`,
        ],
        ["Total memory", formatBytes(report.environment.totalMemoryBytes)],
        ["Free memory at start", formatBytes(report.environment.freeMemoryBytes)],
      ],
    ),
    "",
    "## Timed Commands",
    "",
    markdownTable(
      ["Command", "Duration", "Exit"],
      report.commands.map((command) => [
        command.command,
        formatMs(command.durationMs),
        command.exitCode,
      ]),
    ),
    "",
    "## Watch Rebuilds",
    "",
    report.watch
      ? markdownTable(
          ["Sample", "Touched file", "Duration"],
          [
            ["initial library watch build", "", formatMs(report.watch.initialBuild.durationMs)],
            ...report.watch.rebuilds.map((rebuild) => [
              rebuild.label,
              rebuild.path,
              formatMs(rebuild.durationMs),
            ]),
          ],
        )
      : "Watch rebuild profiling was skipped or failed.",
    "",
    "## Asset Groups",
    "",
    markdownTable(
      ["Group", "Count", "Size", "Gzip"],
      Object.entries(report.dist.assetGroups).map(([group, summary]) => [
        group,
        summary.count,
        formatBytes(summary.bytes),
        formatBytes(summary.gzipBytes),
      ]),
    ),
    "",
    "## Largest Assets",
    "",
    markdownTable(
      ["Asset", "Size", "Gzip"],
      report.dist.largestAssets.slice(0, 12).map((asset) => [
        asset.path,
        formatBytes(asset.bytes),
        formatBytes(asset.gzipBytes),
      ]),
    ),
    "",
    "## Worker Assets",
    "",
    report.dist.workerAssets.length > 0
      ? markdownTable(
          ["Asset", "Size", "Gzip"],
          report.dist.workerAssets.map((asset) => [
            asset.path,
            formatBytes(asset.bytes),
            formatBytes(asset.gzipBytes),
          ]),
        )
      : "No emitted worker assets were detected.",
    "",
    "## Main JS Imports",
    "",
    markdownTable(
      ["Bare import"],
      report.dist.mainJs.bareImports.map((specifier) => [specifier]),
    ),
    "",
    "## Heavy Dependency Signals In Main JS",
    "",
    markdownTable(
      ["Dependency", "Present"],
      Object.entries(report.dist.mainJs.heavyDependencySignals).map(
        ([dependency, present]) => [dependency, present ? "yes" : "no"],
      ),
    ),
    "",
    "## CSS",
    "",
    markdownTable(
      ["Metric", "Value"],
      [
        ["main.css size", formatBytes(report.dist.css.bytes)],
        ["main.css gzip", formatBytes(report.dist.css.gzipBytes)],
        ["@font-face rules", report.dist.css.fontFaceRules],
      ],
    ),
    "",
    "## Sourcemap Signals",
    "",
    markdownTable(
      ["Metric", "Value"],
      Object.entries(report.dist.sourceMapSignals).map(([key, value]) => [
        key,
        value,
      ]),
    ),
    "",
    "## Source Hotspots",
    "",
    markdownTable(
      ["Signal", "Count"],
      Object.entries(report.sourceHotspots.totals).map(([key, value]) => [
        key,
        value,
      ]),
    ),
    "",
    "## Warning Lines",
    "",
    report.commands.flatMap((command) => command.warnings).length > 0
      ? [
          "```txt",
          ...report.commands.flatMap((command) =>
            command.warnings.map((warning) => `[${command.label}] ${warning}`),
          ),
          "```",
        ].join("\n")
      : "No warning-like lines were captured from timed commands.",
    "",
  ];

  return sections.join("\n");
}

async function writeReports(report, outputDir) {
  await mkdir(outputDir, { recursive: true });

  const timestamp = report.environment.timestamp.replace(/[:.]/g, "-");
  const jsonPath = path.join(outputDir, "latest.json");
  const markdownPath = path.join(outputDir, "latest.md");
  const timestampedJsonPath = path.join(outputDir, `${timestamp}.json`);
  const timestampedMarkdownPath = path.join(outputDir, `${timestamp}.md`);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const markdown = renderReportMarkdown(report);

  await writeFile(jsonPath, json);
  await writeFile(markdownPath, markdown);
  await writeFile(timestampedJsonPath, json);
  await writeFile(timestampedMarkdownPath, markdown);

  return { jsonPath, markdownPath, timestampedJsonPath, timestampedMarkdownPath };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = await findRepoRoot();
  const outputDir =
    args.outputDir ??
    path.join(repoRoot, ".context", "petrinaut-characterization");
  const commands = [];

  if (args.build) {
    commands.push(await runTimedCommand("build", "yarn", ["build"]));
  }

  if (args.checks) {
    commands.push(
      await runTimedCommand("lint:eslint", "yarn", ["lint:eslint"]),
      await runTimedCommand("lint:tsc", "yarn", ["lint:tsc"]),
      await runTimedCommand("test:unit", "yarn", ["vitest", "run"]),
    );
  }

  let watch = null;
  let watchError = null;
  const buildFailed = commands.some(
    (command) => command.label === "build" && command.exitCode !== 0,
  );
  if (args.watch && !buildFailed) {
    try {
      watch = await profileWatchRebuilds();
    } catch (error) {
      watchError = error instanceof Error ? error.message : String(error);
    }
  } else if (args.watch && buildFailed) {
    watchError = "Skipped because the production build command failed.";
  }

  const report = {
    environment: await collectEnvironment(),
    commands,
    watch,
    watchError,
    dist: await summarizeDistDirectory(DIST_DIR),
    sourceHotspots: await summarizeSourceHotspots(),
  };

  const reportPaths = await writeReports(report, outputDir);

  console.log("");
  console.log(`Wrote ${path.relative(repoRoot, reportPaths.markdownPath)}`);
  console.log(`Wrote ${path.relative(repoRoot, reportPaths.jsonPath)}`);
  console.log(
    `Wrote ${path.relative(repoRoot, reportPaths.timestampedMarkdownPath)}`,
  );
  console.log(
    `Wrote ${path.relative(repoRoot, reportPaths.timestampedJsonPath)}`,
  );

  const failedCommand = commands.find((command) => command.exitCode !== 0);
  if (failedCommand) {
    process.exitCode = failedCommand.exitCode;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!(await commandExists("yarn"))) {
    throw new Error("Expected yarn to be available on PATH.");
  }
  await main();
}
