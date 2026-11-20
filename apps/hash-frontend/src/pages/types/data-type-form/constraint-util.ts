import { extractBaseUrl } from "@blockprotocol/type-system";
import { formatNumber } from "@local/hash-isomorphic-utils/format-number";

import { itemSchemaForType, listItemTypeLabels } from "./list-util";
import { testStoredPattern } from "./untrusted-pattern-oracle";

import type { ListItemType } from "./list-util";
import type {
  ArrayItemsSchema,
  BaseUrl,
  DataTypeWithMetadata,
  NumberConstraints,
  SingleValueConstraints,
  SingleValueSchema,
  StringConstraints,
  StringFormat,
  ValueConstraints,
  VersionedUrl,
} from "@blockprotocol/type-system";

export type ConstraintPrimitive = SingleValueConstraints["type"];

export type ConstraintKind =
  | "minimum"
  | "maximum"
  | "multipleOf"
  | "minLength"
  | "maxLength"
  | "pattern"
  | "format"
  | "enum"
  | "items"
  | "minItems"
  | "maxItems";

export type NumericBound = { value: number; exclusive: boolean };

export type ConstraintValues = {
  minimum?: NumericBound | undefined;
  maximum?: NumericBound | undefined;
  multipleOf?: number | undefined;
  minLength?: number | undefined;
  maxLength?: number | undefined;
  pattern?: string | undefined;
  format?: StringFormat | undefined;
  enum?: (string | number)[] | undefined;
  items?: ListItemType | undefined;
  minItems?: number | undefined;
  maxItems?: number | undefined;
};

const allConstraintKinds: ConstraintKind[] = [
  "minimum",
  "maximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "pattern",
  "format",
  "enum",
  "items",
  "minItems",
  "maxItems",
];

export const constraintKindsByPrimitive: Record<
  ConstraintPrimitive,
  ConstraintKind[]
> = {
  string: ["minLength", "maxLength", "pattern", "format", "enum"],
  number: ["minimum", "maximum", "multipleOf", "enum"],
  array: ["items", "minItems", "maxItems"],
  boolean: [],
  null: [],
  object: [],
};

export const constraintKindLabels: Record<ConstraintKind, string> = {
  minimum: "Minimum",
  maximum: "Maximum",
  multipleOf: "Multiple of",
  minLength: "Minimum length",
  maxLength: "Maximum length",
  pattern: "Pattern",
  format: "Format",
  enum: "Permitted values",
  items: "Item type",
  minItems: "Minimum items",
  maxItems: "Maximum items",
};

export const stringFormatLabels: Record<StringFormat, string> = {
  uri: "URI",
  hostname: "Hostname",
  ipv4: "IPv4 address",
  ipv6: "IPv6 address",
  uuid: "UUID",
  regex: "Regular expression",
  email: "Email address",
  date: "Date (RFC 3339)",
  time: "Time (RFC 3339)",
  "date-time": "Date and time (RFC 3339)",
  duration: "Duration (ISO 8601)",
};

export const kindHasValue = (
  values: ConstraintValues,
  kind: ConstraintKind,
): boolean =>
  kind === "enum" ? (values.enum ?? []).length > 0 : values[kind] !== undefined;

/** Whether two constraint states hold the same value for a kind. */
export const constraintValueEquals = (
  kind: ConstraintKind,
  a: ConstraintValues,
  b: ConstraintValues,
): boolean => {
  if (kind === "enum") {
    const left = a.enum ?? [];
    const right = b.enum ?? [];
    return (
      left.length === right.length &&
      left.every((value) => right.includes(value))
    );
  }
  if (kind === "minimum" || kind === "maximum") {
    const left = a[kind];
    const right = b[kind];
    if (!left || !right) {
      return left === right;
    }
    return left.value === right.value && left.exclusive === right.exclusive;
  }
  return a[kind] === b[kind];
};

/**
 * The titles of every type a group's constraints reach: the given child
 * types plus, transitively, everything in the graph extending them —
 * breadth-first, so direct children lead the list.
 */
