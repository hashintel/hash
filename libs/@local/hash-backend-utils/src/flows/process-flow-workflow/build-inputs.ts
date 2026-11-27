import {
  buildSourcePayload,
  getSourceParts,
  isBuiltSource,
} from "@local/hash-isomorphic-utils/flows/built-sources";

import type {
  ActionStep,
  ActionStepDefinition,
  Payload,
  StepInput,
  StepInputPart,
  ValueSource,
} from "@local/hash-isomorphic-utils/flows/types";

/** The parts of a step's inputs that have no value yet, for each input that's built from several values. */
export const getMissingInputParts = ({
  step,
  stepDefinition,
}: {
  step: ActionStep;
  stepDefinition: ActionStepDefinition;
}) =>
  Object.entries(stepDefinition.inputs).flatMap(([inputName, source]) =>
    isBuiltSource(source) &&
    !step.inputs?.some((input) => input.inputName === inputName)
      ? getSourceParts(source)
          .filter(
            (part) =>
              !step.inputParts?.some(
                (held) =>
                  held.inputName === inputName && held.partKey === part.key,
              ),
          )
          .map((part) => ({ inputName, part }))
      : [],
  );

/**
 * Gives a step the value `getPayload` has for each source of its inputs: an input's own, or one part of an input
 * that's built from several, which is built once it has a value for every part. The step no longer holds the parts of
 * an input it has built.
 */
export const addInputValues = ({
  step,
  stepDefinition,
  getPayload,
}: {
  step: ActionStep;
  stepDefinition: ActionStepDefinition;
  /** The payload a source gives now, if it has one to give. */
  getPayload: (source: ValueSource) => Payload | undefined;
}) => {
  const inputs: StepInput[] = [];
  const inputParts: StepInputPart[] = [];

  for (const [inputName, source] of Object.entries(stepDefinition.inputs)) {
    if (isBuiltSource(source)) {
      for (const part of getSourceParts(source)) {
        const payload = getPayload(part.from);

        if (payload) {
          inputParts.push({ inputName, partKey: part.key, payload });
        }
      }

      continue;
    }

    const payload = getPayload(source);

    if (payload) {
      inputs.push({ inputName, payload });
    }
  }

  /* eslint-disable no-param-reassign -- a run's steps hold its state as it runs */
  if (inputs.length > 0) {
    step.inputs = [...(step.inputs ?? []), ...inputs];
  }

  step.inputParts = [...(step.inputParts ?? []), ...inputParts];

  const missing = getMissingInputParts({ step, stepDefinition });

  for (const [inputName, source] of Object.entries(stepDefinition.inputs)) {
    if (
      !isBuiltSource(source) ||
      step.inputs?.some((input) => input.inputName === inputName) ||
      missing.some((missingPart) => missingPart.inputName === inputName)
    ) {
      continue;
    }

    const held = step.inputParts.filter((part) => part.inputName === inputName);

    step.inputs = [
      ...(step.inputs ?? []),
      {
        inputName,
        payload: buildSourcePayload(
          source,
          (partKey) =>
            held.find((part) => part.partKey === partKey)?.payload.value,
        ),
      },
    ];

    step.inputParts = step.inputParts.filter(
      (part) => part.inputName !== inputName,
    );
  }

  if (step.inputParts.length === 0) {
    delete step.inputParts;
  }
  /* eslint-enable no-param-reassign */
};
