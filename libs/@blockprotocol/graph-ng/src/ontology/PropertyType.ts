import * as S from "@effect/schema/Schema";
import * as PropertyTypeUrl from "./PropertyTypeUrl";
import * as DataType from "./DataType";

interface ArrayOfPropertyValuesTo {
  minItems?: number | undefined;
  maxItems?: number | undefined;

  items: PropertyValues;
}

interface ArrayOfPropertyValuesFrom {
  minItems?: number | undefined;
  maxItems?: number | undefined;

  items: PropertyValuesFrom;
}

const ArrayOfPropertyValues: S.Schema<
  ArrayOfPropertyValuesTo,
  ArrayOfPropertyValuesFrom
> = S.struct({
  minItems: S.optional(S.Positive),
  maxItems: S.optional(S.Positive),

  items: S.suspend(() => PropertyValues),
});

interface PropertiesTypeObjectArrayTo {
  minItems?: number | undefined;
  maxItems?: number | undefined;

  items: PropertyType;
}

interface PropertiesTypeObjectArrayFrom {
  minItems?: number | undefined;
  maxItems?: number | undefined;

  items: PropertyTypeFrom;
}

const PropertiesTypeObjectArray: S.Schema<
  PropertiesTypeObjectArrayTo,
  PropertiesTypeObjectArrayFrom
> = S.struct({
  minItems: S.optional(S.Positive),
  maxItems: S.optional(S.Positive),

  items: S.suspend(() => PropertyType),
});

type PropertyTypeObjectTo = ReadonlyArray<
  PropertyType | PropertiesTypeObjectArrayTo
>;
type PropertyTypeObjectFrom = ReadonlyArray<
  PropertyTypeFrom | PropertiesTypeObjectArrayFrom
>;

const PropertyTypeObject: S.Schema<
  PropertyTypeObjectTo,
  PropertyTypeObjectFrom
> = S.array(
  S.union(
    S.suspend(() => PropertyType),
    PropertiesTypeObjectArray,
  ),
);

const PropertyValues = S.union(
  DataType.DataType,
  PropertyTypeObject,
  ArrayOfPropertyValues,
);

type PropertyValues = S.Schema.To<typeof PropertyValues>;
type PropertyValuesFrom = S.Schema.From<typeof PropertyValues>;

export const PropertyType = S.struct({
  kind: S.literal("propertyType"),

  id: PropertyTypeUrl.PropertyTypeUrl,
  title: S.string,
  description: S.optional(S.string),

  oneOf: S.nonEmptyArray(PropertyValues),
});

export interface PropertyType extends S.Schema.To<typeof PropertyType> {}
interface PropertyTypeFrom extends S.Schema.From<typeof PropertyType> {}
