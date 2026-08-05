/**
 * `arch-docs build` writes the bundle; `arch-docs check` fails if it is stale.
 *
 * `check` is what CI runs. It rebuilds from source and compares against the
 * committed bundle, so a change to the code that nobody reflected in the docs
 * shows up as a failing job with a diff rather than as documentation that
 * quietly stopped being true.
 */

import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "../architecture.config";
import {
  buildBundle,
  bundleTextFiles,
  GENERATOR_NAME,
  type BuiltBundle,
} from "./build";
import { renderD2 } from "./emit/d2";

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

const checkBundle = async (bundle: BuiltBundle): Promise<number> => {
  const expected = bundleTextFiles(bundle);
  const stale: string[] = [];

  for (const [path, contents] of expected) {
    let actual: string;
    try {
      actual = await readFile(join(bundleRoot, path), "utf8");
    } catch {
      stale.push(`${path} (missing)`);
      continue;
    }

    if (actual !== contents) {
      stale.push(`${path} (out of date)`);
    }
  }

  if (stale.length === 0) {
    return 0;
  }

  process.stderr.write(
    `${red("error")} the committed architecture bundle does not match the source:\n`,
  );
  for (const path of stale.slice(0, 20)) {
    process.stderr.write(`  ${relative(repoRoot, join(bundleRoot, path))}\n`);
  }
  if (stale.length > 20) {
    process.stderr.write(`  …and ${stale.length - 20} more\n`);
  }
  process.stderr.write(
    `\nRegenerate with:\n  yarn workspace ${GENERATOR_NAME} doc:architecture\n`,
  );

  return 1;
};

const main = async (): Promise<number> => {
  const command = process.argv[2] ?? "build";

  if (!["build", "check"].includes(command)) {
    process.stderr.write(
      `unknown command \`${command}\`; expected build or check\n`,
    );
    return 2;
  }

  const bundle = await buildBundle({ repoRoot });
  const { errors } = reportDiagnostics(bundle.diagnostics);
  summarise(bundle);

  if (command === "check") {
    // Report annotation errors and staleness together: fixing one and
    // rediscovering the other on the next run wastes a CI cycle.
    const staleExit = await checkBundle(bundle);
    return errors > 0 || staleExit !== 0 ? 1 : 0;
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
