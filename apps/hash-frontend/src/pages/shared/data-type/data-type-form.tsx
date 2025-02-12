import type {
  DataType,
  SingleValueConstraints,
} from "@blockprotocol/type-system";

export type DataTypeFormData = Pick<
  DataType,
  "allOf" | "abstract" | "description" | "label"
> & {
  constraints: SingleValueConstraints;
};

export const getDataTypeFromFormData = ({
  constraints,
  ...rest
}: DataTypeFormData): Omit<DataType, "$id" | "$schema" | "kind" | "title"> => {
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
    title: _$title,
    titlePlural: _$titlePlural,
    allOf,
    abstract,
    description,
    label,
    ...constraints
  } = dataType;

  if ("anyOf" in constraints) {
    throw new Error("anyOf constraints are not supported");
  }

  return {
    allOf,
    abstract,
    description,
    label,
    constraints,
  };
};
