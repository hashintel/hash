/**
 * The bundle's index files: `manifest.json` and `architecture.md`.
 *
 * `manifest.json` is what a host site reads to build navigation without having
 * to crawl the pages directory. `architecture.md` is the whole architecture as a
 * single file, which is cheaper for a model to read than fetching thirty pages.
 */

import { ARCHITECTURE_MODEL_VERSION, type ArchitectureModel } from "../model";

import type { AuthoredPage } from "../content";
import type { GeneratedPage } from "./mdx";

export const BUNDLE_MANIFEST_VERSION = 1;

export interface ManifestPage {
  /** Path within the bundle. */
  path: string;
  slug: string;
  title: string;
  description: string;
  /** `generated` pages are rewritten on every build; `authored` are hand-written. */
  kind: "generated" | "authored";
  /** Nesting depth implied by the slug, for convenience when building nav. */
  depth: number;
  order: number;
}

export interface BundleManifest {
  manifestVersion: number;
  modelVersion: number;
  generator: string;
  /** Relative path to the machine-readable model. */
  model: string;
  pages: ManifestPage[];
  diagrams: { name: string; source: string; svg: string | null }[];
}

export interface DiagramRecord {
  name: string;
  source: string;
  svg: string | null;
}

export const buildManifest = (options: {
  generator: string;
  generated: GeneratedPage[];
  authored: AuthoredPage[];
  diagrams: DiagramRecord[];
}): BundleManifest => {
  const pages: ManifestPage[] = [
    ...options.generated.map((page) => ({
      path: page.path,
      slug: page.slug,
      title: page.title,
      description: page.description,
      kind: "generated" as const,
      depth: page.slug.split("/").length - 1,
      order: page.order,
    })),
    ...options.authored.map((page) => ({
      path: page.path,
      slug: page.slug,
      title: page.title,
      description: page.description,
      kind: "authored" as const,
      depth: page.slug.split("/").length - 1,
      order: page.order,
    })),
  ].sort(
    (left, right) =>
      left.order - right.order || left.slug.localeCompare(right.slug),
  );

  return {
    manifestVersion: BUNDLE_MANIFEST_VERSION,
    modelVersion: ARCHITECTURE_MODEL_VERSION,
    generator: options.generator,
    model: "architecture.json",
    pages,
    diagrams: options.diagrams,
  };
};

/**
 * The whole architecture as one Markdown file.
 *
 * Ordered so a reader (human or model) meets the system top-down: what the
 * packages are, what the rules are, then each layer with its boundaries,
 * invariants and dependencies. Deliberately terse — this is a reference, and
 * every token spent on prose here is one an agent pays on every read.
 */
export const buildSingleFileArchitecture = (
  model: ArchitectureModel,
): string => {
  const lines: string[] = [
    "# Petrinaut architecture",
    "",
    "Generated from annotations in the source. Do not edit — change the `@layerRoot`/`@boundary`/`@invariant` annotations or the declaring README frontmatter instead.",
    "",
    "## Packages",
    "",
  ];

  for (const pkg of model.packages) {
    lines.push(`- \`${pkg.name}\` (\`${pkg.path}\`) — ${pkg.description}`);
  }

  if (model.rules.length > 0) {
    lines.push("", "## Enforced rules", "");
    for (const rule of model.rules) {
      lines.push(
        `- \`${rule.from}\` must not depend on \`${rule.to}\` — ${rule.reason}`,
      );
    }
  }

  lines.push("", "## Layers", "");

  for (const layer of model.layers) {
    lines.push(
      `### ${layer.name} (\`${layer.id}\`)`,
      "",
      layer.role,
      "",
      `- Package: \`${layer.package}\``,
      `- Declared in: \`${layer.declaredIn}\``,
      `- Size: ${layer.fileCount} files, ${layer.lineCount} lines`,
    );

    if (layer.owner !== null) {
      lines.push(`- Owner: ${layer.owner}`);
    }

    if (layer.seams.length > 0) {
      lines.push(
        `- Public seams: ${layer.seams.map((seam) => `\`${seam}\``).join(", ")}`,
      );
    }

    for (const boundary of layer.boundaries) {
      lines.push(
        `- Boundary (\`${boundary.kind}\`): ${boundary.note} [${boundary.source}:${boundary.line}]`,
      );
    }

    for (const invariant of layer.invariants) {
      lines.push(
        `- Invariant: ${invariant.text} [${invariant.source}:${invariant.line}]`,
      );
    }

    const outgoing = model.edges.filter((edge) => edge.from === layer.id);

    if (outgoing.length > 0) {
      const rendered = outgoing
        .slice()
        .sort((left, right) => right.fileDependencies - left.fileDependencies)
        .map((edge) => `\`${edge.to}\` (${edge.fileDependencies})`)
        .join(", ");
      lines.push(`- Depends on: ${rendered}`);
    }

    if (layer.references.length > 0) {
      lines.push(
        `- Further reading: ${layer.references.map((reference) => `\`${reference}\``).join(", ")}`,
      );
    }

    lines.push("");
  }

  return `${lines.join("\n")}\n`;
};
