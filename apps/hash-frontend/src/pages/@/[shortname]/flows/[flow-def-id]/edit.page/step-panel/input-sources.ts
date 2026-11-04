import { actionDefinitions } from "@local/hash-isomorphic-utils/flows/action-definitions";
import { canConnect } from "@local/hash-isomorphic-utils/flows/can-connect";
import { createStepShapeResolver } from "@local/hash-isomorphic-utils/flows/step-shapes";

import { getStepsBefore } from "../shared/step-order";
import { findStep, getStepName } from "./shared/find-step";
import { getNameLabel } from "./shared/value-display";

import type {
  ConnectionSource,
  ConnectionTarget,
} from "@local/hash-isomorphic-utils/flows/can-connect";
import type {
  ActionDefinition,
  FlowActionDefinitionId,
  FlowDefinition,
  FlowInputDefinition,
  InputDefinition,
  PayloadKind,
  StepInputSource,
} from "@local/hash-isomorphic-utils/flows/types";

export const flowInputsLabel = "Flow inputs";

/** A definition may name an action that doesn't exist. */
export const getActionDefinition = (actionDefinitionId: string) =>
  (
    actionDefinitions as Partial<
      Record<string, ActionDefinition<FlowActionDefinitionId>>
    >
  )[actionDefinitionId];

/**
 * What can feed an input of a step: the kinds it accepts, and whether it's an array and required. An input that takes
 * its kind from another (see `KindFrom`) accepts the kind connected to that one, or while nothing is, any kind that
 * one accepts.
 */
export const getInputTarget = ({
  flowDefinition,
  stepId,
  input,
  actionDefinition,
}: {
  flowDefinition: FlowDefinition<string>;
  stepId: string;
  input: InputDefinition;
  actionDefinition: ActionDefinition<FlowActionDefinitionId>;
}): ConnectionTarget => {
  const { array, required } = input;

  if ("oneOfPayloadKinds" in input) {
    return { oneOfPayloadKinds: input.oneOfPayloadKinds, array, required };
  }

  const connectedKind = createStepShapeResolver(flowDefinition).getInputKind(
    stepId,
    input.kindFrom,
  );

  if (connectedKind) {
    return { oneOfPayloadKinds: [connectedKind], array, required };
  }

  const kindSource = actionDefinition.inputs.find(
    ({ name }) => name === input.kindFrom,
  );

  return {
    oneOfPayloadKinds:
      kindSource && "oneOfPayloadKinds" in kindSource
        ? kindSource.oneOfPayloadKinds
        : [],
    array,
    required,
  };
};

/** Identifies where a value comes from, among the values that can feed an input. */
export const getSourceKey = (source: StepInputSource) => {
  switch (source.kind) {
    case "flow-input":
      return `flow-input:${source.inputName}`;
    case "step-output":
      return `step-output:${JSON.stringify([source.stepId, source.outputName])}`;
    default:
      return source.kind;
  }
};

export type SourceOption = {
  source: Extract<StepInputSource, { kind: "flow-input" | "step-output" }>;
  /** The value's own name, e.g. "Certificate link". */
  label: string;
  /** Where the value comes from: "Start · Flow inputs", or the step that gives it. */
  from: string;
  shape: ConnectionSource;
};

/** The steps a top-level step runs after, directly or not, nearest first. */
const getEarlierStepIds = (
  steps: FlowDefinition<string>["steps"],
  stepId: string,
) => {
  const stepsBefore = getStepsBefore(steps);
  const earlier = new Set<string>();
  let frontier = [stepId];

  while (frontier.length > 0) {
    frontier = [
      ...new Set(frontier.flatMap((id) => stepsBefore.get(id) ?? [])),
    ].filter((id) => id !== stepId && !earlier.has(id));

    for (const id of frontier) {
      earlier.add(id);
    }
  }

  return [...earlier];
};

/**
 * The values that can feed an input of a top-level step: the flow's inputs, and the outputs of every step it runs
 * after, nearest first. Only those `canConnect` accepts are offered.
 */
