/* oxlint-disable max-lines -- data type schema merging and selector tree building live together; splitting them needs new modules and import changes across the monorepo */
import { Big } from "big.js";

import {
  componentsFromVersionedUrl,
  mustHaveAtLeastOne,
} from "@blockprotocol/type-system";

import { add, divide, multiply, subtract } from "./numbers.js";

import type { JsonValue } from "@blockprotocol/core";
import type {
  BaseUrl,
  ClosedDataType,
  ConversionDefinition,
  ConversionExpression,
  ConversionValue,
  DataType,
  NumberConstraints,
  OntologyTypeVersion,
  SingleValueConstraints,
  SingleValueSchema,
  StringConstraints,
  ValueLabel,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { ClosedDataTypeDefinition } from "@local/hash-graph-sdk/ontology";

type MergedNumberSchema = {
  type: "number";
  const?: number;
  enum?: number[];
} & Omit<NumberConstraints, "multipleOf"> & { multipleOf?: number[] };

type MergedStringSchema = {
  type: "string";
  const?: string;
  enum?: string[];
} & Omit<StringConstraints, "pattern"> & { pattern?: string[] };

interface ObjectSchema {
  type: "object";
}

interface NullSchema {
  type: "null";
}

interface BooleanSchema {
  type: "boolean";
}

interface TupleSchema {
  prefixItems: [MergedDataTypeSingleSchema, ...MergedDataTypeSingleSchema[]];
  items: false;
}

interface ListSchema {
  items: MergedDataTypeSingleSchema;
}

type ArraySchema = { type: "array" } & (TupleSchema | ListSchema);

export type MergedValueSchema =
  | MergedNumberSchema
  | MergedStringSchema
  | ObjectSchema
  | NullSchema
  | BooleanSchema
  | ArraySchema;

export type MergedDataTypeSingleSchema = {
  description: string;
  label?: ValueLabel;
} & MergedValueSchema;

export type MergedDataTypeSchema =
  | MergedDataTypeSingleSchema
  | { anyOf: MergedDataTypeSingleSchema[] };

export interface FormattedValuePart {
  color: string;
  type: "leftLabel" | "rightLabel" | "value";
  text: string;
}

const hasText = (value: string | undefined): value is string =>
  value !== undefined && value !== "";

export const createFormattedValueParts = ({
  inner,
  schema,
}: {
  inner: string | FormattedValuePart[];
  schema?: Pick<SingleValueSchema, "label">;
}): FormattedValuePart[] => {
  const { left = "", right = "" } = schema?.label ?? {};

  const parts: FormattedValuePart[] = [];

  if (left !== "") {
    parts.push({ color: "#91A5BA", type: "leftLabel", text: left });
  }

  if (Array.isArray(inner)) {
    parts.push(...inner);
  } else {
    parts.push({ color: "#37434F", type: "value", text: inner });
  }

  if (right !== "") {
    parts.push({ color: "#91A5BA", type: "rightLabel", text: right });
  }

  return parts;
};

const arrayItemSeparator: FormattedValuePart = {
  color: "#758AA1",
  type: "rightLabel",
  text: ", ",
};

const isTruthyJsonValue = (value: JsonValue): boolean =>
  value !== false && value !== null && value !== 0 && value !== "";

export const formatDataValue = (
  value: JsonValue,
  schema: MergedDataTypeSingleSchema,
): FormattedValuePart[] => {
  const { type } = schema;

  if (type === "null") {
    return createFormattedValueParts({ inner: "Null", schema });
  }

  if (type === "boolean") {
    return createFormattedValueParts({
      inner: isTruthyJsonValue(value) ? "True" : "False",
      schema,
    });
  }

  if (type === "array") {
    if (!Array.isArray(value)) {
      throw new TypeError("Non-array value provided for array data type");
    }

    const isTuple = "prefixItems" in schema;

    return value.flatMap((inner, index) => {
      if (isTuple) {
        const itemSchema = schema.prefixItems[index];

        if (itemSchema === undefined) {
          throw new Error(
            `No schema for tuple item at index ${index} – value has too many items`,
          );
        }

        const innerValue = formatDataValue(inner, itemSchema);

        if (index < innerValue.length - 1) {
          return [arrayItemSeparator, ...innerValue];
        }

        return innerValue;
      }

      const innerValue = formatDataValue(inner, schema.items);

      if (index < value.length - 1) {
        return [arrayItemSeparator, ...innerValue];
      }

      return innerValue;
    });
  }

  if (typeof value === "object" && value !== null) {
    return createFormattedValueParts({ inner: JSON.stringify(value), schema });
  }

  return createFormattedValueParts({ inner: String(value), schema });
};

interface Context {
  self: Big;
}

const evaluateConversionValue = (
  value: ConversionValue,
  context: Context,
): Big => {
  if (Array.isArray(value)) {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define -- mutually recursive with evaluateExpression
    return evaluateExpression(value, context);
  }
  if (value === "self") {
    return context.self;
  }
  return new Big(value.const);
};

const evaluateExpression = (
  expression: ConversionExpression,
  context: Context,
): Big => {
  const left = evaluateConversionValue(expression[1], context);
  const right = evaluateConversionValue(expression[2], context);

  switch (expression[0]) {
    case "+": {
      return add(left, right);
    }
    case "-": {
      return subtract(left, right);
    }
    case "*": {
      return multiply(left, right);
    }
    case "/": {
      if (right.eq(0)) {
        return new Big(0);
      }
      return divide(left, right);
    }
  }
};

export const createConversionFunction =
  (conversions: ConversionDefinition[]): ((value: number) => number) =>
  (value: number) => {
    let evaluatedValue = new Big(value);

    for (const conversion of conversions) {
      evaluatedValue = evaluateExpression(conversion.expression, {
        self: evaluatedValue,
      });
    }

    return evaluatedValue.toNumber();
  };

const hasNonZeroNumber = (value: number | undefined): value is number =>
  value !== undefined && value !== 0;

const transformConstraint = (
  constraint: SingleValueConstraints & {
    description: string;
    label?: ValueLabel;
  },
): MergedDataTypeSingleSchema => {
  const { description, label, type } = constraint;

  if (type === "string") {
    if ("enum" in constraint) {
      return constraint;
    }

    return {
      ...constraint,
      pattern: hasText(constraint.pattern) ? [constraint.pattern] : undefined,
    };
  }
  if (type === "number") {
    if ("enum" in constraint) {
      return constraint;
    }

    return {
      ...constraint,
      multipleOf: hasNonZeroNumber(constraint.multipleOf)
        ? [constraint.multipleOf]
        : undefined,
    };
  }

  if (type === "array") {
    if ("prefixItems" in constraint) {
      if (constraint.prefixItems === undefined) {
        throw new Error("Expected prefixItems to be defined");
      }

      return {
        ...constraint,
        prefixItems: mustHaveAtLeastOne(
          constraint.prefixItems.map((tupleItem) =>
            transformConstraint({ description, label, ...tupleItem }),
          ),
        ),
        items: false,
      };
    }

    if ("items" in constraint || constraint.items === undefined) {
      throw new Error("Expected items to be defined");
    }

    return {
      ...constraint,
      items: transformConstraint({ description, label, ...constraint.items }),
    };
  }

  return constraint;
};

export const getMergedDataTypeSchema = (
  dataType: ClosedDataType,
): MergedDataTypeSchema => {
  const { description, label } = dataType;

  const firstOption = dataType.allOf[0];

  if ("anyOf" in firstOption) {
    if (dataType.allOf.length > 1) {
      /**
       * We assume that the Graph API has reduced the constraints to a single anyOf array when closing the data type
       */
      throw new Error("Expected data type to have a single anyOf constraint.");
    }

    const anyOf: MergedDataTypeSingleSchema[] = [];

    for (const option of firstOption.anyOf) {
      anyOf.push(transformConstraint({ description, label, ...option }));
    }

    if (anyOf[0] === undefined) {
      throw new Error("Expected anyOf to have at least one constraint");
    }

    return { anyOf };
  }

  const mergedSchema: MergedDataTypeSchema = transformConstraint({
    description,
    label,
    ...firstOption,
  });

  if (
    mergedSchema.type === "object" ||
    mergedSchema.type === "array" ||
    mergedSchema.type === "null" ||
    mergedSchema.type === "boolean"
  ) {
    return mergedSchema;
  }

  /**
   * If dealing with a string or number, we need to collect all the 'pattern' and 'multipleOf' constraints,
   * because the Graph API does not merge them into a single object.
   * We could later deal with this at the Graph level by:
   * 1. Merging all 'pattern' fields into a single RegExp, or having ClosedDataType have an array for 'pattern'
   * 2. Having an array for 'multipleOf' on ClosedDataType
   */
  for (const option of dataType.allOf.slice(1)) {
    if ("anyOf" in option) {
      throw new Error("Expected data type to have a single anyOf constraint.");
    }

    if (mergedSchema.type === "string") {
      if (option.type !== "string") {
        throw new Error(
          `Mixed primitive data types for data type: ${dataType.$id}`,
        );
      }
      mergedSchema.pattern ??= [];
      if ("pattern" in option && hasText(option.pattern)) {
        mergedSchema.pattern.push(option.pattern);
      }
    } else {
      if (option.type !== "number") {
        throw new Error(
          `Mixed primitive data types for data type: ${dataType.$id}`,
        );
      }
      mergedSchema.multipleOf ??= [];
      if ("multipleOf" in option && hasNonZeroNumber(option.multipleOf)) {
        mergedSchema.multipleOf.push(option.multipleOf);
      }
    }
  }

  return mergedSchema;
};

const isDataType = (
  dataType: DataType | ClosedDataTypeDefinition,
): dataType is DataType => "$id" in dataType;

const getDirectParents = (
  dataType: DataType | ClosedDataTypeDefinition,
): VersionedUrl[] => {
  if (isDataType(dataType)) {
    return dataType.allOf?.map(({ $ref }) => $ref) ?? [];
  }

  return dataType.parents;
};

/**
 * Data types store references to their parents, not children, so we need to know the children of all data types.
 * The selectable types are either targets or children of targets.
 */
const groupDirectChildren = <T extends ClosedDataTypeDefinition | DataType>(
  dataTypePoolById: Record<VersionedUrl, T>,
): Record<VersionedUrl, T[]> => {
  const directChildrenByDataTypeId: Record<VersionedUrl, T[]> = {};

  for (const dataType of Object.values(dataTypePoolById)) {
    for (const parent of getDirectParents(dataType)) {
      directChildrenByDataTypeId[parent] ??= [];

      const parentDataType = dataTypePoolById[parent];

      if (parentDataType !== undefined) {
        /**
         * If the parentDataType is not in the pool, it is not a selectable parent.
         * The caller is responsible for ensuring that the pool contains all selectable data types,
         * via one of the methods described in the function's JSDoc.
         */
        directChildrenByDataTypeId[parent].push(dataType);
      }
    }
  }

  return directChildrenByDataTypeId;
};

/**
 * Get all permitted data types for a value, which are the targetDataTypes or their descendants.
 * Excludes `abstract` types.
 *
 * The data type pool must include all children of the targetDataTypes, which can be fetched from the API via one of:
 * - fetching all data types:
 *     e.g. in the context of the type editor, where all types are selectable)
 * - making a query for an entityType with the 'resolvedWithDataTypeChildren' resolution method
 *     e.g. when selecting a value valid for specific entity types, and having the API resolve the valid data types
 */
export const getPermittedDataTypes = <
  T extends ClosedDataTypeDefinition | DataType,
>({
  targetDataTypes,
  dataTypePoolById,
}: {
  /**
   * The data types that the user is allowed to select
   * – does not need to include children, but they should appear in the dataTypePool.
   */
  targetDataTypes: T[];
  /**
   * The pool to find the permitted data types for selection from.
   * This MUST include targetDataTypes and any children of targetDataTypes
   * It MAY include other data types which are not selectable (e.g. parents of targetDataTypes, or
   * unrelated types). Unselectable types will not be included in the results
   */
  dataTypePoolById: Record<VersionedUrl, T>;
}): T[] => {
  const directChildrenByDataTypeId = groupDirectChildren(dataTypePoolById);

  const permittedDataTypes: T[] = [];

  const stack: T[] = [...targetDataTypes];
  for (
    let current = stack.pop();
    current !== undefined;
    current = stack.pop()
  ) {
    const abstract = isDataType(current)
      ? current.abstract
      : current.schema.abstract;

    if (abstract !== true) {
      permittedDataTypes.push(current);
    }

    const $id = isDataType(current) ? current.$id : current.schema.$id;

    const children = directChildrenByDataTypeId[$id];
    if (children !== undefined) {
      stack.push(...children);
    }
  }

  return permittedDataTypes;
};

/**
 * Should be synced with the DataTypeForSelector type in @hashintel/design-system
 * We can't important it into this package because this is supposed to be isomorphic and having @hashintel/design-system as a dependency
 * means we would need to include JSX in the tsconfig, which we would ideally avoid.
 *
 * @todo create a local 'shared frontend utils' package to avoid the need for duplication, and in that package import this type from @hashintel/design-system.
 *       and move the functions relying on it to that package.
 */
interface DataTypeForSelector {
  $id: VersionedUrl;
  abstract: boolean;
  baseUrl: BaseUrl;
  children: DataTypeForSelector[];
  description: string;
  directParents: VersionedUrl[];
  format?: StringConstraints["format"];
  label: DataType["label"];
  type: string;
  title: string;
  version: OntologyTypeVersion;
}

interface TypeAndFormat {
  type: string;
  format: StringConstraints["format"];
}

const getTypeAndFormat = (schema: {
  type: string;
  format?: StringConstraints["format"];
}): TypeAndFormat => ({
  type: schema.type,
  format: "format" in schema ? schema.format : undefined,
});

const getFirstSchemaTypeAndFormat = (
  dataType: DataType | ClosedDataTypeDefinition,
): TypeAndFormat => {
  if (isDataType(dataType)) {
    return getTypeAndFormat("anyOf" in dataType ? dataType.anyOf[0] : dataType);
  }

  const mergedSchema = getMergedDataTypeSchema(dataType.schema);

  if (!("anyOf" in mergedSchema)) {
    return getTypeAndFormat(mergedSchema);
  }

  const [firstOption] = mergedSchema.anyOf;

  if (firstOption === undefined) {
    throw new Error("Expected anyOf to have at least one constraint");
  }

  return getTypeAndFormat(firstOption);
};

/**
 * Build a tree rooted at the provided data type, with each node containing the information needed for the selector.
 *
 * Some callers will have the 'closed' data type (with all constraints resolved), others only the underlying schema,
 * without having its parents' constraints merged in.
 *
 * We don't care about the closed schema for this purpose because the selector doesn't care about value constraints,
 * but it's the structure that some callers may already have.
 */
const transformDataTypeForSelector = <
  T extends DataType | ClosedDataTypeDefinition,
>(
  dataType: T,
  directChildrenByDataTypeId: Record<VersionedUrl, T[]>,
  allChildren: VersionedUrl[] = [],
): {
  allChildren: VersionedUrl[];
  transformedDataType: DataTypeForSelector;
} => {
  const schema = isDataType(dataType) ? dataType : dataType.schema;
  const { $id } = schema;

  const children = directChildrenByDataTypeId[$id] ?? [];
  const transformedChildren: DataTypeForSelector[] = [];

  /**
   * We need to track all descendants of the data type, so that {@link buildDataTypeTreesForSelector}
   * can remove any types as roots of a tree where they appear lower down another tree.
   */
  allChildren.push(
    ...children.map((child) =>
      isDataType(child) ? child.$id : child.schema.$id,
    ),
  );

  for (const child of children) {
    const { transformedDataType } = transformDataTypeForSelector(
      child,
      directChildrenByDataTypeId,
      allChildren,
    );
    transformedChildren.push(transformedDataType);
  }

  const { type, format } = getFirstSchemaTypeAndFormat(dataType);

  const { baseUrl, version } = componentsFromVersionedUrl($id);

  const transformedDataType = {
    $id,
    baseUrl,
    abstract: Boolean(schema.abstract),
    children: transformedChildren.toSorted((left, right) =>
      left.title.localeCompare(right.title),
    ),
    description: schema.description,
    directParents: getDirectParents(dataType),
    format,
    label: schema.label,
    title: schema.title,
    type,
    version,
  };

  return {
    allChildren,
    transformedDataType,
  };
};

/**
 * Build trees of data types that can be selected by the user, rooted at those data types
 * among targetDataTypes which do not have any parents in targetDataTypes,
 * i.e. rooted at the types which have no selectable parents.
 *
 * Data types may appear in multiple locations in the tree if they have multiple selectable parents.
 * This will only happen if a user builds a type with multiple expected values,
 * and one of the values is a descendant of another one.
 *
 * The data type pool must include all children of the targetDataTypes, which can be fetched from the API via one of:
 * - fetching all data types:
 *     e.g. in the context of the type editor, where all types are selectable)
 * - making a query for an entityType with the 'resolvedWithDataTypeChildren' resolution method
 *     e.g. when selecting a value valid for specific entity types, and having the API resolve the valid data types
 */
export const buildDataTypeTreesForSelector = <
  T extends ClosedDataTypeDefinition | DataType,
>({
  targetDataTypes,
  dataTypePoolById,
}: {
  /**
   * The data types that the user is allowed to select
   * – does not need to include children, but they should appear in the dataTypePool.
   */
  targetDataTypes: T[];
  /**
   * All data types that are available for building the trees from.
   * This MUST include targetDataTypes and any children of targetDataTypes to allow them to be included in the
   * resulting tree. It MAY include other data types which are not selectable (e.g. parents of targetDataTypes, or
   * unrelated types). Unrelated types will not be included in the resulting trees.
   */
  dataTypePoolById: Record<VersionedUrl, T>;
}): DataTypeForSelector[] => {
  const directChildrenByDataTypeId = groupDirectChildren(dataTypePoolById);

  const rootsById = new Map<VersionedUrl, DataTypeForSelector>();

  const dataTypesBelowRoots: VersionedUrl[] = [];

  /**
   * Build a tree for each target data type.
   */
  for (const dataType of targetDataTypes) {
    const { allChildren, transformedDataType } = transformDataTypeForSelector(
      dataType,
      directChildrenByDataTypeId,
    );

    if (
      /**
       * There's no point adding abstract types with no children, because they cannot be selected.
       */
      !transformedDataType.abstract ||
      transformedDataType.children.length > 0
    ) {
      rootsById.set(transformedDataType.$id, transformedDataType);
      dataTypesBelowRoots.push(...allChildren);
    }
  }

  /**
   * Finally, remove any trees rooted at a target data type which appears as the child of another target.
   */
  for (const dataTypeId of dataTypesBelowRoots) {
    rootsById.delete(dataTypeId);
  }

  return [...rootsById.values()];
};
