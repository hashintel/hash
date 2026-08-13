/**
 * Checks that turn the documentation into something a build can hold to account.
 *
 * Documentation rots because nothing fails when it stops being true. Each check
 * here makes one class of rot into a build error: a layer id implying an
 * ancestor nobody declared, a rule the real import graph violates, a
 * declaration whose folder has been emptied.
 *
 * Every check states something about the graph, which is all this version
 * asserts. It holds no unverifiable prose to account because it reads none.
 *
 * Several checks exist because their failure removes coverage instead of
 * producing an error. A rule with a typo, or an `exports` subpath that stops
 * resolving, leaves a build that passes while verifying less than it claims.
 */

import { error, warning, type Diagnostic } from "./diagnostics";
import { ancestorLayerIds } from "./model";

import type { LayerRule } from "../architecture.config";
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
      .map((ancestor) =>
        error(
          layer.declaredIn,
          `layer \`${layer.id}\` implies an ancestor \`${ancestor}\` that is not declared anywhere`,
        ),
      ),
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
): Diagnostic[] =>
  rules.flatMap((rule) =>
    model.edges
      .filter(
        (edge) =>
          withinScope(edge.from, rule.from) && withinScope(edge.to, rule.to),
      )
      .map((edge) => {
        const example = edge.examples[0];
        const imports =
          edge.fileDependencies === 1
            ? "1 import does"
            : `${edge.fileDependencies} imports do`;

        return error(
          example?.from ?? edge.from,
          `\`${edge.from}\` must not depend on \`${edge.to}\` (${rule.reason}); ${imports}, e.g. ${example ? `${example.from} → ${example.to}` : "unknown"}`,
        );
      }),
  );

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
    .map((layer) =>
      warning(
        layer.declaredIn,
        `layer \`${layer.id}\` has no source files and no sub-layers; was its folder moved or emptied?`,
      ),
    );
};

/**
 * A rule naming a layer that does not exist matches no edge and fires never.
 *
 * `checkRules` matches by layer id or ancestor prefix, so `reactt` is not a
 * pattern that happens to match nothing: it is a rule that has been switched off
 * by a typo, while still reading as enforced on the overview page. The rules are
 * the only claims here checked against the import graph, so a silently inert one
 * is the most expensive kind of mistake this file can allow.
 */
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
          "architecture.config.ts",
          `rule \`${rule.from}\` must not depend on \`${rule.to}\` names \`${rule[side]}\` as its \`${side}\`, which is not a declared layer, so the rule can never fire`,
        ),
      ),
  );
};

export const runChecks = (options: {
  model: ArchitectureModel;
  rules: LayerRule[];
}): Diagnostic[] => [
  ...checkAncestorsDeclared(options.model),
  ...checkRuleTargets(options.model, options.rules),
  ...checkRules(options.model, options.rules),
  ...checkEmptyLayers(options.model),
];
