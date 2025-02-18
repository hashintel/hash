import type {
  DataType,
  SingleValueConstraints,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { DistributiveOmit } from "@local/advanced-types/distribute";

export type DataTypeFormData = Pick<
  DataType,
  "abstract" | "description" | "label" | "title"
> & {
  allOf: VersionedUrl[];
  constraints: SingleValueConstraints;
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
  return {
    ...rest,
    allOf: allOf.map((versionedUrl) => ({ $ref: versionedUrl })),
    label: Object.keys(label ?? {}).length > 0 ? label : undefined,
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
    allOf: allOf?.map(({ $ref }) => $ref) ?? [],
    abstract: !!abstract,
    description,
    label: label ?? {},
    title,
    constraints,
  };
};
