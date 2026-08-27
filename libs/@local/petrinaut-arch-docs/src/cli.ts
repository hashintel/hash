/**
 * `arch-docs build` writes the bundle; `arch-docs check` reports on it.
 *
 * `check` reports without writing: it builds everything, discards the files, and
 * fails on any annotation error — an unannotated file, an undeclared ancestor, a
 * violated rule — so the map cannot quietly stop matching the code.
 */

import { existsSync } from "node:fs";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "../architecture.config";
import { buildBundle, bundleTextFiles, type BuiltBundle } from "./build";
import { countErrors, type Diagnostic } from "./diagnostics";
import {
  generatorInputsHash,
  readCachedBaseSide,
  writeCachedBaseSide,
} from "./diff/base-cache";
import {
  materializeBaseTree,
  remoteRepoUrl,
  resolveBaseSha,
  type BaseTree,
} from "./diff/base-tree";
import { applyBundleDiff, diffSideOfBundle } from "./diff/bundle-diff";
import { canRenderDiagrams, renderD2 } from "./emit/d2";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const bundleRoot = join(repoRoot, config.outputDirectory);

const supportsColour = process.stdout.isTTY === true;

const colour = (code: string, text: string): string =>
  supportsColour ? `\u001B[${code}m${text}\u001B[0m` : text;

const red = (text: string): string => colour("31", text);
const yellow = (text: string): string => colour("33", text);
const dim = (text: string): string => colour("2", text);

const reportDiagnostics = (diagnostics: Diagnostic[]): { errors: number } => {
  const errors = diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );
  const warnings = diagnostics.filter(
    (diagnostic) => diagnostic.severity === "warning",
  );

  for (const diagnostic of [...errors, ...warnings]) {
    const location =
      diagnostic.line === null
        ? diagnostic.file
        : `${diagnostic.file}:${diagnostic.line}`;
    const label =
      diagnostic.severity === "error" ? red("error") : yellow("warning");
    process.stderr.write(`${label} ${location}\n  ${diagnostic.message}\n`);
  }

  return { errors: countErrors(diagnostics) };
};

const summarise = (bundle: BuiltBundle): void => {
  const files = bundle.model.layers.reduce(
    (total, layer) => total + layer.fileCount,
    0,
  );

  process.stdout.write(
    dim(
      `${bundle.model.layers.length} layers \u00b7 ${bundle.model.edges.length} edges \u00b7 ${files} files \u00b7 ${bundle.generated.length} generated pages \u00b7 ${bundle.authored.length} authored pages\n`,
    ),
  );
};

/**
 * The ref to diff the bundle against, or null for a plain build.
 *
 * `--diff-base <ref>` (or `--diff-base=<ref>`) wins over the
 * `PETRINAUT_ARCH_DOCS_DIFF_BASE` environment variable, which is how CI turns
 * the diff on for preview builds without touching the command line.
 */
const resolveDiffBase = (args: string[]): string | null => {
  const flagIndex = args.findIndex(
    (arg) => arg === "--diff-base" || arg.startsWith("--diff-base="),
  );

  if (flagIndex !== -1) {
    const flag = args[flagIndex] ?? "";
    const value = flag.includes("=")
      ? flag.slice(flag.indexOf("=") + 1)
      : (args[flagIndex + 1] ?? "");
    if (value.trim() === "") {
      // The flag was typed deliberately, so an empty value gets a message
      // rather than a silent plain build.
      process.stderr.write(
        `${yellow("warning")} --diff-base given without a ref; building without change highlighting\n`,
      );
      return null;
    }
    return value.trim();
  }

  const fromEnvironment = process.env.PETRINAUT_ARCH_DOCS_DIFF_BASE?.trim();
  return fromEnvironment === undefined || fromEnvironment === ""
    ? null
    : fromEnvironment;
};

/**
 * Builds the base ref's bundle and applies the diff to the head one.
 *
 * The base build runs the current generator over the base sources, with the
 * current config and source-URL prefix, so the comparison never sees emitter
 * or prefix drift. Any failure — an unfetchable ref, a base tree the
 * generator cannot process — degrades to the plain bundle with a warning: a
 * broken diff must not take the docs down with it.
 */
