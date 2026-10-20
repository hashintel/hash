/**
 * Checks that make documentation rot a build error: an undeclared ancestor, a
 * rule the real graph violates, a rule that can never fire, a declaration
 * whose folder has been emptied.
 */

import { ancestorLayerIds, isImportEdge } from "../model";
import { error, warning, type Diagnostic } from "../shared/diagnostics";

import type { ArchitectureModel, LayerRule } from "../model";

/** True when `layerId` is the scope itself or nested inside it. */
export const withinScope = (layerId: string, scope: string): boolean =>
  layerId === scope || layerId.startsWith(`${scope}.`);

export const checkAncestorsDeclared = (
  model: ArchitectureModel,
): Diagnostic[] => {
  const declared = new Set(model.layers.map((layer) => layer.id));
  return model.layers.flatMap((layer) =>
    ancestorLayerIds(layer.id)
      .filter((ancestor) => !declared.has(ancestor))
      .map((ancestor) =>
        error(
          layer.declaredIn,
          `layer \`${layer.id}\` implies an ancestor \`${ancestor}\` that is not declared anywhere`,
        ),
      ),
  );
};

export const checkRules = (
  model: ArchitectureModel,
  rules: LayerRule[],
): Diagnostic[] =>
  rules.flatMap((rule) =>
    model.edges
      .filter(
        (edge) =>
          withinScope(edge.from, rule.from) && withinScope(edge.to, rule.to),
      )
      .map((edge) => {
        const forbidden = `\`${edge.from}\` must not depend on \`${edge.to}\` (${rule.reason})`;
        if (!isImportEdge(edge)) {
          return error(
            edge.declaredIn,
            `${forbidden}; declared with @talksTo via ${edge.protocol}`,
            edge.line,
          );
        }
        const example = edge.examples[0];
        const count =
          edge.fileDependencies === 1
            ? "1 dependency does"
            : `${edge.fileDependencies} dependencies do`;
        return error(
          example?.from ?? edge.from,
          `${forbidden}; ${count}, e.g. ${example ? `${example.from} → ${example.to}` : "unknown"}`,
        );
      }),
  );

export const checkRuleTargets = (
  model: ArchitectureModel,
  rules: LayerRule[],
): Diagnostic[] => {
  const declared = new Set(model.layers.map((layer) => layer.id));
  return rules.flatMap((rule) =>
    (["from", "to"] as const)
      .filter((side) => !declared.has(rule[side]))
      .map((side) =>
        error(
          "archinaut.config.ts",
          `rule \`${rule.from}\` must not depend on \`${rule.to}\` names \`${rule[side]}\` as its \`${side}\`, which is not a declared layer, so the rule can never fire`,
        ),
      ),
  );
};

export const checkEmptyLayers = (model: ArchitectureModel): Diagnostic[] => {
  const hasChildren = new Set(
    model.layers.flatMap((layer) =>
      layer.parent === null ? [] : [layer.parent],
    ),
  );
  return model.layers
    .filter((layer) => layer.fileCount === 0 && !hasChildren.has(layer.id))
    .map((layer) =>
      warning(
        layer.declaredIn,
        `layer \`${layer.id}\` has no source files and no sub-layers; was its folder moved or emptied?`,
      ),
    );
};

/** A tag no registry entry describes is probably a typo, so it is reported. */
export const checkTags = (model: ArchitectureModel): Diagnostic[] => {
  const known = new Set(model.tags.map((tag) => tag.id));
  return model.layers.flatMap((layer) =>
    layer.tags
      .filter((tag) => !known.has(tag))
      .map((tag) =>
        warning(
          layer.declaredIn,
          `tag \`${tag}\` is not in the config's tag registry`,
        ),
      ),
  );
};

export const runChecks = (
  model: ArchitectureModel,
  rules: LayerRule[],
): Diagnostic[] => [
  ...checkAncestorsDeclared(model),
  ...checkRuleTargets(model, rules),
  ...checkRules(model, rules),
  ...checkEmptyLayers(model),
  ...checkTags(model),
];