export const getSourceOptions = ({
  flowDefinition,
  stepId,
  target,
}: {
  flowDefinition: FlowDefinition<string>;
  stepId: string;
  target: ConnectionTarget;
}): { flowInputs: SourceOption[]; earlierSteps: SourceOption[] } => {
  const shapes = createStepShapeResolver(flowDefinition);
  const fits = (shape: ConnectionSource | null): shape is ConnectionSource =>
    shape !== null && canConnect({ source: shape, target }).ok;

  const flowInputs = flowDefinition.inputs.flatMap(
    ({ name, label, payloadKind, array, required }): SourceOption[] => {
      const shape = { payloadKind, array, required };

      return fits(shape)
        ? [
            {
              source: { kind: "flow-input", inputName: name },
              label: label ?? getNameLabel(name),
              from: `Start · ${flowInputsLabel}`,
              shape,
            },
          ]
        : [];
    },
  );

  const earlierSteps = getEarlierStepIds(flowDefinition.steps, stepId).flatMap(
    (earlierStepId): SourceOption[] => {
      const step = flowDefinition.steps.find(
        (candidate) => candidate.stepId === earlierStepId,
      );

      if (!step) {
        return [];
      }

      const outputNames =
        step.kind === "for-each"
          ? [step.collect.as]
          : (getActionDefinition(step.actionDefinitionId)?.outputs.map(
              ({ name }) => name,
            ) ?? []);

      return outputNames.flatMap((outputName): SourceOption[] => {
        const shape = shapes.getStepOutputShape(step.stepId, outputName);

        return fits(shape)
          ? [
              {
                source: {
                  kind: "step-output",
                  stepId: step.stepId,
                  outputName,
                },
                label: getNameLabel(outputName),
                from: getStepName(step),
                shape,
              },
            ]
          : [];
      });
    },
  );

  return { flowInputs, earlierSteps };
};

/** How a picked value reads in its field, e.g. "Flow inputs › Entity type" or "supplier › Certificate link". */
export const getSourceLabel = (
  flowDefinition: FlowDefinition<string>,
  source: StepInputSource,
) => {
  switch (source.kind) {
    case "flow-input": {
      const flowInput = flowDefinition.inputs.find(
        ({ name }) => name === source.inputName,
      );

      return `${flowInputsLabel} › ${flowInput?.label ?? getNameLabel(source.inputName)}`;
    }

    case "step-output": {
      const found = findStep(flowDefinition.steps, source.stepId);

      return `${found ? getStepName(found.step) : source.stepId} › ${getNameLabel(source.outputName)}`;
    }

    case "item":
      return "For each › Item";

    /* One that can be typed shows in a text field instead. */
    case "constant":
      return "Fixed value";
  }
};

/** Kinds a value can be typed for, as a fixed value, most preferred first. */
const typedKinds: PayloadKind[] = ["Text", "Number", "Date"];

/** A fixed value that can be typed in its field, as it reads there: one text, number or date. */
export const getTypedConstant = (
  source: StepInputSource | undefined,
): { kind: PayloadKind; text: string } | null => {
  if (source?.kind !== "constant") {
    return null;
  }

  const { kind, value } = source.payload;

  return typedKinds.includes(kind) &&
    (typeof value === "string" || typeof value === "number")
    ? { kind, text: String(value) }
    : null;
};

/** The kind of a value typed for an input, or `null` if nothing it accepts can be typed. */
export const getTypedKind = (target: ConnectionTarget) =>
  target.array
    ? null
    : (typedKinds.find((kind) => target.oneOfPayloadKinds.includes(kind)) ??
      null);

/**
 * A new flow input that can feed an input when nothing else can: named after the input, and of a kind it accepts,
 * preferring text. `null` if it accepts no kind.
 */
export const getNewFlowInput = ({
  flowDefinition,
  inputName,
  target,
}: {
  flowDefinition: FlowDefinition<string>;
  inputName: string;
  target: ConnectionTarget;
}): FlowInputDefinition | null => {
  const payloadKind = target.oneOfPayloadKinds.includes("Text")
    ? "Text"
    : target.oneOfPayloadKinds[0];

  if (!payloadKind) {
    return null;
  }

  const takenNames = new Set(flowDefinition.inputs.map(({ name }) => name));
  let name = inputName;

  for (let index = 2; takenNames.has(name); index++) {
    name = `${inputName}${index}`;
  }

  return {
    name,
    label: getNameLabel(name),
    payloadKind,
    array: target.array,
    required: target.required,
  };
};
