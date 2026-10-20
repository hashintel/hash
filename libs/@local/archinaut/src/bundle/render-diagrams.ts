/**
 * Renders D2 sources in the bundle to SVG, only the ones named, so a dev
 * rebuild pays for the diagrams that changed rather than all of them. Renders
 * run in parallel, one d2 process per core: an edit to a layer many diagrams
 * show rewrites all of them at once.
 */

import { chmod } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { error, type Diagnostic } from "../shared/diagnostics";
import { renderD2 } from "./diagrams";

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

export const renderDiagrams = async (options: {
  command: string[];
  repoRoot: string;
  bundleRoot: string;
  names: string[];
}): Promise<{ rendered: number; diagnostics: Diagnostic[] }> => {
  const diagnostics: Diagnostic[] = [];
  let rendered = 0;
  await inParallel(options.names, availableParallelism(), async (name) => {
    const outputPath = join(options.bundleRoot, `diagrams/${name}.svg`);
    const result = await renderD2({
      command: options.command,
      repoRoot: options.repoRoot,
      sourcePath: join(options.bundleRoot, `diagrams/${name}.d2`),
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
    // d2 writes 0600, which leaves the SVG unreadable to a server running as
    // another user.
    await chmod(outputPath, 0o644);
    rendered += 1;
  });
  return { rendered, diagnostics };
};