export const collectDescendantTypeTitles = ({
  childDataTypeIds,
  latestDataTypes,
  resolveDataType,
  excludeBaseUrl,
}: {
  childDataTypeIds: VersionedUrl[];
  latestDataTypes: Record<BaseUrl, DataTypeWithMetadata>;
  resolveDataType: (
    dataTypeId: VersionedUrl,
  ) => DataTypeWithMetadata | undefined;
  excludeBaseUrl?: BaseUrl;
}): string[] => {
  const titles: string[] = [];
  const visitedBaseUrls = new Set<string>(
    excludeBaseUrl ? [excludeBaseUrl] : [],
  );
  const queue = [...childDataTypeIds];

  while (queue.length > 0) {
    const dataTypeId = queue.shift();
    if (!dataTypeId) {
      break;
    }

    const baseUrl = extractBaseUrl(dataTypeId);
    if (visitedBaseUrls.has(baseUrl)) {
      continue;
    }
    visitedBaseUrls.add(baseUrl);

    const dataType = resolveDataType(dataTypeId);
    if (!dataType) {
      continue;
    }
    titles.push(dataType.schema.title);

    for (const candidate of Object.values(latestDataTypes)) {
      if (
        candidate.schema.allOf?.some(
          ({ $ref }) => extractBaseUrl($ref) === baseUrl,
        )
      ) {
        queue.push(candidate.schema.$id);
      }
    }
  }

  return titles;
};

/**
 * Titles and values are user-authored with no length limit — composed copy
 * (tooltips, card descriptions, picker disabled reasons) truncates each to
 * this many characters. Generous enough for real names: the tightest layout,
 * the picker's nowrap disabled reason, still fits two truncated titles.
 */
const maxSummarizedItemLength = 40;

const truncateSummarizedItem = (item: string): string =>
  item.length > maxSummarizedItemLength
    ? `${item.slice(0, maxSummarizedItemLength).trimEnd()}…`
    : item;

/** "A and B", or "A, B and 2 more" beyond two titles. */
export const summarizeTypeTitles = (titles: string[]): string => {
  const shown = titles.map(truncateSummarizedItem);
  return titles.length <= 2
    ? shown.join(" and ")
    : `${shown[0]}, ${shown[1]} and ${titles.length - 2} more`;
};

/** A human-readable rendering of a kind's value, e.g. for tooltips. */
export const formatConstraintValue = (
  kind: ConstraintKind,
  values: ConstraintValues,
): string => {
  switch (kind) {
    case "minimum":
    case "maximum": {
      const bound = values[kind];
      if (!bound) {
        return "";
      }
      const symbol =
        kind === "minimum"
          ? bound.exclusive
            ? ">"
            : "≥"
          : bound.exclusive
            ? "<"
            : "≤";
      return `${symbol} ${formatNumber(bound.value)}`;
    }
    case "enum": {
      const enumValues = (values.enum ?? []).map((member) =>
        typeof member === "number" ? formatNumber(member) : member,
      );
      const shown = enumValues.slice(0, 5).map(truncateSummarizedItem);
      const hiddenCount = enumValues.length - shown.length;
      return hiddenCount > 0
        ? `${shown.join(", ")} and ${hiddenCount} more`
        : shown.join(", ");
    }
    case "format":
      return values.format ? stringFormatLabels[values.format] : "";
    case "items":
      return values.items ? listItemTypeLabels[values.items] : "";
    default: {
      const value = values[kind];
      if (value === undefined) {
        return "";
      }
      return typeof value === "number" ? formatNumber(value) : String(value);
    }
  }
};

/**
 * The constraint rows to show: the kinds the primitive allows that are
 * either set on the type itself or inherited. Active kinds left over from a
 * previously-selected primitive don't count.
 */
export const visibleConstraintKinds = ({
  primitive,
  activeKinds,
  inheritedValues,
}: {
  primitive: ConstraintPrimitive;
  activeKinds: ConstraintKind[];
  inheritedValues: ConstraintValues;
}): ConstraintKind[] =>
  constraintKindsByPrimitive[primitive].filter(
    (kind) => activeKinds.includes(kind) || kindHasValue(inheritedValues, kind),
  );

