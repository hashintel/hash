import { useState } from "react";

import { Form, LoadingSpinner, Select } from "@hashintel/ds-components";
import { payloadKindTraits } from "@local/hash-isomorphic-utils/flows/types";

import {
  aggregationOperations,
  isNumberTarget,
  readAggregationForm,
  toAggregation,
} from "./aggregation-field/aggregation-form";
import { InputField } from "./input-field";
import { UnreadableCondition } from "./shared/condition-rows";
import { getSavedSubjectKind } from "./shared/condition-targets";
import { useConditionTargets } from "./shared/use-condition-targets";

import type {
  AggregationForm,
  AggregationOperation,
} from "./aggregation-field/aggregation-form";
import type { ComponentProps } from "react";

/** Aggregate's aggregation: what to calculate and, for all but count, which number of each item it reads. */
export const AggregationField = (props: ComponentProps<typeof InputField>) => {
  const { editor, flowDefinition, stepId, input, source, problems } = props;

  /* An operation picked before its number, which isn't an aggregation the step can run yet. */
  const [pending, setPending] = useState<AggregationForm>();

  const conditionTargets = useConditionTargets({
    flowDefinition,
    stepId,
    kindFrom: "items",
    savedKind:
      source?.kind === "constant"
        ? getSavedSubjectKind(source.payload.value)
        : null,
    valueLabel: "Item",
  });

  if (source && source.kind !== "constant") {
    return <InputField {...props} />;
  }

  const errors = problems.map(({ code, message }) =>
    code === "missingInput" ? "Required" : message,
  );

  if (!conditionTargets) {
    return (
      <Form.Field layout="inline" label="Calculate">
        <LoadingSpinner size="sm" />
      </Form.Field>
    );
  }

  const { kind, targetsByKey, offered } = conditionTargets;

  const saved: AggregationForm | null =
    source?.payload.kind === "Aggregation"
      ? readAggregationForm(source.payload.value, targetsByKey)
      : null;

  if (source && !saved) {
    return (
      <UnreadableCondition
        label="Calculate"
        value={source.payload.value}
        note="This calculation can't be shown here, so it can't be changed. The step calculates it as it is."
        resetLabel="Choose a new calculation"
        errors={errors}
        onReset={() => editor.setInputSource(stepId, input.name, null)}
      />
    );
  }

  const form = saved ?? pending;

  const save = (next: AggregationForm) => {
    const aggregation = toAggregation(next, targetsByKey);

    setPending(aggregation ? undefined : next);
    editor.setInputSource(
      stepId,
      input.name,
      aggregation && {
        kind: "constant",
        payload: { kind: "Aggregation", value: aggregation },
      },
    );
  };

  const targetKey = form && "targetKey" in form ? form.targetKey : null;
  const picked = targetKey === null ? undefined : targetsByKey.get(targetKey);
  const numbers = offered.filter(isNumberTarget);
  /* Kept listed when the items' types no longer offer it. */
  const ofItems = [
    ...numbers,
    ...(picked && !numbers.some(({ key }) => key === picked.key)
      ? [picked]
      : []),
  ].map((target) => ({ value: target.key, text: target.label }));

  /* Until its number is picked, the step's "Required" belongs under Of. */
  const missingOf = !!form && form.operation !== "count" && targetKey === null;
  const errorList = errors.length > 0 ? errors : undefined;

  return (
    <>
      <Form.Field
        layout="inline"
        label="Calculate"
        errors={missingOf ? undefined : errorList}
      >
        <Select<AggregationOperation>
          items={aggregationOperations}
          value={form?.operation ?? null}
          placeholder="Choose…"
          onChange={(operation) => {
            if (!operation) {
              setPending(undefined);
              editor.setInputSource(stepId, input.name, null);
              return;
            }

            /* Another operation on a number keeps reading the same one. */
            save(
              operation === "count" ? { operation } : { operation, targetKey },
            );
          }}
        />
      </Form.Field>
      {form && form.operation !== "count" && (
        <Form.Field
          layout="inline"
          label="Of"
          errors={missingOf ? errorList : undefined}
          descriptionBottom={
            ofItems.length === 0
              ? kind === null
                ? "Choose the items first"
                : "entity" in payloadKindTraits[kind]
                  ? "These entities have no number properties"
                  : "These items aren't numbers"
              : undefined
          }
        >
          <Select<string>
            items={ofItems}
            value={targetKey}
            placeholder="Choose a number…"
            searchable
            disabled={ofItems.length === 0}
            onChange={(nextKey) =>
              save({ operation: form.operation, targetKey: nextKey })
            }
          />
        </Form.Field>
      )}
    </>
  );
};
