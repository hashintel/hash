/**
 * Hand-written MDX that ships in the same bundle as the generated pages.
 *
 * Authored pages carry the reasoning an import graph cannot supply. They end up
 * in the same manifest as the generated pages, so a host renders one coherent
 * set of docs. Slugs mirror the directory layout under `content/`.
 */

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

import { parseFrontmatterRecord } from "./frontmatter";
import { toPosix } from "./paths";

import type { Dirent } from "node:fs";

export interface AuthoredPage {
  /** Path within the bundle. */
  path: string;
  slug: string;
  title: string;
  description: string;
  contents: string;
  order: number;
  /**
   * Layer id this page explains, from the `attachTo` frontmatter key.
   *
   * When set, the page is placed beneath that layer's page rather than at the
   * top level, so a hand-written guide sits with the generated reference for the
   * same code instead of in a separate section. Null means a standalone page.
   *
   * Note this is *not* a layer declaration — it attaches to a layer declared in
   * the source. Declaring layers from `content/` stays forbidden.
   */
  attachTo: string | null;
  /** Repo-relative source file, for error messages. */
  sourceFile: string;
}

/** A diagram component shipped in the bundle for authored pages to import. */
export interface AuthoredComponent {
  /** Path within the bundle, e.g. `components/lanes.tsx`. */
  path: string;
  /** Import name authors use, e.g. `lanes` for `@diagrams/lanes`. */
  name: string;
  contents: string;
}

/** A hand-written D2 diagram, rendered to SVG alongside the generated ones. */
export interface AuthoredDiagram {
  /** Name pages reference, e.g. `cli-request-flow` for `@diagrams/cli-request-flow.svg`. */
  name: string;
  source: string;
  /** Repo-relative source file, for error messages. */
  sourceFile: string;
}

export interface AuthoredContentResult {
  pages: AuthoredPage[];
  components: AuthoredComponent[];
  diagrams: AuthoredDiagram[];
  errors: { file: string; message: string }[];
}

const authoredExtensions = new Set([".md", ".mdx"]);
const componentExtensions = new Set([".tsx", ".ts", ".css"]);

/** Directory under `content/` holding importable diagram components. */
const componentDirectory = "components";

/** Directory under `content/` holding hand-written `.d2` diagram sources. */
const diagramDirectory = "diagrams";

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
};

/**
 * A scalar frontmatter value as a trimmed string.
 *
 * YAML gives back the type it inferred, so `sidebar_order: 10` is a number and
 * `title: 2026` is too. Anything that is not a scalar (a list, a nested
 * mapping) has no sensible single-line reading and is treated as absent.
 */