export const activeConstraintKinds = (
  values: ConstraintValues,
): ConstraintKind[] =>
  allConstraintKinds.filter((kind) => kindHasValue(values, kind));

export const clearConstraintValue = (
  values: ConstraintValues,
  kind: ConstraintKind,
): ConstraintValues => {
  const next = { ...values };
  delete next[kind];
  return next;
};

/**
 * The union arm the constraint card reads and writes: the single non-array
 * arm. Array arms are configured through list entries instead, and several
 * non-array arms (a mirrored union parent) leave the card hidden.
 */
export const primitiveArmOfUnion = (
  arms: readonly SingleValueSchema[],
): SingleValueSchema | null => {
  const nonArrayArms = arms.filter((arm) => arm.type !== "array");
  return nonArrayArms.length === 1 ? (nonArrayArms[0] ?? null) : null;
};

export const constraintValuesFromSchema = (
  schema: ValueConstraints,
): ConstraintValues => {
  if ("anyOf" in schema) {
    return {};
  }

  const values: ConstraintValues = {};

  if (schema.type === "number") {
    if ("enum" in schema) {
      if (schema.enum.length > 0) {
        values.enum = [...schema.enum];
      }
    } else {
      // A schema may carry both forms of a bound — keep the effectively
      // stricter one, so a load-and-save round trip can't loosen it
      if (schema.exclusiveMinimum !== undefined) {
        values.minimum =
          schema.minimum !== undefined &&
          schema.minimum > schema.exclusiveMinimum
            ? { value: schema.minimum, exclusive: false }
            : { value: schema.exclusiveMinimum, exclusive: true };
      } else if (schema.minimum !== undefined) {
        values.minimum = { value: schema.minimum, exclusive: false };
      }
      if (schema.exclusiveMaximum !== undefined) {
        values.maximum =
          schema.maximum !== undefined &&
          schema.maximum < schema.exclusiveMaximum
            ? { value: schema.maximum, exclusive: false }
            : { value: schema.exclusiveMaximum, exclusive: true };
      } else if (schema.maximum !== undefined) {
        values.maximum = { value: schema.maximum, exclusive: false };
      }
      if (schema.multipleOf !== undefined) {
        values.multipleOf = schema.multipleOf;
      }
    }
  } else if (schema.type === "string") {
    if ("enum" in schema) {
      if (schema.enum.length > 0) {
        values.enum = [...schema.enum];
      }
    } else {
      if (schema.minLength !== undefined) {
        values.minLength = schema.minLength;
      }
      if (schema.maxLength !== undefined) {
        values.maxLength = schema.maxLength;
      }
      if (schema.pattern !== undefined) {
        values.pattern = schema.pattern;
      }
      if (schema.format !== undefined) {
        values.format = schema.format;
      }
    }
  } else if (schema.type === "array" && schema.items !== false) {
    // Fixed-shape tuples (items: false) are configured via list entries
    const { items, minItems, maxItems } = schema;

    if (items !== undefined) {
      values.items = items.type;
    }
    if (minItems !== undefined) {
      values.minItems = minItems;
    }
    if (maxItems !== undefined) {
      values.maxItems = maxItems;
    }
  }

  return values;
};

export type ConstraintSchemaPart =
  | Partial<NumberConstraints>
  | { enum: [number, ...number[]] }
  | Partial<StringConstraints>
  | { enum: [string, ...string[]] }
  | { items?: ArrayItemsSchema; minItems?: number; maxItems?: number };

/**
 * The schema fields a constraint state serializes to, ready to spread into a
 * `{ type: <primitive> }` schema. Only kinds valid for the primitive are
 * read, and a non-empty permitted-values set wins outright: the type system
 * models `enum` as an alternative to the other constraints, not an addition.
 */
