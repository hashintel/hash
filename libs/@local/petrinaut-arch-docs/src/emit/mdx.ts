/**
 * MDX page generation.
 *
 * Output here is deliberately **framework-neutral**: YAML frontmatter plus plain
 * CommonMark. No JSX, no imports, no framework-specific components. That
 * constraint is what lets the same bundle render in the Starlight site, in
 * hash.dev's Next.js MDX pipeline, and as plain text for an AI agent — a single
 * `<LayerGraph/>` component here would break two of those three.
 *
 * Diagrams are referenced as relative image paths, and every layer page links
 * back to the annotation that declared it so a reader can go straight from the
 * rendered claim to the source of truth.
 */

import { posix } from "node:path";

import type { ArchitectureModel, Edge, Layer } from "../model";

export interface GeneratedPage {
  /** Path within the bundle, e.g. `pages/core.simulation.mdx`. */
  path: string;
  /** Route-ish identifier a host can map onto its own URL space. */
  slug: string;
  title: string;
  description: string;
  contents: string;
  order: number;
}

/**
 * Sidebar order at which generated pages begin.
 *
 * Authored pages are the narrative entry to the docs and generated pages are
 * reference, so the two sets are kept in separate bands rather than interleaved
 * by number. An authored page can still sort itself after the reference section
 * by choosing a `sidebar_order` above this.
 */
export const GENERATED_ORDER_BASE = 1000;

const escapeTableCell = (text: string): string =>
  text.replace(/\|/gu, "\\|").replace(/\n/gu, " ");

/** Serialises frontmatter by hand so the output stays byte-stable. */
const frontmatter = (fields: Record<string, string | number>): string => {
  const lines = Object.entries(fields).map(
    ([key, value]) =>
      `${key}: ${typeof value === "number" ? value : JSON.stringify(value)}`,
  );
  return ["---", ...lines, "---", ""].join("\n");
};

const sourceLink = (
  sourceUrlPrefix: string,
  file: string,
  line?: number,
): string =>
  `${sourceUrlPrefix}${file}${line !== undefined && line > 1 ? `#L${line}` : ""}`;

const layerSlug = (id: string): string =>
  `architecture/${id.replace(/\./gu, "/")}`;

/**
 * Rewrites relative links in embedded README prose to absolute source URLs.
 *
 * A README's `[engine](./engine/README.md)` is correct where the README lives
 * and broken once the prose is embedded in a docs page served from somewhere
 * else entirely. Resolving against the README's own directory keeps those links
 * working wherever the bundle is mounted.
 */
export const rewriteRelativeLinks = (
  prose: string,
  declaredIn: string,
  sourceUrlPrefix: string,
): string => {
  const baseDirectory = posix.dirname(declaredIn);

  return prose.replace(
    /(!?\[[^\]]*\])\(([^)\s]+)(\s+"[^"]*")?\)/gu,
    (match, label: string, target: string, title: string | undefined) => {
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/iu.test(target)) {
        return match;
      }

      const [path = "", fragment] = target.split("#");

      if (path === "") {
        return match;
      }

      const resolved = posix.normalize(posix.join(baseDirectory, path));

      // A link that escapes the repository root cannot be made absolute.
      if (resolved.startsWith("..")) {
        return match;
      }

      return `${label}(${sourceUrlPrefix}${resolved}${fragment === undefined ? "" : `#${fragment}`}${title ?? ""})`;
    },
  );
};

/**
 * Relative link from one bundle page to another, so the bundle works when
 * mounted at any base path.
 *
 * Resolved against the *slug* — page links are followed in URL space by a
 * reader, and assume slugs map to URLs without a trailing slash.
 */
const relativeTo = (fromSlug: string, toSlug: string): string => {
  const relative = posix.relative(posix.dirname(fromSlug), toSlug);
  return relative === "" ? "." : relative;
};

/**
 * Relative path from a page's *file* to an asset in the bundle.
 *
 * Deliberately different from `relativeTo`: MDX toolchains resolve image paths
 * against the file on disk at build time, not against the page's URL. Using the
 * slug-relative form here produced `diagrams/x.svg` from `pages/architecture.mdx`,
 * which points at a `pages/diagrams/` directory that does not exist.
 */
const assetPathFrom = (slug: string, assetPath: string): string =>
  posix.relative(posix.dirname(`pages/${slug}`), assetPath);

const describeBoundaries = (
  layer: Layer,
  sourceUrlPrefix: string,
): string[] => {
  if (layer.boundaries.length === 0) {
    return [];
  }

  const rows = layer.boundaries.map(
    (boundary) =>
      `| \`${boundary.kind}\` | ${escapeTableCell(boundary.note)} | [${posix.basename(boundary.source)}](${sourceLink(sourceUrlPrefix, boundary.source, boundary.line)}) |`,
  );

  return [
    "## Boundaries",
    "",
    "Crossing one of these is never a plain function call.",
    "",
    "| Kind | What may not cross | Declared in |",
    "| --- | --- | --- |",
    ...rows,
    "",
  ];
};

