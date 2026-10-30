import { actionDefinitions } from "./action-definitions.js";
import { validatePayloadValue } from "./payload-schemas.js";

import type { PayloadValueProblem } from "./payload-schemas.js";
import type {
  FlowActionDefinitionId,
  FlowInputDefinition,
  FlowInputValues,
  OutputDefinition,
  StepInput,
  StepOutput,
} from "./types.js";

const describeProblem = ({ path, message }: PayloadValueProblem) =>
  path ? ` at ${path}: ${message}` : `: ${message}`;

/**
 * Leaves out flow inputs given as an empty string that isn't a valid value of their kind, e.g. a number or a URL left
 * blank in a form, so that they count as not given. An empty string that is valid, e.g. as Text, is kept.
 */
export const omitInvalidEmptyFlowInputs = ({
  inputDefinitions,
  flowInputs,
}: {
  inputDefinitions: readonly FlowInputDefinition[];
  flowInputs: FlowInputValues;
}): FlowInputValues =>
  Object.fromEntries(
    Object.entries(flowInputs).filter(([inputName, payload]) => {
      const inputDefinition = inputDefinitions.find(
        ({ name }) => name === inputName,
      );

      /* Given from outside the workflow, so a payload may not have the shape its type says. */
      const uncheckedPayload = payload as {
        kind?: unknown;
        value?: unknown;
      } | null;
      const { kind, value } = uncheckedPayload ?? {};

      return !(
        value === "" &&
        inputDefinition &&
        !inputDefinition.array &&
        kind === inputDefinition.payloadKind &&
        validatePayloadValue({
          kind: inputDefinition.payloadKind,
          array: false,
          value,
          allowStoredRefs: false,
        })
      );
    }),
  );

/**
 * Checks the values given to a flow's inputs from outside it, e.g. by a user, a schedule or a trigger, against the
 * flow's input definitions. A stored payload reference is rejected, since only the flow's own steps create them.
 *
 * Together with `validateActionOutputs`, this checks every value in a run, so action inputs aren't checked again.
 *
 * @returns what's wrong with the first invalid input, naming it, or `undefined` if every input is valid.
 */
export const validateFlowInputs = ({
  inputDefinitions,
  flowInputs,
}: {
  inputDefinitions: readonly FlowInputDefinition[];
  flowInputs: FlowInputValues;
}): string | undefined => {
  for (const inputName of Object.keys(flowInputs)) {
    if (!inputDefinitions.some(({ name }) => name === inputName)) {
      return `Flow input "${inputName}" isn't one of the flow's inputs`;
    }
  }

  for (const { name, payloadKind, array, required } of inputDefinitions) {
    /* Given from outside the workflow, so a payload may not have the shape its type says. */
    const payload = flowInputs[name] as
      | { kind?: unknown; value?: unknown }
      | null
      | undefined;

    if (payload === undefined) {
      if (required) {
        return `Flow input "${name}" is required, but wasn't given`;
      }
      continue;
    }

    if (typeof payload !== "object" || payload === null) {
      return `Flow input "${name}" must be a payload with a kind and a value`;
    }

    if (payload.kind !== payloadKind) {
      return `Flow input "${name}" must be of kind ${payloadKind}, but is of kind ${String(payload.kind)}`;
    }

    const problem = validatePayloadValue({
      kind: payloadKind,
      array,
      value: payload.value,
      allowStoredRefs: false,
    });

    if (problem) {
      return `Flow input "${name}" is invalid${describeProblem(problem)}`;
    }
  }

  return undefined;
};

/**
 * Checks the outputs an action returned against its output definitions: each is one the action defines, has the
 * kind it declares (or, for a derived kind, the kind given to its kind source), and holds a valid value of it, and
 * every required output is returned.
 *
 * A value of a stored kind may be a stored reference, of which only the kind and whether it's to an array are checked.
 *
 * @returns what's wrong with the first invalid output, naming it, or `undefined` if every output is valid.
 */
export const validateActionOutputs = ({
  actionDefinitionId,
  inputs,
  outputs,
}: {
  actionDefinitionId: FlowActionDefinitionId;
  inputs: readonly StepInput[];
  outputs: readonly StepOutput[];
}): string | undefined => {
  const outputDefinitions: readonly OutputDefinition[] =
    actionDefinitions[actionDefinitionId].outputs;

  for (const { outputName, payload } of outputs) {
    const outputDefinition = outputDefinitions.find(
      ({ name }) => name === outputName,
    );

    if (!outputDefinition) {
      return `Action ${actionDefinitionId} returned output "${outputName}", which it doesn't define`;
    }

    if ("kindFrom" in outputDefinition) {
      const inputKind = inputs.find(
        ({ inputName }) => inputName === outputDefinition.kindFrom,
      )?.payload.kind;

      if (payload.kind !== inputKind) {
        return `Action ${actionDefinitionId} returned output "${outputName}" of kind ${payload.kind}, but it must have the kind of input "${outputDefinition.kindFrom}" (${inputKind ?? "not given"})`;
      }
    } else if (payload.kind !== outputDefinition.payloadKind) {
      return `Action ${actionDefinitionId} returned output "${outputName}" of kind ${payload.kind}, but it must be of kind ${outputDefinition.payloadKind}`;
    }

    const problem = validatePayloadValue({
      kind: payload.kind,
      array: outputDefinition.array,
      value: payload.value,
      allowStoredRefs: true,
    });

    if (problem) {
      return `Action ${actionDefinitionId} returned an invalid output "${outputName}"${describeProblem(problem)}`;
    }
  }

  for (const { name, required } of outputDefinitions) {
    if (required && !outputs.some(({ outputName }) => outputName === name)) {
      return `Action ${actionDefinitionId} didn't return its required output "${name}"`;
    }
  }

  return undefined;
};