export const schemaConstraintsFromValues = ({
  primitive,
  activeKinds,
  values,
}: {
  primitive: ConstraintPrimitive;
  activeKinds: ConstraintKind[];
  values: ConstraintValues;
}): ConstraintSchemaPart => {
  const active = (kind: ConstraintKind) =>
    activeKinds.includes(kind) && kindHasValue(values, kind);

  if (primitive === "number") {
    if (active("enum")) {
      const numbers = (values.enum ?? [])
        .map((value) => (typeof value === "number" ? value : Number(value)))
        .filter((value) => Number.isFinite(value));

      if (numbers.length > 0) {
        return { enum: numbers as [number, ...number[]] };
      }
    }

    const part: Partial<NumberConstraints> = {};
    if (active("minimum") && values.minimum) {
      part[values.minimum.exclusive ? "exclusiveMinimum" : "minimum"] =
        values.minimum.value;
    }
    if (active("maximum") && values.maximum) {
      part[values.maximum.exclusive ? "exclusiveMaximum" : "maximum"] =
        values.maximum.value;
    }
    if (active("multipleOf") && values.multipleOf !== undefined) {
      part.multipleOf = values.multipleOf;
    }
    return part;
  }

  if (primitive === "string") {
    if (active("enum")) {
      const strings = (values.enum ?? []).map(String);

      if (strings.length > 0) {
        return { enum: strings as [string, ...string[]] };
      }
    }

    const part: Partial<StringConstraints> = {};
    if (active("minLength") && values.minLength !== undefined) {
      part.minLength = values.minLength;
    }
    if (active("maxLength") && values.maxLength !== undefined) {
      part.maxLength = values.maxLength;
    }
    if (active("pattern") && values.pattern !== undefined) {
      part.pattern = values.pattern;
    }
    if (active("format") && values.format !== undefined) {
      part.format = values.format;
    }
    return part;
  }

  if (primitive === "array") {
    const part: {
      items?: ArrayItemsSchema;
      minItems?: number;
      maxItems?: number;
    } = {};

    if (active("items") && values.items !== undefined) {
      part.items = itemSchemaForType(values.items);
    }
    if (active("minItems") && values.minItems !== undefined) {
      part.minItems = values.minItems;
    }
    if (active("maxItems") && values.maxItems !== undefined) {
      part.maxItems = values.maxItems;
    }
    return part;
  }

  return {};
};

/**
 * The single primitive a set of parents shares — constraints only compose
 * across parents agreeing on one primitive (the graph rejects intersections
 * like number + text when closing the schema), so `null` means the parents'
 * constraints are not composable.
 */
export const sharedParentPrimitive = ({
  parentDataTypeIds,
  resolvePrimitive,
}: {
  parentDataTypeIds: VersionedUrl[];
  resolvePrimitive: (dataTypeId: VersionedUrl) => ConstraintPrimitive | null;
}): ConstraintPrimitive | null => {
  const primitives = parentDataTypeIds.map((dataTypeId) =>
    resolvePrimitive(dataTypeId),
  );
  const first = primitives[0] ?? null;

  return first !== null && primitives.every((primitive) => primitive === first)
    ? first
    : null;
};

export type InheritedConstraints = {
  values: ConstraintValues;
  sources: Partial<
    Record<ConstraintKind, { title: string; dataTypeId: VersionedUrl }>
  >;
};

export const emptyInheritedConstraints: InheritedConstraints = {
  values: {},
  sources: {},
};

/**
 * The constraints the edited type inherits through its parents' ancestries,
 * each attributed to the nearest ancestor that defines it (ancestors are
 * visited breadth-first from the parents upwards).
 */
