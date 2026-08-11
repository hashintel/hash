/**
 * Hand-written MDX that ships in the same bundle as the generated pages.
 *
 * Authored pages carry the reasoning an import graph cannot supply. They end up
 * in the same manifest as the generated pages, so a host renders one coherent
 * set of docs. Slugs mirror the directory layout under `content/`.
 */

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

import { parseFrontmatter } from "./frontmatter";
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

export interface AuthoredContentResult {
  pages: AuthoredPage[];
  components: AuthoredComponent[];
  errors: { file: string; message: string }[];
}

const authoredExtensions = new Set([".md", ".mdx"]);
const componentExtensions = new Set([".tsx", ".ts", ".css"]);

/** Directory under `content/` holding importable diagram components. */
const componentDirectory = "components";

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
};

/**
 * Reads `title`, `description` and `sidebar_order` out of frontmatter without
 * requiring the architecture-declaration shape, which authored pages do not use.
 */
const readPageMeta = (
  markdown: string,
): {
  title: string | null;
  description: string;
  order: number;
  attachTo: string | null;
} => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(markdown);

  if (!match) {
    return { title: null, description: "", order: 100, attachTo: null };
  }

  const fields = match[1] ?? "";
  const read = (key: string): string | null => {
    const found = new RegExp(`^${key}\\s*:\\s*(.+)$`, "mu").exec(fields);
    if (!found) {
      return null;
    }
    return (found[1] ?? "").trim().replace(/^["']|["']$/gu, "");
  };

  const rawOrder = read("sidebar_order");
  const parsedOrder = rawOrder === null ? Number.NaN : Number(rawOrder);

  return {
    title: read("title"),
    description: read("description") ?? "",
    order: Number.isFinite(parsedOrder) ? parsedOrder : 100,
    attachTo: read("attachTo"),
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
  const errors: { file: string; message: string }[] = [];

  let entries: Dirent<string>[];
  try {
    entries = await readdir(root, { withFileTypes: true, recursive: true });
  } catch {
    // No content directory yet is a normal state, not an error.
    return { pages, components, errors };
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

    if (!authoredExtensions.has(extensionOf(entry.name))) {
      continue;
    }

    const absolutePath = join(entry.parentPath, entry.name);
    const relativePath = toPosix(relative(root, absolutePath));
    const contents = await readFile(absolutePath, "utf8");

    const { declaration, errors: frontmatterErrors } =
      parseFrontmatter(contents);

    if (declaration !== null) {
      errors.push({
        file: toPosix(relative(options.repoRoot, absolutePath)),
        message:
          "authored pages must not declare a layer; layer declarations belong in the source packages",
      });
    }

    // Only surface hard YAML failures — authored pages legitimately carry
    // frontmatter that is not an architecture declaration.
    for (const message of frontmatterErrors) {
      if (message.startsWith("invalid YAML")) {
        errors.push({
          file: toPosix(relative(options.repoRoot, absolutePath)),
          message,
        });
      }
    }

    const slug = relativePath.replace(/\.(?:md|mdx)$/iu, "");
    const meta = readPageMeta(contents);

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
    errors,
  };
};
