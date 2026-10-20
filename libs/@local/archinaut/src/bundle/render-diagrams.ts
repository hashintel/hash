/**
 * Renders D2 sources in the bundle to SVG, only the ones named, so a dev
 * rebuild pays for the diagrams that changed rather than all of them.
 */

import { chmod } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { error, type Diagnostic } from "../shared/diagnostics";
import { renderD2 } from "./diagrams";

/** The vendored faces d2 measures its labels with. */
const fontsDirectory = fileURLToPath(new URL("../../fonts", import.meta.url));

export const renderDiagrams = async (options: {
  command: string[];
  repoRoot: string;
  bundleRoot: string;
  names: string[];
}): Promise<{ rendered: number; diagnostics: Diagnostic[] }> => {
  const diagnostics: Diagnostic[] = [];
  let rendered = 0;
  for (const name of options.names) {
    const outputPath = join(options.bundleRoot, `diagrams/${name}.svg`);
    const result = renderD2({
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
      continue;
    }
    // d2 writes 0600, which leaves the SVG unreadable to a server running as
    // another user.
    await chmod(outputPath, 0o644);
    rendered += 1;
  }
  return { rendered, diagnostics };
};
