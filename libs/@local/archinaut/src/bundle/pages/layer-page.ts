/**
 * A layer's page: its facts and relations as props of the shipped cards, its
 * README prose, the pages attached to it, and a link back to the annotation
 * that declared it.
 */

import { posix } from "node:path";

import { isDeclaredEdge, isImportEdge } from "../../model";
import { rewriteRelativeLinks } from "../page-links";
import {
  assetPathFrom,
  interfaceSlug,
  layerSlug,
  relativeTo,
} from "../shared/page-paths";
import {
  LAYER_FACTS_MODULE,
  LAYER_LINKS_MODULE,
  LAYER_RELATIONS_MODULE,
  LAYER_SOURCE_MODULE,
} from "../shipped-components";
import {
  frontmatter,
  sourceLink,
  type GeneratedPage,
} from "./shared/page-shape";

import type { ArchitectureModel, Edge, Layer } from "../../model";

interface LayerRelationEntry {
  id: string;
  name: string;
  href: string;
  provenance: "imports" | "declared";
  crossesPackage: boolean;
  imports?: number;
  protocol?: string;
}

/**
 * Rows for the relations card, per direction. Import edges come first, sorted
 * by import count, then declared edges: one kind is aggregated from real
 * imports, the other is an annotation someone wrote, and the `provenance`
 * field is how the card keeps a reader from mistaking one for the other.
 */
const relationEntries = (
  layer: Layer,
  edges: Edge[],
  layersById: Map<string, Layer>,
  slug: string,
): { dependsOn: LayerRelationEntry[]; dependedOnBy: LayerRelationEntry[] } => {
  const toEntry = (edge: Edge, otherId: string): LayerRelationEntry => {
    const other = layersById.get(otherId);
    const base = {
      id: otherId,
      name: other ? other.name : otherId,
      href: relativeTo(slug, layerSlug(otherId)),
      provenance: edge.provenance,
      crossesPackage: edge.crossesPackage,
    };
    return isImportEdge(edge)
      ? { ...base, imports: edge.fileDependencies }
      : { ...base, protocol: edge.protocol };
  };

  const inDirection = (
    rows: Edge[],
    direction: "to" | "from",
  ): LayerRelationEntry[] => {
    const otherOf = (edge: Edge): string =>
      direction === "to" ? edge.to : edge.from;
    return [
      ...rows
        .filter(isImportEdge)
        .sort((left, right) => right.fileDependencies - left.fileDependencies)
        .map((edge) => toEntry(edge, otherOf(edge))),
      ...rows
        .filter(isDeclaredEdge)
        .map((edge) => toEntry(edge, otherOf(edge))),
    ];
  };

  return {
    dependsOn: inDirection(
      edges.filter((edge) => edge.from === layer.id),
      "to",
    ),
    dependedOnBy: inDirection(
      edges.filter((edge) => edge.to === layer.id),
      "from",
    ),
  };
};

/**
 * A JSX attribute carrying an array of relation entries, one JSON object per
 * line so a diff of the emitted page shows which edge changed.
 */
const relationsProp = (key: string, entries: LayerRelationEntry[]): string[] =>
  entries.length === 0
    ? [`  ${key}={[]}`]
    : [
        `  ${key}={[`,
        ...entries.map((entry) => `    ${JSON.stringify(entry)},`),
        "  ]}",
      ];

/**
 * A links card instance. Entries are one per line, like relation entries, so a
 * diff of the emitted page shows which link changed.
 */
const linksCard = (
  title: string,
  entries: {
    label: string;
    href: string;
    description?: string;
    code?: boolean;
  }[],
  note?: string,
): string[] => [
  "<LayerLinks",
  `  title={${JSON.stringify(title)}}`,
  ...(note === undefined ? [] : [`  note={${JSON.stringify(note)}}`]),
  "  entries={[",
  ...entries.map((entry) => `    ${JSON.stringify(entry)},`),
  "  ]}",
  "/>",
  "",
];

/** Import of a shipped component, relative to the page file like any asset. */
const componentImport = (slug: string, name: string, module: string): string =>
  `import { ${name} } from "${assetPathFrom(slug, `components/${module}`)}";`;

