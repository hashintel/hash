import { isEqual, memoize } from "lodash";
import { Fragment, useMemo, useState } from "react";

import {
  Button,
  Filter,
  FilterGroup,
  Form,
  LoadingSpinner,
  Menu,
  NumberInput,
  Select,
  SelectableListSearch,
  TextArea,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { isIsoDate } from "@local/hash-isomorphic-utils/flows/datetime";
import { maxEntitiesPerStep } from "@local/hash-isomorphic-utils/flows/limits";

import { useLatestEntityTypesOptional } from "../../../../../../../shared/entity-types-context/hooks";
import { useEntityTypesContextRequired } from "../../../../../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { usePropertyTypes } from "../../../../../../../shared/property-types-context";
import { useDataTypesContext } from "../../../../../../shared/data-types-context";
import {
  operatorsByKind,
  readQueryForm,
  sortOrders,
  toEntityQuery,
} from "../shared/query-form";
import { getPathInSource } from "./field-problems";
import { InputField } from "./input-field";
import {
  getConditionProperties,
  getLatestDataTypeIds,
} from "./query-field/condition-properties";

import type {
  ConditionOperator,
  ConditionValueKind,
  QueryCondition,
  QueryForm,
  SortOrder,
} from "../shared/query-form";
import type {
  ConditionOntology,
  ConditionProperty,
} from "./query-field/condition-properties";
import type { BaseUrl, VersionedUrl } from "@blockprotocol/type-system";
import type {
  FilterChange,
  FilterOperator,
  FilterValue,
  MenuItem,
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

/*
 * Each condition and each join gets a full-width line of the group, so a chip has the whole column: the panel is too
 * narrow for a join and a chip side by side. The group shrinks to the column, so a long chip stays inside the panel.
 */
const conditionGroup = css({ flex: "1", minWidth: "0" });
const groupLine = css({ width: "full" });
const joinText = css({ textStyle: "sm", color: "fg.subtle", px: "2" });
const note = css({ textStyle: "sm", color: "fg.subtle" });
const unreadable = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "2",
});

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
  readOnly,
  autoFocus,
  onCommit,
  onRemove,
}: {
  rowKey: string;
  property: ConditionProperty;
  condition: QueryCondition | undefined;
  readOnly: boolean;
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
      disabled={readOnly}
      autoFocus={autoFocus}
      removeable={!readOnly && { onRemove }}
      onChange={commit}
    />
  );
};

const AddConditionMenu = ({
  properties,
  onPick,
}: {
  properties: ConditionProperty[];
  onPick: (property: ConditionProperty) => void;
}) => {
  const [query, setQuery] = useState("");

  const matching = properties.filter(({ title }) =>
    title.toLowerCase().includes(query.toLowerCase()),
  );

  const items: MenuItem[] =
    matching.length > 0
      ? matching.map((property) => ({
          id: property.baseUrl,
          text: property.title,
          icon: property.valueKind.kind === "date" ? "calendar" : "list",
          onClick: () => onPick(property),
        }))
      : [
          {
            id: "none",
            text:
              properties.length === 0
                ? "These types have no dates or statuses"
                : "No matching properties",
            disabled: true,
            onClick: () => {},
          },
        ];

  return (
    <Menu
      items={items}
      header={
        <SelectableListSearch
          value={query}
          onChange={setQuery}
          placeholder="Search properties"
          aria-label="Search properties"
        />
      }
      onOpen={(open) => {
        if (!open) {
          setQuery("");
        }
      }}
      trigger={<FilterGroup.AddFilter renderAs="plusLabel" />}
    />
  );
};

/**
 * Each change saves the whole query. A query the builder didn't make shows read-only, as it runs; one from a flow
 * input or an earlier step shows as any other input does.
 */
