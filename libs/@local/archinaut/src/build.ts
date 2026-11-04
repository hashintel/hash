/**
 * One build: the pipeline, the bundle, and, when asked to write, the bundle
 * directory brought up to date and the changed diagrams rendered. Every
 * command runs this; `check` with `write: false`, the others with `true`.
 */

import { join } from "node:path";

import { bundleFiles, emitBundle, type Bundle } from "./bundle";
import { findD2, type D2 } from "./bundle/d2";
import { renderDiagrams } from "./bundle/render-diagrams";
import { diffAgainstBase, seedBaseCache } from "./diff";
import { runPipeline, type PipelineResult } from "./pipeline";
import {
  countErrors,
  messageOf,
  warning,
  type Diagnostic,
} from "./shared/diagnostics";
import { syncDirectory } from "./shared/sync-directory";

import type { ArchinautConfig } from "./config";
import type { ArchitectureModel } from "./model";

/** What a diff build compared against, and what it found. */
export interface DiffSummary {
  baseRef: string;
  baseSha: string;
  fromCache: boolean;
  /** The remote URL the base tree came from, when the local clone could not supply it. */
  fetchedFrom: string | null;
  added: number;
  changed: number;
  removed: number;
}

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
  /** Null when the build compared against nothing. */
  diff: DiffSummary | null;
}

export interface BuildOptions {
  write: boolean;
  /** A git ref to mark changes against; null builds a plain bundle. */
  diffBase?: string | null;
}

/**
 * The bundle with changes against `ref` marked. The diff decorates a build
 * and never gates it: when the base cannot be resolved or built, the plain
 * bundle is kept with a warning.
 */
const decorateWithDiff = async (options: {
  config: ArchinautConfig;
  model: ArchitectureModel;
  bundle: Bundle;
  ref: string;
  includeDiagrams: boolean;
}): Promise<{
  bundle: Bundle;
  diff: DiffSummary | null;
  diagnostics: Diagnostic[];
}> => {
  try {
    const diff = await diffAgainstBase(options);
    const statuses = Object.values(diff.bundle.manifest.diff?.pages ?? {});
    const count = (status: string): number =>
      statuses.filter((each) => each === status).length;
    return {
      bundle: diff.bundle,
      diff: {
        baseRef: options.ref,
        baseSha: diff.baseSha,
        fromCache: diff.fromCache,
        fetchedFrom: diff.fetchedFrom,
        added: count("added"),
        changed: count("changed"),
        removed: count("removed"),
      },
      diagnostics: [],
    };
  } catch (cause) {
    return {
      bundle: options.bundle,
      diff: null,
      diagnostics: [
        warning(
          "archinaut.config.ts",
          `building without change highlighting: could not compare against \`${options.ref}\` (${messageOf(cause)})`,
        ),
      ],
    };
  }
};

/** Brings the bundle directory up to date and renders the diagrams that changed. */
const writeBundleFiles = async (options: {
  config: ArchinautConfig;
  bundleRoot: string;
  files: Map<string, string>;
  d2: D2 | null;
}): Promise<{
  written: string[];
  removed: string[];
  diagramsRendered: number;
  diagnostics: Diagnostic[];
}> => {
  const { config, bundleRoot, files, d2 } = options;
  const summary = await syncDirectory(bundleRoot, files, {
    // Rendered SVGs sit beside their sources and are not in `files`.
    keep: (path) => path.endsWith(".svg"),
  });
  if (d2 === null) {
    return { ...summary, diagramsRendered: 0, diagnostics: [] };
  }
  const rendering = await renderDiagrams({
    d2,
    repoRoot: config.root,
    bundleRoot,
    cacheDirectory: join(config.cacheDirectory, "diagrams"),
    names: [...files.keys()]
      .filter((path) => path.startsWith("diagrams/") && path.endsWith(".d2"))
      .map((path) => path.slice("diagrams/".length, -".d2".length)),
  });
  return {
    written: [...summary.written, ...rendering.written],
    removed: summary.removed,
    diagramsRendered: rendering.rendered,
    diagnostics: rendering.diagnostics,
  };
};

/** Emits and, when asked, writes the bundle for an already-built model. */
export const writeBuild = async (
  config: ArchinautConfig,
  pipeline: PipelineResult,
  options: BuildOptions,
): Promise<BuildResult> => {
  const bundleRoot = join(config.root, config.outputDirectory);
  const d2 = options.write ? findD2(config.root) : null;
  const bundle = await emitBundle({
    model: pipeline.model,
    repoRoot: config.root,
    contentDirectory: config.contentDirectory,
    sourceUrlPrefix: config.sourceUrlPrefix,
    includeDiagrams: d2 !== null,
  });
  const diagnostics = [...pipeline.diagnostics, ...bundle.diagnostics];
  const unwritten: BuildResult = {
    pipeline,
    bundle,
    diagnostics,
    written: [],
    removed: [],
    diagramsRendered: 0,
    bundleRoot,
    diff: null,
  };
  if (!options.write || countErrors(diagnostics) > 0) {
    return unwritten;
  }

  const diffBase = options.diffBase ?? null;
  const decorated =
    diffBase === null
      ? { bundle, diff: null, diagnostics: [] }
      : await decorateWithDiff({
          config,
          model: pipeline.model,
          bundle,
          ref: diffBase,
          includeDiagrams: d2 !== null,
        });
  // A clean build's own side is a future base; seeded after the diff read
  // its base, since seeding first could evict the entry the diff was about
  // to use.
  seedBaseCache({
    config,
    model: pipeline.model,
    bundle,
    includeDiagrams: d2 !== null,
  });
  const output = await writeBundleFiles({
    config,
    bundleRoot,
    files: bundleFiles(pipeline.model, decorated.bundle),
    d2,
  });
  return {
    ...unwritten,
    diagnostics: [
      ...diagnostics,
      ...decorated.diagnostics,
      ...output.diagnostics,
    ],
    written: output.written,
    removed: output.removed,
    diagramsRendered: output.diagramsRendered,
    diff: decorated.diff,
  };
};

export const buildArchitecture = async (
  config: ArchinautConfig,
  options: BuildOptions,
): Promise<BuildResult> =>
  writeBuild(config, await runPipeline(config), options);
