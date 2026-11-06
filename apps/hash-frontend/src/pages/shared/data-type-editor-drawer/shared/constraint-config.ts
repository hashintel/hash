import { extractBaseUrl } from "@blockprotocol/type-system";

import { itemSchemaForType, listItemTypeLabels } from "./list-config";

import type { ListItemType } from "./list-config";
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

/** "A and B", or "A, B and 2 more" beyond two titles. */
export const summarizeTypeTitles = (titles: string[]): string =>
  titles.length <= 2
    ? titles.join(" and ")
    : `${titles[0]}, ${titles[1]} and ${titles.length - 2} more`;

/** A human-readable rendering of a kind's value, e.g. for tooltips. */
export const formatConstraintValue = (
  kind: ConstraintKind,
  values: ConstraintValues,
): string => {
  switch (kind) {
    case "minimum":
    case "maximum": {
      const bound = values[kind];
      return bound
        ? `${bound.value}${bound.exclusive ? " (exclusive)" : ""}`
        : "";
    }
    case "enum":
      return (values.enum ?? []).map(String).join(", ");
    case "format":
      return values.format ? stringFormatLabels[values.format] : "";
    case "items":
      return values.items ? listItemTypeLabels[values.items] : "";
    default:
      return values[kind] !== undefined ? String(values[kind]) : "";
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
      if (schema.exclusiveMinimum !== undefined) {
        values.minimum = { value: schema.exclusiveMinimum, exclusive: true };
      } else if (schema.minimum !== undefined) {
        values.minimum = { value: schema.minimum, exclusive: false };
      }
      if (schema.exclusiveMaximum !== undefined) {
        values.maximum = { value: schema.exclusiveMaximum, exclusive: true };
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