export const QueryField = (props: ComponentProps<typeof InputField>) => {
  const { editor, stepId, input, source, problems, readOnly } = props;

  /* Set from picking a property under Add filter until the condition is complete. */
  const [newConditionProperty, setNewConditionProperty] =
    useState<ConditionProperty>();

  /*
   * A key for each condition's row, kept across removals, so that a chip that collapses as it's removed isn't reused for
   * the condition after it. Rows past `keys` haven't needed one kept yet, and count on from `next`.
   */
  const [rowKeys, setRowKeys] = useState({ keys: [] as number[], next: 0 });
  const getRowKey = (index: number) =>
    rowKeys.keys[index] ?? rowKeys.next + index - rowKeys.keys.length;

  const { entityTypes, entityTypeParentIds } = useEntityTypesContextRequired();
  const { latestEntityTypes } = useLatestEntityTypesOptional();
  const { propertyTypes } = usePropertyTypes();
  const { propertyTypes: latestPropertyTypes } = usePropertyTypes({
    latestOnly: true,
  });
  const { dataTypes } = useDataTypesContext();

  const ontology = useMemo(
    (): ConditionOntology | null =>
      entityTypes &&
      entityTypeParentIds &&
      propertyTypes &&
      latestPropertyTypes &&
      dataTypes
        ? {
            entityTypes,
            entityTypeParentIds,
            propertyTypes,
            latestDataTypeIds: getLatestDataTypeIds(
              Object.values(latestPropertyTypes),
            ),
            dataTypes,
          }
        : null,
    [
      entityTypes,
      entityTypeParentIds,
      propertyTypes,
      latestPropertyTypes,
      dataTypes,
    ],
  );

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
      <Form.Field
        layout="inline"
        label="Query"
        errors={
          problems.length > 0
            ? problems.map(({ message }) => message)
            : undefined
        }
      >
        <div className={unreadable}>
          <span className={note}>
            This query wasn&apos;t built here, so it can&apos;t be changed here.
            The step runs it as it is.
          </span>
          <TextArea
            readonly
            value={JSON.stringify(query)}
            aria-label="Query"
            onChange={() => {}}
          />
          {!readOnly && (
            <Button
              size="sm"
              variant="subtle"
              onClick={() => editor.setInputSource(stepId, input.name, null)}
            >
              Build a new query
            </Button>
          )}
        </div>
      </Form.Field>
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

  const forgetRowKey = (index: number) =>
    setRowKeys(({ keys, next }) => {
      const kept = Array.from(
        { length: rows.length },
        (_, rowIndex) => keys[rowIndex] ?? next + rowIndex - keys.length,
      );

      return {
        keys: kept.toSpliced(index, 1),
        next: next + Math.max(0, rows.length - keys.length),
      };
    });

  const commitCondition = (index: number, condition: QueryCondition | null) => {
    if (index === form.conditions.length) {
      if (condition) {
        setNewConditionProperty(undefined);
        save({ ...form, conditions: [...form.conditions, condition] });
      }
      return;
    }

    if (!condition) {
      forgetRowKey(index);
    }

    save({
      ...form,
      conditions: condition
        ? form.conditions.with(index, condition)
        : form.conditions.toSpliced(index, 1),
    });
  };

  const removeCondition = (index: number) => {
    forgetRowKey(index);

    if (index === form.conditions.length) {
      setNewConditionProperty(undefined);
    } else {
      save({ ...form, conditions: form.conditions.toSpliced(index, 1) });
    }
  };

  const joinLabel = form.join === "all" ? "AND" : "OR";

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
          disabled={readOnly}
          aria-label="Entity type"
          onChange={(entityTypeBaseUrls) =>
            save({ ...form, entityTypeBaseUrls })
          }
        />
      </Form.Field>
      {(rows.length > 0 || !readOnly) && (
        <Form.Field layout="inline" label="Where">
          <div className={conditionGroup}>
            <FilterGroup dismissAbandoned>
              {rows.map(({ condition, property }, index) => (
                <Fragment key={getRowKey(index)}>
                  {index > 0 && (
                    <div className={groupLine}>
                      {index === 1 && !readOnly ? (
                        <Select<"all" | "any">
                          size="xs"
                          width="fitContent"
                          required
                          items={[
                            { value: "all", text: "AND" },
                            { value: "any", text: "OR" },
                          ]}
                          value={form.join}
                          aria-label="Join conditions with"
                          onChange={(join) => save({ ...form, join })}
                        />
                      ) : (
                        <span className={joinText}>{joinLabel}</span>
                      )}
                    </div>
                  )}
                  {property && (
                    <div className={groupLine}>
                      <ConditionFilter
                        rowKey={`condition-${getRowKey(index)}`}
                        property={property}
                        condition={condition}
                        readOnly={readOnly}
                        autoFocus={condition === undefined}
                        onCommit={(next) => commitCondition(index, next)}
                        onRemove={() => removeCondition(index)}
                      />
                    </div>
                  )}
                </Fragment>
              ))}
              {!readOnly && !newConditionProperty && (
                <AddConditionMenu
                  properties={
                    form.entityTypeBaseUrls.length === 0
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
                  }
                  onPick={setNewConditionProperty}
                />
              )}
            </FilterGroup>
          </div>
        </Form.Field>
      )}
      <Form.Field layout="inline" label="Sort">
        <Select<SortOrder>
          required
          items={Object.entries(sortOrders).map(([sort, { label }]) => ({
            value: sort as SortOrder,
            text: label,
          }))}
          value={form.sort}
          disabled={readOnly}
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
          value={form.limit ?? null}
          min={1}
          max={maxEntitiesPerStep}
          placeholder="No limit"
          invalid={limitErrors.length > 0}
          disabled={readOnly}
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
