import { camelCase } from "lodash";
import { useState } from "react";

import { propertyValueTarget } from "@local/hash-isomorphic-utils/flows/built-sources";

import { getForEachScope } from "../../shared/item-name";
import { getKindLabel, withArticle } from "../../shared/value-display";
import { SourceMenu } from "../input-field";
import {
  flowInputTypes,
  getNewFlowInput,
  getSourceKey,
  getSourceLabel,
  getSourceOptions,
  goneSourceCodes,
} from "../input-sources";
import { PropertyValueInput } from "./property-value-input";

import type { EntityProperty } from "../shared/condition-properties";
import type { RowSource, RowValue } from "./property-form";
import type { ConnectionTarget } from "@local/hash-isomorphic-utils/flows/can-connect";
import type { FlowEditor } from "@local/hash-isomorphic-utils/flows/flow-editor";
import type { FlowDefinition } from "@local/hash-isomorphic-utils/flows/types";
import type { FlowDefinitionDiagnosticWithStepId } from "@local/hash-isomorphic-utils/flows/validate-flow-definition";

/** How the menu offers a fixed value: typed, or for true or false and a status, chosen. */
const getTypeLabel = ({ valueKind }: EntityProperty) => {
  switch (valueKind.kind) {
    case "Boolean":
      return "Choose true or false";
    case "Text":
      return valueKind.options ? "Choose an option" : "Type a value";
    default:
      return `Type ${withArticle(getKindLabel({ payloadKind: valueKind.kind, array: false }))}`;
  }
};

/**
 * The value a row sets its property to, as a step's own inputs are given theirs (see `InputField`): a menu of the
 * flow inputs and earlier steps' outputs of the property's kind, or once it's typed, a field of that kind.
 */
export const PropertyValuePicker = ({
  editor,
  flowDefinition,
  stepId,
  property,
  value,
  from,
  brokenProblem,
  invalid,
  getItemName,
  onPick,
  onType,
  onClear,
  onError,
  onSelectStart,
}: {
  editor: FlowEditor;
  flowDefinition: FlowDefinition<string>;
  stepId: string;
  property: EntityProperty;
  /** The typed value, if the row has one. */
  value: RowValue | undefined;
  /** Where the value comes from, if it isn't typed. */
  from: RowSource | undefined;
  /** A problem with where the value comes from, shown in place of it. */
  brokenProblem: FlowDefinitionDiagnosticWithStepId | undefined;
  invalid: boolean;
  getItemName: (forEachStepId: string) => string;
  onPick: (from: RowSource) => void;
  onType: (value: RowValue) => void;
  /** Gives the value up, leaving the row without one. */
  onClear: () => void;
  /** Reports what's wrong with what's typed while it isn't a value. */
  onError: (error: string | undefined) => void;
  onSelectStart: () => void;
}) => {
  /* Set from picking to type a value until the field is left with nothing typed. */
  const [typing, setTyping] = useState(false);

  const { title, valueKind } = property;

  if (value !== undefined || typing) {
    const stopTyping = () => {
      setTyping(false);
      onError(undefined);
    };

    return (
      <PropertyValueInput
        valueKind={valueKind}
        value={value}
        label={title}
        autoFocus={typing}
        invalid={invalid}
        onCommit={onType}
        onError={onError}
        onClear={() => {
          stopTyping();
          onClear();
        }}
        onLeaveEmpty={stopTyping}
      />
    );
  }

  /* What the definition lets a property take, narrowed to this property's kind. */
  const target: ConnectionTarget = {
    ...propertyValueTarget,
    oneOfPayloadKinds: [valueKind.kind],
  };
  const { item, flowInputs, earlierSteps } = getSourceOptions({
    flowDefinition,
    stepId,
    target,
    getItemName,
  });
  const forEachStepId = getForEachScope(flowDefinition.steps, stepId)?.at(-1);
  const pickedLabel =
    from &&
    getSourceLabel(
      flowDefinition,
      from,
      forEachStepId
        ? { stepId: forEachStepId, itemName: getItemName(forEachStepId) }
        : undefined,
    );
  const options = [...(item ? [item] : []), ...flowInputs, ...earlierSteps];
  /*
   * Only offered when no value fits, so only then worked out, as naming it reads the whole flow. Start only gives a
   * flow input a type that can be typed when the flow is run.
   */
  const newFlowInput =
    options.length === 0 &&
    flowInputTypes.some(({ payloadKind }) => payloadKind === valueKind.kind)
      ? getNewFlowInput({
          flowDefinition,
          inputName: camelCase(title) || "value",
          target,
        })
      : null;

  return (
    <SourceMenu
      label={title}
      options={options}
      pickedKey={from && getSourceKey(from)}
      pickedLabel={pickedLabel}
      brokenReason={
        brokenProblem &&
        (goneSourceCodes.has(brokenProblem.code)
          ? `${pickedLabel} no longer exists`
          : brokenProblem.message)
      }
      invalid={invalid}
      newFlowInputLabel={
        newFlowInput &&
        `Add ${withArticle(getKindLabel(newFlowInput))} input on Start`
      }
      typeLabel={getTypeLabel(property)}
      onPick={(option) => onPick(option.source)}
      onAddFlowInput={() => {
        if (!newFlowInput) {
          return;
        }

        editor.addFlowInput(newFlowInput);
        onPick({ kind: "flow-input", inputName: newFlowInput.name });
        onSelectStart();
      }}
      onType={() => setTyping(true)}
      onClear={onClear}
    />
  );
};
