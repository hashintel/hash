import { Form, LoadingSpinner, SortMenu } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { payloadKindTraits } from "@local/hash-isomorphic-utils/flows/types";

import { InputField } from "./input-field";
import { UnreadableCondition } from "./shared/condition-rows";
import { getSavedSubjectKind } from "./shared/condition-targets";
import { useConditionTargets } from "./shared/use-condition-targets";
import { readSortForm, toSortKey } from "./sort-key-field/sort-key-form";

import type { ConditionTarget } from "./shared/condition-targets";
import type { SortForm } from "./sort-key-field/sort-key-form";
import type { SortDirection, Sorter } from "@hashintel/ds-components";
import type { ComponentProps } from "react";

const label = "Sort by";

/* Fills the value column, as the other inputs' fields do. */
const trigger = css({ width: "full", justifyContent: "flex-start" });

const sortIcons: Record<
  ConditionTarget["valueKind"]["kind"],
  Sorter<string>["sortIcon"]
> = {
  Text: "alphabetical",
  Number: "numeric",
  Date: "generic",
  DateTime: "generic",
  Boolean: "generic",
};

const toSorter = (target: ConditionTarget): Sorter<string> => ({
  name: target.label,
  sortKey: target.key,
  sortIcon: sortIcons[target.valueKind.kind],
});

const toMenuDirection = (direction: SortForm["direction"]): SortDirection =>
  direction === "ascending" ? "ASCENDING" : "DESCENDING";

/** Order by's sort key: the item or a property of its entity, and which way, picked in one menu. */
export const SortKeyField = (props: ComponentProps<typeof InputField>) => {
  const { editor, flowDefinition, stepId, input, source, problems, readOnly } =
    props;

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
      <Form.Field layout="inline" label={label}>
        <LoadingSpinner size="sm" />
      </Form.Field>
    );
  }

  const { kind, targetsByKey, offered } = conditionTargets;

  const form: SortForm | null =
    source?.payload.kind === "SortKey"
      ? readSortForm(source.payload.value, targetsByKey)
      : null;

  if (source && !form) {
    return (
      <UnreadableCondition
        label={label}
        value={source.payload.value}
        note="This sort can't be shown here, so it can't be changed. The step sorts by it as it is."
        resetLabel="Choose a new sort"
        errors={errors}
        readOnly={readOnly}
        onReset={() => editor.setInputSource(stepId, input.name, null)}
      />
    );
  }

  if (readOnly && !form) {
    return null;
  }

  const picked = form ? targetsByKey.get(form.targetKey) : undefined;
  /* Kept listed when the items' types no longer offer it. */
  const sorters = [
    ...offered,
    ...(picked && !offered.some(({ key }) => key === picked.key)
      ? [picked]
      : []),
  ].map(toSorter);

  const emptyText =
    kind === null
      ? "Choose the items first"
      : "entity" in payloadKindTraits[kind]
        ? "These entities have no properties to sort by"
        : "These items can't be sorted yet";

  return (
    <Form.Field
      layout="inline"
      label={label}
      errors={errors.length > 0 ? errors : undefined}
      descriptionBottom={sorters.length === 0 ? emptyText : undefined}
    >
      <SortMenu
        items={sorters}
        value={
          form
            ? {
                sortKey: form.targetKey,
                direction: toMenuDirection(form.direction),
              }
            : undefined
        }
        searchable
        variant="subtle"
        size="md"
        className={trigger}
        disabled={readOnly || sorters.length === 0}
        onChange={(targetKey, direction) => {
          const target = targetsByKey.get(targetKey);

          if (!target) {
            return;
          }

          editor.setInputSource(stepId, input.name, {
            kind: "constant",
            payload: {
              kind: "SortKey",
              value: toSortKey(
                target,
                direction === "ASCENDING" ? "ascending" : "descending",
              ),
            },
          });
        }}
      />
    </Form.Field>
  );
};
