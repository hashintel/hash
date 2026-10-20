import { accumulatorColor, createIteratorColor } from "./shared/colors.js";
import {
  createTransition,
  inputArc,
  outputArc,
  placeEndpoint,
} from "./shared/net-elements.js";
import { pendingPlaceId } from "./shared/step-places.js";
import {
  consumes,
  itemValueKey,
  outputValueKey,
  sourceValueKey,
} from "./shared/value-places.js";

import type { FlowSteps } from "./shared/flow-steps.js";
import type { NetBuilder } from "./shared/net-builder.js";
import type { ValuePlaces } from "./shared/value-places.js";
import type { JsonValue } from "@hashintel/petrinaut-core";
import type { ForEachStepDefinition } from "@local/hash-isomorphic-utils/flows/types";

/**
 * Adds a for-each step: an iterator that fans out one item token (and one `Pending` token per nested step) at a
 * time, and an accumulator that counts each item's collected output until every item has finished.
 */
export const compileForEachStep = ({
  step,
  steps,
  net,
  values,
}: {
  step: ForEachStepDefinition;
  steps: FlowSteps;
  net: NetBuilder;
  values: ValuePlaces;
}) => {
  const overShape = steps.getForEachArrayShape(step);

  const iteratorPlaceId = net.addPlace({
    id: `p.forEach.${step.stepId}.iterator`,
    name: `Iterator: ${step.stepId}`,
    description: `Iterates over the array step ${step.stepId} runs its steps for.`,
    colorId: net.registerColor(createIteratorColor(overShape.payloadKind)),
  });

  const accumulatorPlaceId = net.addPlace({
    id: `p.forEach.${step.stepId}.accumulator`,
    name: `Accumulator: ${step.stepId}`,
    description: `Counts the items of step ${step.stepId} that have finished.`,
    colorId: net.registerColor(accumulatorColor),
  });

  const overKey = sourceValueKey(step.over);

  net.addTransitions(
    createTransition({
      id: `t.startForEach.${step.stepId}`,
      name: `Start ${step.stepId}`,
      description: `Starts step ${step.stepId} once its array is available.`,
      role: "startForEach",
      inputArcs: [
        inputArc(placeEndpoint(pendingPlaceId(step.stepId))),
        ...(overKey
          ? [
              values.valueInputArc(overKey, {
                key: `${step.stepId}.over`,
                label: `${step.stepId} (for each)`,
                consumes: consumes(step.over),
              }),
            ]
          : []),
      ],
      outputArcs: [outputArc(placeEndpoint(iteratorPlaceId))],
      metadata: {
        stepId: step.stepId,
        ...(step.over.kind === "constant"
          ? { constant: step.over.payload as JsonValue }
          : {}),
      },
    }),
    createTransition({
      id: `t.startItem.${step.stepId}`,
      name: `Start an item of ${step.stepId}`,
      description: `Starts the next item of step ${step.stepId}, while \`next\` is less than \`item_count\`.`,
      role: "startItem",
      metadata: { stepId: step.stepId },
      inputArcs: [inputArc(placeEndpoint(iteratorPlaceId))],
      outputArcs: [
        outputArc(placeEndpoint(iteratorPlaceId)),
        ...values.valueOutputArcs(itemValueKey(step.stepId)),
        ...step.steps.map(({ stepId }) =>
          outputArc(placeEndpoint(pendingPlaceId(stepId))),
        ),
      ],
    }),
    createTransition({
      id: `t.startCollecting.${step.stepId}`,
      name: `Collect the items of ${step.stepId}`,
      description: `Every item of step ${step.stepId} has started (\`next\` equals \`item_count\`): count them as they finish.`,
      role: "startCollecting",
      metadata: { stepId: step.stepId },
      inputArcs: [inputArc(placeEndpoint(iteratorPlaceId))],
      outputArcs: [outputArc(placeEndpoint(accumulatorPlaceId))],
    }),
    createTransition({
      id: `t.collectItem.${step.stepId}`,
      name: `Collect an item of ${step.stepId}`,
      description: `Collects an item's ${step.collect.stepId}.${step.collect.outputName}, counting it as done.`,
      role: "collectItem",
      metadata: { stepId: step.stepId, collect: step.collect },
      inputArcs: [
        values.valueInputArc(
          outputValueKey(step.collect.stepId, step.collect.outputName),
          {
            key: `${step.stepId}.collect`,
            label: `${step.stepId} (collect)`,
            consumes: true,
          },
        ),
        inputArc(placeEndpoint(accumulatorPlaceId)),
      ],
      outputArcs: [outputArc(placeEndpoint(accumulatorPlaceId))],
    }),
    createTransition({
      id: `t.finishCollecting.${step.stepId}`,
      name: `Finish collecting ${step.stepId}`,
      description: `Every item of step ${step.stepId} has finished (\`done\` equals \`expected\`): its collected output is complete.`,
      role: "finishCollecting",
      metadata: { stepId: step.stepId },
      inputArcs: [inputArc(placeEndpoint(accumulatorPlaceId))],
      outputArcs: values.valueOutputArcs(
        outputValueKey(step.stepId, step.collect.as),
      ),
    }),
  );
};
