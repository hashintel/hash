import { useMemo } from "react";

import { createStepShapeResolver } from "@local/hash-isomorphic-utils/flows/step-shapes";

import { useLatestEntityTypesOptional } from "../../../../../../../shared/entity-types-context/hooks";
import { findStep } from "./find-step";
import { readQueryEntityTypes } from "./query-form";
import { getActionDefinition } from "./step-display";

import type { BaseUrl } from "@blockprotocol/type-system";
import type {
  FlowDefinition,
  PayloadKind,
  StepDefinition,
  StepInputSource,
} from "@local/hash-isomorphic-utils/flows/types";

const entityKinds = new Set<PayloadKind>([
  "EntityId",
  "PersistedEntityMetadata",
  "ProposedEntity",
  "ProposedEntityWithResolvedLinks",
]);

/** The ids of the for-each steps around a step, outermost first, or `undefined` if there's no such step. */
export const getForEachScope = (
  steps: StepDefinition<string>[],
  stepId: string,
): string[] | undefined => {
  for (const step of steps) {
    if (step.stepId === stepId) {
      return [];
    }

    if (step.kind === "for-each") {
      const scope = getForEachScope(step.steps, stepId);

      if (scope) {
        return [step.stepId, ...scope];
      }
    }
  }

  return undefined;
};

/**
 * The query of the Find entities step a list comes from, through steps such as Order by and Take first that pass on
 * some of their list's items.
 */
const findListQuery = (
  flowDefinition: FlowDefinition<string>,
  list: StepInputSource | undefined,
) => {
  const visited = new Set<string>();
  let source = list;

  while (source?.kind === "step-output" && !visited.has(source.stepId)) {
    visited.add(source.stepId);

    const step = findStep(flowDefinition.steps, source.stepId)?.step;

    if (step?.kind !== "action") {
      return undefined;
    }

    if (step.actionDefinitionId === "queryEntities") {
      return step.inputs.query;
    }

    const { outputName } = source;
    const output = getActionDefinition(step.actionDefinitionId)?.outputs.find(
      ({ name }) => name === outputName,
    );

    source =
      output && "kindFrom" in output ? step.inputs[output.kindFrom] : undefined;
  }

  return undefined;
};

/**
 * What one item of a for-each's list is called, as in "For each supplier". Nothing stores it, so it comes from the
 * list: a Find entities query limited to one type, or a list taken from one, gives that type's title in lower case,
 * any other list of entities
 * gives "entity", and anything else "item".
 */
export const getItemName = ({
  flowDefinition,
  forEachStepId,
  entityTypeTitles,
}: {
  flowDefinition: FlowDefinition<string>;
  forEachStepId: string;
  entityTypeTitles: ReadonlyMap<BaseUrl, string>;
}) => {
  const forEach = findStep(flowDefinition.steps, forEachStepId)?.step;
  const scope = getForEachScope(flowDefinition.steps, forEachStepId);

  if (forEach?.kind !== "for-each" || !scope) {
    return "item";
  }

  const query = findListQuery(flowDefinition, forEach.over);
  const [onlyType, ...otherTypes] =
    query?.kind === "constant" ? readQueryEntityTypes(query.payload.value) : [];
  const title =
    onlyType && otherTypes.length === 0
      ? entityTypeTitles.get(onlyType)
      : undefined;

  if (title) {
    return title.toLowerCase();
  }

  const kind = createStepShapeResolver(flowDefinition).getSourceShape(
    forEach.over,
    scope,
  )?.payloadKind;

  return kind && entityKinds.has(kind) ? "entity" : "item";
};

/** `getItemName` for each for-each step of a flow, by its id. */
export const useItemNames = (flowDefinition: FlowDefinition<string>) => {
  /* A query can still name a type that has since been archived. */
  const { latestEntityTypes } = useLatestEntityTypesOptional({
    includeArchived: true,
  });

  return useMemo(() => {
    const entityTypeTitles = new Map(
      (latestEntityTypes ?? []).map(({ metadata, schema }) => [
        metadata.recordId.baseUrl,
        schema.title,
      ]),
    );

    return (forEachStepId: string) =>
      getItemName({ flowDefinition, forEachStepId, entityTypeTitles });
  }, [flowDefinition, latestEntityTypes]);
};