export const buildLayerPage = (
  layer: Layer,
  model: ArchitectureModel,
  layersById: Map<string, Layer>,
  sourceUrlPrefix: string,
  order: number,
  neighbourhoodDiagram: string | null,
  subtreeDiagram: string | null,
  attachedGuides: { slug: string; title: string; description: string }[],
): GeneratedPage => {
  const slug = layerSlug(layer.id);
  const children = model.layers.filter((other) => other.parent === layer.id);

  const relations = relationEntries(layer, model.edges, layersById, slug);
  const hasRelations =
    relations.dependsOn.length > 0 || relations.dependedOnBy.length > 0;

  const body: string[] = [];

  // All four imports are emitted unconditionally: whether a card renders is
  // decided where it is emitted below, and repeating those predicates here
  // only creates a second copy to keep in sync. An unused import is
  // tree-shaken, and the CSS side effect is the same file in all four.
  body.push(
    componentImport(slug, "LayerFacts", LAYER_FACTS_MODULE),
    componentImport(slug, "LayerRelations", LAYER_RELATIONS_MODULE),
    componentImport(slug, "LayerSource", LAYER_SOURCE_MODULE),
    componentImport(slug, "LayerLinks", LAYER_LINKS_MODULE),
    "",
  );

  // The role reads as the page's lead paragraph, outside the facts card.
  body.push(layer.role, "");

  // Values are emitted as `{JSON}` expressions rather than quoted attributes:
  // JSX string attributes have no escape sequences, so a value containing a
  // double quote would end the attribute early.
  body.push(
    "<LayerFacts",
    `  package={${JSON.stringify(layer.package)}}`,
    `  layerId={${JSON.stringify(layer.id)}}`,
    `  files={${layer.fileCount}}`,
    `  lines={${layer.lineCount}}`,
    `  declaredIn={${JSON.stringify(layer.declaredIn)}}`,
    `  declaredInUrl={${JSON.stringify(sourceLink(sourceUrlPrefix, layer.declaredIn))}}`,
    "/>",
    "",
  );

  if (neighbourhoodDiagram !== null) {
    body.push(
      `![What ${layer.name} depends on, and what depends on it](${assetPathFrom(
        slug,
        `diagrams/${neighbourhoodDiagram}.svg`,
      )})`,
      "",
    );
  }

  if (hasRelations) {
    body.push(
      "<LayerRelations",
      ...relationsProp("dependsOn", relations.dependsOn),
      ...relationsProp("dependedOnBy", relations.dependedOnBy),
      "/>",
      "",
    );
  }

  if (subtreeDiagram !== null) {
    body.push(
      `![Layers within ${layer.name}](${assetPathFrom(
        slug,
        `diagrams/${subtreeDiagram}.svg`,
      )})`,
      "",
    );
  }

  if (children.length > 0) {
    body.push(
      ...linksCard(
        "Sub-layers",
        children.map((child) => ({
          label: child.name,
          href: relativeTo(slug, layerSlug(child.id)),
          description: child.role,
        })),
      ),
    );
  }

  if (attachedGuides.length > 0) {
    body.push(
      ...linksCard(
        "Guides",
        attachedGuides.map((guide) => ({
          label: guide.title,
          href: relativeTo(slug, guide.slug),
          ...(guide.description === ""
            ? {}
            : { description: guide.description }),
        })),
        "Hand-written, not generated and not checked against the code.",
      ),
    );
  }

  const participations = model.interfaces.filter((node) =>
    node.participants.some((participant) => participant.node === layer.id),
  );
  if (participations.length > 0) {
    body.push(
      ...linksCard(
        "Interfaces",
        participations.map((node) => {
          const role =
            node.participants.find(
              (participant) => participant.node === layer.id,
            )?.role ?? "";
          return {
            label: node.name,
            href: relativeTo(slug, interfaceSlug(node.id)),
            description: `${role} · ${node.transport}${node.summary === "" ? "" : ` · ${node.summary}`}`,
          };
        }),
      ),
    );
  }

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
      ...linksCard(
        "Further reading",
        layer.references.map((reference) => ({
          label: reference,
          href: sourceLink(sourceUrlPrefix, reference),
          code: true,
        })),
      ),
    );
  }

  if (layer.files.length > 0) {
    // A per-file list would dominate the page (the editor layer alone resolves
    // over a hundred files) and every consumer that actually wants the list can
    // read `files` from architecture.json instead.
    const folder = posix.dirname(layer.declaredIn);
    body.push(
      "<LayerSource",
      `  files={${layer.fileCount}}`,
      `  root={${JSON.stringify(folder)}}`,
      `  rootUrl={${JSON.stringify(sourceLink(sourceUrlPrefix, folder))}}`,
      "/>",
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
