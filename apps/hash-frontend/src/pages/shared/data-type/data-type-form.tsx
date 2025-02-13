import type {
  DataType,
  SingleValueConstraints,
} from "@blockprotocol/type-system";
import type { DistributiveOmit } from "@local/advanced-types/distribute";
import { blockProtocolDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

export type DataTypeFormData = Pick<
  DataType,
  "abstract" | "description" | "label" | "title"
> & {
  allOf: NonNullable<DataType["allOf"]>;
  constraints: SingleValueConstraints;
};

export const getDataTypeFromFormData = ({
  constraints,
  ...rest
}: DataTypeFormData): DistributiveOmit<
  DataType,
  "$id" | "$schema" | "kind"
> => {
  return {
    ...rest,
    ...constraints,
  };
};

export const getFormDataFromDataType = (
  dataType: DataType,
): DataTypeFormData => {
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
  } = dataType;

  if ("anyOf" in constraints) {
    throw new Error("anyOf constraints are not supported");
  }

  return {
    allOf: allOf ?? [{ $ref: blockProtocolDataTypes.text.dataTypeId }],
    abstract,
    description,
    label,
    title,
    constraints,
  };
};
