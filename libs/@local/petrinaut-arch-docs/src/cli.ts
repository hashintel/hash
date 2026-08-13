/**
 * `arch-docs build` writes the bundle; `arch-docs check` reports on it.
 *
 * `check` reports without writing: it builds everything, discards the files, and
 * fails on any annotation error — an unannotated file, an undeclared ancestor, a
 * violated rule — so the map cannot quietly stop matching the code.
 */

import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "../architecture.config";
import { buildBundle, bundleTextFiles, type BuiltBundle } from "./build";
import { countErrors, type Diagnostic } from "./diagnostics";
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

/** Returns false when a diagram the pages already reference failed to render. */
const writeBundle = async (bundle: BuiltBundle): Promise<boolean> => {
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

  if (!(await writeBundle(bundle))) {
    return 1;
  }

  process.stdout.write(`Wrote ${config.outputDirectory}\n`);
  return 0;
};

process.exitCode = await main();
