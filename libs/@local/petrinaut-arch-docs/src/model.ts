/**
 * The architecture model — the single artefact every consumer reads.
 *
 * `architecture.json` is the source of truth for the generated docs bundle.
 * The Starlight site, hash.dev, the CI drift checks and any AI agent all read
 * this file rather than re-parsing the codebase, so the schema here is the
 * public contract. It is versioned: bump `ARCHITECTURE_MODEL_VERSION` on any
 * breaking shape change so downstream consumers can fail loudly instead of
 * silently mis-reading fields.
 *
 * Nothing in the model is time-dependent. The same commit must always produce
 * a byte-identical model, which is what lets CI diff a fresh build against the
 * committed bundle to detect drift.
 */

import { z } from "zod";

export const ARCHITECTURE_MODEL_VERSION = 1;

/**
 * The kinds of boundary a layer can sit on.
 *
 * A boundary is a place where the *cost or semantics* of a call change —
 * crossing one is never free and never implicit. These are the categories that
 * actually exist in Petrinaut; add a kind only when a genuinely new sort of hop
 * appears, because each one is a claim the drift checks have to be able to test.
 */
export const boundaryKindSchema = z.enum([
  /** Main thread ⇄ worker thread: structured clone, no shared closures. */
  "thread",
  /** A dedicated Web Worker / `worker_threads` entry point. */
  "worker",
  /** A separate OS process (CLI subprocess, Python service). */
  "process",
  /** An HTTP / SSE / WebSocket hop. */
  "network",
  /** The published surface of an npm package — semver applies. */
  "package",
  /** Evaluation of user-authored code under restricted globals. */
  "sandbox",
]);

export type BoundaryKind = z.infer<typeof boundaryKindSchema>;

export const boundarySchema = z.object({
  kind: boundaryKindSchema,
  /** Why the boundary exists / what may not cross it. */
  note: z.string().min(1),
  /** Repo-relative file the annotation was read from. */
  source: z.string().min(1),
  line: z.number().int().positive(),
});

export type Boundary = z.infer<typeof boundarySchema>;

export const annotationSchema = z.object({
  text: z.string().min(1),
  source: z.string().min(1),
  line: z.number().int().positive(),
});

export type Annotation = z.infer<typeof annotationSchema>;

/**
 * A layer: one node in the architecture, and one page in the docs.
 *
 * `id` is dotted and hierarchical (`core.simulation.monte-carlo`). Every
 * ancestor segment must itself be a declared layer — the checks enforce this so
 * the taxonomy cannot grow implicit holes.
 */
export const layerSchema = z.object({
  id: z
    .string()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*$/u,
      "layer ids are dot-separated kebab-case segments",
    ),
  /** Human-facing name, used as the diagram node label and page title. */
  name: z.string().min(1),
  /** Dotted id of the parent layer, or null at the root. */
  parent: z.string().nullable(),
  /** Workspace package the declaration lives in. */
  package: z.string().min(1),
  /** One-line statement of what this layer is responsible for. */
  role: z.string().min(1),
  /** Repo-relative path of the declaring `README.md` or entry file. */
  declaredIn: z.string().min(1),
  /**
   * Prose body of the declaring README, if any. This is why declarations
   * prefer READMEs: existing folder docs become layer pages for free.
   */
  prose: z.string().nullable(),
  boundaries: z.array(boundarySchema),
  invariants: z.array(annotationSchema),
  /** Public import specifiers through which this layer is reachable. */
  seams: z.array(z.string().min(1)),
  owner: z.string().nullable(),
  /**
   * Markdown files under this layer that are not the declaration itself —
   * design notes like `hir/BUFFER_ABI.md`. Linked from the layer page so
   * existing deep-dive docs stay discoverable instead of orphaned.
   */
  references: z.array(z.string().min(1)),
  /** Repo-relative source files resolved to this layer, sorted. */
  files: z.array(z.string().min(1)),
  fileCount: z.number().int().nonnegative(),
  /** Total non-blank lines across `files`. A rough size signal for diagrams. */
  lineCount: z.number().int().nonnegative(),
});

export type Layer = z.infer<typeof layerSchema>;

/** An aggregated import relationship between two layers. */
export const edgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  /** How many file-level imports collapse into this edge. */
  fileDependencies: z.number().int().positive(),
  /**
   * A few representative file-level imports, so a reader can jump straight to
   * real code instead of guessing which files the edge stands for.
   */
  examples: z.array(z.object({ from: z.string(), to: z.string() })),
  /**
   * Whether the two layers live in different workspace packages.
   *
   * Deliberately the *only* boundary fact derived for edges. Which runtime
   * boundaries an import crosses cannot be read off a static import graph: a
   * module importing into a worker-boundary layer is how you obtain the module,
   * not evidence that a thread hop occurs. Package membership, by contrast, is
   * a property of the two layers and is always true when reported.
   */
  crossesPackage: z.boolean(),
});

export type Edge = z.infer<typeof edgeSchema>;

export const packageSchema = z.object({
  name: z.string().min(1),
  /** Repo-relative package root. */
  path: z.string().min(1),
  description: z.string(),
  language: z.enum(["typescript", "python"]),
  /**
   * Subdirectory holding the code the architecture describes, relative to
   * `path`. Build configuration (`vite.config.ts`, `panda.config.ts`,
   * `.storybook/`) sits outside it and is deliberately not part of any layer —
   * it configures the build, it is not a piece of the system's design.
   */
  sourceDirectory: z.string().min(1).default("src"),
});

export type ArchitecturePackage = z.infer<typeof packageSchema>;

/** Config-facing shape, where defaulted fields may be omitted. */
export type ArchitecturePackageInput = z.input<typeof packageSchema>;

export const architectureModelSchema = z.object({
  version: z.literal(ARCHITECTURE_MODEL_VERSION),
  packages: z.array(packageSchema),
  layers: z.array(layerSchema),
  edges: z.array(edgeSchema),
  /**
   * Layer-crossing rules declared in config, echoed into the model so
   * consumers can render "what is forbidden" without reading the config.
   */
  rules: z.array(
    z.object({
      from: z.string().min(1),
      to: z.string().min(1),
      reason: z.string().min(1),
    }),
  ),
});

export type ArchitectureModel = z.infer<typeof architectureModelSchema>;

/** Derive the parent layer id from a dotted id (`a.b.c` → `a.b`). */
export const parentLayerId = (id: string): string | null => {
  const lastDot = id.lastIndexOf(".");
  return lastDot === -1 ? null : id.slice(0, lastDot);
};

/** All ancestor ids of a dotted id, nearest first. */
export const ancestorLayerIds = (id: string): string[] => {
  const ancestors: string[] = [];
  let current = parentLayerId(id);
  while (current !== null) {
    ancestors.push(current);
    current = parentLayerId(current);
  }
  return ancestors;
};
