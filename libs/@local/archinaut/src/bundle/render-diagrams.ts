/**
 * Brings the bundle's SVGs up to date with its D2 sources. A rendering is
 * cached by the source's content and d2's version, so a diagram already
 * rendered costs a read to confirm, a branch switch or an edit undone costs
 * a copy, and a d2 upgrade re-renders everything; what needs d2 renders in
 * parallel, one process per core, since a layer many diagrams show
 * rewrites all of them at once.
 */

import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, readFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { error, type Diagnostic } from "../shared/diagnostics";
import { renderD2, type D2 } from "./d2";

/** The vendored faces d2 measures its labels with. */
const fontsDirectory = fileURLToPath(new URL("../../fonts", import.meta.url));

/** Runs `task` over `items` with at most `limit` in flight. */
const inParallel = async <T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<void>,
): Promise<void> => {
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      if (item !== undefined) {
        await task(item);
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
};

const cacheKey = (source: Buffer, version: string): string =>
  createHash("sha256").update(`${version}\n`).update(source).digest("hex");

const readable = (path: string): Promise<void> =>
  // d2 writes 0600, which leaves the SVG unreadable to a server running as
  // another user.
  chmod(path, 0o644);

export const renderDiagrams = async (options: {
  d2: D2;
  repoRoot: string;
  bundleRoot: string;
  /** Absolute; holds one SVG per rendered source content. */
  cacheDirectory: string;
  /** Every diagram of the bundle. */
  names: string[];
}): Promise<{
  /** How many came out of d2 this time, as opposed to the cache. */
  rendered: number;
  /** Bundle-relative paths of every SVG that changed, cache hits included. */
  written: string[];
  diagnostics: Diagnostic[];
}> => {
  const diagnostics: Diagnostic[] = [];
  const written: string[] = [];
  let rendered = 0;
  await mkdir(options.cacheDirectory, { recursive: true });
  await inParallel(options.names, availableParallelism(), async (name) => {
    const sourcePath = join(options.bundleRoot, `diagrams/${name}.d2`);
    const outputPath = join(options.bundleRoot, `diagrams/${name}.svg`);
    const cached = join(
      options.cacheDirectory,
      `${cacheKey(await readFile(sourcePath), options.d2.version)}.svg`,
    );
    const [expected, current] = await Promise.all([
      readFile(cached).catch(() => null),
      readFile(outputPath).catch(() => null),
    ]);
    if (expected !== null) {
      if (current?.equals(expected) !== true) {
        await copyFile(cached, outputPath);
        await readable(outputPath);
        written.push(`diagrams/${name}.svg`);
      }
      return;
    }
    const result = await renderD2({
      command: options.d2.command,
      repoRoot: options.repoRoot,
      sourcePath,
      outputPath,
      fontsDirectory,
    });
    if (!result.ok) {
      diagnostics.push(
        error(
          `diagrams/${name}.d2`,
          `could not render the diagram: ${result.error}`,
        ),
      );
      return;
    }
    await readable(outputPath);
    await copyFile(outputPath, cached);
    written.push(`diagrams/${name}.svg`);
    rendered += 1;
  });
  return { rendered, written, diagnostics };
};
