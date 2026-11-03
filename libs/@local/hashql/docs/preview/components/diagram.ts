import { renderMermaidSVG } from "beautiful-mermaid";
import { Function } from "effect";

import type { HierarchyProps } from "../../lib/components.js";

/** The types of a hierarchy, and the edges between them. */
type Graph = Pick<HierarchyProps, "nodes" | "edges">;

const escapeAttribute = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");

/** `text` with each match of `pattern`, a global expression, replaced by what `replace` makes of the match and its named groups. */
const replaceGroups = (
  text: string,
  pattern: RegExp,
  replace: (match: string, groups: Readonly<Record<string, string>>) => string,
): string => {
  let replaced = "";
  let at = 0;
  for (const match of text.matchAll(pattern)) {
    replaced +=
      text.slice(at, match.index) + replace(match[0], match.groups ?? {});
    at = match.index + match[0].length;
  }

  return replaced + text.slice(at);
};

/** An arrowhead that fills its triangle, in place of the renderer's hollow one, which reads as a box's corner at the size the diagram is drawn. `id` keeps it apart from other diagrams' on the page. */
const arrowheadOf = (id: string): string =>
  `<marker id="${id}" viewBox="0 0 10 10" markerWidth="13" markerHeight="13" refX="10" refY="5" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--_arrow)" /></marker>`;

/** A box's group without its empty member compartments, its header filling it with the name centred. */
const boxOf = (
  group: string,
  { open = "", body = "", close = "" }: Readonly<Record<string, string>>,
): string => {
  const [outer, header] = Array.from(
    body.matchAll(/<rect [^>]*height="(?<height>[\d.]+)"/gu),
    (match) => Number(match.groups?.["height"]),
  );
  if (outer === undefined || header === undefined) {
    return group;
  }

  const shift = (outer - header) / 2;
  const kept = replaceGroups(
    body
      .replaceAll(/\s*<line [^>]*\/>/gu, "")
      .replace(`height="${header}"`, `height="${outer}"`),
    /<text (?<before>[^>]*)y="(?<top>[\d.]+)"/gu,
    (_, { before = "", top = "0" }) =>
      `<text ${before}y="${Number(top) + shift}"`,
  );

  return `${open}${kept}${close}`;
};

/**
 * The class diagram of a hierarchy as SVG, with bases above the types that extend them and an arrow from each type to the one it extends. The export's own box is marked, and every other box links to its type.
 *
 * `id` names the diagram's own definitions. Its colours are the page's custom properties, so it follows the theme.
 */
export const diagramOf: {
  (graph: Graph): (id: string) => string;
  (id: string, graph: Graph): string;
} = Function.dual(2, (id: string, { nodes, edges }: Graph): string => {
  // Mermaid names a box by its label, so a label two types share takes a count after the first.
  const used = new Map<string, number>();
  const ids = nodes.map(({ label }) => {
    const count = used.get(label) ?? 0;
    used.set(label, count + 1);
    return count === 0 ? label : `${label}_${count}`;
  });
  const text = [
    "classDiagram",
    ...nodes.map(({ role }, index) => {
      const box = ids[index] ?? "";
      return role === "trait"
        ? `  class ${box} { <<trait>> }`
        : `  class ${box}`;
    }),
    ...edges.map(
      ([base, derived]) => `  ${ids[base] ?? ""} <|-- ${ids[derived] ?? ""}`,
    ),
  ].join("\n");
  const arrowhead = `${id}-arrowhead`;
  const byId = new Map(ids.map((own, index) => [own, nodes[index]]));

  const svg = renderMermaidSVG(text, {
    bg: "var(--color-fd-card)",
    fg: "var(--color-fd-foreground)",
    accent: "var(--color-fd-primary)",
    transparent: true,
    padding: 16,
  })
    // The renderer imports its fonts from Google, and the page's own fonts stand in.
    .replaceAll(/@import url\([^)]*\);/gu, "")
    .replace(
      /<marker id="cls-inherit"[\s\S]*?<\/marker>/u,
      arrowheadOf(arrowhead),
    )
    .replaceAll("url(#cls-inherit)", `url(#${arrowhead})`);
  const boxes = replaceGroups(
    svg,
    /(?<open><g [^>]*class="class-node"[^>]*>)(?<body>[\s\S]*?)(?<close><\/g>)/gu,
    boxOf,
  );

  return replaceGroups(
    boxes,
    /<g class="class-node" data-id="(?<box>[^"]+)"[^>]*>[\s\S]*?<\/g>/gu,
    (group, { box = "" }) => {
      const node = byId.get(box.replaceAll("&amp;", "&"));
      if (node === undefined) {
        return group;
      }

      const marked = group.replace(
        "<g ",
        `<g data-role="${escapeAttribute(node.role)}" `,
      );
      if (node.href === undefined || node.role === "current") {
        return marked;
      }

      return `<a href="${escapeAttribute(node.href)}" class="api-hierarchy-link">${marked}</a>`;
    },
  );
});
