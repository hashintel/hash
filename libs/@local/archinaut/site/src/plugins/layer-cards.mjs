/**
 * Fills each `<LayerCard layer="…">` on a slide with the layer's facts when
 * the slide compiles, read from the bundle's model: name, role, package and
 * size, and its strongest dependencies both ways. The card then needs no
 * model at run time, and a slide naming a layer the model lacks fails to
 * compile.
 *
 * Docs pages are left alone.
 */

import { readFileSync } from "node:fs";

import { visit } from "unist-util-visit";

import { dataAttribute } from "./estree-values.mjs";

/** @type {{ text: string, model: any } | null} */
let cached = null;

/** The model, parsed again only when the bundle has rewritten it. */
const modelAt = (path) => {
  const text = readFileSync(path, "utf8");
  if (cached?.text !== text) {
    cached = { text, model: JSON.parse(text) };
  }
  return cached.model;
};

/** An import counts its file-level dependencies; a declared edge sorts after every import. */
const weightOf = (edge) =>
  edge.provenance === "imports" ? edge.fileDependencies : 0;

/**
 * A layer's facts as the card shows them, or null when the model has no
 * such layer.
 *
 * @param {{ layers: any[], edges: any[] }} model
 * @param {string} id
 * @param {number} limit how many dependencies to list each way
 */
export const layerFacts = (model, id, limit) => {
  const layers = new Map(model.layers.map((layer) => [layer.id, layer]));
  const layer = layers.get(id);
  if (layer === undefined) {
    return null;
  }
  const neighbours = (direction) =>
    model.edges
      .filter((edge) => (direction === "out" ? edge.from : edge.to) === id)
      .toSorted((left, right) => weightOf(right) - weightOf(left))
      .slice(0, limit)
      .flatMap((edge) => {
        const other = layers.get(direction === "out" ? edge.to : edge.from);
        return other === undefined
          ? []
          : [
              {
                id: other.id,
                name: other.name,
                label:
                  edge.provenance === "imports"
                    ? String(edge.fileDependencies)
                    : edge.protocol,
              },
            ];
      });
  return {
    id: layer.id,
    name: layer.name,
    role: layer.role,
    package: layer.package,
    fileCount: layer.fileCount,
    lineCount: layer.lineCount,
    dependsOn: neighbours("out"),
    dependedOnBy: neighbours("in"),
  };
};

/** An attribute's literal value: a string, or a number written `{4}`. */
const literalOf = (node, name) => {
  const attribute = node.attributes.find(
    (candidate) =>
      candidate.type === "mdxJsxAttribute" && candidate.name === name,
  );
  if (attribute === undefined || typeof attribute.value === "string") {
    return attribute?.value;
  }
  const raw = attribute.value?.value;
  return typeof raw === "string" && /^\s*\d+\s*$/u.test(raw)
    ? Number(raw)
    : null;
};

/**
 * @param {{ docsDirectory: string, modelPath: string }} options
 * @returns {(tree: import("mdast").Root, file: import("vfile").VFile) => void}
 */
export const remarkLayerCards =
  ({ docsDirectory, modelPath }) =>
  (tree, file) => {
    if (typeof file.path === "string" && file.path.startsWith(docsDirectory)) {
      return;
    }
    visit(tree, (node) => {
      if (
        (node.type !== "mdxJsxFlowElement" &&
          node.type !== "mdxJsxTextElement") ||
        node.name !== "LayerCard"
      ) {
        return;
      }
      const where = `${file.path ?? "slide"}:${node.position?.start.line ?? "?"}`;
      const id = literalOf(node, "layer");
      const limit = literalOf(node, "limit") ?? 4;
      if (typeof id !== "string" || typeof limit !== "number") {
        throw new Error(
          `${where}: <LayerCard> takes a literal layer="…" and an optional limit={n}`,
        );
      }
      const facts = layerFacts(modelAt(modelPath), id, limit);
      if (facts === null) {
        throw new Error(
          `${where}: <LayerCard> names "${id}", a layer the model does not have`,
        );
      }
      node.attributes = [dataAttribute("facts", facts)];
    });
  };
