import {
  getSourceParts,
  isBuiltSource,
} from "@local/hash-isomorphic-utils/flows/built-sources";

import {
  failedStepRunsPlaceKey,
  generateGaveUpPortKey,
  generateInputPortKey,
  generateInstanceKey,
  generatePendingPlaceKey,
  generateStartPortKey,
  generateStepTransitionKey,
  generateSubnetKey,
  maxRetriesParameterKey,
} from "../flow-net-keys.js";
import { getActionDefinition } from "./shared/flow-steps.js";
import { defaultMaxRetries } from "./shared/max-retries.js";
import {
  createTransition,
  inputArc,
  outputArc,
  placeEndpoint,
  portEndpoint,
  toPetrinautEndpoint,
} from "./shared/net-elements.js";
import { consumes } from "./shared/value-places.js";

import type {
  ConnectedValue,
  InputSource,
  InstanceMetadata,
} from "../flow-net-metadata.js";
import type { FlowSteps } from "./shared/flow-steps.js";
import type { NetBuilder } from "./shared/net-builder.js";
import type { ValuePlaces } from "./shared/value-places.js";
import type {
  ArcEndpoint,
  InputArc,
  JsonValue,
} from "@hashintel/petrinaut-core";
import type {
  ActionStepDefinition,
  ValueSource,
} from "@local/hash-isomorphic-utils/flows/types";

/**
 * Adds an action step: an instance of its action's subnet, the `startStep` transition that starts it once its
 * `Pending` token and its connected inputs are available, and the `recordStepFailure` transition that records it giving up.
 */
export const compileActionStep = ({
  step,
  steps,
  net,
  values,
}: {
  step: ActionStepDefinition;
  steps: FlowSteps;
  net: NetBuilder;
  values: ValuePlaces;
}) => {
  const actionDefinition = getActionDefinition(step);
  const subnetName = steps.getSubnetName(step);

  const valueArcs: (InputArc & { endpoint: ArcEndpoint })[] = [];

  const constants: Record<string, JsonValue> = {};

  /**
   * Where each of the action's inputs gets its value, as the arcs alone don't say: two inputs of one kind connected
   * the other way round take the same arcs.
   */
  const inputSources: Record<string, InputSource> = {};

  const connectedValue = (
    arc: { endpoint: ArcEndpoint },
    source: ValueSource,
  ): ConnectedValue => ({
    kind: "value",
    from: toPetrinautEndpoint(arc.endpoint),
    access: consumes(source) ? "consume" : "read",
    ...(source.kind !== "constant" && source.wrap ? { wrap: true } : {}),
    ...(source.kind !== "constant" && source.whenMissing
      ? { whenMissing: source.whenMissing }
      : {}),
  });

  for (const [inputName, source] of Object.entries(step.inputs)) {
    if (isBuiltSource(source)) {
      /* The step takes each value the input is built from, and builds it when it starts. */
      const parts: Record<string, ConnectedValue> = {};

      for (const [partIndex, part] of getSourceParts(source).entries()) {
        const arc = values.stepInputPartArc(step.stepId, inputName, partIndex);

        if (arc) {
          valueArcs.push(arc);
          parts[part.key] = connectedValue(arc, part.from);
        }
      }

      inputSources[inputName] = {
        kind: "built",
        source: source as JsonValue,
        parts,
      };
    } else if (source.kind === "constant") {
      constants[inputName] = source.payload as JsonValue;
      inputSources[inputName] = { kind: "constant" };
    } else {
      const arc = values.stepInputArc(step.stepId, inputName);

      if (arc) {
        valueArcs.push(arc);
        inputSources[inputName] = connectedValue(arc, source);
      }
    }
  }

  const inputPortIds =
    actionDefinition.inputs.length > 0
      ? actionDefinition.inputs.map(({ name }) =>
          generateInputPortKey(subnetName, name),
        )
      : [generateStartPortKey(subnetName)];

  /*
   * An input nothing is connected to takes its default, if it has one. Otherwise, as it must be optional, it's given a
   * token marked absent.
   */
  const absentInputPortIds: string[] = [];

  for (const input of actionDefinition.inputs) {
    if (input.name in step.inputs) {
      continue;
    }

    if ("default" in input && input.default !== undefined) {
      inputSources[input.name] = { kind: "default" };
    } else {
      inputSources[input.name] = { kind: "absent" };
      absentInputPortIds.push(generateInputPortKey(subnetName, input.name));
    }
  }

  const {
    arcs: runAfterArcs,
    runAfter,
    paths,
  } = values.runAfterArcs(step, valueArcs);

  const startStepKey = generateStepTransitionKey("startStep", step.stepId);

  net.markAbsentInputPorts(startStepKey, absentInputPortIds);

  net.addTransitions(
    createTransition({
      id: startStepKey,
      name: `Start ${step.stepId}`,
      description: `Starts step ${step.stepId} once its inputs are available, feeding every input of ${step.actionDefinitionId}: connected values, constants, values built from several, and absent values for unconnected optional inputs.`,
      metadata: {
        role: "startStep",
        stepId: step.stepId,
        inputSources,
        ...(runAfter.length > 0
          ? { runAfter: runAfter.map(toPetrinautEndpoint) }
          : {}),
        ...(paths.length > 0 ? { paths: paths.map(toPetrinautEndpoint) } : {}),
      },
      inputArcs: [
        inputArc(placeEndpoint(generatePendingPlaceKey(step.stepId))),
        ...valueArcs,
        ...runAfterArcs,
      ],
      outputArcs: inputPortIds.map((portId) =>
        outputArc(portEndpoint(generateInstanceKey(step.stepId), portId)),
      ),
    }),
    createTransition({
      id: generateStepTransitionKey("recordStepFailure", step.stepId),
      name: `${step.stepId} gave up`,
      description: `Records that step ${step.stepId} gave up, failing its run.`,
      metadata: { role: "recordStepFailure", stepId: step.stepId },
      inputArcs: [
        inputArc(
          portEndpoint(
            generateInstanceKey(step.stepId),
            generateGaveUpPortKey(subnetName),
          ),
        ),
      ],
      outputArcs: [outputArc(placeEndpoint(failedStepRunsPlaceKey))],
    }),
  );

  net.addComponentInstance({
    id: generateInstanceKey(step.stepId),
    name: `${step.stepId}: ${step.actionDefinitionId}`,
    description: step.description,
    metadata: {
      actionDefinitionId: step.actionDefinitionId,
      ...(Object.keys(constants).length > 0 ? { constants } : {}),
    } satisfies InstanceMetadata,
    component: { id: generateSubnetKey(subnetName) },
    parameterValues: {
      [maxRetriesParameterKey]: String(step.retryCount ?? defaultMaxRetries),
    },
    x: 0,
    y: 0,
  });
};