const describeInvariants = (
  layer: Layer,
  sourceUrlPrefix: string,
): string[] => {
  if (layer.invariants.length === 0) {
    return [];
  }

  return [
    "## Invariants",
    "",
    ...layer.invariants.map(
      (invariant) =>
        `- ${invariant.text} — [${posix.basename(invariant.source)}](${sourceLink(sourceUrlPrefix, invariant.source, invariant.line)})`,
    ),
    "",
  ];
};

const describeEdges = (
  layer: Layer,
  edges: Edge[],
  layersById: Map<string, Layer>,
  slug: string,
): string[] => {
  const outgoing = edges.filter((edge) => edge.from === layer.id);
  const incoming = edges.filter((edge) => edge.to === layer.id);

  const sections: string[] = [];

  const table = (
    heading: string,
    intro: string,
    rows: Edge[],
    direction: "to" | "from",
  ): string[] => {
    if (rows.length === 0) {
      return [];
    }

    return [
      `## ${heading}`,
      "",
      intro,
      "",
      "| Layer | Imports | Package boundary |",
      "| --- | --- | --- |",
      ...rows
        .slice()
        .sort((left, right) => right.fileDependencies - left.fileDependencies)
        .map((edge) => {
          const otherId = direction === "to" ? edge.to : edge.from;
          const other = layersById.get(otherId);
          const label = other ? other.name : otherId;
          const link = `[${escapeTableCell(label)}](${relativeTo(slug, layerSlug(otherId))})`;
          const crosses = edge.crossesPackage ? "crossed" : "—";
          return `| ${link} | ${edge.fileDependencies} | ${crosses} |`;
        }),
      "",
    ];
  };

  sections.push(
    ...table(
      "Depends on",
      "Aggregated from real TypeScript imports.",
      outgoing,
      "to",
    ),
  );
  sections.push(
    ...table(
      "Depended on by",
      "Who reaches into this layer.",
      incoming,
      "from",
    ),
  );

  return sections;
};

const buildLayerPage = (
  layer: Layer,
  model: ArchitectureModel,
  layersById: Map<string, Layer>,
  sourceUrlPrefix: string,
  order: number,
  diagramName: string | null,
): GeneratedPage => {
  const slug = layerSlug(layer.id);
  const children = model.layers.filter((other) => other.parent === layer.id);

  const body: string[] = [];

  body.push(`> ${layer.role}`, "");

  const facts = [
    `**Package** \`${layer.package}\``,
    `**Layer id** \`${layer.id}\``,
    `**Files** ${layer.fileCount}`,
    `**Lines** ${layer.lineCount.toLocaleString("en-US")}`,
  ];
  if (layer.owner !== null) {
    facts.push(`**Owner** ${layer.owner}`);
  }
  body.push(facts.join(" · "), "");

  body.push(
    `Declared in [\`${layer.declaredIn}\`](${sourceLink(sourceUrlPrefix, layer.declaredIn)}).`,
    "",
  );

  if (diagramName !== null) {
    body.push(
      `![Layers within ${layer.name}](${assetPathFrom(
        slug,
        `diagrams/${diagramName}.svg`,
      )})`,
      "",
    );
  }

  if (layer.seams.length > 0) {
    body.push(
      "## Public seams",
      "",
      "Import specifiers through which this layer is reachable from outside its package.",
      "",
      ...layer.seams.map((seam) => `- \`${seam}\``),
      "",
    );
  }

  body.push(...describeBoundaries(layer, sourceUrlPrefix));
  body.push(...describeInvariants(layer, sourceUrlPrefix));

  if (children.length > 0) {
    body.push(
      "## Sub-layers",
      "",
      ...children.map(
        (child) =>
          `- [${child.name}](${relativeTo(slug, layerSlug(child.id))}) — ${child.role}`,
      ),
      "",
    );
  }

  body.push(...describeEdges(layer, model.edges, layersById, slug));

  if (layer.prose !== null) {
    body.push(
      "## Notes",
      "",
      rewriteRelativeLinks(layer.prose, layer.declaredIn, sourceUrlPrefix),
      "",
    );
  }

  if (layer.references.length > 0) {
    body.push(
      "## Further reading",
      "",
      ...layer.references.map(
        (reference) =>
          `- [\`${reference}\`](${sourceLink(sourceUrlPrefix, reference)})`,
      ),
      "",
    );
  }

  if (layer.files.length > 0) {
    // A per-file list would dominate the page (the editor layer alone resolves
    // over a hundred files) and every consumer that actually wants the list can
    // read `files` from architecture.json instead.
    const folder = posix.dirname(layer.declaredIn);
    body.push(
      "## Source",
      "",
      `${layer.fileCount} file${layer.fileCount === 1 ? "" : "s"} resolve to this layer, rooted at [\`${folder}\`](${sourceUrlPrefix}${folder}) — files under a sub-layer's folder belong to that sub-layer instead. The full list is in \`architecture.json\`.`,
      "",
    );
  }

  return {
    path: `pages/${slug}.mdx`,
    slug,
    title: layer.name,
    description: layer.role,
    order,
    contents:
      frontmatter({
        title: layer.name,
        description: layer.role,
        sidebar_order: order,
      }) + `\n${body.join("\n")}`,
  };
};