const withDiffAgainst = async (
  bundle: BuiltBundle,
  ref: string,
  includeDiagrams: boolean,
): Promise<BuiltBundle> => {
  let baseTree: BaseTree | null = null;
  try {
    const url = remoteRepoUrl(process.env);
    const cacheDir = join(repoRoot, "node_modules/.cache/petrinaut-arch-docs");
    const inputsHash = generatorInputsHash({
      packageRoot: join(repoRoot, "libs/@local/petrinaut-arch-docs"),
      includeDiagrams,
    });

    // The base side is deterministic in (base commit, generator inputs), so a
    // build against an unmoved base reuses the last one instead of extracting
    // and building the base tree again.
    const knownSha = resolveBaseSha(repoRoot, ref, url);
    let base =
      knownSha === null
        ? null
        : readCachedBaseSide({ cacheDir, sha: knownSha, inputsHash });
    let baseSha = knownSha ?? "";

    if (base !== null) {
      process.stdout.write(
        dim(`base bundle from cache (${baseSha.slice(0, 10)})\n`),
      );
    } else {
      const tree = await materializeBaseTree({
        repoRoot,
        ref,
        paths: [
          ...new Set([
            ...config.packages.map((pkg) => pkg.path),
            // For the base tree's authored content and dependency-cruiser
            // tsconfig; the generator itself still runs from this checkout.
            "libs/@local/petrinaut-arch-docs",
          ]),
        ],
      });
      baseTree = tree;
      baseSha = tree.sha;

      // Logged because it names the strategy: a Vercel build has no usable
      // clone, and this line is how its logs show the fallback fetch worked.
      if (tree.fetchedFrom !== undefined) {
        process.stdout.write(
          dim(`base tree fetched from ${tree.fetchedFrom}\n`),
        );
      }

      const baseBundle = await buildBundle({
        repoRoot: tree.root,
        includeDiagrams,
        overrides: {
          // A package added since the base ref has no directory to scan there.
          packages: config.packages.filter((pkg) =>
            existsSync(join(tree.root, pkg.path)),
          ),
        },
      });
      base = diffSideOfBundle(baseBundle, config.sourceUrlPrefix);
      writeCachedBaseSide({ cacheDir, sha: baseSha, inputsHash, side: base });
    }

    const diffed = applyBundleDiff(bundle, base, {
      baseRef: ref,
      baseSha,
      sourceUrlPrefix: config.sourceUrlPrefix,
    });

    const statuses = Object.values(diffed.manifest.diff?.pages ?? {});
    const count = (status: string) =>
      statuses.filter((entry) => entry === status).length;
    process.stdout.write(
      dim(
        `changes vs ${ref} (${baseSha.slice(0, 10)}): ${count("added")} added · ${count("changed")} changed · ${count("removed")} removed\n`,
      ),
    );

    return diffed;
  } catch (cause) {
    process.stderr.write(
      `${yellow("warning")} building without change highlighting: could not compare against \`${ref}\`\n  ${cause instanceof Error ? cause.message : String(cause)}\n`,
    );
    return bundle;
  } finally {
    // A failed cleanup must not reject out of the build the diff decorates.
    await baseTree?.dispose().catch(() => {});
  }
};

/** Returns false when a diagram the pages already reference failed to render. */
const writeBundle = async (
  bundle: BuiltBundle,
  renderDiagrams: boolean,
): Promise<boolean> => {
  // Generated pages, diagrams and components are rewritten wholesale so a
  // renamed layer or a deleted component cannot leave an orphan behind, which
  // would silently keep serving a description of code that no longer exists.
  await rm(join(bundleRoot, "pages"), { recursive: true, force: true });
  await rm(join(bundleRoot, "diagrams"), { recursive: true, force: true });
  await rm(join(bundleRoot, "components"), { recursive: true, force: true });
  await mkdir(bundleRoot, { recursive: true });

  for (const [path, contents] of bundleTextFiles(bundle)) {
    const target = join(bundleRoot, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents, "utf8");
  }

  // The `.d2` sources always ship. Without a renderer the pages reference no
  // SVG, so rendering here would fail on a bundle that is already complete.
  if (!renderDiagrams) {
    return true;
  }

  for (const name of bundle.diagramSources.keys()) {
    const source = join(bundleRoot, `diagrams/${name}.d2`);
    const output = join(bundleRoot, `diagrams/${name}.svg`);
    const result = renderD2(repoRoot, source, output);

    if (!result.ok) {
      // The pages were emitted expecting this SVG, because `d2` answered the
      // availability probe. A bundle that references an image it does not
      // contain fails the consuming site's build, so this stops here rather
      // than writing one.
      process.stderr.write(
        `${red("error")} could not render ${name}.svg, and the pages already reference it\n  ${result.error}\n`,
      );
      return false;
    }

    // d2 writes 0600, which leaves the committed SVG unreadable to anything
    // serving the bundle under a different user.
    await chmod(output, 0o644);
  }

  return true;
};

const main = async (): Promise<number> => {
  const command = process.argv[2] ?? "build";

  if (!["build", "check"].includes(command)) {
    process.stderr.write(
      `unknown command \`${command}\`; expected build or check\n`,
    );
    return 2;
  }

  // Probed before building so pages only reference diagrams that will exist.
  // `check` never writes, so it does not care either way.
  const diagramsAvailable = command === "check" || canRenderDiagrams(repoRoot);

  if (command === "build" && !diagramsAvailable) {
    process.stderr.write(
      `${yellow("warning")} d2 is unavailable, so the bundle is being written without rendered diagrams.\n  Install it with \`mise install\` to include them.\n`,
    );
  }

  const bundle = await buildBundle({
    repoRoot,
    includeDiagrams: diagramsAvailable,
  });
  const { errors } = reportDiagnostics(bundle.diagnostics);
  summarise(bundle);

  if (command === "check") {
    // `check` builds the whole bundle and discards the files. The build is
    // what surfaces the diagnostics — an unannotated file, an undeclared
    // ancestor, a violated rule — and because the bundle is never stored, there is no
    // committed copy that could be out of date with the source.
    return errors > 0 ? 1 : 0;
  }

  if (errors > 0) {
    process.stderr.write(
      `\n${red("refusing to write")} the bundle while ${errors} annotation error${errors === 1 ? "" : "s"} remain\n`,
    );
    return 1;
  }

  // Applied only to a bundle that already passed the checks: the diff decorates
  // the output, it never gates it.
  const diffBase = resolveDiffBase(process.argv.slice(3));
  const written =
    diffBase === null
      ? bundle
      : await withDiffAgainst(bundle, diffBase, diagramsAvailable);

  if (!(await writeBundle(written, diagramsAvailable))) {
    return 1;
  }

  // The prefix is logged because it varies by build: a preview deployment
  // points its source links at the previewed commit, and a wrong ref is
  // otherwise only visible by clicking a link on the published page.
  process.stdout.write(
    `Wrote ${config.outputDirectory}, source links to ${config.sourceUrlPrefix}\n`,
  );
  return 0;
};

process.exitCode = await main();
