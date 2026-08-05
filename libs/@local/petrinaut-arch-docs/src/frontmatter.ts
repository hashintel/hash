/**
 * Layer declarations read from folder `README.md` frontmatter.
 *
 * A README is the natural home for folder-level architecture metadata: the
 * frontmatter declares the layer, and the prose below it becomes the layer's
 * page body. Several Petrinaut folders already have READMEs describing exactly
 * this, so declaring a layer there costs a few lines of frontmatter rather than
 * a new document.
 *
 * A README *without* a `layer` key is not a declaration — it stays an ordinary
 * document and is surfaced as a reference on whichever layer it falls under.
 */

import { load } from "js-yaml";
import { z } from "zod";

import { boundaryKindSchema } from "./model";

const frontmatterPattern = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/u;

export const layerDeclarationSchema = z
  .object({
    /** Dotted layer id this folder and its descendants belong to. */
    layer: z.string().min(1),
    /** Human-facing layer name. Falls back to the last id segment. */
    name: z.string().min(1).optional(),
    /** One-line responsibility statement. */
    role: z.string().min(1),
    seams: z.array(z.string().min(1)).default([]),
    boundaries: z
      .array(
        z.object({
          kind: boundaryKindSchema,
          note: z.string().min(1),
        }),
      )
      .default([]),
    invariants: z.array(z.string().min(1)).default([]),
    owner: z.string().min(1).optional(),
  })
  .strict();

export type LayerDeclaration = z.infer<typeof layerDeclarationSchema>;

export interface FrontmatterResult {
  /** Present only when the frontmatter carried a `layer` key. */
  declaration: LayerDeclaration | null;
  /** Markdown body with frontmatter removed. */
  body: string;
  errors: string[];
}

/**
 * Keys that only make sense as part of a layer declaration. Seeing one without
 * a `layer` key almost always means the declaration is half-written, so it is
 * reported rather than ignored.
 */
const declarationOnlyKeys = new Set([
  "role",
  "seams",
  "boundaries",
  "invariants",
]);

export const parseFrontmatter = (markdown: string): FrontmatterResult => {
  const match = frontmatterPattern.exec(markdown);

  if (!match) {
    return { declaration: null, body: markdown.trim(), errors: [] };
  }

  const body = markdown.slice(match[0].length).trim();
  let parsed: unknown;

  try {
    parsed = load(match[1] ?? "");
  } catch (error) {
    return {
      declaration: null,
      body,
      errors: [
        `invalid YAML frontmatter: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { declaration: null, body, errors: [] };
  }

  const record = parsed as Record<string, unknown>;

  if (!("layer" in record)) {
    const strayKeys = Object.keys(record).filter((key) =>
      declarationOnlyKeys.has(key),
    );

    return {
      declaration: null,
      body,
      errors:
        strayKeys.length > 0
          ? [
              `frontmatter has ${strayKeys.map((key) => `\`${key}\``).join(", ")} but no \`layer\` key, so it does not declare a layer`,
            ]
          : [],
    };
  }

  const result = layerDeclarationSchema.safeParse(record);

  if (!result.success) {
    return {
      declaration: null,
      body,
      errors: result.error.issues.map(
        (issue) =>
          `${issue.path.length > 0 ? `${issue.path.join(".")}: ` : ""}${issue.message}`,
      ),
    };
  }

  return { declaration: result.data, body, errors: [] };
};
