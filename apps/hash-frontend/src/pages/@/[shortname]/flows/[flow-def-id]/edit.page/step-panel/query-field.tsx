import { isEqual, memoize } from "lodash";
import { useMemo, useState } from "react";

import {
  Filter,
  Form,
  LoadingSpinner,
  NumberInput,
  Select,
} from "@hashintel/ds-components";
import { isIsoDate } from "@local/hash-isomorphic-utils/flows/datetime";
import { maxEntitiesPerStep } from "@local/hash-isomorphic-utils/flows/limits";

import { useLatestEntityTypesOptional } from "../../../../../../../shared/entity-types-context/hooks";
import {
  operatorsByKind,
  readQueryForm,
  sortOrders,
  toEntityQuery,
} from "../shared/query-form";
import { getPathInSource } from "./field-problems";
import { InputField } from "./input-field";
import { getConditionProperties } from "./shared/condition-properties";
import {
  AddFilterMenu,
  ConditionRows,
  UnreadableCondition,
} from "./shared/condition-rows";
import { useConditionOntology } from "./shared/use-condition-ontology";
import { useRowKeys } from "./shared/use-row-keys";

import type {
  ConditionOperator,
  ConditionValueKind,
  QueryCondition,
  QueryForm,
  SortOrder,
} from "../shared/query-form";
import type { ConditionProperty } from "./shared/condition-properties";
import type { BaseUrl, VersionedUrl } from "@blockprotocol/type-system";
import type {
  FilterChange,
  FilterOperator,
  FilterValue,
} from "@hashintel/ds-components";
import type { ComponentProps } from "react";

type ConditionValues = {
  is: string;
  isNot: string;
  before: string;
  after: string;
  isEmpty: null;
  isNotEmpty: null;
};

const operatorLabels: Record<ConditionOperator, string> = {
  is: "is",
  isNot: "is not",
  before: "is before",
  after: "is after",
  isEmpty: "is empty",
  isNotEmpty: "is not empty",
};

const limitPath = ["payload", "value", "limit"];

const getOperator = (
  operator: ConditionOperator,
  valueKind: ConditionValueKind,
): FilterOperator<ConditionValues> => {
  const label = operatorLabels[operator];

  switch (operator) {
    case "isEmpty":
    case "isNotEmpty":
      return { key: operator, label, input: null };
    default:
      return {
        key: operator,
        label,
        input:
          valueKind.kind === "date"
            ? { type: "string", placeholder: "YYYY-MM-DD" }
            : {
                type: "select",
                placeholder: "Choose…",
                items: valueKind.options.map((option) => ({
                  value: option,
                  text: option,
                })),
              },
      };
  }
};

const getFilterValue = (
  condition: QueryCondition,
): FilterValue<ConditionValues> =>
  "value" in condition
    ? { key: condition.operator, value: condition.value }
    : { key: condition.operator, value: null };

/** Commits once its value is complete. */
const ConditionFilter = ({
  rowKey,
  property,
  condition,
  autoFocus,
  onCommit,
  onRemove,
}: {
  rowKey: string;
  property: ConditionProperty;
  condition: QueryCondition | undefined;
  autoFocus: boolean;
  /** Called with `null` when the value is cleared. */
  onCommit: (condition: QueryCondition | null) => void;
  onRemove: () => void;
}) => {
  const [error, setError] = useState<string>();

  const commit = (...[operator, value]: FilterChange<ConditionValues>) => {
    if (operator === "isEmpty" || operator === "isNotEmpty") {
      setError(undefined);
      onCommit({ propertyBaseUrl: property.baseUrl, operator });
      return;
    }

    if (value === null) {
      setError(undefined);
      onCommit(null);
      return;
    }

    if (property.valueKind.kind === "date" && !isIsoDate(value)) {
      setError("Enter a date as YYYY-MM-DD.");
      return;
    }

    setError(undefined);
    onCommit({ propertyBaseUrl: property.baseUrl, operator, value });
  };

  return (
    <Filter<ConditionValues>
      property={rowKey}
      propertyLabel={property.title}
      operators={operatorsByKind[property.valueKind.kind].map((operator) =>
        getOperator(operator, property.valueKind),
      )}
      value={condition ? getFilterValue(condition) : null}
      errors={error === undefined ? undefined : [error]}
      autoFocus={autoFocus}
      removeable={{ onRemove }}
      onChange={commit}
    />
  );
};