const buildOverviewPage = (
  model: ArchitectureModel,
  overviewDiagram: string | null,
): GeneratedPage => {
  const slug = "architecture";
  const roots = model.layers.filter((layer) => layer.parent === null);

  const body: string[] = [
    "> Generated from annotations in the Petrinaut source. Every layer, edge and boundary on this page was read out of the code, not drawn by hand.",
    "",
  ];

  if (overviewDiagram !== null) {
    body.push(
      `![Top-level layers and the dependencies between them](${assetPathFrom(
        slug,
        `diagrams/${overviewDiagram}.svg`,
      )})`,
      "",
    );
  }

  body.push(
    "## Top-level layers",
    "",
    "| Layer | Responsibility | Files |",
    "| --- | --- | --- |",
    ...roots.map(
      (layer) =>
        `| [${escapeTableCell(layer.name)}](${relativeTo(slug, layerSlug(layer.id))}) | ${escapeTableCell(layer.role)} | ${model.layers
          .filter(
            (other) =>
              other.id === layer.id || other.id.startsWith(`${layer.id}.`),
          )
          .reduce((total, other) => total + other.fileCount, 0)} |`,
    ),
    "",
  );

  body.push(
    "## Packages",
    "",
    "| Package | Path | Description |",
    "| --- | --- | --- |",
    ...model.packages.map(
      (pkg) =>
        `| \`${pkg.name}\` | \`${pkg.path}\` | ${escapeTableCell(pkg.description)} |`,
    ),
    "",
  );

  if (model.rules.length > 0) {
    body.push(
      "## Enforced rules",
      "",
      "These are checked against the real import graph on every CI run.",
      "",
      "| Rule | Reason |",
      "| --- | --- |",
      ...model.rules.map(
        (rule) =>
          `| \`${rule.from}\` must not depend on \`${rule.to}\` | ${escapeTableCell(rule.reason)} |`,
      ),
      "",
    );
  }

  const boundaryLayers = model.layers.filter(
    (layer) => layer.boundaries.length > 0,
  );

  if (boundaryLayers.length > 0) {
    body.push(
      "## Boundaries across the system",
      "",
      "| Layer | Kind | What may not cross |",
      "| --- | --- | --- |",
      ...boundaryLayers.flatMap((layer) =>
        layer.boundaries.map(
          (boundary) =>
            `| [${escapeTableCell(layer.name)}](${relativeTo(slug, layerSlug(layer.id))}) | \`${boundary.kind}\` | ${escapeTableCell(boundary.note)} |`,
        ),
      ),
      "",
    );
  }

  return {
    path: `pages/${slug}.mdx`,
    slug,
    title: "Architecture",
    description:
      "Generated map of the Petrinaut packages: layers, dependencies and boundaries.",
    order: GENERATED_ORDER_BASE,
    contents:
      frontmatter({
        title: "Architecture",
        description:
          "Generated map of the Petrinaut packages: layers, dependencies and boundaries.",
        sidebar_order: GENERATED_ORDER_BASE,
      }) + `\n${body.join("\n")}`,
  };
};

export const buildPages = (
  model: ArchitectureModel,
  options: {
    sourceUrlPrefix: string;
    overviewDiagram: string | null;
    /** Layer ids that have a diagram of their own sub-tree. */
    layerDiagrams: Set<string>;
  },
): GeneratedPage[] => {
  const layersById = new Map(model.layers.map((layer) => [layer.id, layer]));

  const pages = [buildOverviewPage(model, options.overviewDiagram)];

  model.layers.forEach((layer, index) => {
    pages.push(
      buildLayerPage(
        layer,
        model,
        layersById,
        options.sourceUrlPrefix,
        GENERATED_ORDER_BASE + index + 1,
        options.layerDiagrams.has(layer.id) ? layer.id : null,
      ),
    );
  });

  return pages;
};
