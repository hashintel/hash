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

const frontmatterPattern = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/u;

/**
 * Strict: a declaration is exactly a layer id and a role.
 *
 * An unknown key next to a `layer` is a typo or a leftover from a vocabulary
 * this version does not have, and either is worth a build error rather than
 * silence — a misspelled `role` would otherwise leave the layer with no
 * responsibility statement and no complaint.
 */
export const layerDeclarationSchema = z
  .object({
    /** Dotted layer id this folder and its descendants belong to. */
    layer: z.string().min(1),
    /** One-line responsibility statement. */
    role: z.string().min(1),
  })
  .strict();

export type LayerDeclaration = z.infer<typeof layerDeclarationSchema>;

export interface FrontmatterRecord {
  /** The mapping as YAML read it, or null when there is no frontmatter. */
  record: Record<string, unknown> | null;
  /** Markdown body with frontmatter removed. */
  body: string;
  errors: string[];
}

export interface FrontmatterResult {
  /** Present only when the frontmatter carried a `layer` key. */
  declaration: LayerDeclaration | null;
  /** Markdown body with frontmatter removed. */
  body: string;
  errors: string[];
}

/**
 * Reads the frontmatter block as YAML, with no schema applied.
 *
 * Every caller goes through here, so a page's metadata and the check that it
 * does not declare a layer see the same mapping. Reading it twice, once as YAML
 * and once by splitting lines, made `attachTo: core.simulation # comment` parse
 * differently in the two places, and let a `layer` key hide behind an unrelated
 * key such as `title`.
 */
export const parseFrontmatterRecord = (markdown: string): FrontmatterRecord => {
  const match = frontmatterPattern.exec(markdown);

  if (!match) {
    return { record: null, body: markdown.trim(), errors: [] };
  }

  const body = markdown.slice(match[0].length).trim();

  let parsed: unknown;
  try {
    parsed = load(match[1] ?? "");
  } catch (cause) {
    return {
      record: null,
      body,
      errors: [
        `invalid YAML frontmatter: ${cause instanceof Error ? cause.message : String(cause)}`,
      ],
    };
  }

  // A scalar or a list is valid YAML but not a mapping, so there are no keys to
  // read. Treated as absent rather than as an error, matching a file with no
  // frontmatter at all.
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { record: null, body, errors: [] };
  }

  return { record: parsed as Record<string, unknown>, body, errors: [] };
};

/**
 * Keys that only make sense as part of a layer declaration. Seeing one without
 * a `layer` key almost always means the declaration is half-written, so it is
 * reported rather than ignored.
 */
const declarationOnlyKeys = new Set(["role"]);

export const parseFrontmatter = (markdown: string): FrontmatterResult => {
  const { record, body, errors } = parseFrontmatterRecord(markdown);

  if (record === null) {
    return { declaration: null, body, errors };
  }

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
