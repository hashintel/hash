/**
 * One build: the pipeline, the bundle, and, when asked to write, the bundle
 * directory brought up to date and the changed diagrams rendered. Every
 * command runs this; `check` with `write: false`, the others with `true`.
 */

import { join } from "node:path";

import { bundleFiles, emitBundle, type Bundle } from "./bundle";
import { findD2 } from "./bundle/d2";
import { renderDiagrams } from "./bundle/render-diagrams";
import { diffAgainstBase, seedBaseCache } from "./diff";
import {
  runPipeline,
  type PipelineOptions,
  type PipelineResult,
} from "./pipeline";
import { countErrors, warning, type Diagnostic } from "./shared/diagnostics";
import { syncDirectory } from "./shared/sync-directory";

import type { ArchinautConfig } from "./config";

export interface BuildResult {
  pipeline: PipelineResult;
  bundle: Bundle;
  diagnostics: Diagnostic[];
  /** Bundle files written this time, relative to the bundle root; empty when nothing changed or nothing was written. */
  written: string[];
  /** Bundle files the model no longer produces, removed this time. */
  removed: string[];
  diagramsRendered: number;
  /** Where the bundle lives, absolute. */
  bundleRoot: string;
}

export interface BuildOptions extends PipelineOptions {
  write: boolean;
  /** A git ref to mark changes against; null builds a plain bundle. */
  diffBase?: string | null;
}

/** Emits and, when asked, writes the bundle for an already-built model. */
export const writeBuild = async (
  config: ArchinautConfig,
  pipeline: PipelineResult,
  options: BuildOptions,
): Promise<BuildResult> => {
  const bundleRoot = join(config.root, config.outputDirectory);
  const d2 = options.write ? findD2(config.root) : null;
  const cacheDirectory = join(config.root, config.cacheDirectory);

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
      removed: [],
      diagramsRendered: 0,
      bundleRoot,
    };
  }

  // Applied only to a bundle that passed the checks, and never gating it: when
  // the base cannot be resolved or built, the plain bundle is written with a
  // warning.
  let output = bundle;
  const diffBase = options.diffBase ?? null;
  if (diffBase !== null) {
    try {
      const diff = await diffAgainstBase({
        config,
        model: pipeline.model,
        bundle,
        ref: diffBase,
        includeDiagrams: d2 !== null,
      });
      output = diff.bundle;
      const changes = Object.values(diff.bundle.manifest.diff?.pages ?? {});
      process.stdout.write(
        `changes vs ${diffBase} (${diff.baseSha.slice(0, 10)}${diff.fromCache ? ", base from cache" : ""}${diff.fetchedFrom === null ? "" : `, fetched from ${diff.fetchedFrom}`}): ${changes.filter((status) => status === "added").length} added · ${changes.filter((status) => status === "changed").length} changed · ${changes.filter((status) => status === "removed").length} removed\n`,
      );
    } catch (cause) {
      diagnostics.push(
        warning(
          "archinaut.config.ts",
          `building without change highlighting: could not compare against \`${diffBase}\` (${cause instanceof Error ? cause.message : String(cause)})`,
        ),
      );
    }
  }
  // A clean build's own side is a future base; seeded before the diff's base
  // was read, this could evict the entry the diff was about to use.
  seedBaseCache({
    config,
    model: pipeline.model,
    bundle,
    includeDiagrams: d2 !== null,
  });

  const files = bundleFiles(pipeline.model, output);
  const summary = await syncDirectory(bundleRoot, files, {
    // Rendered SVGs sit beside their sources and are not in `files`.
    keep: (path) => path.endsWith(".svg"),
  });

  let diagramsRendered = 0;
  const written = [...summary.written];
  if (d2 !== null) {
    const names = [...files.keys()]
      .filter((path) => path.startsWith("diagrams/") && path.endsWith(".d2"))
      .map((path) => path.slice("diagrams/".length, -".d2".length));
    const rendering = await renderDiagrams({
      d2,
      repoRoot: config.root,
      bundleRoot,
      cacheDirectory: join(cacheDirectory, "diagrams"),
      names,
    });
    diagnostics.push(...rendering.diagnostics);
    diagramsRendered = rendering.rendered;
    written.push(...rendering.written);
  }

  return {
    pipeline,
    bundle,
    diagnostics,
    written,
    removed: summary.removed,
    diagramsRendered,
    bundleRoot,
  };
};

export const buildArchitecture = async (
  config: ArchinautConfig,
  options: BuildOptions,
): Promise<BuildResult> =>
  writeBuild(config, await runPipeline(config, options), options);
