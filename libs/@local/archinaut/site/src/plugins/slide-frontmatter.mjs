/**
 * An MDX slide's frontmatter: the YAML block at the top of the file that
 * names the slide, lays it out and holds its presenter notes, as a docs
 * page's frontmatter does for the page.
 *
 * Strict: an unknown key is a typo, and a typo should fail the compile
 * rather than leave a title slide without its subtitle.
 */

import { CORE_SCHEMA, load } from "js-yaml";
import { z } from "zod";

const text = z.string().min(1);

const fields = z.strictObject({
  /** The slide's name in the presenter view, the tab, and the header without a `label`. */
  title: text.optional(),
  /** The header's text after the logo. */
  label: text.optional(),
  /** `title` draws the talk's title: `title` large, then `subtitle` and `author`. */
  layout: z.enum(["content", "title"]).optional(),
  /** Where a content slide's body sits under its heading: at the top, or centred in the space left. */
  align: z.enum(["top", "center"]).optional(),
  subtitle: text.optional(),
  author: text.optional(),
  notes: z
    .union(
      [
        z.string(),
        z.strictObject({
          default: z.string().optional(),
          byStep: z.record(z.string().regex(/^\d+$/u), z.string()).optional(),
        }),
      ],
      {
        error:
          "notes are a string, or a `default` note and `byStep` notes keyed by step number",
      },
    )
    .optional(),
  /** Overrides the worked-out step count; the compile fails if the slide uses a later step. */
  steps: z.int().min(1).optional(),
});

/** The keys a slide's frontmatter may hold, which its code may not export. */
export const slideFrontmatterKeys = Object.keys(fields.shape);

export const slideFrontmatterSchema = fields
  .refine(
    (meta) =>
      meta.layout === "title" ||
      (meta.subtitle === undefined && meta.author === undefined),
    {
      message:
        "only a title slide shows `subtitle` and `author`; add `layout: title`",
    },
  )
  .refine((meta) => meta.layout !== "title" || meta.title !== undefined, {
    message: "a title slide needs a `title`",
    path: ["title"],
  })
  .refine((meta) => meta.layout !== "title" || meta.align === undefined, {
    message: "a title slide lays itself out; `align` is for content slides",
    path: ["align"],
  });

/**
 * The slide's metadata from its frontmatter's YAML, checked.
 *
 * @param {string} source the YAML between the `---` lines
 * @param {string} where the slide's path, for errors
 * @returns {z.infer<typeof slideFrontmatterSchema>}
 */
export const readSlideFrontmatter = (source, where) => {
  /** @type {unknown} */
  let data;
  try {
    // The core schema keeps a date such as 2026-11-03 a string.
    data = load(source, { schema: CORE_SCHEMA }) ?? {};
  } catch (error) {
    throw new Error(
      `${where}: the frontmatter is not YAML: ${error instanceof Error ? error.message : String(error)}\n` +
        'A value that holds ": " needs quotes, or a block scalar: `notes: >-` with the text indented on the lines below.',
    );
  }
  const result = slideFrontmatterSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`${where}: frontmatter\n${z.prettifyError(result.error)}`);
  }
  return result.data;
};
