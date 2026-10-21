import {
  generateAccumulatorPlaceKey,
  generateIteratorPlaceKey,
  generatePendingPlaceKey,
  generateStepTransitionKey,
} from "../flow-net-keys.js";
import { accumulatorColor, createIteratorColor } from "./shared/colors.js";
import {
  createTransition,
  inputArc,
  outputArc,
  placeEndpoint,
} from "./shared/net-elements.js";

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
    id: generateIteratorPlaceKey(step.stepId),
    name: `Iterator: ${step.stepId}`,
    description: `Iterates over the array step ${step.stepId} runs its steps for.`,
    colorId: net.registerColor(createIteratorColor(overShape.payloadKind)),
  });

  const accumulatorPlaceId = net.addPlace({
    id: generateAccumulatorPlaceKey(step.stepId),
    name: `Accumulator: ${step.stepId}`,
    description: `Counts the items of step ${step.stepId} that have finished.`,
    colorId: net.registerColor(accumulatorColor),
  });

  const arrayArc = values.forEachArrayArc(step.stepId);

  net.addTransitions(
    createTransition({
      id: generateStepTransitionKey("startForEach", step.stepId),
      name: `Start ${step.stepId}`,
      description: `Starts step ${step.stepId} once its array is available.`,
      metadata: {
        role: "startForEach",
        stepId: step.stepId,
        ...(step.over.kind === "constant"
          ? { constant: step.over.payload as JsonValue }
          : {}),
      },
      inputArcs: [
        inputArc(placeEndpoint(generatePendingPlaceKey(step.stepId))),
        ...(arrayArc ? [arrayArc] : []),
      ],
      outputArcs: [outputArc(placeEndpoint(iteratorPlaceId))],
    }),
    createTransition({
      id: generateStepTransitionKey("startItem", step.stepId),
      name: `Start an item of ${step.stepId}`,
      description: `Starts the next item of step ${step.stepId}, while \`next\` is less than \`item_count\`.`,
      metadata: { role: "startItem", stepId: step.stepId },
      inputArcs: [inputArc(placeEndpoint(iteratorPlaceId))],
      outputArcs: [
        outputArc(placeEndpoint(iteratorPlaceId)),
        ...values.itemOutputArcs(step.stepId),
        ...step.steps.map(({ stepId }) =>
          outputArc(placeEndpoint(generatePendingPlaceKey(stepId))),
        ),
      ],
    }),
    createTransition({
      id: generateStepTransitionKey("startCollecting", step.stepId),
      name: `Collect the items of ${step.stepId}`,
      description: `Every item of step ${step.stepId} has started (\`next\` equals \`item_count\`): count them as they finish.`,
      metadata: { role: "startCollecting", stepId: step.stepId },
      inputArcs: [inputArc(placeEndpoint(iteratorPlaceId))],
      outputArcs: [outputArc(placeEndpoint(accumulatorPlaceId))],
    }),
    createTransition({
      id: generateStepTransitionKey("collectItem", step.stepId),
      name: `Collect an item of ${step.stepId}`,
      description: `Collects an item's ${step.collect.stepId}.${step.collect.outputName}, counting it as done.`,
      metadata: {
        role: "collectItem",
        stepId: step.stepId,
        collect: step.collect,
      },
      inputArcs: [
        values.collectArc(step.stepId),
        inputArc(placeEndpoint(accumulatorPlaceId)),
      ],
      outputArcs: [outputArc(placeEndpoint(accumulatorPlaceId))],
    }),
    createTransition({
      id: generateStepTransitionKey("finishCollecting", step.stepId),
      name: `Finish collecting ${step.stepId}`,
      description: `Every item of step ${step.stepId} has finished (\`done\` equals \`expected\`): its collected output is complete.`,
      metadata: { role: "finishCollecting", stepId: step.stepId },
      inputArcs: [inputArc(placeEndpoint(accumulatorPlaceId))],
      outputArcs: values.collectedOutputArcs(step.stepId, step.collect.as),
    }),
  );
};
