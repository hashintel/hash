import type {
  ArraySchema,
  Conversions,
  DataType,
  SingleValueConstraints,
  StringConstraints,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { DistributiveOmit } from "@local/advanced-types/distribute";
import type {
  BaseUrl,
  DataTypeMetadata,
} from "@local/hash-graph-types/ontology";

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
  conversions: Record<BaseUrl, Conversions> | null;
};

export const getDataTypeFromFormData = ({
  allOf,
  constraints,
  label,
  ...rest
}: DataTypeFormData): DistributiveOmit<
  DataType,
  "$id" | "$schema" | "kind"
> => {
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
          minimum: constraints.minimum ?? undefined,
          maximum: constraints.maximum ?? undefined,
          exclusiveMinimum: constraints.exclusiveMinimum ?? undefined,
          exclusiveMaximum: constraints.exclusiveMaximum ?? undefined,
          multipleOf: constraints.multipleOf ?? undefined,
        };
      }
      break;
    }
  }

  return {
    ...rest,
    allOf: allOf.map((versionedUrl) => ({ $ref: versionedUrl })),
    label: Object.keys(label ?? {}).length > 0 ? label : undefined,
    ...unNulledConstraints,
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
        conversions: null,
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
        nulledConstraints = {
          type: "number",
          minimum: constraints.minimum ?? null,
          maximum: constraints.maximum ?? null,
          exclusiveMinimum: constraints.exclusiveMinimum ?? null,
          exclusiveMaximum: constraints.exclusiveMaximum ?? null,
          multipleOf: constraints.multipleOf ?? null,
        };
      }
      break;
  }

  const { conversions } =
    "ownedById" in dataTypeWithMetadata.metadata
      ? dataTypeWithMetadata.metadata
      : { conversions: null };

  return {
    allOf: allOf?.map(({ $ref }) => $ref) ?? [],
    abstract: !!abstract,
    conversions: conversions ?? null,
    description,
    label: label?.left?.length || label?.right?.length ? label : undefined,
    title,
    constraints: nulledConstraints,
  };
};
