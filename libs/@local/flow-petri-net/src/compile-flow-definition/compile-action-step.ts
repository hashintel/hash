import {
  actionSubnetId,
  defaultMaxRetries,
  gaveUpPortId,
  inputPortId,
  maxRetriesParameterId,
  startPortId,
} from "./shared/action-subnet-ids.js";
import { getActionDefinition } from "./shared/flow-steps.js";
import {
  createTransition,
  inputArc,
  outputArc,
  placeEndpoint,
  portEndpoint,
} from "./shared/net-elements.js";
import {
  failedStepRunsPlaceId,
  instanceKey,
  itemPlaceId,
  pendingPlaceId,
} from "./shared/step-places.js";
import { consumes, sourceValueKey } from "./shared/value-places.js";

import type { FlowSteps } from "./shared/flow-steps.js";
import type { NetBuilder } from "./shared/net-builder.js";
import type { ValuePlaces } from "./shared/value-places.js";
import type { InputArc, JsonValue } from "@hashintel/petrinaut-core";
import type { ActionStepDefinition } from "@local/hash-isomorphic-utils/flows/types";

/**
 * Adds an action step: an instance of its action's subnet, the `startStep` transition that starts it once its
 * `Pending` token and its connected inputs are available, and the `recordStepFailure` transition that records it giving up.
 */
export const compileActionStep = ({
  step,
  scope,
  steps,
  net,
  values,
}: {
  step: ActionStepDefinition;
  /** The for-each steps enclosing the step, outermost first. */
  scope: string[];
  steps: FlowSteps;
  net: NetBuilder;
  values: ValuePlaces;
}) => {
  const actionDefinition = getActionDefinition(step);
  const subnetKey = steps.getSubnetKey(step);

  const inputArcs: InputArc[] = [
    inputArc(placeEndpoint(pendingPlaceId(step.stepId))),
  ];

  const constants: Record<string, JsonValue> = {};

  for (const [inputName, source] of Object.entries(step.inputs)) {
    const consumer = {
      key: `${step.stepId}.${inputName}`,
      name: `${step.stepId}.${inputName}`,
      consumes: consumes(source),
    };

    if (source.kind === "constant") {
      constants[inputName] = source.payload as JsonValue;
    } else if (source.kind === "item") {
      const forEachStepId = scope.at(-1);

      if (forEachStepId === undefined) {
        throw new Error(
          `Step "${step.stepId}" uses an item outside a for-each step`,
        );
      }

      inputArcs.push(
        inputArc(
          placeEndpoint(itemPlaceId(forEachStepId)),
          consumer.consumes ? "standard" : "read",
        ),
      );
    } else {
      const key = sourceValueKey(source);

      if (key) {
        inputArcs.push(values.valueInputArc(key, consumer));
      }
    }
  }

  const inputPortIds =
    actionDefinition.inputs.length > 0
      ? actionDefinition.inputs.map(({ name }) => inputPortId(subnetKey, name))
      : [startPortId(subnetKey)];

  /* An optional input that nothing feeds, and that has no default, is given a token marked absent. */
  net.markAbsentInputPorts(
    `t.startStep.${step.stepId}`,
    actionDefinition.inputs
      .filter(
        (input) =>
          !(input.name in step.inputs) &&
          !input.required &&
          !("default" in input && input.default !== undefined),
      )
      .map(({ name }) => inputPortId(subnetKey, name)),
  );

  net.addTransitions(
    createTransition({
      id: `t.startStep.${step.stepId}`,
      name: `Start ${step.stepId}`,
      description: `Starts step ${step.stepId} once its inputs are available, feeding every input of ${step.actionDefinitionId}: connected values, constants, and absent values for unconnected optional inputs.`,
      role: "startStep",
      metadata: { stepId: step.stepId },
      inputArcs,
      outputArcs: inputPortIds.map((portId) =>
        outputArc(portEndpoint(instanceKey(step.stepId), portId)),
      ),
    }),
    createTransition({
      id: `t.recordStepFailure.${step.stepId}`,
      name: `${step.stepId} gave up`,
      description: `Records that step ${step.stepId} gave up, failing its run.`,
      role: "recordStepFailure",
      metadata: { stepId: step.stepId },
      inputArcs: [
        inputArc(
          portEndpoint(instanceKey(step.stepId), gaveUpPortId(subnetKey)),
        ),
      ],
      outputArcs: [outputArc(placeEndpoint(failedStepRunsPlaceId))],
    }),
  );

  net.addComponentInstance({
    id: instanceKey(step.stepId),
    name: `${step.stepId}: ${step.actionDefinitionId}`,
    description: step.description,
    metadata: {
      actionDefinitionId: step.actionDefinitionId,
      ...(Object.keys(constants).length > 0 ? { constants } : {}),
    },
    subnetId: actionSubnetId(subnetKey),
    parameterValues: {
      [maxRetriesParameterId]: String(step.retryCount ?? defaultMaxRetries),
    },
    x: 0,
    y: 0,
  });
};
