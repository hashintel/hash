/**
 * Classifies every page against a base build and rewrites the changed ones.
 *
 * Both sides come from the *same* generator run over two source trees, so the
 * emitter, the config and the source-URL prefix cannot differ between them —
 * what survives normalization is a real change. The classification is per
 * page: `added` and `removed` by slug presence, `changed` when the normalized
 * content differs or the layer's own file membership moved. Removed pages get
 * a stub ("tombstone") page carrying the removed source, so navigation has
 * something to point at.
 */

import { buildManifest } from "../emit/bundle-outputs";
import { assetPathFrom, frontmatter, layerSlug } from "../emit/mdx";
import { DIFF_MARKER_MODULE } from "../emit/shipped-components";
import { annotatePageBlocks, splitFrontmatter } from "./annotate";
import { diffBlocks, splitBlocks } from "./blocks";
import { normalizeGeneratedBlock } from "./normalize";

import type { BuiltBundle } from "../build";
import type { Layer } from "../model";

export type PageChange = "added" | "changed" | "removed";

/** The slice of a page the diff needs, common to generated and authored. */
export interface DiffPage {
  slug: string;
  title: string;
  description: string;
  order: number;
  kind: "generated" | "authored";
  contents: string;
}

export interface DiffSide {
  pages: DiffPage[];
  layers: Layer[];
  /**
   * The source-URL prefix this side's generated pages embed. Each side's own
   * prefix is replaced with one placeholder before comparison: the prefix
   * carries the built commit, so it legitimately differs between a head build
   * and a base side built earlier (a cached one), without a single page
   * having changed.
   */
  sourceUrlPrefix: string;
}

const SOURCE_PREFIX_PLACEHOLDER = "https://source.invalid/";

const stripSourcePrefix = (text: string, prefix: string): string =>
  prefix === "" ? text : text.split(prefix).join(SOURCE_PREFIX_PLACEHOLDER);

export interface PageDiffResult {
  /** Page slug → how it differs from the base. Unchanged slugs are absent. */
  statuses: Record<string, PageChange>;
  /** Changed pages rewritten with block markers, by slug. */
  annotated: Map<string, string>;
  /** Stub pages standing in for removed ones, so navigation can show them. */
  tombstones: DiffPage[];
}

/**
 * Layers whose file membership changed between the two models.
 *
 * The one structural change a page's normalized content cannot show: counts
 * are masked, and the page never lists its files. Everything else about a
 * layer — role, prose, name, parent, declaring file, outgoing edges,
 * references — already appears in the content and is compared there.
 */
const layersWithMovedFiles = (
  baseLayers: Layer[],
  headLayers: Layer[],
): Set<string> => {
  const baseFiles = new Map(
    baseLayers.map((layer) => [layer.id, [...layer.files].sort().join("\n")]),
  );

  return new Set(
    headLayers
      .filter((layer) => {
        const base = baseFiles.get(layer.id);
        return (
          base !== undefined && base !== [...layer.files].sort().join("\n")
        );
      })
      .map((layer) => layer.id),
  );
};

const identity = (block: string): string => block;

const tombstonePage = (page: DiffPage, baseRef: string): DiffPage => {
  const { body } = splitFrontmatter(page.contents);

  const contents = [
    frontmatter({
      title: page.title,
      description: `Removed since ${baseRef}.`,
      sidebar_order: page.order,
    }),
    `import { DiffMarker } from "${assetPathFrom(page.slug, `components/${DIFF_MARKER_MODULE}`)}";`,
    "",
    `> **Removed** — this page existed at \`${baseRef}\` and was removed by this change.`,
    "",
    `<DiffMarker status="removed" content={${JSON.stringify(body.trim())}} />`,
    "",
  ].join("\n");

  return {
    slug: page.slug,
    title: page.title,
    description: `Removed since ${baseRef}.`,
    order: page.order,
    kind: "generated",
    contents,
  };
};

