import { useMemo } from "react";

import { createStepShapeResolver } from "@local/hash-isomorphic-utils/flows/step-shapes";
import { payloadKindTraits } from "@local/hash-isomorphic-utils/flows/types";

import { useLatestEntityTypesOptional } from "../../../../../../../../shared/entity-types-context/hooks";
import { findStep } from "../../shared/find-step";
import { getSourceEntityTypes } from "../../shared/item-name";
import { getEntityProperties } from "./condition-properties";
import { getConditionTargets } from "./condition-targets";
import { useConditionOntology } from "./use-condition-ontology";

import type { ConditionTarget } from "./condition-targets";
import type {
  FlowDefinition,
  PayloadKind,
} from "@local/hash-isomorphic-utils/flows/types";

export type ConditionTargets = {
  /** The kind connected to the input the targets are read from, or `null` while nothing is. */
  kind: PayloadKind | null;
  /** Every target a saved value can name, by key, so one on any type's property reads back. */
  targetsByKey: Map<string, ConditionTarget>;
  /** What can be picked: the source's types' properties when it's limited to some, nothing until `kind` is connected. */
  offered: ConditionTarget[];
};

/** What a step's condition, sort or aggregation can read from its `kindFrom` input's value. `null` while types load. */
export const useConditionTargets = ({
  flowDefinition,
  stepId,
  kindFrom,
  savedKind,
  valueLabel,
}: {
  flowDefinition: FlowDefinition<string>;
  stepId: string;
  /** The input whose values are read, if the step has one. */
  kindFrom: string | undefined;
  /** The kind a saved value was built for, so it still reads while nothing is connected. */
  savedKind: PayloadKind | null;
  /** What the value itself is called, e.g. "Value" or "Item". */
  valueLabel: string;
}): ConditionTargets | null => {
  const ontology = useConditionOntology();
  const { latestEntityTypes } = useLatestEntityTypesOptional();

  const step = findStep(flowDefinition.steps, stepId)?.step;
  const kindSource =
    kindFrom !== undefined && step?.kind === "action"
      ? step.inputs[kindFrom]
      : undefined;
  const kind =
    kindFrom === undefined
      ? null
      : createStepShapeResolver(flowDefinition).getInputKind(stepId, kindFrom);
  const rowKind = kind ?? savedKind;
  const readsEntities =
    rowKind !== null && "entity" in payloadKindTraits[rowKind];

  /* Every type's, so a saved target on any property reads back. */
  const allProperties = useMemo(
    () =>
      readsEntities && ontology && latestEntityTypes
        ? getEntityProperties(
            ontology,
            latestEntityTypes.map(({ schema }) => schema.$id),
          )
        : null,
    [readsEntities, ontology, latestEntityTypes],
  );

  /* The types of the Find entities query the value comes from, if it's limited to some. */
  const sourceTypes = readsEntities
    ? getSourceEntityTypes(flowDefinition, stepId, kindSource)
    : [];
  const sourceTypeKey = sourceTypes.join(" ");
  const offeredProperties = useMemo(
    () =>
      sourceTypeKey !== "" && ontology && latestEntityTypes
        ? getEntityProperties(
            ontology,
            latestEntityTypes
              .filter(({ metadata }) =>
                sourceTypeKey.split(" ").includes(metadata.recordId.baseUrl),
              )
              .map(({ schema }) => schema.$id),
          )
        : null,
    [sourceTypeKey, ontology, latestEntityTypes],
  );

  if (readsEntities && !allProperties) {
    return null;
  }

  /* Last, so the source's version of a property wins over another type's. */
  const targets = getConditionTargets({
    kind: rowKind,
    valueLabel,
    properties: [...(allProperties ?? []), ...(offeredProperties ?? [])],
  });

  return {
    kind,
    targetsByKey: new Map(targets.map((target) => [target.key, target])),
    offered:
      kind === null
        ? []
        : offeredProperties
          ? getConditionTargets({
              kind,
              valueLabel,
              properties: offeredProperties,
            })
          : targets,
  };
};
