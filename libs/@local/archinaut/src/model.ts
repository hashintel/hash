/**
 * The architecture model, version 3: the schema every consumer reads.
 *
 * Layers and edges keep their v2 shape; a layer now also lists the pages
 * and diagrams kept beside its code.
 */

import { z } from "zod";

export const ARCHITECTURE_MODEL_VERSION = 3;

const layerIdPattern =
  /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*$/u;

export const packageSchema = z.object({
  name: z.string().min(1),
  /** Repo-relative package root. */
  path: z.string().min(1),
  description: z.string(),
  language: z.enum(["typescript", "python"]),
  /** Subdirectory holding the code the architecture describes, relative to `path`. */
  sourceDirectory: z.string().min(1).default("src"),
});

export type ArchitecturePackage = z.infer<typeof packageSchema>;
export type ArchitecturePackageInput = z.input<typeof packageSchema>;

export const layerSchema = z.object({
  id: z
    .string()
    .regex(layerIdPattern, "layer ids are dot-separated kebab-case segments"),
  name: z.string().min(1),
  parent: z.string().nullable(),
  package: z.string().min(1),
  /** One-line statement of what this layer is responsible for. */
  role: z.string().min(1),
  /** Repo-relative path of the declaring `README.md` or entry file. */
  declaredIn: z.string().min(1),
  /** Prose body of the declaring README, if any. */
  prose: z.string().nullable(),
  /** Other markdown under this layer, linked from its page. */
  references: z.array(z.string().min(1)),
  /** MDX pages beside the layer's code, rendered beneath its page. */
  pages: z.array(z.string().min(1)),
  /** D2 sources beside the layer's code, rendered for its pages. */
  diagrams: z.array(z.string().min(1)),
  files: z.array(z.string().min(1)),
  fileCount: z.number().int().nonnegative(),
  lineCount: z.number().int().nonnegative(),
});

export type Layer = z.infer<typeof layerSchema>;

const edgeBaseSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  /** Whether the two layers live in different workspace packages. */
  crossesPackage: z.boolean(),
});

/** An aggregated import relationship between two layers. */
export const importEdgeSchema = edgeBaseSchema.extend({
  provenance: z.literal("imports"),
  /** How many file-level dependencies collapse into this edge. */
  fileDependencies: z.number().int().positive(),
  examples: z.array(z.object({ from: z.string(), to: z.string() })),
});

/** A relationship declared with `@talksTo`, for a boundary no import crosses. */
export const declaredEdgeSchema = edgeBaseSchema.extend({
  provenance: z.literal("declared"),
  protocol: z.string().min(1),
  declaredIn: z.string().min(1),
  line: z.number().int().positive(),
});

export const edgeSchema = z.discriminatedUnion("provenance", [
  importEdgeSchema,
  declaredEdgeSchema,
]);

export type ImportEdge = z.infer<typeof importEdgeSchema>;
export type DeclaredEdge = z.infer<typeof declaredEdgeSchema>;
export type Edge = z.infer<typeof edgeSchema>;

export const isImportEdge = (edge: Edge): edge is ImportEdge =>
  edge.provenance === "imports";

export const isDeclaredEdge = (edge: Edge): edge is DeclaredEdge =>
  edge.provenance === "declared";

export const ruleSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  reason: z.string().min(1),
});

export type LayerRule = z.infer<typeof ruleSchema>;

export const architectureModelSchema = z.object({
  version: z.literal(ARCHITECTURE_MODEL_VERSION),
  packages: z.array(packageSchema),
  layers: z.array(layerSchema),
  edges: z.array(edgeSchema),
  rules: z.array(ruleSchema),
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
