/**
 * The architecture model — the schema every consumer reads.
 *
 * Consumers read `architecture.json` rather than re-parsing the codebase, so
 * this is the public contract; bump `ARCHITECTURE_MODEL_VERSION` on a breaking
 * shape change so they fail loudly rather than mis-reading fields.
 */

import { z } from "zod";

export const ARCHITECTURE_MODEL_VERSION = 1;

/**
 * The kinds of boundary a layer can sit on.
 *
 * A boundary is where the cost or semantics of a call change — crossing one is
 * never free and never implicit. `thread` is a hop across an existing one;
 * `worker` is the entry point that defines one.
 */
export const boundaryKindSchema = z.enum([
  "thread",
  "worker",
  "process",
  "network",
  "package",
  "sandbox",
]);

export type BoundaryKind = z.infer<typeof boundaryKindSchema>;

export const boundarySchema = z.object({
  kind: boundaryKindSchema,
  /** What may not cross it. */
  note: z.string().min(1),
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
  name: z.string().min(1),
  parent: z.string().nullable(),
  package: z.string().min(1),
  /** One-line statement of what this layer is responsible for. */
  role: z.string().min(1),
  /** Repo-relative path of the declaring `README.md` or entry file. */
  declaredIn: z.string().min(1),
  /** Prose body of the declaring README, if any — becomes the page body. */
  prose: z.string().nullable(),
  boundaries: z.array(boundarySchema),
  invariants: z.array(annotationSchema),
  /** Public import specifiers through which this layer is reachable. */
  entryPoints: z.array(z.string().min(1)),
  /** Other markdown under this layer, e.g. `hir/BUFFER_ABI.md`, linked from its page. */
  references: z.array(z.string().min(1)),
  files: z.array(z.string().min(1)),
  fileCount: z.number().int().nonnegative(),
  /** Total non-blank lines across `files`. */
  lineCount: z.number().int().nonnegative(),
});

export type Layer = z.infer<typeof layerSchema>;

/** An aggregated import relationship between two layers. */
export const edgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  /** How many file-level imports collapse into this edge. */
  fileDependencies: z.number().int().positive(),
  /** A few representative imports, so a reader can jump to real code. */
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
  /** Echoed from config so consumers can render the rules without reading it. */
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