const readString = (value: unknown): string | null => {
  if (typeof value === "string") {
    return value.trim() === "" ? null : value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
};

/**
 * Reads `title`, `description`, `sidebar_order` and `attachTo` out of a page's
 * frontmatter, without requiring the architecture-declaration shape.
 */
const readPageMeta = (
  record: Record<string, unknown> | null,
): {
  title: string | null;
  description: string;
  order: number;
  attachTo: string | null;
} => {
  if (record === null) {
    return { title: null, description: "", order: 100, attachTo: null };
  }

  const rawOrder = record.sidebar_order;
  const order =
    typeof rawOrder === "number" ? rawOrder : Number(readString(rawOrder));

  return {
    title: readString(record.title),
    description: readString(record.description) ?? "",
    order: Number.isFinite(order) ? order : 100,
    attachTo: readString(record.attachTo),
  };
};

/** Derives a heading-based title when frontmatter omits one. */
const firstHeading = (markdown: string): string | null => {
  const withoutFrontmatter = markdown.replace(
    /^---\r?\n[\s\S]*?\r?\n---\r?\n?/u,
    "",
  );
  const match = /^#\s+(.+)$/mu.exec(withoutFrontmatter);
  return match ? (match[1] ?? "").trim() : null;
};

const titleFromSlug = (slug: string): string => {
  const last = slug.split("/").pop() ?? slug;
  return last
    .split("-")
    .map((word) =>
      word === "" ? word : word[0]?.toUpperCase() + word.slice(1),
    )
    .join(" ");
};

export const collectAuthoredContent = async (options: {
  repoRoot: string;
  contentDirectory: string;
}): Promise<AuthoredContentResult> => {
  const root = join(options.repoRoot, options.contentDirectory);
  const pages: AuthoredPage[] = [];
  const components: AuthoredComponent[] = [];
  const diagrams: AuthoredDiagram[] = [];
  const errors: { file: string; message: string }[] = [];

  let entries: Dirent<string>[];
  try {
    entries = await readdir(root, { withFileTypes: true, recursive: true });
  } catch (cause) {
    // An absent directory is a normal state, since `content/` is optional.
    // Anything else (a permission error, a bad path) would otherwise drop every
    // authored page and still report success.
    if ((cause as NodeJS.ErrnoException).code !== "ENOENT") {
      throw cause;
    }
    return { pages, components, diagrams, errors };
  }

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const componentPath = toPosix(
      relative(root, join(entry.parentPath, entry.name)),
    );

    if (componentPath.startsWith(`${componentDirectory}/`)) {
      if (componentExtensions.has(extensionOf(entry.name))) {
        components.push({
          path: componentPath,
          name: componentPath
            .slice(componentDirectory.length + 1)
            .replace(/\.[^.]+$/u, ""),
          contents: await readFile(join(entry.parentPath, entry.name), "utf8"),
        });
      }
      continue;
    }

    if (componentPath.startsWith(`${diagramDirectory}/`)) {
      if (extensionOf(entry.name) === ".d2") {
        diagrams.push({
          name: componentPath
            .slice(diagramDirectory.length + 1)
            .replace(/\.d2$/u, ""),
          source: await readFile(join(entry.parentPath, entry.name), "utf8"),
          sourceFile: toPosix(
            relative(options.repoRoot, join(entry.parentPath, entry.name)),
          ),
        });
      }
      continue;
    }

    if (!authoredExtensions.has(extensionOf(entry.name))) {
      continue;
    }

    const absolutePath = join(entry.parentPath, entry.name);
    const relativePath = toPosix(relative(root, absolutePath));
    const contents = await readFile(absolutePath, "utf8");

    const { record, errors: frontmatterErrors } =
      parseFrontmatterRecord(contents);

    // Checked as a key, not as a successful declaration parse. Going through
    // the strict declaration schema meant an unrelated key such as `title`
    // failed the parse and let the `layer` key through unreported.
    if (record !== null && "layer" in record) {
      errors.push({
        file: toPosix(relative(options.repoRoot, absolutePath)),
        message:
          "authored pages must not declare a layer; layer declarations belong in the source packages",
      });
    }

    // `parseFrontmatterRecord` only reports unreadable YAML, which is the one
    // failure an authored page cannot legitimately have.
    for (const message of frontmatterErrors) {
      errors.push({
        file: toPosix(relative(options.repoRoot, absolutePath)),
        message,
      });
    }

    const slug = relativePath.replace(/\.(?:md|mdx)$/iu, "");
    const meta = readPageMeta(record);

    pages.push({
      path: `pages/${slug}.mdx`,
      slug,
      title: meta.title ?? firstHeading(contents) ?? titleFromSlug(slug),
      description: meta.description,
      contents,
      order: meta.order,
      attachTo: meta.attachTo,
      sourceFile: toPosix(relative(options.repoRoot, absolutePath)),
    });
  }

  return {
    pages: pages.sort((left, right) => left.slug.localeCompare(right.slug)),
    components: components.sort((left, right) =>
      left.path.localeCompare(right.path),
    ),
    diagrams: diagrams.sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
    errors,
  };
};
