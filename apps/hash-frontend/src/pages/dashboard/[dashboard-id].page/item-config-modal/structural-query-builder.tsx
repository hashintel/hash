import { Box, Stack, Typography } from "@mui/material";
import { useMemo } from "react";

import { extractBaseUrl } from "@blockprotocol/type-system";
import {
  Button,
  NumberInput,
  Select,
  TextInput,
} from "@hashintel/ds-components";
import {
  incomingHopEdges,
  outgoingHopEdges,
} from "@local/hash-isomorphic-utils/dashboard-types";

import {
  useEntityTypesOptional,
  useLatestEntityTypesOptional,
} from "../../../../shared/entity-types-context/hooks";
import { usePropertyTypes } from "../../../../shared/property-types-context";
import { useDataTypesContext } from "../../../shared/data-types-context";
import { resolveDataTypeValueKind } from "../../../shared/entities-visualizer/shared/property-filters/derive-filterable-properties";
import { DeleteIconButton } from "../delete-icon-button";

import type { FilterValueKind } from "../../../shared/entities-visualizer/shared/property-filters/property-filter";
import type {
  EntityTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { SelectItem } from "@hashintel/ds-components";
import type {
  EntityTraversalEdge,
  Filter,
  FilterExpression,
} from "@local/hash-graph-client";
import type {
  LabelledTraversalPath,
  StructuralQueryDefinition,
  TraversalHopMeta,
} from "@local/hash-isomorphic-utils/dashboard-types";

const cardBorderColor = "#e0e0e0";

const inputSize = "sm" as const;

/**
 * Graph comparison filter keys with `[FilterExpression, FilterExpression]`
 * operands.
 */
const comparisonOperators = [
  "equal",
  "notEqual",
  "greater",
  "greaterOrEqual",
  "less",
  "lessOrEqual",
  "startsWith",
  "endsWith",
  "containsSegment",
] as const;

type ComparisonOperator = (typeof comparisonOperators)[number];

const groupOperators = ["all", "any", "not"] as const;

type GroupOperator = (typeof groupOperators)[number];

const groupOperatorLabels: Record<GroupOperator, string> = {
  all: "ALL of (and)",
  any: "ANY of (or)",
  not: "NOT",
};

/* -------------------------------------------------------------------------
 * Property conditions: `Property <operator> <value>` rows, built over
 * `["properties", baseUrl]` paths. Operators depend on the property's
 * resolved value kind (string / number / boolean).
 * ---------------------------------------------------------------------- */

type PropertyOperatorId =
  | ComparisonOperator
  | "isTrue"
  | "isFalse"
  | "hasAnyValue"
  | "isEmpty";

type PropertyOperatorDescriptor = {
  id: PropertyOperatorId;
  label: string;
  requiresValue: boolean;
};

const existenceOperators: PropertyOperatorDescriptor[] = [
  { id: "hasAnyValue", label: "has any value", requiresValue: false },
  { id: "isEmpty", label: "is empty", requiresValue: false },
];

const propertyOperatorsByKind: Record<
  FilterValueKind,
  PropertyOperatorDescriptor[]
> = {
  string: [
    { id: "equal", label: "equals", requiresValue: true },
    { id: "notEqual", label: "does not equal", requiresValue: true },
    { id: "containsSegment", label: "contains", requiresValue: true },
    { id: "startsWith", label: "starts with", requiresValue: true },
    { id: "endsWith", label: "ends with", requiresValue: true },
    ...existenceOperators,
  ],
  number: [
    { id: "equal", label: "=", requiresValue: true },
    { id: "notEqual", label: "≠", requiresValue: true },
    { id: "greater", label: ">", requiresValue: true },
    { id: "greaterOrEqual", label: "≥", requiresValue: true },
    { id: "less", label: "<", requiresValue: true },
    { id: "lessOrEqual", label: "≤", requiresValue: true },
    ...existenceOperators,
  ],
  boolean: [
    { id: "isTrue", label: "is true", requiresValue: false },
    { id: "isFalse", label: "is false", requiresValue: false },
    ...existenceOperators,
  ],
};

type ConditionSubject = "entityType" | "property" | "advanced";

type ParsedCondition =
  | { subject: "entityType"; entityTypeBaseUrl: string }
  | {
      subject: "property";
      propertyBaseUrl: string;
      operator: PropertyOperatorId;
      value: string;
    }
  | null;

const matchPropertyPath = (path: unknown): string | null =>
  Array.isArray(path) &&
  path.length === 2 &&
  path[0] === "properties" &&
  typeof path[1] === "string"
    ? path[1]
    : null;

/**
 * Recognise a filter leaf as one of the simple condition shapes the builder
 * offers dedicated UI for. Returns `null` for anything else (rendered via the
 * "Advanced" editor instead).
 */
const parseCondition = (filter: Filter): ParsedCondition => {
  const keys = Object.keys(filter);
  const key = keys[0];
  if (keys.length !== 1 || !key) {
    return null;
  }

  // `is empty` compiles to { not: { exists } }, so check it before treating
  // `not` as a group construct.
  if (key === "not") {
    const inner = (filter as { not: Filter }).not;
    const innerKeys = Object.keys(inner);
    if (innerKeys.length === 1 && innerKeys[0] === "exists") {
      const propertyBaseUrl = matchPropertyPath(
        (inner as { exists: { path?: unknown } }).exists.path,
      );
      if (propertyBaseUrl !== null) {
        return {
          subject: "property",
          propertyBaseUrl,
          operator: "isEmpty",
          value: "",
        };
      }
    }
    return null;
  }

  if (key === "exists") {
    const propertyBaseUrl = matchPropertyPath(
      (filter as { exists: { path?: unknown } }).exists.path,
    );
    if (propertyBaseUrl !== null) {
      return {
        subject: "property",
        propertyBaseUrl,
        operator: "hasAnyValue",
        value: "",
      };
    }
    return null;
  }

  if (!(comparisonOperators as readonly string[]).includes(key)) {
    return null;
  }

  const operands = (filter as unknown as Record<string, FilterExpression[]>)[
    key
  ];
  if (!Array.isArray(operands) || operands.length !== 2) {
    return null;
  }
  const [left, right] = operands;
  if (!left || !right || !("path" in left) || !("parameter" in right)) {
    return null;
  }

  const { path } = left as { path: unknown[] };
  const { parameter } = right as { parameter: unknown };

  if (
    key === "equal" &&
    Array.isArray(path) &&
    path.length === 2 &&
    path[0] === "type" &&
    path[1] === "baseUrl" &&
    typeof parameter === "string"
  ) {
    return { subject: "entityType", entityTypeBaseUrl: parameter };
  }

  const propertyBaseUrl = matchPropertyPath(path);
  if (propertyBaseUrl === null) {
    return null;
  }

  if (key === "equal" && typeof parameter === "boolean") {
    return {
      subject: "property",
      propertyBaseUrl,
      operator: parameter ? "isTrue" : "isFalse",
      value: "",
    };
  }

  return {
    subject: "property",
    propertyBaseUrl,
    operator: key as PropertyOperatorId,
    value:
      typeof parameter === "string" ? parameter : JSON.stringify(parameter),
  };
};

const buildEntityTypeCondition = (entityTypeBaseUrl: string): Filter =>
  ({
    equal: [{ path: ["type", "baseUrl"] }, { parameter: entityTypeBaseUrl }],
  }) as unknown as Filter;

const buildPropertyCondition = ({
  propertyBaseUrl,
  operator,
  value,
  kind,
}: {
  propertyBaseUrl: string;
  operator: PropertyOperatorId;
  value: string;
  kind: FilterValueKind;
}): Filter => {
  const path = ["properties", propertyBaseUrl];
  switch (operator) {
    case "hasAnyValue":
      return { exists: { path } } as unknown as Filter;
    case "isEmpty":
      return { not: { exists: { path } } } as unknown as Filter;
    case "isTrue":
      return { equal: [{ path }, { parameter: true }] } as unknown as Filter;
    case "isFalse":
      return { equal: [{ path }, { parameter: false }] } as unknown as Filter;
    default: {
      let parameter: unknown = value;
      if (kind === "number") {
        const numeric = Number(value);
        parameter =
          value.trim() !== "" && !Number.isNaN(numeric) ? numeric : value;
      }
      return { [operator]: [{ path }, { parameter }] } as unknown as Filter;
    }
  }
};

const defaultEntityTypeCondition = buildEntityTypeCondition("");

const defaultPropertyCondition = buildPropertyCondition({
  propertyBaseUrl: "",
  operator: "equal",
  value: "",
  kind: "string",
});

/**
 * A neutral starting point for the advanced editor: an empty single-segment
 * path so it isn't mistaken for an entity-type or property condition.
 */
const defaultAdvancedCondition = {
  equal: [{ path: [""] }, { parameter: "" }],
} as unknown as Filter;

const defaultCondition = defaultEntityTypeCondition;

/* -------------------------------------------------------------------------
 * Ontology-derived options for the selectors
 * ---------------------------------------------------------------------- */

type PropertyOption = {
  baseUrl: string;
  title: string;
  kind: FilterValueKind;
};

type BuilderOptions = {
  entityTypeItems: SelectItem[];
  entityTypesLoading: boolean;
  propertyItems: SelectItem[];
  propertyOptions: Map<string, PropertyOption>;
  propertiesLoading: boolean;
};

const useBuilderOptions = (): BuilderOptions => {
  const { latestEntityTypes, isSpecialEntityTypeLookup } =
    useLatestEntityTypesOptional();
  const { propertyTypes } = usePropertyTypes({ latestOnly: true });
  const { dataTypes, loading: dataTypesLoading } = useDataTypesContext();

  const entityTypeItems = useMemo<SelectItem[]>(
    () =>
      (latestEntityTypes ?? [])
        .filter(
          (entityType) =>
            !isSpecialEntityTypeLookup?.[entityType.schema.$id]?.isLink,
        )
        .map((entityType) => ({
          value: entityType.metadata.recordId.baseUrl as string,
          text: entityType.schema.title,
        }))
        .sort((a, b) => a.text.localeCompare(b.text)),
    [latestEntityTypes, isSpecialEntityTypeLookup],
  );

  const propertyOptions = useMemo<Map<string, PropertyOption>>(() => {
    const options = new Map<string, PropertyOption>();
    if (!propertyTypes || !dataTypes) {
      return options;
    }
    for (const propertyType of Object.values(propertyTypes)) {
      const { oneOf, title } = propertyType.schema;
      // Only single, direct data-type values are offered (matching the
      // entities-table property filters) – nested objects and lists are not.
      if (oneOf.length !== 1) {
        continue;
      }
      const [valueDefinition] = oneOf;
      if (!("$ref" in valueDefinition)) {
        continue;
      }
      const kind = resolveDataTypeValueKind({
        dataTypeId: valueDefinition.$ref,
        dataTypes,
      });
      if (kind !== "string" && kind !== "number" && kind !== "boolean") {
        continue;
      }
      options.set(propertyType.metadata.recordId.baseUrl, {
        baseUrl: propertyType.metadata.recordId.baseUrl,
        title,
        kind,
      });
    }
    return options;
  }, [propertyTypes, dataTypes]);

  const propertyItems = useMemo<SelectItem[]>(
    () =>
      [...propertyOptions.values()]
        .map(({ baseUrl, title }) => ({ value: baseUrl, text: title }))
        .sort((a, b) => a.text.localeCompare(b.text)),
    [propertyOptions],
  );

  return {
    entityTypeItems,
    entityTypesLoading: latestEntityTypes === null,
    propertyItems,
    propertyOptions,
    propertiesLoading: !propertyTypes || dataTypesLoading,
  };
};

/* -------------------------------------------------------------------------
 * Advanced editor: arbitrary paths and operators for filters that don't fit
 * the simple entity-type / property shapes (e.g. LLM-generated queries).
 * ---------------------------------------------------------------------- */

const advancedOperatorLabels: Record<ComparisonOperator | "exists", string> = {
  equal: "equals",
  notEqual: "not equals",
  greater: "greater than",
  greaterOrEqual: "greater or equal",
  less: "less than",
  lessOrEqual: "less or equal",
  startsWith: "starts with",
  endsWith: "ends with",
  containsSegment: "contains segment",
  exists: "exists",
};

const advancedOperatorItems: SelectItem<ComparisonOperator | "exists">[] = (
  [...comparisonOperators, "exists"] as const
).map((operator) => ({
  value: operator,
  text: advancedOperatorLabels[operator],
}));

type PathEditorProps = {
  path: unknown[];
  onChange: (path: unknown[]) => void;
};

const PathEditor = ({ path, onChange }: PathEditorProps) => (
  <Stack
    direction="row"
    spacing={0.75}
    flexWrap="wrap"
    useFlexGap
    alignItems="center"
    flex={1}
  >
    {path.map((segment, index) => (
      // eslint-disable-next-line react/no-array-index-key
      <Stack key={index} direction="row" alignItems="center" spacing={0.25}>
        <Box sx={{ width: 140 }}>
          <TextInput
            size={inputSize}
            placeholder="segment"
            value={
              typeof segment === "string" ? segment : JSON.stringify(segment)
            }
            onChange={(newValue) => {
              const newPath = [...path];
              newPath[index] = newValue;
              onChange(newPath);
            }}
          />
        </Box>
        <DeleteIconButton
          label="Remove segment"
          onClick={() =>
            onChange(path.filter((_, segmentIndex) => segmentIndex !== index))
          }
        />
      </Stack>
    ))}
    <Button
      variant="subtle"
      tone="neutral"
      size="xs"
      iconName="plus"
      onClick={() => onChange([...path, ""])}
    >
      Segment
    </Button>
  </Stack>
);

/**
 * Convert a text input into a parameter value, preserving JSON scalars
 * (numbers, booleans, null) while treating everything else as a string.
 */
const parseParameterInput = (input: string): unknown => {
  const trimmed = input.trim();
  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  if (trimmed === "null") {
    return null;
  }
  if (trimmed !== "" && !Number.isNaN(Number(trimmed))) {
    return Number(trimmed);
  }
  return input;
};

const parameterToInput = (value: unknown): string =>
  typeof value === "string" ? value : JSON.stringify(value);

type ExpressionEditorProps = {
  expression: FilterExpression;
  onChange: (expression: FilterExpression) => void;
};

const ExpressionEditor = ({ expression, onChange }: ExpressionEditorProps) => {
  const isPath = "path" in expression;

  return (
    <Stack direction="row" spacing={1} alignItems="flex-start" flex={1}>
      <Box sx={{ flexShrink: 0 }}>
        <Select
          required
          size={inputSize}
          width="fitContent"
          items={[
            { value: "path", text: "path" },
            { value: "value", text: "value" },
          ]}
          value={isPath ? "path" : "value"}
          onChange={(newKind) => {
            if (newKind === "path" && !isPath) {
              onChange({ path: ["type", "baseUrl"] });
            } else if (newKind === "value" && isPath) {
              onChange({ parameter: "" });
            }
          }}
        />
      </Box>
      {isPath ? (
        <PathEditor
          path={(expression as { path: unknown[] }).path}
          onChange={(path) => onChange({ path } as FilterExpression)}
        />
      ) : (
        <TextInput
          size={inputSize}
          width="fullWidth"
          placeholder="value (string, number, true/false)"
          value={parameterToInput(
            (expression as { parameter: unknown }).parameter,
          )}
          onChange={(newValue) =>
            onChange({
              parameter: parseParameterInput(newValue),
            } as FilterExpression)
          }
        />
      )}
    </Stack>
  );
};

type AdvancedConditionEditorProps = {
  filter: Filter;
  onChange: (filter: Filter) => void;
};

const AdvancedConditionEditor = ({
  filter,
  onChange,
}: AdvancedConditionEditorProps) => {
  const keys = Object.keys(filter);
  const key = keys[0];

  const isExists = key === "exists";
  const isComparison =
    !!key && (comparisonOperators as readonly string[]).includes(key);

  if (keys.length !== 1 || !key || (!isExists && !isComparison)) {
    return (
      <Typography variant="smallTextParagraphs" color="error">
        This condition uses a construct the builder doesn't support — switch to
        the JSON view to edit it.
      </Typography>
    );
  }

  const operator = key as ComparisonOperator | "exists";

  const handleOperatorChange = (newOperator: ComparisonOperator | "exists") => {
    if (newOperator === operator) {
      return;
    }

    if (newOperator === "exists") {
      let path: unknown[] = ["properties"];
      if (isComparison) {
        const operands = (
          filter as unknown as Record<string, FilterExpression[]>
        )[operator];
        const pathOperand = operands?.find((operand) => "path" in operand);
        if (pathOperand) {
          path = (pathOperand as { path: unknown[] }).path;
        }
      }
      onChange({ exists: { path } } as unknown as Filter);
      return;
    }

    if (isExists) {
      const { path } = (filter as { exists: { path: unknown[] } }).exists;
      onChange({
        [newOperator]: [{ path }, { parameter: "" }],
      } as unknown as Filter);
      return;
    }

    const operands = (filter as unknown as Record<string, FilterExpression[]>)[
      operator
    ];
    onChange({ [newOperator]: operands } as unknown as Filter);
  };

  const operatorSelect = (
    <Box sx={{ flexShrink: 0 }}>
      <Select
        required
        size={inputSize}
        width="fitContent"
        items={advancedOperatorItems}
        value={operator}
        onChange={handleOperatorChange}
      />
    </Box>
  );

  if (isExists) {
    const { path } = (filter as { exists: { path: unknown[] } }).exists;
    return (
      <Stack direction="row" spacing={1} alignItems="flex-start" flex={1}>
        {operatorSelect}
        <PathEditor
          path={path}
          onChange={(newPath) =>
            onChange({ exists: { path: newPath } } as unknown as Filter)
          }
        />
      </Stack>
    );
  }

  const operands =
    (filter as unknown as Record<string, FilterExpression[]>)[operator] ?? [];
  const [left, right] = operands;

  if (!left || !right) {
    return (
      <Typography variant="smallTextParagraphs" color="error">
        This condition is malformed — switch to the JSON view to fix it.
      </Typography>
    );
  }

  const updateOperand = (index: 0 | 1, expression: FilterExpression) => {
    const newOperands: FilterExpression[] = [...operands];
    newOperands[index] = expression;
    onChange({ [operator]: newOperands } as unknown as Filter);
  };

  return (
    <Stack spacing={1} flex={1}>
      <ExpressionEditor
        expression={left}
        onChange={(expression) => updateOperand(0, expression)}
      />
      <Stack direction="row" spacing={1} alignItems="flex-start">
        {operatorSelect}
        <ExpressionEditor
          expression={right}
          onChange={(expression) => updateOperand(1, expression)}
        />
      </Stack>
    </Stack>
  );
};

/* -------------------------------------------------------------------------
 * Condition rows (leaves)
 * ---------------------------------------------------------------------- */

const subjectItems: SelectItem<ConditionSubject>[] = [
  { value: "entityType", text: "Entity Type" },
  { value: "property", text: "Property" },
  { value: "advanced", text: "Advanced" },
];

type ConditionEditorProps = {
  filter: Filter;
  onChange: (filter: Filter) => void;
  onDelete?: () => void;
  options: BuilderOptions;
};

const ConditionEditor = ({
  filter,
  onChange,
  onDelete,
  options,
}: ConditionEditorProps) => {
  const parsed = parseCondition(filter);
  const subject: ConditionSubject = parsed?.subject ?? "advanced";

  const handleSubjectChange = (newSubject: ConditionSubject) => {
    if (newSubject === subject) {
      return;
    }
    if (newSubject === "entityType") {
      onChange(defaultEntityTypeCondition);
    } else if (newSubject === "property") {
      onChange(defaultPropertyCondition);
    } else {
      onChange(defaultAdvancedCondition);
    }
  };

  const subjectSelect = (
    <Box sx={{ flexShrink: 0 }}>
      <Select
        required
        size={inputSize}
        width="fitContent"
        items={subjectItems}
        value={subject}
        onChange={handleSubjectChange}
        aria-label="Condition type"
      />
    </Box>
  );

  let content: React.ReactNode;

  if (parsed?.subject === "entityType") {
    content = (
      <>
        <Typography
          sx={{ fontSize: 12, color: "#525252", flexShrink: 0 }}
          aria-hidden
        >
          is
        </Typography>
        <Box sx={{ width: 280, flexShrink: 0 }}>
          <Select
            size={inputSize}
            width="fullWidth"
            items={options.entityTypeItems}
            loading={options.entityTypesLoading}
            placeholder="Select entity type…"
            value={parsed.entityTypeBaseUrl || null}
            onChange={(baseUrl) =>
              onChange(buildEntityTypeCondition(baseUrl ?? ""))
            }
            aria-label="Entity type"
          />
        </Box>
      </>
    );
  } else if (parsed?.subject === "property") {
    const propertyOption = options.propertyOptions.get(parsed.propertyBaseUrl);
    const kind = propertyOption?.kind ?? "string";
    const operators = propertyOperatorsByKind[kind];
    const descriptor = operators.find(
      (candidate) => candidate.id === parsed.operator,
    );

    content = (
      <>
        <Box sx={{ flex: 1, minWidth: 160 }}>
          <Select
            size={inputSize}
            items={options.propertyItems}
            loading={options.propertiesLoading}
            placeholder="Select property…"
            value={parsed.propertyBaseUrl || null}
            onChange={(newBaseUrl) => {
              const newKind =
                options.propertyOptions.get(newBaseUrl ?? "")?.kind ?? "string";
              const newOperators = propertyOperatorsByKind[newKind];
              const operator = newOperators.some(
                (candidate) => candidate.id === parsed.operator,
              )
                ? parsed.operator
                : newOperators[0]!.id;
              onChange(
                buildPropertyCondition({
                  propertyBaseUrl: newBaseUrl ?? "",
                  operator,
                  value: parsed.value,
                  kind: newKind,
                }),
              );
            }}
            aria-label="Property"
          />
        </Box>
        <Box sx={{ flexShrink: 0, minWidth: 110 }}>
          <Select
            required
            size={inputSize}
            width="fullWidth"
            items={operators.map(({ id, label }) => ({
              value: id,
              text: label,
            }))}
            value={parsed.operator}
            onChange={(operator) =>
              onChange(
                buildPropertyCondition({
                  propertyBaseUrl: parsed.propertyBaseUrl,
                  operator,
                  value: parsed.value,
                  kind,
                }),
              )
            }
            aria-label="Operator"
          />
        </Box>
        {(descriptor?.requiresValue ?? true) &&
          (kind === "number" ? (
            <Box sx={{ flex: 1, minWidth: 100 }}>
              <NumberInput
                size={inputSize}
                hideStepper
                min={Number.MIN_SAFE_INTEGER}
                step="any"
                placeholder="Value"
                value={
                  parsed.value.trim() !== "" &&
                  !Number.isNaN(Number(parsed.value))
                    ? Number(parsed.value)
                    : null
                }
                onChange={(numericValue) =>
                  onChange(
                    buildPropertyCondition({
                      propertyBaseUrl: parsed.propertyBaseUrl,
                      operator: parsed.operator,
                      value: numericValue === null ? "" : String(numericValue),
                      kind,
                    }),
                  )
                }
                aria-label="Value"
              />
            </Box>
          ) : (
            <Box sx={{ flex: 1, minWidth: 120 }}>
              <TextInput
                size={inputSize}
                width="fullWidth"
                placeholder="Value"
                value={parsed.value}
                onChange={(newValue) =>
                  onChange(
                    buildPropertyCondition({
                      propertyBaseUrl: parsed.propertyBaseUrl,
                      operator: parsed.operator,
                      value: newValue,
                      kind,
                    }),
                  )
                }
                aria-label="Value"
              />
            </Box>
          ))}
      </>
    );
  }

  return (
    <Box
      sx={{
        border: `1px solid ${cardBorderColor}`,
        borderRadius: "8px",
        backgroundColor: "white",
        p: 1,
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        alignItems={subject === "advanced" ? "flex-start" : "center"}
        flexWrap="wrap"
        useFlexGap
      >
        {subjectSelect}
        {subject === "advanced" ? (
          <AdvancedConditionEditor filter={filter} onChange={onChange} />
        ) : (
          content
        )}
        {onDelete && (
          <Box sx={{ ml: "auto", flexShrink: 0 }}>
            <DeleteIconButton label="Delete condition" onClick={onDelete} />
          </Box>
        )}
      </Stack>
    </Box>
  );
};

/* -------------------------------------------------------------------------
 * Groups (all / any / not) and the tree
 * ---------------------------------------------------------------------- */

const getGroupKind = (filter: Filter): GroupOperator | null => {
  const keys = Object.keys(filter);
  const key = keys[0];
  if (keys.length !== 1 || !key) {
    return null;
  }
  return (groupOperators as readonly string[]).includes(key)
    ? (key as GroupOperator)
    : null;
};

type FilterNodeEditorProps = {
  filter: Filter;
  onChange: (filter: Filter) => void;
  onDelete?: () => void;
  depth: number;
  options: BuilderOptions;
};

const FilterNodeEditor = ({
  filter,
  onChange,
  onDelete,
  depth,
  options,
}: FilterNodeEditorProps) => {
  // Leaf conditions first: `{ not: { exists } }` renders as an "is empty"
  // property condition rather than a NOT group.
  const parsed = parseCondition(filter);

  const groupKind = parsed ? null : getGroupKind(filter);

  if (!groupKind) {
    return (
      <ConditionEditor
        filter={filter}
        onChange={onChange}
        onDelete={onDelete}
        options={options}
      />
    );
  }

  const handleGroupKindChange = (newKind: GroupOperator) => {
    if (newKind === groupKind) {
      return;
    }
    if (newKind === "not") {
      const children =
        groupKind === "not"
          ? []
          : (filter as unknown as Record<"all" | "any", Filter[]>)[groupKind];
      onChange({ not: children[0] ?? defaultCondition } as Filter);
      return;
    }
    if (groupKind === "not") {
      onChange({
        [newKind]: [(filter as { not: Filter }).not],
      } as unknown as Filter);
      return;
    }
    onChange({
      [newKind]: (filter as unknown as Record<"all" | "any", Filter[]>)[
        groupKind
      ],
    } as unknown as Filter);
  };

  const header = (
    <Stack direction="row" alignItems="center" spacing={1}>
      <Select
        required
        size={inputSize}
        width="fitContent"
        items={groupOperators.map((operator) => ({
          value: operator,
          text: groupOperatorLabels[operator],
        }))}
        value={groupKind}
        onChange={handleGroupKindChange}
        aria-label="Group operator"
      />
      {onDelete && (
        <Box sx={{ ml: "auto" }}>
          <DeleteIconButton label="Delete group" onClick={onDelete} />
        </Box>
      )}
    </Stack>
  );

  const containerSx = {
    border: `1px solid ${cardBorderColor}`,
    borderRadius: "8px",
    p: 1.25,
    backgroundColor: depth % 2 === 0 ? "#fafafa" : "white",
  };

  if (groupKind === "not") {
    const child = (filter as { not: Filter }).not;
    return (
      <Box sx={containerSx}>
        <Stack spacing={1}>
          {header}
          <FilterNodeEditor
            filter={child}
            depth={depth + 1}
            options={options}
            onChange={(newChild) => onChange({ not: newChild } as Filter)}
          />
        </Stack>
      </Box>
    );
  }

  const children = (filter as unknown as Record<"all" | "any", Filter[]>)[
    groupKind
  ];

  const updateChild = (index: number, child: Filter) => {
    const newChildren = [...children];
    newChildren[index] = child;
    onChange({ [groupKind]: newChildren } as unknown as Filter);
  };

  return (
    <Box sx={containerSx}>
      <Stack spacing={1}>
        {header}
        {children.map((child, index) => (
          <FilterNodeEditor
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            filter={child}
            depth={depth + 1}
            options={options}
            onChange={(newChild) => updateChild(index, newChild)}
            onDelete={() =>
              onChange({
                [groupKind]: children.filter(
                  (_, childIndex) => childIndex !== index,
                ),
              } as unknown as Filter)
            }
          />
        ))}
        <Stack direction="row" spacing={0.5}>
          <Button
            variant="subtle"
            tone="neutral"
            size="xs"
            iconName="plus"
            onClick={() =>
              onChange({
                [groupKind]: [...children, defaultCondition],
              } as unknown as Filter)
            }
          >
            Condition
          </Button>
          <Button
            variant="subtle"
            tone="neutral"
            size="xs"
            iconName="plus"
            onClick={() =>
              onChange({
                [groupKind]: [...children, { all: [defaultCondition] }],
              } as unknown as Filter)
            }
          >
            Group
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
};

/* -------------------------------------------------------------------------
 * Related entities: traversal paths built from named relationships.
 *
 * Users pick relationships by name ("Associated with → Account"); each pick
 * compiles to a graph traversal path (a pair of link-entity edges per hop).
 * The graph doesn't type-filter hops, so a hop brings in all entities linked
 * at that step — the named pick guarantees the wanted data is reachable.
 * ---------------------------------------------------------------------- */

/** Graph API limits (see MAX_TRAVERSAL_PATHS / MAX_ENTITY_TRAVERSAL_EDGES). */
const maximumTraversalPaths = 10;
const maximumTraversalEdgesPerPath = 10;

type RelationshipOption = {
  id: string;
  label: string;
  hop: TraversalHopMeta;
};

const hopToEdges = (hop: TraversalHopMeta): EntityTraversalEdge[] => [
  ...(hop.direction === "outgoing" ? outgoingHopEdges : incomingHopEdges),
];

type EntityTypeLinkSchema = NonNullable<
  EntityTypeWithMetadata["schema"]["links"]
>[VersionedUrl];

/**
 * Relationship options for entities of the given type base URLs: outgoing
 * relationships from each type's link definitions, and incoming ones from
 * scanning all types whose links can target one of the given types.
 *
 * Inheritance is resolved on both sides: a type's effective links include
 * those declared on its `allOf` ancestors, and a link whose declared target
 * is an ancestor of the root type counts as targeting the root.
 *
 * @todo FE-13: use a context with closed entity types to avoid this custom walking
 */
const useRelationshipOptions = (
  forTypeBaseUrls: string[],
): RelationshipOption[] => {
  const { latestEntityTypes } = useLatestEntityTypesOptional();
  /** All versions, for resolving the exact versioned URLs in `allOf` refs. */
  const allEntityTypes = useEntityTypesOptional();

  return useMemo(() => {
    if (!latestEntityTypes || forTypeBaseUrls.length === 0) {
      return [];
    }

    const typesByBaseUrl = new Map(
      latestEntityTypes.map((entityType) => [
        entityType.metadata.recordId.baseUrl as string,
        entityType,
      ]),
    );

    const typesByVersionedUrl = new Map(
      (allEntityTypes ?? []).map((entityType) => [
        entityType.schema.$id,
        entityType,
      ]),
    );

    const titleForBaseUrl = (baseUrl: string) =>
      typesByBaseUrl.get(baseUrl)?.schema.title ?? baseUrl;

    /**
     * Walk a type's `allOf` ancestry breadth-first (cycle-safe, skipping
     * ancestors that aren't loaded), visiting the type itself first so that
     * nearer declarations take precedence.
     */
    const walkTypeAndAncestors = (
      entityType: EntityTypeWithMetadata,
      visit: (schema: EntityTypeWithMetadata["schema"]) => void,
    ) => {
      const queue = [entityType.schema];
      const visited = new Set([entityType.schema.$id]);
      while (queue.length > 0) {
        const schema = queue.shift()!;
        visit(schema);
        for (const parentRef of schema.allOf ?? []) {
          const parent = typesByVersionedUrl.get(parentRef.$ref);
          if (parent && !visited.has(parent.schema.$id)) {
            visited.add(parent.schema.$id);
            queue.push(parent.schema);
          }
        }
      }
    };

    /**
     * A type's effective link definitions: its own plus those inherited via
     * `allOf`, keyed by link type base URL (nearest declaration wins).
     */
    const effectiveLinksCache = new Map<
      VersionedUrl,
      Map<string, EntityTypeLinkSchema>
    >();
    const getEffectiveLinks = (entityType: EntityTypeWithMetadata) => {
      const cached = effectiveLinksCache.get(entityType.schema.$id);
      if (cached) {
        return cached;
      }
      const links = new Map<string, EntityTypeLinkSchema>();
      walkTypeAndAncestors(entityType, (schema) => {
        for (const [linkTypeId, linkSchema] of Object.entries(
          schema.links ?? {},
        )) {
          const linkTypeBaseUrl = extractBaseUrl(linkTypeId as VersionedUrl);
          if (!links.has(linkTypeBaseUrl)) {
            links.set(linkTypeBaseUrl, linkSchema);
          }
        }
      });
      effectiveLinksCache.set(entityType.schema.$id, links);
      return links;
    };

    /** Base URLs of a type and all of its `allOf` ancestors. */
    const getSelfAndAncestorBaseUrls = (entityType: EntityTypeWithMetadata) => {
      const baseUrls = new Set<string>();
      walkTypeAndAncestors(entityType, (schema) => {
        baseUrls.add(extractBaseUrl(schema.$id));
      });
      return baseUrls;
    };

    const optionsById = new Map<string, RelationshipOption>();

    const addOption = (label: string, hop: TraversalHopMeta) => {
      const id = `${hop.direction}:${hop.linkTypeBaseUrl ?? ""}:${
        hop.entityTypeBaseUrl ?? ""
      }`;
      if (!optionsById.has(id)) {
        optionsById.set(id, { id, label, hop });
      }
    };

    for (const rootBaseUrl of forTypeBaseUrls) {
      const rootType = typesByBaseUrl.get(rootBaseUrl);

      const rootAndAncestorBaseUrls = rootType
        ? getSelfAndAncestorBaseUrls(rootType)
        : new Set([rootBaseUrl]);

      // Outgoing: the root type's effective (own + inherited) links
      for (const [linkTypeBaseUrl, linkSchema] of rootType
        ? getEffectiveLinks(rootType)
        : new Map<string, EntityTypeLinkSchema>()) {
        const linkTitle = titleForBaseUrl(linkTypeBaseUrl);

        const destinationRefs =
          "oneOf" in linkSchema.items
            ? linkSchema.items.oneOf.map((destination) => destination.$ref)
            : undefined;

        if (destinationRefs) {
          for (const destinationRef of destinationRefs) {
            const destinationBaseUrl = extractBaseUrl(destinationRef);
            addOption(`${linkTitle} → ${titleForBaseUrl(destinationBaseUrl)}`, {
              direction: "outgoing",
              linkTypeBaseUrl,
              entityTypeBaseUrl: destinationBaseUrl,
            });
          }
        } else {
          addOption(`${linkTitle} → (any entity)`, {
            direction: "outgoing",
            linkTypeBaseUrl,
          });
        }
      }

      // Incoming: other types whose effective links can target the root type
      // (a declared target that is an ancestor of the root also matches)
      for (const candidateType of latestEntityTypes) {
        for (const [linkTypeBaseUrl, linkSchema] of getEffectiveLinks(
          candidateType,
        )) {
          if (!("oneOf" in linkSchema.items)) {
            continue;
          }
          const targetsRoot = linkSchema.items.oneOf.some((destination) =>
            rootAndAncestorBaseUrls.has(extractBaseUrl(destination.$ref)),
          );
          if (!targetsRoot) {
            continue;
          }
          addOption(
            `← ${titleForBaseUrl(linkTypeBaseUrl)} ← ${
              candidateType.schema.title
            }`,
            {
              direction: "incoming",
              linkTypeBaseUrl,
              entityTypeBaseUrl: candidateType.metadata.recordId
                .baseUrl as string,
            },
          );
        }
      }
    }

    return [...optionsById.values()].sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  }, [latestEntityTypes, allEntityTypes, forTypeBaseUrls]);
};

const edgePairMatches = (
  first: EntityTraversalEdge,
  second: EntityTraversalEdge,
  [expectedFirst, expectedSecond]: EntityTraversalEdge[],
): boolean =>
  first.kind === expectedFirst!.kind &&
  first.direction === expectedFirst!.direction &&
  second.kind === expectedSecond!.kind &&
  second.direction === expectedSecond!.direction;

/**
 * Human-readable description of a traversal path. Paths built via the picker
 * carry a label; AI- or JSON-authored paths get a generic description derived
 * from their edges.
 */
const describeTraversalPath = (path: LabelledTraversalPath): string => {
  if (path.label) {
    return path.label;
  }

  const hopDirections: string[] = [];
  if (path.edges.length % 2 === 0) {
    for (let index = 0; index + 1 < path.edges.length; index += 2) {
      const [first, second] = [path.edges[index]!, path.edges[index + 1]!];
      if (edgePairMatches(first, second, outgoingHopEdges)) {
        hopDirections.push("outgoing");
      } else if (edgePairMatches(first, second, incomingHopEdges)) {
        hopDirections.push("incoming");
      } else {
        hopDirections.length = 0;
        break;
      }
    }
  }

  if (hopDirections.length > 0) {
    return `${hopDirections.length} hop${
      hopDirections.length === 1 ? "" : "s"
    } via ${hopDirections.join(", then ")} links`;
  }

  return `Custom traversal (${path.edges.length} edge${
    path.edges.length === 1 ? "" : "s"
  })`;
};

/** Select item list for a set of relationship options. */
const relationshipItems = (options: RelationshipOption[]): SelectItem[] =>
  options.map((option) => ({ value: option.id, text: option.label }));

type TraversalPathRowProps = {
  path: LabelledTraversalPath;
  onChange: (path: LabelledTraversalPath) => void;
  onDelete: () => void;
};

const TraversalPathRow = ({
  path,
  onChange,
  onDelete,
}: TraversalPathRowProps) => {
  // Chaining deeper needs to know the entity type at the end of the path
  const endTypeBaseUrl = path.hops?.at(-1)?.entityTypeBaseUrl;
  const extendOptions = useRelationshipOptions(
    endTypeBaseUrl ? [endTypeBaseUrl] : [],
  );

  const canExtend =
    extendOptions.length > 0 &&
    path.edges.length + 2 <= maximumTraversalEdgesPerPath;

  const handleExtend = (optionId: string | null | undefined) => {
    const option = extendOptions.find((candidate) => candidate.id === optionId);
    if (!option) {
      return;
    }
    onChange({
      edges: [...path.edges, ...hopToEdges(option.hop)],
      label: `${path.label ?? describeTraversalPath(path)} › ${option.label}`,
      hops: [...(path.hops ?? []), option.hop],
    });
  };

  return (
    <Stack
      direction="row"
      spacing={1}
      alignItems="center"
      flexWrap="wrap"
      useFlexGap
      sx={{
        border: `1px solid ${cardBorderColor}`,
        borderRadius: "8px",
        backgroundColor: "white",
        px: 1,
        py: 0.75,
      }}
    >
      <Typography sx={{ fontSize: 13, color: "#37352f" }}>
        {describeTraversalPath(path)}
      </Typography>
      {canExtend && (
        <Box sx={{ flexShrink: 0 }}>
          <Select
            size={inputSize}
            width="fitContent"
            items={relationshipItems(extendOptions)}
            value={null}
            placeholder="Extend…"
            onChange={handleExtend}
            aria-label="Extend traversal path"
          />
        </Box>
      )}
      <Box sx={{ ml: "auto", flexShrink: 0 }}>
        <DeleteIconButton label="Remove related entities" onClick={onDelete} />
      </Box>
    </Stack>
  );
};

type RelatedEntitiesSectionProps = {
  rootTypeBaseUrls: string[];
  traversalPaths: LabelledTraversalPath[];
  onChange: (traversalPaths: LabelledTraversalPath[]) => void;
};

const RelatedEntitiesSection = ({
  rootTypeBaseUrls,
  traversalPaths,
  onChange,
}: RelatedEntitiesSectionProps) => {
  const addOptions = useRelationshipOptions(rootTypeBaseUrls);

  const handleAdd = (optionId: string | null | undefined) => {
    const option = addOptions.find((candidate) => candidate.id === optionId);
    if (!option) {
      return;
    }
    onChange([
      ...traversalPaths,
      {
        edges: hopToEdges(option.hop),
        label: option.label,
        hops: [option.hop],
      },
    ]);
  };

  return (
    <Stack spacing={1} sx={{ alignSelf: "stretch" }}>
      <Typography sx={{ fontSize: 12, fontWeight: 500, color: "#525252" }}>
        Include related entities
      </Typography>

      {traversalPaths.map((path, index) => (
        <TraversalPathRow
          // eslint-disable-next-line react/no-array-index-key
          key={index}
          path={path}
          onChange={(newPath) =>
            onChange(
              traversalPaths.map((existing, pathIndex) =>
                pathIndex === index ? newPath : existing,
              ),
            )
          }
          onDelete={() =>
            onChange(
              traversalPaths.filter((_, pathIndex) => pathIndex !== index),
            )
          }
        />
      ))}

      {rootTypeBaseUrls.length === 0 ? (
        <Typography variant="smallTextParagraphs" color="text.secondary">
          Select an entity type in the query above to add related entities.
        </Typography>
      ) : addOptions.length === 0 ? (
        <Typography variant="smallTextParagraphs" color="text.secondary">
          The selected entity type has no known relationships. Use the JSON view
          for custom traversal paths.
        </Typography>
      ) : traversalPaths.length < maximumTraversalPaths ? (
        <Box>
          <Select
            size={inputSize}
            width="fitContent"
            items={relationshipItems(addOptions)}
            value={null}
            placeholder="Add related entities…"
            onChange={handleAdd}
            aria-label="Add related entities"
          />
        </Box>
      ) : null}

      {traversalPaths.length > 0 && (
        <Typography
          variant="smallTextParagraphs"
          sx={{ color: "text.secondary", fontSize: 11 }}
        >
          Each hop brings in all entities linked at that step, not only the
          named relationship — the analysis uses the ones it needs.
        </Typography>
      )}
    </Stack>
  );
};

/**
 * Collect the entity type base URLs positively selected by the filter (used
 * to offer relationship options). Types inside NOT groups are skipped.
 */
const collectEntityTypeBaseUrls = (filter: Filter): string[] => {
  const parsed = parseCondition(filter);
  if (parsed) {
    return parsed.subject === "entityType" && parsed.entityTypeBaseUrl
      ? [parsed.entityTypeBaseUrl]
      : [];
  }
  const groupKind = getGroupKind(filter);
  if (groupKind === "all" || groupKind === "any") {
    return (filter as unknown as Record<"all" | "any", Filter[]>)[
      groupKind
    ].flatMap(collectEntityTypeBaseUrls);
  }
  return [];
};

type StructuralQueryBuilderProps = {
  value: StructuralQueryDefinition | null;
  /** `null` clears the query entirely */
  onChange: (definition: StructuralQueryDefinition | null) => void;
};

/**
 * Visual builder for dashboard item data queries: a graph structural query
 * (`Filter` tree) plus optional traversal paths pulling in related entities.
 *
 * Simple filter conditions get dedicated UI: "Entity Type is …" (backed by
 * the entity types context) and "Property … <operator> …" with operators
 * driven by the property's data type. Anything else is editable via the
 * "Advanced" path editor, with all/any/not groups combining conditions.
 * Related entities are added by picking named relationships, compiled to
 * traversal paths under the hood.
 */
export const StructuralQueryBuilder = ({
  value,
  onChange,
}: StructuralQueryBuilderProps) => {
  const options = useBuilderOptions();

  const filter = value?.filter ?? null;
  const traversalPaths = useMemo(
    () => value?.traversalPaths ?? [],
    [value?.traversalPaths],
  );

  const rootTypeBaseUrls = useMemo(
    () => (filter ? [...new Set(collectEntityTypeBaseUrls(filter))] : []),
    [filter],
  );

  const handleFilterChange = (newFilter: Filter | null) => {
    onChange(newFilter ? { filter: newFilter, traversalPaths } : null);
  };

  if (!filter) {
    return (
      <Stack spacing={1.5} alignItems="flex-start">
        <Typography variant="smallTextParagraphs" color="text.secondary">
          No query yet — start with a condition or a group.
        </Typography>
        <Stack direction="row" spacing={0.5}>
          <Button
            variant="subtle"
            tone="neutral"
            size="xs"
            iconName="plus"
            onClick={() => handleFilterChange(defaultCondition)}
          >
            Condition
          </Button>
          <Button
            variant="subtle"
            tone="neutral"
            size="xs"
            iconName="plus"
            onClick={() => handleFilterChange({ all: [defaultCondition] })}
          >
            Group
          </Button>
        </Stack>
      </Stack>
    );
  }

  // A lone condition at the root has no group around it to offer add/remove
  // controls, so provide them here: adding wraps it into an ALL group.
  const rootIsLeaf =
    parseCondition(filter) !== null || getGroupKind(filter) === null;

  return (
    <Stack spacing={1} alignItems="flex-start">
      <Box sx={{ alignSelf: "stretch" }}>
        <FilterNodeEditor
          filter={filter}
          onChange={handleFilterChange}
          onDelete={() => onChange(null)}
          depth={0}
          options={options}
        />
      </Box>
      {rootIsLeaf && (
        <Stack direction="row" spacing={0.5}>
          <Button
            variant="subtle"
            tone="neutral"
            size="xs"
            iconName="plus"
            onClick={() =>
              handleFilterChange({ all: [filter, defaultCondition] })
            }
          >
            Condition
          </Button>
          <Button
            variant="subtle"
            tone="neutral"
            size="xs"
            iconName="plus"
            onClick={() =>
              handleFilterChange({ all: [filter, { all: [defaultCondition] }] })
            }
          >
            Group
          </Button>
        </Stack>
      )}

      <Box
        sx={{
          alignSelf: "stretch",
          borderTop: `1px solid ${cardBorderColor}`,
          pt: 1.5,
          mt: 0.5,
        }}
      >
        <RelatedEntitiesSection
          rootTypeBaseUrls={rootTypeBaseUrls}
          traversalPaths={traversalPaths}
          onChange={(newPaths) =>
            onChange({ filter, traversalPaths: newPaths })
          }
        />
      </Box>
    </Stack>
  );
};
