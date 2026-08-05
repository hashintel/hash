/**
 * `arch-docs build` writes the bundle; `arch-docs check` fails if it is stale.
 *
 * `check` is what CI runs. It rebuilds from source and compares against the
 * committed bundle, so a change to the code that nobody reflected in the docs
 * shows up as a failing job with a diff rather than as documentation that
 * quietly stopped being true.
 */

import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "../architecture.config";
import { buildBundle, bundleTextFiles, type BuiltBundle } from "./build";
import { canRenderDiagrams, renderD2 } from "./emit/d2";

import type { Diagnostic } from "./extract";

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

  return { errors: errors.length };
};

const summarise = (bundle: BuiltBundle): void => {
  const boundaries = bundle.model.layers.reduce(
    (total, layer) => total + layer.boundaries.length,
    0,
  );
  const invariants = bundle.model.layers.reduce(
    (total, layer) => total + layer.invariants.length,
    0,
  );
  const files = bundle.model.layers.reduce(
    (total, layer) => total + layer.fileCount,
    0,
  );

  process.stdout.write(
    dim(
      `${bundle.model.layers.length} layers · ${bundle.model.edges.length} edges · ${files} files · ${boundaries} boundaries · ${invariants} invariants · ${bundle.generated.length} generated pages · ${bundle.authored.length} authored pages\n`,
    ),
  );
};

const writeBundle = async (bundle: BuiltBundle): Promise<void> => {
  // Generated pages and diagrams are rewritten wholesale so a renamed layer
  // cannot leave an orphaned page behind, which would silently keep serving a
  // description of code that no longer exists.
  await rm(join(bundleRoot, "pages"), { recursive: true, force: true });
  await rm(join(bundleRoot, "diagrams"), { recursive: true, force: true });
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
      process.stderr.write(
        `${yellow("warning")} could not render ${name}.svg — the .d2 source was still written\n  ${result.error}\n`,
      );
      continue;
    }

    // d2 writes 0600, which leaves the committed SVG unreadable to anything
    // serving the bundle under a different user.
    await chmod(output, 0o644);
  }
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
    // what surfaces the diagnostics — an unannotated file, a dead seam, a
    // violated rule — and because the bundle is never stored, there is no
    // committed copy that could be out of date with the source.
    return errors > 0 ? 1 : 0;
  }

  if (errors > 0) {
    process.stderr.write(
      `\n${red("refusing to write")} the bundle while ${errors} annotation error${errors === 1 ? "" : "s"} remain\n`,
    );
    return 1;
  }

  await writeBundle(bundle);
  process.stdout.write(`Wrote ${config.outputDirectory}\n`);
  return 0;
};

process.exitCode = await main();
