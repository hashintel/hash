import type {
  ArraySchema,
  DataType,
  DataTypeMetadata,
  SingleValueConstraints,
  StringConstraints,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { DistributiveOmit } from "@local/advanced-types/distribute";
import type { DataTypeDirectConversionsMap } from "@local/hash-graph-sdk/ontology";

/**
 * For the purposes of react-hook-form we need to have explicit null values to be able to unset values.
 */
type NullableNumberConstraints = {
  minimum: number | null;
  exclusiveMinimum: boolean | null;
  maximum: number | null;
  exclusiveMaximum: boolean | null;
  multipleOf: number | null;
};

type NullableNumberSchema =
  | NullableNumberConstraints
  | { enum: [number, ...number[]] };

type NullableStringConstraints = Omit<
  StringConstraints,
  "minLength" | "maxLength"
> & {
  minLength: number | null;
  maxLength: number | null;
};

type NullableStringSchema =
  | NullableStringConstraints
  | { enum: [string, ...string[]] };

type NullableSingleValueConstraints =
  | { type: "anything" }
  | { type: "null" }
  | { type: "boolean" }
  | ({ type: "number" } & NullableNumberSchema)
  | ({ type: "string" } & NullableStringSchema)
  | ({ type: "array" } & ArraySchema)
  | { type: "object" };

export type DataTypeFormData = Pick<
  DataType,
  "abstract" | "description" | "label" | "title"
> & {
  allOf: VersionedUrl[];
  constraints: NullableSingleValueConstraints;
  conversions?: DataTypeDirectConversionsMap;
};

export const getDataTypeFromFormData = ({
  allOf,
  constraints,
  conversions,
  label,
  ...rest
}: DataTypeFormData): {
  dataType: DistributiveOmit<DataType, "$id" | "$schema" | "kind">;
  conversions?: DataTypeDirectConversionsMap;
} => {
  let unNulledConstraints: SingleValueConstraints;

  switch (constraints.type) {
    case "anything": {
      throw new Error("Unexpected update to 'Value' type");
    }
    case "object":
    case "array":
    case "null":
    case "boolean":
      unNulledConstraints = { type: constraints.type as "object" };
      break;
    case "string": {
      if ("enum" in constraints) {
        unNulledConstraints = { type: "string", enum: constraints.enum };
      } else {
        unNulledConstraints = {
          type: "string",
          minLength: constraints.minLength ?? undefined,
          maxLength: constraints.maxLength ?? undefined,
        };
      }
      break;
    }
    case "number": {
      if ("enum" in constraints) {
        unNulledConstraints = { type: "number", enum: constraints.enum };
      } else {
        unNulledConstraints = {
          type: "number",
          /**
           * In JSON schema, exclusiveMinimum and exclusiveMaximum are numbers (after Draft 4),
           * but in the form it is simpler to deal with them as booleans,
           * so we need to convert them back to numbers here.
           * We don't want both minimum and exclusiveMinimum to be set.
           */
          minimum: !constraints.exclusiveMinimum
            ? (constraints.minimum ?? undefined)
            : undefined,
          maximum: !constraints.exclusiveMaximum
            ? (constraints.maximum ?? undefined)
            : undefined,
          exclusiveMinimum: constraints.exclusiveMinimum
            ? (constraints.minimum ?? undefined)
            : undefined,
          exclusiveMaximum: constraints.exclusiveMaximum
            ? (constraints.maximum ?? undefined)
            : undefined,
          multipleOf: constraints.multipleOf ?? undefined,
        };
      }
      break;
    }
  }

  return {
    dataType: {
      ...rest,
      allOf: allOf.map((versionedUrl) => ({ $ref: versionedUrl })),
      label: Object.keys(label ?? {}).length > 0 ? label : undefined,
      ...unNulledConstraints,
    },
    conversions,
  };
};

export const getFormDataFromDataType = (dataTypeWithMetadata: {
  schema: DataType;
  metadata: Pick<DataTypeMetadata, "conversions">;
}): DataTypeFormData => {
  const {
    $id: _$id,
    $schema: _$schema,
    kind: _$kind,
    allOf,
    abstract,
    description,
    label,
    title,
    ...constraints
  } = dataTypeWithMetadata.schema;

  if ("anyOf" in constraints) {
    if (title === "Value") {
      return {
        allOf: [],
        conversions: {},
        description,
        label,
        title,
        constraints: { type: "anything" },
      };
    }
    throw new Error("anyOf constraints are not supported");
  }

  let nulledConstraints: NullableSingleValueConstraints;

  switch (constraints.type) {
    case "object":
    case "array":
    case "null":
    case "boolean":
      nulledConstraints = { type: constraints.type as "object" };
      break;
    case "string": {
      if ("enum" in constraints) {
        nulledConstraints = { type: "string", enum: constraints.enum };
      } else {
        nulledConstraints = {
          ...constraints,
          minLength: constraints.minLength ?? null,
          maxLength: constraints.maxLength ?? null,
        };
      }
      break;
    }
    case "number":
      if ("enum" in constraints) {
        nulledConstraints = { type: "number", enum: constraints.enum };
      } else {
        const applicableExclusiveMinimum =
          constraints.exclusiveMinimum !== undefined
            ? constraints.minimum === undefined ||
              constraints.minimum < constraints.exclusiveMinimum
            : null;

        const applicableExclusiveMaximum =
          constraints.exclusiveMaximum !== undefined
            ? constraints.maximum === undefined ||
              constraints.maximum > constraints.exclusiveMaximum
            : null;

        nulledConstraints = {
          type: "number",
          minimum: applicableExclusiveMinimum
            ? constraints.exclusiveMinimum!
            : (constraints.minimum ?? null),
          maximum: applicableExclusiveMaximum
            ? constraints.exclusiveMaximum!
            : (constraints.maximum ?? null),
          exclusiveMinimum: applicableExclusiveMinimum ?? null,
          exclusiveMaximum: applicableExclusiveMaximum ?? null,
          multipleOf: constraints.multipleOf ?? null,
        };
      }
      break;
  }

  const { conversions } =
    "webId" in dataTypeWithMetadata.metadata
      ? dataTypeWithMetadata.metadata
      : { conversions: null };

  return {
    allOf: allOf?.map(({ $ref }) => $ref) ?? [],
    abstract: !!abstract,
    conversions: conversions ?? {},
    description,
    label: label?.left?.length || label?.right?.length ? label : undefined,
    title,
    constraints: nulledConstraints,
  };
};