export const diffBundlePages = (options: {
  base: DiffSide;
  head: DiffSide;
  baseRef: string;
}): PageDiffResult => {
  const baseBySlug = new Map(
    options.base.pages.map((page) => [page.slug, page]),
  );
  const headSlugs = new Set(options.head.pages.map((page) => page.slug));

  const movedFileSlugs = new Set(
    [...layersWithMovedFiles(options.base.layers, options.head.layers)].map(
      layerSlug,
    ),
  );

  const statuses: Record<string, PageChange> = {};
  const annotated = new Map<string, string>();

  for (const page of options.head.pages) {
    const basePage = baseBySlug.get(page.slug);

    if (basePage === undefined) {
      statuses[page.slug] = "added";
      continue;
    }

    const generated = page.kind === "generated";
    const normalize = generated ? normalizeGeneratedBlock : identity;

    // Compared on prefix-stripped copies; the raw head text is what gets
    // annotated. The prefix holds no newline, so both split identically and
    // block statuses map across by index.
    const head = splitFrontmatter(
      generated
        ? stripSourcePrefix(page.contents, options.head.sourceUrlPrefix)
        : page.contents,
    );
    const base = splitFrontmatter(
      generated
        ? stripSourcePrefix(basePage.contents, options.base.sourceUrlPrefix)
        : basePage.contents,
    );

    const diff = diffBlocks({
      baseBlocks: splitBlocks(base.body),
      headBlocks: splitBlocks(head.body),
      normalize,
    });

    const bodyChanged =
      diff.removed.size > 0 ||
      diff.headStatuses.some((status) => status !== "unchanged");
    const frontmatterChanged =
      normalize(base.frontmatter) !== normalize(head.frontmatter);

    if (!bodyChanged && !frontmatterChanged && !movedFileSlugs.has(page.slug)) {
      continue;
    }

    statuses[page.slug] = "changed";

    if (bodyChanged) {
      const raw = splitFrontmatter(page.contents);
      annotated.set(
        page.slug,
        annotatePageBlocks({
          slug: page.slug,
          frontmatter: raw.frontmatter,
          blocks: splitBlocks(raw.body),
          diff,
        }),
      );
    }
  }

  const tombstones = options.base.pages
    .filter((page) => !headSlugs.has(page.slug))
    .map((page) => tombstonePage(page, options.baseRef));

  for (const tombstone of tombstones) {
    statuses[tombstone.slug] = "removed";
  }

  return { statuses, annotated, tombstones };
};

/** The slice of a built bundle the diff consumes — also what a cache stores. */
export const diffSideOfBundle = (
  bundle: BuiltBundle,
  sourceUrlPrefix: string,
): DiffSide => ({
  layers: bundle.model.layers,
  sourceUrlPrefix,
  pages: [
    ...bundle.generated.map((page) => ({
      slug: page.slug,
      title: page.title,
      description: page.description,
      order: page.order,
      kind: "generated" as const,
      contents: page.contents,
    })),
    ...bundle.authored.map((page) => ({
      slug: page.slug,
      title: page.title,
      description: page.description,
      order: page.order,
      kind: "authored" as const,
      contents: page.contents,
    })),
  ],
});

/**
 * Returns the head bundle with the diff applied: changed pages carry block
 * markers, tombstones stand in for removed pages, and the manifest records
 * every page's status for a host to build navigation from.
 */
export const applyBundleDiff = (
  head: BuiltBundle,
  base: DiffSide,
  info: { baseRef: string; baseSha: string; sourceUrlPrefix: string },
): BuiltBundle => {
  const { statuses, annotated, tombstones } = diffBundlePages({
    base,
    head: diffSideOfBundle(head, info.sourceUrlPrefix),
    baseRef: info.baseRef,
  });

  const generated = [
    ...head.generated.map((page) => {
      const contents = annotated.get(page.slug);
      return contents === undefined ? page : { ...page, contents };
    }),
    ...tombstones.map((page) => ({
      path: `pages/${page.slug}.mdx`,
      slug: page.slug,
      title: page.title,
      description: page.description,
      order: page.order,
      contents: page.contents,
    })),
  ];

  const authored = head.authored.map((page) => {
    const contents = annotated.get(page.slug);
    return contents === undefined ? page : { ...page, contents };
  });

  return {
    ...head,
    generated,
    authored,
    manifest: buildManifest({
      generator: head.manifest.generator,
      generated,
      authored,
      diff: { baseRef: info.baseRef, baseSha: info.baseSha, pages: statuses },
    }),
  };
};
