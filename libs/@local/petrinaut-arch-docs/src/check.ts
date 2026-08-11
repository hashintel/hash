/**
 * Checks that turn the documentation into something CI can hold to account.
 *
 * Documentation rots because nothing fails when it stops being true. Each check
 * here makes one class of rot into a build error: a layer id implying an
 * ancestor nobody declared, a rule the real import graph violates, a
 * declaration whose folder has been emptied.
 *
 * Every check is a statement about the *graph* — which is the whole of what
 * this version claims. It holds no unverifiable prose to account because it
 * reads none.
 */

import { ancestorLayerIds } from "./model";

import type { LayerRule } from "../architecture.config";
import type { Diagnostic } from "./extract";
import type { ArchitectureModel } from "./model";

/** True when `layerId` is the scope itself or nested inside it. */
export const withinScope = (layerId: string, scope: string): boolean =>
  layerId === scope || layerId.startsWith(`${scope}.`);

/**
 * Every ancestor segment of a dotted layer id must itself be a declared layer.
 *
 * Without this, `core.simulation.monte-carlo` could exist while
 * `core.simulation` does not, leaving the diagram with a container nobody
 * described and the docs with a page that 404s from its own breadcrumb.
 */
export const checkAncestorsDeclared = (
  model: ArchitectureModel,
): Diagnostic[] => {
  const declared = new Set(model.layers.map((layer) => layer.id));

  return model.layers.flatMap((layer) =>
    ancestorLayerIds(layer.id)
      .filter((ancestor) => !declared.has(ancestor))
      .map((ancestor) => ({
        file: layer.declaredIn,
        line: null,
        severity: "error" as const,
        message: `layer \`${layer.id}\` implies an ancestor \`${ancestor}\` that is not declared anywhere`,
      })),
  );
};

/**
 * Rules are only worth stating if they are enforced, so a violation is an error
 * rather than a note on a page. The message names representative files so the
 * fix does not start with a search.
 */
export const checkRules = (
  model: ArchitectureModel,
  rules: LayerRule[],
): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];

  for (const rule of rules) {
    for (const edge of model.edges) {
      if (
        !withinScope(edge.from, rule.from) ||
        !withinScope(edge.to, rule.to)
      ) {
        continue;
      }

      const example = edge.examples[0];

      diagnostics.push({
        file: example?.from ?? edge.from,
        line: null,
        severity: "error",
        message: `\`${edge.from}\` must not depend on \`${edge.to}\` (${rule.reason}); ${edge.fileDependencies} import${edge.fileDependencies === 1 ? "" : "s"} do${edge.fileDependencies === 1 ? "es" : ""}, e.g. ${example ? `${example.from} → ${example.to}` : "unknown"}`,
      });
    }
  }

  return diagnostics;
};

/**
 * Layers with no files usually mean a declaration whose folder was emptied or
 * renamed. Grouping layers legitimately hold no files of their own, so this is a
 * warning: it is reported, but does not fail the build.
 */
export const checkEmptyLayers = (model: ArchitectureModel): Diagnostic[] => {
  const hasChildren = new Set(
    model.layers.flatMap((layer) =>
      layer.parent === null ? [] : [layer.parent],
    ),
  );

  return model.layers
    .filter((layer) => layer.fileCount === 0 && !hasChildren.has(layer.id))
    .map((layer) => ({
      file: layer.declaredIn,
      line: null,
      severity: "warning" as const,
      message: `layer \`${layer.id}\` has no source files and no sub-layers — was its folder moved or emptied?`,
    }));
};

export const runChecks = (options: {
  model: ArchitectureModel;
  rules: LayerRule[];
}): Diagnostic[] => [
  ...checkAncestorsDeclared(options.model),
  ...checkRules(options.model, options.rules),
  ...checkEmptyLayers(options.model),
];