/**
 * Each change saves the whole query. A query the builder didn't make shows read-only, as it runs; one from a flow
 * input or an earlier step shows as any other input does.
 */
export const QueryField = (props: ComponentProps<typeof InputField>) => {
  const { editor, stepId, input, source, problems } = props;

  /* Set from picking a property under Add filter until the condition is complete. */
  const [newConditionProperty, setNewConditionProperty] =
    useState<ConditionProperty>();

  const { getRowKey, forgetRowKey } = useRowKeys();

  const { latestEntityTypes } = useLatestEntityTypesOptional();
  const ontology = useConditionOntology();

  /* By base URL, the properties a condition can be on for entities of any type. */
  const conditionProperties = useMemo(
    () =>
      ontology &&
      latestEntityTypes &&
      new Map(
        getConditionProperties(
          ontology,
          latestEntityTypes.map(({ schema }) => schema.$id),
        ).map((property) => [property.baseUrl, property]),
      ),
    [ontology, latestEntityTypes],
  );

  const getPropertiesOfTypes = useMemo(
    () =>
      ontology &&
      memoize(
        (entityTypeIds: VersionedUrl[]) =>
          getConditionProperties(ontology, entityTypeIds),
        (entityTypeIds) => entityTypeIds.join(" "),
      ),
    [ontology],
  );

  const typeItems = useMemo(() => {
    const types = latestEntityTypes ?? [];
    const typesByTitle = Map.groupBy(types, ({ schema }) => schema.title);

    return types
      .map(({ schema, metadata }) => {
        const { baseUrl } = metadata.recordId;
        /* Types in different webs may share a title. */
        const web =
          (typesByTitle.get(schema.title)?.length ?? 0) > 1
            ? baseUrl.match(/\/(@[^/]+)/)?.[1]
            : undefined;

        return {
          value: baseUrl,
          text: web ? `${schema.title} (${web})` : schema.title,
        };
      })
      .sort((left, right) => left.text.localeCompare(right.text));
  }, [latestEntityTypes]);

  if (source && source.kind !== "constant") {
    return <InputField {...props} />;
  }

  const query = source ? source.payload.value : input.default?.value;

  const isAboutLimit = (problem: (typeof problems)[number]) =>
    isEqual(getPathInSource(problem), limitPath);
  const limitErrors = problems
    .filter(isAboutLimit)
    .map(({ message }) => message);
  const queryErrors = problems
    .filter((problem) => !isAboutLimit(problem))
    .map(({ message }) => message);

  if (!latestEntityTypes || !conditionProperties || !getPropertiesOfTypes) {
    return (
      <Form.Field layout="inline" label="Query">
        <LoadingSpinner size="sm" />
      </Form.Field>
    );
  }

  const form =
    source?.payload.kind === "EntityQuery" || !source
      ? readQueryForm(
          query,
          (baseUrl) => conditionProperties.get(baseUrl)?.valueKind,
        )
      : null;

  if (!form) {
    return (
      <UnreadableCondition
        label="Query"
        value={query}
        note="This query wasn't built here, so it can't be changed here. The step runs it as it is."
        resetLabel="Build a new query"
        errors={problems.map(({ message }) => message)}
        onReset={() => editor.setInputSource(stepId, input.name, null)}
      />
    );
  }

  const save = (next: QueryForm) =>
    editor.setInputSource(stepId, input.name, {
      kind: "constant",
      payload: { kind: "EntityQuery", value: toEntityQuery(next) },
    });

  const rows = [
    ...form.conditions.map((condition) => ({
      condition,
      property: conditionProperties.get(condition.propertyBaseUrl),
    })),
    ...(newConditionProperty
      ? [{ condition: undefined, property: newConditionProperty }]
      : []),
  ];

  const commitCondition = (index: number, condition: QueryCondition | null) => {
    if (index === form.conditions.length) {
      if (condition) {
        setNewConditionProperty(undefined);
        save({ ...form, conditions: [...form.conditions, condition] });
      }
      return;
    }

    if (!condition) {
      forgetRowKey(index, rows.length);
    }

    save({
      ...form,
      conditions: condition
        ? form.conditions.with(index, condition)
        : form.conditions.toSpliced(index, 1),
    });
  };

  const removeCondition = (index: number) => {
    forgetRowKey(index, rows.length);

    if (index === form.conditions.length) {
      setNewConditionProperty(undefined);
    } else {
      save({ ...form, conditions: form.conditions.toSpliced(index, 1) });
    }
  };

  return (
    <>
      {queryErrors.length > 0 && <Form.Field.Errors errors={queryErrors} />}
      <Form.Field layout="inline" label="Entity type">
        <Select<BaseUrl>
          multiple
          searchable={{ hideSelectAllToggle: true }}
          items={typeItems}
          value={form.entityTypeBaseUrls}
          placeholder="Any"
          aria-label="Entity type"
          onChange={(entityTypeBaseUrls) =>
            save({ ...form, entityTypeBaseUrls })
          }
        />
      </Form.Field>
      <ConditionRows
        rows={rows.flatMap(({ condition, property }, index) =>
          property
            ? [
                {
                  key: getRowKey(index),
                  chip: (
                    <ConditionFilter
                      rowKey={`condition-${getRowKey(index)}`}
                      property={property}
                      condition={condition}
                      autoFocus={condition === undefined}
                      onCommit={(next) => commitCondition(index, next)}
                      onRemove={() => removeCondition(index)}
                    />
                  ),
                },
              ]
            : [],
        )}
        join={form.join}
        add={
          newConditionProperty ? null : (
            <AddFilterMenu
              options={(form.entityTypeBaseUrls.length === 0
                ? [...conditionProperties.values()]
                : getPropertiesOfTypes(
                    latestEntityTypes
                      .filter(({ metadata }) =>
                        form.entityTypeBaseUrls.includes(
                          metadata.recordId.baseUrl,
                        ),
                      )
                      .map(({ schema }) => schema.$id),
                  )
              ).map((property) => ({ ...property, key: property.baseUrl }))}
              getIcon={({ valueKind }) =>
                valueKind.kind === "date" ? "calendar" : "list"
              }
              emptyText="These types have no dates or statuses"
              onPick={setNewConditionProperty}
            />
          )
        }
        errors={[]}
        onJoinChange={(join) => save({ ...form, join })}
      />
      <Form.Field layout="inline" label="Sort">
        <Select<SortOrder>
          required
          items={Object.entries(sortOrders).map(([sort, { label }]) => ({
            value: sort as SortOrder,
            text: label,
          }))}
          value={form.sort}
          aria-label="Sort"
          onChange={(sort) => save({ ...form, sort })}
        />
      </Form.Field>
      <Form.Field
        layout="inline"
        label="Limit"
        errors={limitErrors.length > 0 ? limitErrors : undefined}
      >
        <NumberInput
          width="xs"
          value={form.limit ?? null}
          min={1}
          max={maxEntitiesPerStep}
          placeholder="No limit"
          invalid={limitErrors.length > 0}
          aria-label="Limit"
          onChange={(limit) => {
            /* A negative would be rejected for the whole query, not reported here, so it isn't saved. */
            if (limit !== null && limit < 0) {
              return;
            }

            save({ ...form, limit: limit ?? undefined });
          }}
        />
      </Form.Field>
    </>
  );
};
