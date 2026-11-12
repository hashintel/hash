import {
  getFlowInputLabel,
  getKindLabel,
  withArticle,
} from "../../shared/value-display";

import type { EntityId } from "@blockprotocol/type-system";
import type { FlowEditorState } from "@local/hash-isomorphic-utils/flows/flow-editor";
import type {
  FlowInputDefinition,
  FlowInputValues,
  Payload,
  PayloadKind,
} from "@local/hash-isomorphic-utils/flows/types";

/**
 * A value given to a flow input in the run form. A number or an entity not given yet is `null`, text or a date `""`,
 * and a list of entities `[]`.
 */
export type RunFormValue =
  | { kind: "Text"; value: string }
  | { kind: "Number"; value: number | null }
  | { kind: "Boolean"; value: boolean }
  | { kind: "Date"; value: string }
  | { kind: "EntityId"; array: false; value: EntityId | null }
  | { kind: "EntityId"; array: true; value: EntityId[] };

/** The form's values, by the name of the input each is for. Inputs the form can't take have none. */
export type RunFormValues = Record<string, RunFormValue>;

/** The value each kind starts with in the form, or `null` for a kind it can't take yet, e.g. a duration. */
const emptyValues = {
  Text: { kind: "Text", value: "" },
  Number: { kind: "Number", value: null },
  Boolean: { kind: "Boolean", value: false },
  Date: { kind: "Date", value: "" },
  ActorType: null,
  Aggregation: null,
  DateTime: null,
  Duration: null,
  EntityId: { kind: "EntityId", array: false, value: null },
  EntityQuery: null,
  FailedEntityProposal: null,
  FilterCondition: null,
  FormattedText: null,
  GoogleAccountId: null,
  GoogleSheet: null,
  PersistedEntityMetadata: null,
  PropertyObjectWithMetadata: null,
  PropertyPatch: null,
  ProposedEntity: null,
  ProposedEntityWithResolvedLinks: null,
  SortKey: null,
  VersionedUrl: null,
  WebPage: null,
  WebSearchResult: null,
} satisfies Record<PayloadKind, RunFormValue | null>;

/** The value an input starts with in the form, or `null` if the form can't take it, e.g. a list of text. */
const getEmptyValue = ({
  payloadKind,
  array,
}: FlowInputDefinition): RunFormValue | null => {
  if (!array) {
    return emptyValues[payloadKind];
  }

  return payloadKind === "EntityId"
    ? { kind: "EntityId", array: true, value: [] }
    : null;
};

export const getInitialFormValues = (
  inputs: FlowInputDefinition[],
): RunFormValues => {
  const values: RunFormValues = {};

  for (const input of inputs) {
    const value = getEmptyValue(input);

    if (value) {
      values[input.name] = value;
    }
  }

  return values;
};

/** A run's value as the form's value for its input, given the value the input starts with, or `null` if it isn't one. */
const getRanFormValue = (
  emptyValue: RunFormValue,
  payload: Payload,
): RunFormValue | null => {
  const { value } = payload;

  switch (emptyValue.kind) {
    case "Text":
    case "Date":
      return typeof value === "string"
        ? { kind: emptyValue.kind, value }
        : null;
    case "Number":
      return typeof value === "number" ? { kind: "Number", value } : null;
    case "Boolean":
      return typeof value === "boolean" ? { kind: "Boolean", value } : null;
    case "EntityId":
      if (payload.kind !== "EntityId") {
        return null;
      }

      if (emptyValue.array) {
        return Array.isArray(payload.value) &&
          payload.value.every(
            (item): item is EntityId => typeof item === "string",
          )
          ? { kind: "EntityId", array: true, value: payload.value }
          : null;
      }

      return typeof payload.value === "string"
        ? { kind: "EntityId", array: false, value: payload.value }
        : null;
  }
};

/**
 * The form's values to run the flow again with a run's inputs: each of the run's values fills in the input of the same
 * name. `changedInputLabels` names the run's inputs whose values are left out, as the flow no longer has them or they
 * now take another kind of value.
 */
export const getFormValuesFromRun = (
  inputs: FlowInputDefinition[],
  ranInputs: FlowInputValues,
): { values: RunFormValues; changedInputLabels: string[] } => {
  const values = getInitialFormValues(inputs);
  const inputsByName = new Map(inputs.map((input) => [input.name, input]));
  const changedInputLabels: string[] = [];

  for (const [name, payload] of Object.entries(ranInputs)) {
    const input = inputsByName.get(name);

    if (
      !input ||
      input.payloadKind !== payload.kind ||
      input.array !== Array.isArray(payload.value)
    ) {
      changedInputLabels.push(getFlowInputLabel(input ?? { name }));
      continue;
    }

    const emptyValue = values[name];
    const ranValue = emptyValue ? getRanFormValue(emptyValue, payload) : null;

    if (ranValue) {
      values[name] = ranValue;
    }
  }

  return { values, changedInputLabels };
};

/**
 * Why the flow can't be run from the editor, or `null` if it can: the first of its errors, no steps, or a required
 * input the form can't take.
 */
export const getRunBlocker = ({
  flowDefinition,
  flowProblems,
  problemsByStepId,
}: FlowEditorState): string | null => {
  /* Warnings, e.g. an unused input, don't stop a flow running. */
  const firstError = [
    ...flowProblems,
    ...[...problemsByStepId.values()].flat(),
  ].find(({ severity }) => severity === "error");

  if (firstError) {
    return `Fix this flow's problems to run it: ${firstError.message}`;
  }

  if (flowDefinition.steps.length === 0) {
    return "Add a step to run this flow";
  }

  const unfillable = flowDefinition.inputs.find(
    (input) => input.required && !getEmptyValue(input),
  );

  if (unfillable) {
    return `“${getFlowInputLabel(unfillable)}” takes ${withArticle(getKindLabel(unfillable))}, which can't be given here yet`;
  }

  return null;
};

/** The payload for a value, or `null` if it was left blank. */
const toPayload = (formValue: RunFormValue): Payload | null => {
  switch (formValue.kind) {
    case "Number":
      return formValue.value === null
        ? null
        : { kind: "Number", value: formValue.value };
    case "Boolean":
      return formValue;
    case "Text":
    case "Date":
      return formValue.value === "" ? null : formValue;
    case "EntityId":
      if (formValue.array) {
        return formValue.value.length === 0
          ? null
          : { kind: "EntityId", value: formValue.value };
      }

      return formValue.value === null
        ? null
        : { kind: "EntityId", value: formValue.value };
  }
};

/**
 * The inputs to start a run with, from the form's values. A value left blank isn't given, and is in
 * `missingInputNames` if its input is required.
 */
export const getFlowInputValues = (
  inputs: FlowInputDefinition[],
  values: RunFormValues,
): { flowInputs: FlowInputValues; missingInputNames: string[] } => {
  const flowInputs: FlowInputValues = {};
  const missingInputNames: string[] = [];

  for (const { name, required } of inputs) {
    const formValue = values[name];
    const payload = formValue ? toPayload(formValue) : null;

    if (payload) {
      flowInputs[name] = payload;
    } else if (required) {
      missingInputNames.push(name);
    }
  }

  return { flowInputs, missingInputNames };
};
