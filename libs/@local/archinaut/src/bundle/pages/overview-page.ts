/**
 * The architecture overview: every top-level layer and the overview
 * diagram, as the page a reader lands on first.
 */

import { assetPathFrom, layerSlug, relativeTo } from "../shared/page-paths";
import {
  GENERATED_ORDER_BASE,
  escapeTableCell,
  frontmatter,
  type GeneratedPage,
} from "./shared/page-shape";

import type { ArchitectureModel } from "../../model";

export const buildOverviewPage = (
  model: ArchitectureModel,
  overviewDiagram: string | null,
): GeneratedPage => {
  const slug = "architecture";
  const roots = model.layers.filter((layer) => layer.parent === null);

  const body: string[] = [
    "> Generated from annotations in the Petrinaut source. Every layer and edge on this page was read out of the code, not drawn by hand.",
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
      "These are checked against the real import graph whenever the bundle is built.",
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

  return {
    path: `pages/${slug}.mdx`,
    slug,
    title: "Architecture",
    description:
      "Generated map of the Petrinaut packages: layers and the dependencies between them.",
    order: GENERATED_ORDER_BASE,
    contents:
      frontmatter({
        title: "Architecture",
        description:
          "Generated map of the Petrinaut packages: layers and the dependencies between them.",
        sidebar_order: GENERATED_ORDER_BASE,
      }) + `\n${body.join("\n")}`,
  };
};

/** A name for a participant: the layer id, or the external's name. */
