/**
 * One build: the pipeline, the bundle, and, when asked to write, the bundle
 * directory brought up to date and the changed diagrams rendered. Every
 * command runs this; `check` with `write: false`, the others with `true`.
 */

import { join } from "node:path";

import { bundleFiles, emitBundle, type Bundle } from "./bundle";
import { findD2 } from "./bundle/diagrams";
import { renderDiagrams } from "./bundle/render-diagrams";
import { runPipeline, type PipelineResult } from "./pipeline";
import { countErrors, type Diagnostic } from "./shared/diagnostics";
import { syncDirectory } from "./shared/sync-directory";

import type { ArchinautConfig } from "./config";

export interface BuildResult {
  pipeline: PipelineResult;
  bundle: Bundle;
  diagnostics: Diagnostic[];
  /** Bundle files written this time, relative to the bundle root; empty when nothing changed or nothing was written. */
  written: string[];
  diagramsRendered: number;
  /** Where the bundle lives, absolute. */
  bundleRoot: string;
}

export const buildArchitecture = async (
  config: ArchinautConfig,
  options: { write: boolean },
): Promise<BuildResult> => {
  const bundleRoot = join(config.root, config.outputDirectory);
  const d2 = options.write ? findD2(config.root) : null;

  const pipeline = await runPipeline(config);
  const bundle = await emitBundle({
    model: pipeline.model,
    repoRoot: config.root,
    contentDirectory: config.contentDirectory,
    sourceUrlPrefix: config.sourceUrlPrefix,
    includeDiagrams: d2 !== null,
  });
  const diagnostics = [...pipeline.diagnostics, ...bundle.diagnostics];

  if (!options.write || countErrors(diagnostics) > 0) {
    return {
      pipeline,
      bundle,
      diagnostics,
      written: [],
      diagramsRendered: 0,
      bundleRoot,
    };
  }

  const files = bundleFiles(pipeline.model, bundle);
  const summary = await syncDirectory(bundleRoot, files, {
    // Rendered SVGs sit beside their sources and are not in `files`.
    keep: (path) => path.endsWith(".svg"),
  });

  let diagramsRendered = 0;
  if (d2 !== null) {
    const names = summary.written
      .filter((path) => path.startsWith("diagrams/") && path.endsWith(".d2"))
      .map((path) => path.slice("diagrams/".length, -".d2".length));
    const rendering = await renderDiagrams({
      command: d2,
      repoRoot: config.root,
      bundleRoot,
      names,
    });
    diagnostics.push(...rendering.diagnostics);
    diagramsRendered = rendering.rendered;
  }

  return {
    pipeline,
    bundle,
    diagnostics,
    written: summary.written,
    diagramsRendered,
    bundleRoot,
  };
};
