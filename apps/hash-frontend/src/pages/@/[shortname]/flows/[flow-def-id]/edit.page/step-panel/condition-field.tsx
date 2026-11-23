import { useState } from "react";

import { Filter, Form, LoadingSpinner } from "@hashintel/ds-components";
import { isIsoDate } from "@local/hash-isomorphic-utils/flows/datetime";
import { payloadKindTraits } from "@local/hash-isomorphic-utils/flows/types";

import { getKindIcon } from "../shared/value-display";
import {
  emptyConditionForm,
  getSavedConditionKind,
  getOperatorLabel,
  getRowOperators,
  readConditionForm,
  toFilterCondition,
} from "./condition-field/condition-form";
import { InputField } from "./input-field";
import {
  AddFilterMenu,
  ConditionRows,
  UnreadableCondition,
} from "./shared/condition-rows";
import { useConditionTargets } from "./shared/use-condition-targets";
import { useRowKeys } from "./shared/use-row-keys";

import type {
  ConditionForm,
  ConditionRow,
  RowOperator,
} from "./condition-field/condition-form";
import type { PropertyValueKind } from "./shared/condition-properties";
import type { ConditionTarget } from "./shared/condition-targets";
import type {
  FilterChange,
  FilterOperator,
  FilterValue,
  IconName,
} from "@hashintel/ds-components";
import type { FlowActionDefinitionId } from "@local/hash-isomorphic-utils/flows/types";
import type { ComponentProps } from "react";

/** By action: the input its condition checks, what one value of it is called, and what to pick first. */
const conditionSubjects: Partial<
  Record<string, { kindFrom: string; valueLabel: string; pickFirst: string }>
> = {
  if: {
    kindFrom: "value",
    valueLabel: "Value",
    pickFirst: "Choose the value to check first",
  },
  filterList: {
    kindFrom: "items",
    valueLabel: "Item",
    pickFirst: "Choose the items first",
  },
  find: {
    kindFrom: "items",
    valueLabel: "Item",
    pickFirst: "Choose the items first",
  },
} satisfies Partial<Record<FlowActionDefinitionId, unknown>>;

/** What a chip's inputs give: text, a number, or nothing for an operator without a value. */
type RowValues = Record<RowOperator, string | number | null>;

const getIcon = ({ valueKind }: ConditionTarget): IconName =>
  valueKind.kind === "Text" && valueKind.options
    ? "list"
    : getKindIcon({ payloadKind: valueKind.kind, array: false });

const getOperator = (
  operator: RowOperator,
  valueKind: PropertyValueKind,
): FilterOperator<RowValues> => {
  const label = getOperatorLabel(operator, valueKind);

  if (operator === "isEmpty" || operator === "isNotEmpty") {
    return { key: operator, label, input: null };
  }

  switch (valueKind.kind) {
    case "Number":
      return { key: operator, label, input: { type: "number" } };
    case "Boolean":
      return {
        key: operator,
        label,
        input: {
          type: "select",
          placeholder: "Choose…",
          items: [
            { value: "true", text: "true" },
            { value: "false", text: "false" },
          ],
        },
      };
    case "Date":
      return {
        key: operator,
        label,
        input: { type: "string", placeholder: "YYYY-MM-DD" },
      };
    case "Text":
      return {
        key: operator,
        label,
        input: valueKind.options
          ? {
              type: "select",
              placeholder: "Choose…",
              items: valueKind.options.map((option) => ({
                value: option,
                text: option,
              })),
            }
          : { type: "string", placeholder: "Text" },
      };
  }
};

/** Commits once its value is complete. */
const RowFilter = ({
  rowKey,
  target,
  row,
  readOnly,
  autoFocus,
  onCommit,
  onRemove,
}: {
  rowKey: string;
  target: ConditionTarget;
  row: ConditionRow | undefined;
  readOnly: boolean;
  autoFocus: boolean;
  /** Called with `null` when the value is cleared. */
  onCommit: (row: ConditionRow | null) => void;
  onRemove: () => void;
}) => {
  const [error, setError] = useState<string>();
  const { valueKind } = target;

  const commit = (...[operator, value]: FilterChange<RowValues>) => {
    setError(undefined);

    if (operator === "isEmpty" || operator === "isNotEmpty") {
      onCommit({ targetKey: target.key, operator });
      return;
    }

    if (value === null || value === "") {
      onCommit(null);
      return;
    }

    if (valueKind.kind === "Date" && !isIsoDate(String(value))) {
      setError("Enter a date as YYYY-MM-DD.");
      return;
    }

    onCommit({
      targetKey: target.key,
      operator,
      value:
        valueKind.kind === "Boolean"
          ? value === "true"
          : valueKind.kind === "Number"
            ? Number(value)
            : String(value),
    });
  };

  const value: FilterValue<RowValues> | null = row
    ? {
        key: row.operator,
        value:
          "value" in row
            ? typeof row.value === "boolean"
              ? String(row.value)
              : row.value
            : null,
      }
    : null;

  return (
    <Filter<RowValues>
      property={rowKey}
      propertyLabel={target.label}
      operators={getRowOperators(valueKind).map((operator) =>
        getOperator(operator, valueKind),
      )}
      value={value}
      errors={error === undefined ? undefined : [error]}
      disabled={readOnly}
      autoFocus={autoFocus}
      removeable={!readOnly && { onRemove }}
      onChange={commit}
    />
  );
};