export const deriveInheritedConstraints = ({
  parentDataTypeIds,
  resolveDataType,
}: {
  parentDataTypeIds: VersionedUrl[];
  resolveDataType: (
    dataTypeId: VersionedUrl,
  ) => DataTypeWithMetadata | undefined;
}): InheritedConstraints => {
  // Nearest ancestor wins per constraint kind. The graph instead intersects
  // all ancestors (stricter-wins) when closing the schema — the two agree
  // unless an ancestor chain loosens a bound, which the graph silently
  // ignores rather than rejects.
  const values: ConstraintValues = {};
  const sources: InheritedConstraints["sources"] = {};

  const queue = [...parentDataTypeIds];
  const visitedBaseUrls = new Set<string>();

  while (queue.length > 0) {
    const dataTypeId = queue.shift();
    if (!dataTypeId) {
      break;
    }

    const baseUrl = extractBaseUrl(dataTypeId);
    if (visitedBaseUrls.has(baseUrl)) {
      continue;
    }
    visitedBaseUrls.add(baseUrl);

    const dataType = resolveDataType(dataTypeId);
    if (!dataType) {
      continue;
    }

    const { schema } = dataType;

    if (!("anyOf" in schema)) {
      const ancestorValues = constraintValuesFromSchema(schema);

      const adopt = <Kind extends ConstraintKind>(kind: Kind) => {
        const value = ancestorValues[kind];
        if (value !== undefined && values[kind] === undefined) {
          values[kind] = value;
          sources[kind] = { title: schema.title, dataTypeId: schema.$id };
        }
      };

      for (const kind of allConstraintKinds) {
        adopt(kind);
      }
    }

    queue.push(...(schema.allOf ?? []).map(({ $ref }) => $ref));
  }

  return { values, sources };
};

/** Whether `value` is a whole multiple of `factor`, within float tolerance */
export const isApproxMultiple = (value: number, factor: number): boolean => {
  if (factor === 0) {
    return false;
  }
  const ratio = value / factor;
  return Math.abs(ratio - Math.round(ratio)) < 1e-9;
};

/**
 * Live checks for the formats with unambiguous shapes; the rest pass and are
 * left to the server's validation on save, like skipped patterns
 */
const formatCheckers: Partial<
  Record<StringFormat, (value: string) => boolean>
> = {
  email: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
  uri: (value) => URL.canParse(value),
  uuid: (value) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    ),
  ipv4: (value) =>
    /^((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/.test(
      value,
    ),
  hostname: (value) =>
    value.length <= 253 &&
    /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(
      value,
    ),
  regex: (value) => {
    try {
      // Compiled only to check syntax, never executed against input
      // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
      return new RegExp(value) instanceof RegExp;
    } catch {
      return false;
    }
  },
  date: (value) => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value),
  time: (value) =>
    /^([01]\d|2[0-3]):[0-5]\d:([0-5]\d|60)(\.\d+)?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)?$/i.test(
      value,
    ),
  "date-time": (value) =>
    /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])[Tt]([01]\d|2[0-3]):[0-5]\d:([0-5]\d|60)(\.\d+)?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)$/i.test(
      value,
    ),
  duration: (value) =>
    /^P(?!$)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(?=\d)(\d+(\.\d+)?H)?(\d+(\.\d+)?M)?(\d+(\.\d+)?S)?)?$/.test(
      value,
    ),
};

/**
 * Whether a permitted value survives the inherited constraints: the graph
 * drops enum values failing any of them when it closes the type, and rejects
 * the save when none survive.
 */
export const satisfiesInherited = (
  value: string | number,
  inherited: ConstraintValues,
): boolean => {
  if (inherited.enum && !inherited.enum.some((allowed) => allowed === value)) {
    return false;
  }

  if (typeof value === "number") {
    const { minimum, maximum, multipleOf } = inherited;
    if (
      minimum &&
      (minimum.exclusive ? value <= minimum.value : value < minimum.value)
    ) {
      return false;
    }
    if (
      maximum &&
      (maximum.exclusive ? value >= maximum.value : value > maximum.value)
    ) {
      return false;
    }
    if (multipleOf !== undefined && !isApproxMultiple(value, multipleOf)) {
      return false;
    }
    return true;
  }

  if (inherited.minLength !== undefined && value.length < inherited.minLength) {
    return false;
  }
  if (inherited.maxLength !== undefined && value.length > inherited.maxLength) {
    return false;
  }
  // The pattern may be hostile (a foreign ancestor authors it), so it only
  // ever executes inside the oracle's terminable worker — no verdict counts
  // as matching, leaving the decision to the server's validation on save
  if (
    inherited.pattern !== undefined &&
    testStoredPattern(inherited.pattern, value) === false
  ) {
    return false;
  }
  if (inherited.format !== undefined) {
    const checker = formatCheckers[inherited.format];
    if (checker && !checker(value)) {
      return false;
    }
  }
  return true;
};