/**
 * A step's condition, as rows: each checks the value itself, or a property of the entity it is or names, joined by one
 * "and" or "or". Each change saves the whole condition; a condition the rows can't show is read-only, as it runs.
 */
export const ConditionField = (props: ComponentProps<typeof InputField>) => {
  const {
    editor,
    flowDefinition,
    stepId,
    input,
    actionDefinition,
    source,
    problems,
    readOnly,
  } = props;

  /* Set from picking under Add filter until the row is complete. */
  const [newTarget, setNewTarget] = useState<ConditionTarget>();
  const { getRowKey, forgetRowKey } = useRowKeys();

  const subject = conditionSubjects[actionDefinition.actionDefinitionId];
  const valueLabel = subject?.valueLabel ?? "Value";
  const conditionTargets = useConditionTargets({
    flowDefinition,
    stepId,
    kindFrom: subject?.kindFrom,
    savedKind:
      source?.kind === "constant"
        ? getSavedConditionKind(source.payload.value)
        : null,
    valueLabel,
  });

  if (source && source.kind !== "constant") {
    return <InputField {...props} />;
  }

  const errors = problems.map(({ code, message }) =>
    code === "missingInput" ? "Required" : message,
  );

  if (!conditionTargets) {
    return (
      <Form.Field layout="inline" label="Where">
        <LoadingSpinner size="sm" />
      </Form.Field>
    );
  }

  const { kind, targetsByKey, offered } = conditionTargets;

  const form: ConditionForm | null = source
    ? source.payload.kind === "FilterCondition"
      ? readConditionForm(source.payload.value, targetsByKey)
      : null
    : emptyConditionForm;

  if (!form) {
    return (
      <UnreadableCondition
        label="Condition"
        value={source?.payload.value}
        note="The rows can't show this condition, so it can't be changed here. The step checks it as it is."
        resetLabel="Build a new condition"
        errors={errors}
        readOnly={readOnly}
        onReset={() => editor.setInputSource(stepId, input.name, null)}
      />
    );
  }

  const save = (next: ConditionForm) => {
    const condition = toFilterCondition(next, targetsByKey);

    editor.setInputSource(
      stepId,
      input.name,
      condition && {
        kind: "constant",
        payload: { kind: "FilterCondition", value: condition },
      },
    );
  };

  const rows = [
    ...form.rows.map((row) => ({
      row,
      target: targetsByKey.get(row.targetKey),
    })),
    ...(newTarget ? [{ row: undefined, target: newTarget }] : []),
  ];

  const commitRow = (index: number, row: ConditionRow | null) => {
    if (index === form.rows.length) {
      if (row) {
        setNewTarget(undefined);
        save({ ...form, rows: [...form.rows, row] });
      }
      return;
    }

    if (!row) {
      forgetRowKey(index, rows.length);
    }

    save({
      ...form,
      rows: row ? form.rows.with(index, row) : form.rows.toSpliced(index, 1),
    });
  };

  const removeRow = (index: number) => {
    forgetRowKey(index, rows.length);

    if (index === form.rows.length) {
      setNewTarget(undefined);
    } else {
      save({ ...form, rows: form.rows.toSpliced(index, 1) });
    }
  };

  if (readOnly && rows.length === 0) {
    return null;
  }

  return (
    <ConditionRows
      rows={rows.flatMap(({ row, target }, index) =>
        target
          ? [
              {
                key: getRowKey(index),
                chip: (
                  <RowFilter
                    rowKey={`condition-${getRowKey(index)}`}
                    target={target}
                    row={row}
                    readOnly={readOnly}
                    autoFocus={row === undefined}
                    onCommit={(next) => commitRow(index, next)}
                    onRemove={() => removeRow(index)}
                  />
                ),
              },
            ]
          : [],
      )}
      join={form.join}
      readOnly={readOnly}
      add={
        readOnly || newTarget ? null : (
          <AddFilterMenu
            options={offered.map((target) => ({
              ...target,
              title: target.label,
            }))}
            getIcon={getIcon}
            emptyText={
              kind === null
                ? (subject?.pickFirst ?? "Nothing to check yet")
                : "entity" in payloadKindTraits[kind]
                  ? "These entities have no properties to check"
                  : "Conditions can't check these values yet"
            }
            onPick={setNewTarget}
          />
        )
      }
      errors={errors}
      onJoinChange={(join) => save({ ...form, join })}
    />
  );
};
